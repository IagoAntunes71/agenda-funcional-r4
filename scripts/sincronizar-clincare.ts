import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { BrowserContext, chromium, Page } from 'playwright';
import { neon, NeonQueryFunction } from '@neondatabase/serverless';

interface UnidadeRow {
    id: number;
    nome: string;
    clin_care_id: string;
}

interface DataRow {
    data: string;
}

interface ProfessorRow {
    id: number;
    nome: string;
    clin_care_id: string | null;
    unidade_id: number;
}

interface ImportacaoRow {
    id: number;
    clin_care_id: string;
}

interface BloqueioGrade {
    nomeProfessorBruto: string;
    horaInicio: string;
    horaFim: string;
    motivo: string;
}

function normalizarTexto(texto: string): string {
    return texto
        .replace(/^(\d+\s*\.\s*)+/, '')
        .replace(/\./g, ' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function nomesCorrespondem(nomeAdmin: string, nomeClinCare: string): boolean {
    const a = normalizarTexto(nomeAdmin);
    const b = normalizarTexto(nomeClinCare);
    if (!a || !b) return false;
    if (a === b) return true;

    const partesA = a.split(' ');
    const partesB = b.split(' ');
    if (partesA.length >= 2 && partesB.length >= 2 && partesA[0] === partesB[0]) {
        const ultA = partesA[partesA.length - 1];
        const ultB = partesB[partesB.length - 1];
        if (
            (ultA.length === 1 && ultB.startsWith(ultA)) ||
            (ultB.length === 1 && ultA.startsWith(ultB))
        ) {
            return true;
        }
    }

    return false;
}

function limparNomeExibicao(bruto: string): string {
    return bruto
        .replace(/^(\d+\s*\.\s*)+/, '')
        .replace(/\./g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function ajustarRestricaoBanco(sql: NeonQueryFunction<false, false>) {
    await sql`
    ALTER TABLE professores
    DROP CONSTRAINT IF EXISTS professores_clin_care_id_key
  `;
    await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_professores_clincare_unidade
    ON professores (clin_care_id, unidade_id)
    WHERE clin_care_id IS NOT NULL
  `;
}

async function realizarLogin(
    page: Page,
    baseUrl: string,
    email: string,
    senha: string
) {
    const loginUrl = `${baseUrl}/login`;
    console.log(`[LOGIN] Acedendo a ${loginUrl}...`);

    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);

    if (!page.url().includes('/painel')) {
        let contextoLogin = page.mainFrame();
        for (const frame of page.frames()) {
            const temSenha = await frame
                .locator('input[type="password"]')
                .count()
                .catch(() => 0);
            if (temSenha > 0) {
                contextoLogin = frame;
                break;
            }
        }

        const campoSenha = contextoLogin.locator('input[type="password"]').first();
        await campoSenha.waitFor({ state: 'visible', timeout: 30000 });

        const campoEmail = contextoLogin
            .locator(
                'input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"])'
            )
            .first();

        await campoEmail.fill(email);
        await campoSenha.fill(senha);

        const botaoEntrar = contextoLogin
            .locator(
                'button[type="submit"], button:has-text("Entrar"), button:has-text("Acessar"), button:has-text("Login")'
            )
            .first();

        if (await botaoEntrar.isVisible().catch(() => false)) {
            await botaoEntrar.click();
        } else {
            await campoSenha.press('Enter');
        }

        await page.waitForURL((url) => url.pathname.includes('/painel'), {
            timeout: 30000,
        });
    }

    console.log(`[LOGIN] Autenticado com sucesso: ${page.url()}`);
}

function extrairParesIdNomeDeTexto(texto: string): Map<string, string> {
    const pares = new Map<string, string>();
    const textoDesescapado = texto.replace(/\\"/g, '"');

    // Padrão 1: "id":"uuid" seguido de "nome":"..." ou "name":"..."
    const regexIdAntes =
        /"id"\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"[^{}]{0,250}?"(?:nome|name|fullName|full_name)"\s*:\s*"([^"]{2,80})"/gi;
    let m: RegExpExecArray | null;
    while ((m = regexIdAntes.exec(textoDesescapado)) !== null) {
        pares.set(m[1].toLowerCase(), m[2].trim());
    }

    // Padrão 2: "nome":"..." seguido de "id":"uuid"
    const regexNomeAntes =
        /"(?:nome|name|fullName|full_name)"\s*:\s*"([^"]{2,80})"[^{}]{0,250}?"id"\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/gi;
    while ((m = regexNomeAntes.exec(textoDesescapado)) !== null) {
        const uuid = m[2].toLowerCase();
        if (!pares.has(uuid)) {
            pares.set(uuid, m[1].trim());
        }
    }

    return pares;
}

async function descobrirTodosProfissionais(
    sql: NeonQueryFunction<false, false>,
    page: Page,
    baseUrl: string,
    unidades: UnidadeRow[],
    itemControleId: number
) {
    const urlLista = `${baseUrl}/painel/profissionais`;
    console.log(`[DISCOVERY] Varrendo lista de profissionais em ${urlLista}...`);

    const idsUnidadesIgnorar = new Set(
        unidades.map((u) => u.clin_care_id.toLowerCase())
    );
    const profissionaisEncontrados = new Map<string, string>();
    const paresPayloadGlobal = new Map<string, string>();

    const listener = async (res: import('playwright').Response) => {
        try {
            const ct = res.headers()['content-type'] || '';
            if (
                res.status() === 200 &&
                (ct.includes('application/json') ||
                    ct.includes('text/x-component') ||
                    ct.includes('text/plain') ||
                    ct.includes('text/html'))
            ) {
                const corpo = await res.text();
                for (const [uuid, nome] of extrairParesIdNomeDeTexto(corpo)) {
                    paresPayloadGlobal.set(uuid, nome);
                }
            }
        } catch {
            // Ignora respostas fechadas
        }
    };

    page.on('response', listener);
    await page.goto(urlLista, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => null);
    await page.waitForTimeout(3000);

    // Tenta selecionar 100 ou 50 itens por página, se disponível
    const selectPagina = page
        .locator('select:has(option[value="50"]), select:has(option[value="100"])')
        .first();
    if (await selectPagina.isVisible({ timeout: 1500 }).catch(() => false)) {
        const tem100 = await selectPagina.locator('option[value="100"]').count();
        await selectPagina.selectOption(tem100 > 0 ? '100' : '50').catch(() => null);
        await page.waitForTimeout(2500);
    }

    for (let pagina = 1; pagina <= 20; pagina++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);

        const htmlAtual = await page.content();
        for (const [uuid, nome] of extrairParesIdNomeDeTexto(htmlAtual)) {
            paresPayloadGlobal.set(uuid, nome);
        }

        // Coleta apenas os textos e links visíveis dentro da área principal (<main>) de /painel/profissionais
        const dadosVisiveisMain = await page.evaluate(() => {
            const main = document.querySelector('main') || document.body;
            const linksProf = Array.from(main.querySelectorAll('a[href*="/profissionais/"]'))
                .map((a) => a.getAttribute('href') || '')
                .filter(Boolean);

            const textosLinhas = Array.from(
                main.querySelectorAll('tr, [role="row"], tbody td, li, h2, h3, span, p')
            )
                .map((el) => (el as HTMLElement).innerText?.trim() || '')
                .filter((t) => t.length >= 3 && t.length <= 90);

            return {
                linksProf,
                textosLinhas: Array.from(new Set(textosLinhas)),
            };
        });

        // 1. Links diretos /profissionais/{uuid} dentro de <main>
        for (const href of dadosVisiveisMain.linksProf) {
            const m = href.match(
                /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
            );
            if (m) {
                const uuid = m[0].toLowerCase();
                if (!idsUnidadesIgnorar.has(uuid)) {
                    profissionaisEncontrados.set(
                        uuid,
                        paresPayloadGlobal.get(uuid) || 'Profissional'
                    );
                }
            }
        }

        // 2. Cruza (uuid, nome) do payload APENAS com os nomes realmente visíveis dentro de <main>
        const textosVisiveisSet = new Set(
            dadosVisiveisMain.textosLinhas.map((t) => t.toLowerCase())
        );

        for (const [uuid, nome] of paresPayloadGlobal.entries()) {
            if (idsUnidadesIgnorar.has(uuid)) continue;
            // Ignora registros com padrão de aluno (ex: "Fulano - 8 ano - Escola")
            if (/\s-\s*\d+[º°]?\s*(ano|semestre|s[eé]rie)/i.test(nome)) continue;

            if (textosVisiveisSet.has(nome.toLowerCase())) {
                profissionaisEncontrados.set(uuid, nome);
            }
        }

        const tamanhoAntes = profissionaisEncontrados.size;

        const botaoProxima = page
            .locator(
                'main button:has-text("Próxima"):not([disabled]), main button:has-text("Próximo"):not([disabled]), main button[aria-label*="next" i]:not([disabled]), main button[aria-label*="próxim" i]:not([disabled]), main a:has-text("Próxima"), main button:has-text("›"):not([disabled])'
            )
            .first();

        if (await botaoProxima.isVisible({ timeout: 1500 }).catch(() => false)) {
            await botaoProxima.click();
            await page.waitForTimeout(2500);
            if (profissionaisEncontrados.size === tamanhoAntes && pagina > 2) break;
        } else {
            break;
        }
    }

    page.off('response', listener);

    console.log(
        `[DISCOVERY] Total de profissionais encontrados: ${profissionaisEncontrados.size}`
    );
    if (profissionaisEncontrados.size > 0) {
        console.log(
            `[DISCOVERY] Amostra: ${Array.from(profissionaisEncontrados.values())
                .slice(0, 10)
                .join(', ')}`
        );
    }

    for (const [uuid, nomePrevio] of profissionaisEncontrados.entries()) {
        await sql`
      INSERT INTO importacao_profissionais_clincare (
        clin_care_id,
        nome_detectado,
        status,
        mensagem,
        atualizado_em
      )
      VALUES (
        ${uuid},
        ${limparNomeExibicao(nomePrevio)},
        'pendente',
        'Descoberto via /painel/profissionais',
        now()
      )
      ON CONFLICT (clin_care_id)
      DO UPDATE SET
        status = 'pendente',
        mensagem = 'Atualizado via varredura de profissionais',
        atualizado_em = now()
    `;
    }

    await sql`
    UPDATE importacao_profissionais_clincare
    SET status = 'importado',
        mensagem = ${`${profissionaisEncontrados.size} profissional(is) enfileirado(s)`},
        atualizado_em = now()
    WHERE id = ${itemControleId}
  `;
}

async function extrairUnidadesEMateriasDaTela(
    page: Page,
    nomesUnidades: { id: number; nome: string; clinCareId: string; norm: string }[]
) {
    return await page.evaluate((listaUnidades) => {
        const raiz = document.querySelector('main') || document.body;

        const inputNome = raiz.querySelector(
            'input[name*="nome" i], input[name*="name" i], input[placeholder*="nome" i]'
        ) as HTMLInputElement | null;

        const heading = Array.from(raiz.querySelectorAll('h1, h2, h3'))
            .map((el) => (el.textContent || '').trim())
            .find(
                (t) =>
                    t.length >= 3 &&
                    t.length <= 70 &&
                    !/^(profissionais|editar|dados|unidades|especialidades|servi[cç]os|r4 ensina|agenda|hor[aá]rios)$/i.test(
                        t
                    )
            );

        const nomeBruto = (inputNome?.value || heading || '').trim();

        const unidadesEncontradas = new Set<string>();
        const checkboxesMarcados = Array.from(
            raiz.querySelectorAll(
                'input[type="checkbox"]:checked, [role="checkbox"][aria-checked="true"], [role="switch"][aria-checked="true"]'
            )
        );
        for (const cb of checkboxesMarcados) {
            const container = cb.closest('label, tr, li, div') || cb.parentElement;
            const texto = (container as HTMLElement)?.innerText || '';
            for (const u of listaUnidades) {
                if (texto.toLowerCase().includes(u.norm)) {
                    unidadesEncontradas.add(u.nome);
                }
            }
        }

        if (unidadesEncontradas.size === 0) {
            const secoes = Array.from(raiz.querySelectorAll('section, div, table, ul'));
            for (const sec of secoes) {
                const cabecalho = sec.querySelector('h2, h3, h4, th, legend, label');
                const tit = (cabecalho?.textContent || '').trim();
                if (/unidade/i.test(tit)) {
                    const textoSecao = (sec as HTMLElement).innerText || '';
                    for (const u of listaUnidades) {
                        if (textoSecao.toLowerCase().includes(u.norm)) {
                            unidadesEncontradas.add(u.nome);
                        }
                    }
                }
            }
        }

        const materiasSet = new Set<string>();
        const blocos = Array.from(raiz.querySelectorAll('section, div, fieldset, table'));
        for (const bloco of blocos) {
            const cabecalho = bloco.querySelector('h2, h3, h4, label, legend, th');
            const tituloTxt = (cabecalho?.textContent || '').trim();
            if (/(especialidade|mat[eé]ria|disciplina|servi[cç]o)/i.test(tituloTxt)) {
                const itens = Array.from(
                    bloco.querySelectorAll(
                        'input[type="checkbox"]:checked, [role="checkbox"][aria-checked="true"], option:checked, td, li, span[class*="badge" i], span[class*="tag" i], span[class*="chip" i]'
                    )
                );
                for (const el of itens) {
                    const val =
                        el.tagName === 'INPUT'
                            ? (
                                el.closest('label, tr, li')?.textContent ||
                                el.parentElement?.textContent ||
                                ''
                            ).trim()
                            : (el.textContent || '').trim();

                    if (
                        val.length >= 3 &&
                        val.length <= 45 &&
                        !/(especialidade|mat[eé]ria|disciplina|servi[cç]o|selecione|adicionar|buscar|ativo|inativo|a[cç][oõ]es)/i.test(
                            val
                        )
                    ) {
                        materiasSet.add(val);
                    }
                }
            }
        }

        return {
            nomeBruto,
            unidades: Array.from(unidadesEncontradas),
            materias: Array.from(materiasSet),
            textoMain: (raiz as HTMLElement).innerText?.replace(/\s+/g, ' ').slice(0, 350) || '',
        };
    }, nomesUnidades);
}

async function importarProfessoresPendentes(
    sql: NeonQueryFunction<false, false>,
    page: Page,
    baseUrl: string,
    unidades: UnidadeRow[]
) {
    const marcadorTodos = (await sql`
    SELECT id
    FROM importacao_profissionais_clincare
    WHERE clin_care_id = '__TODOS__'
      AND status = 'pendente'
    LIMIT 1
  `) as { id: number }[];

    if (marcadorTodos.length > 0) {
        await descobrirTodosProfissionais(
            sql,
            page,
            baseUrl,
            unidades,
            marcadorTodos[0].id
        );
    }

    const todosFila = (await sql`
    SELECT id, clin_care_id
    FROM importacao_profissionais_clincare
    WHERE clin_care_id <> '__TODOS__'
  `) as ImportacaoRow[];

    const pendentes = (await sql`
    SELECT id, clin_care_id
    FROM importacao_profissionais_clincare
    WHERE status = 'pendente'
      AND clin_care_id <> '__TODOS__'
    ORDER BY id ASC
  `) as ImportacaoRow[];

    console.log(
        `[IMPORT] Fila de importação: ${pendentes.length} pendente(s) de ${todosFila.length} total.`
    );

    if (pendentes.length === 0) return;

    const nomesUnidades = unidades.map((u) => ({
        id: u.id,
        nome: u.nome,
        clinCareId: u.clin_care_id.toLowerCase(),
        norm: normalizarTexto(u.nome),
    }));

    let logouAmostraFicha = false;

    for (const item of pendentes) {
        const urlPerfil = `${baseUrl}/painel/profissionais/${item.clin_care_id}`;
        console.log(`[IMPORT] Abrindo perfil ${urlPerfil}...`);

        try {
            await page
                .goto(urlPerfil, { waitUntil: 'networkidle', timeout: 45000 })
                .catch(() => null);
            await page.waitForTimeout(2000);

            const dadosIniciais = await extrairUnidadesEMateriasDaTela(page, nomesUnidades);
            const unidadesEncontradas = new Set<string>(dadosIniciais.unidades);
            const materiasEncontradas = new Set<string>(dadosIniciais.materias);

            // Extrai também vínculos do próprio registro no HTML/RSC da ficha
            const htmlFicha = (await page.content()).replace(/\\"/g, '"');
            const idxId = htmlFicha.toLowerCase().indexOf(item.clin_care_id.toLowerCase());
            if (idxId !== -1) {
                const trechoRegistro = htmlFicha.slice(
                    Math.max(0, idxId - 400),
                    Math.min(htmlFicha.length, idxId + 2500)
                );
                for (const u of nomesUnidades) {
                    if (
                        trechoRegistro.toLowerCase().includes(u.clinCareId) ||
                        trechoRegistro.toLowerCase().includes(`"${u.norm}"`)
                    ) {
                        unidadesEncontradas.add(u.nome);
                    }
                }
            }

            if (
                !logouAmostraFicha &&
                unidadesEncontradas.size === 0 &&
                materiasEncontradas.size === 0
            ) {
                logouAmostraFicha = true;
                console.log(`[IMPORT][DEBUG] Conteúdo da ficha: ${dadosIniciais.textoMain}`);
            }

            const nomeLimpo = limparNomeExibicao(dadosIniciais.nomeBruto);

            if (!nomeLimpo) {
                await sql`
          UPDATE importacao_profissionais_clincare
          SET status = 'erro',
              mensagem = 'Não foi possível ler o nome neste ID. Verifique o UUID.',
              atualizado_em = now()
          WHERE id = ${item.id}
        `;
                continue;
            }

            const listaUnidadesFinal = Array.from(unidadesEncontradas);
            const unidadesAlvo =
                listaUnidadesFinal.length > 0
                    ? unidades.filter((u) => listaUnidadesFinal.includes(u.nome))
                    : unidades;

            const materiasFinais =
                materiasEncontradas.size > 0
                    ? Array.from(materiasEncontradas)
                    : ['Reforço Geral'];

            for (const un of unidadesAlvo) {
                const existentes = (await sql`
          SELECT id
          FROM professores
          WHERE unidade_id = ${un.id}
            AND (clin_care_id = ${item.clin_care_id} OR lower(trim(nome)) = lower(trim(${nomeLimpo})))
          LIMIT 1
        `) as { id: number }[];

                if (existentes.length > 0) {
                    await sql`
            UPDATE professores
            SET nome = ${nomeLimpo},
                clin_care_id = ${item.clin_care_id},
                materias = ${materiasFinais}::text[],
                ativo = true
            WHERE id = ${existentes[0].id}
          `;
                } else {
                    await sql`
            INSERT INTO professores (
              nome,
              clin_care_id,
              unidade_id,
              materias,
              hora_inicio,
              hora_fim,
              ativo
            )
            VALUES (
              ${nomeLimpo},
              ${item.clin_care_id},
              ${un.id},
              ${materiasFinais}::text[],
              '08:00'::time,
              '20:00'::time,
              true
            )
          `;
                }
            }

            await sql`
        UPDATE importacao_profissionais_clincare
        SET nome_detectado = ${nomeLimpo},
            unidades_detectadas = ${unidadesAlvo.map((u) => u.nome).join(', ')},
            materias_detectadas = ${materiasFinais.join(', ')},
            status = 'importado',
            mensagem = 'Cadastrado/atualizado com sucesso',
            atualizado_em = now()
        WHERE id = ${item.id}
      `;

            console.log(
                `[IMPORT] Sucesso: ${nomeLimpo} | Unidades: ${unidadesAlvo
                    .map((u) => u.nome)
                    .join(', ')} | Matérias: ${materiasFinais.join(', ')}`
            );
        } catch (err) {
            console.error(`[IMPORT] Falha ao importar ${item.clin_care_id}:`, err);
            await sql`
        UPDATE importacao_profissionais_clincare
        SET status = 'erro',
            mensagem = 'Erro ao acessar perfil no clin.care',
            atualizado_em = now()
        WHERE id = ${item.id}
      `;
        }
    }
}

async function abrirMapaAgenda(context: BrowserContext, page: Page): Promise<Page> {
    const cardMapa = page.locator('a[aria-label="Mapa de agenda"]').first();
    if (await cardMapa.isVisible({ timeout: 8000 }).catch(() => false)) {
        const popupPromise = context.waitForEvent('page', { timeout: 6000 }).catch(() => null);
        await cardMapa.click();
        const novaAba = await popupPromise;
        const agendaPage = novaAba ?? page;
        await agendaPage.waitForTimeout(2500);
        return agendaPage;
    }
    return page;
}

async function main() {
    const databaseUrl = (process.env.DATABASE_URL || '')
        .replace(/^DATABASE_URL=/i, '')
        .replace(/^psql\s+/i, '')
        .trim()
        .replace(/^['"]+|['"]+$/g, '')
        .trim();

    const clinCareBaseUrl = (process.env.CLINCARE_URL || 'https://app.clin.care')
        .trim()
        .replace(/^['"]+|['"]+$/g, '')
        .replace(/\/(login|painel.*)$/i, '')
        .replace(/\/$/, '');

    const clinCareEmail = (process.env.CLINCARE_EMAIL || '')
        .trim()
        .replace(/^['"]+|['"]+$/g, '');
    const clinCarePassword = (process.env.CLINCARE_PASSWORD || '')
        .trim()
        .replace(/^['"]+|['"]+$/g, '');

    if (!databaseUrl.startsWith('postgres')) {
        throw new Error('DATABASE_URL inválida. Deve começar com postgresql://');
    }
    if (!clinCareEmail || !clinCarePassword) {
        throw new Error('CLINCARE_EMAIL ou CLINCARE_PASSWORD ausentes.');
    }

    const sql = neon(databaseUrl);
    await ajustarRestricaoBanco(sql);

    const unidades = (await sql`
    SELECT id, nome, clin_care_id
    FROM unidades
    WHERE ativa = true
      AND clin_care_id NOT LIKE 'id-%'
  `) as UnidadeRow[];

    const datas = (await sql`
    SELECT to_char(data, 'YYYY-MM-DD') AS data
    FROM datas_liberadas
    WHERE ativo = true
      AND data >= (now() AT TIME ZONE 'America/Bahia')::date
    ORDER BY data ASC
  `) as DataRow[];

    if (unidades.length === 0) {
        console.log('Nenhuma unidade com UUID real configurada.');
        return;
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 4200, height: 1800 },
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'pt-BR',
        timezoneId: 'America/Bahia',
    });
    const page = await context.newPage();

    try {
        await realizarLogin(page, clinCareBaseUrl, clinCareEmail, clinCarePassword);

        await importarProfessoresPendentes(sql, page, clinCareBaseUrl, unidades);

        if (datas.length === 0) {
            console.log('Nenhuma data futura liberada para sincronizar horários.');
            return;
        }

        const professoresBanco = (await sql`
      SELECT id, nome, clin_care_id, unidade_id
      FROM professores
      WHERE ativo = true
    `) as ProfessorRow[];

        await page.goto(`${clinCareBaseUrl}/painel`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        const agendaPage = await abrirMapaAgenda(context, page);

        for (const unidade of unidades) {
            for (const itemData of datas) {
                const urlMapa = `${clinCareBaseUrl}/painel/mapa-agenda?date=${itemData.data}&unitId=${unidade.clin_care_id}`;
                console.log(`[SYNC] Abrindo ${unidade.nome} | ${itemData.data}...`);

                await agendaPage
                    .goto(urlMapa, { waitUntil: 'networkidle', timeout: 60000 })
                    .catch(() => null);

                await agendaPage
                    .locator('text="08:00"')
                    .first()
                    .waitFor({ state: 'visible', timeout: 15000 })
                    .catch(() => null);

                await agendaPage.waitForTimeout(2500);

                const resultado = await agendaPage.evaluate(() => {
                    const colunas: { nome: string; left: number; right: number }[] = [];

                    const todosElementos = Array.from(document.querySelectorAll('*'));
                    for (const el of todosElementos) {
                        if (el.children.length > 0) continue;
                        const textoFolha = (el.textContent || '').trim();

                        if (textoFolha === 'Aulas' || /^\d+\.[A-Za-zÀ-ÿ]/.test(textoFolha)) {
                            let container: HTMLElement | null = el.parentElement;
                            for (let nivel = 0; nivel < 4 && container; nivel++) {
                                const rect = container.getBoundingClientRect();
                                const linhas = (container.innerText || '')
                                    .split('\n')
                                    .map((l) => l.trim())
                                    .filter(Boolean);

                                const nomeProf =
                                    linhas.find((l) => /^\d+\.[A-Za-zÀ-ÿ]/.test(l)) ||
                                    (linhas.indexOf('Aulas') > 0
                                        ? linhas[linhas.indexOf('Aulas') - 1]
                                        : '');

                                if (
                                    nomeProf &&
                                    nomeProf !== 'BLOQUEIO' &&
                                    nomeProf.length <= 60 &&
                                    rect.width >= 100 &&
                                    rect.width <= 450 &&
                                    rect.height >= 35 &&
                                    rect.height <= 260
                                ) {
                                    const jaExiste = colunas.some(
                                        (c) => Math.abs(c.left - rect.left) < 25
                                    );
                                    if (!jaExiste) {
                                        colunas.push({
                                            nome: nomeProf,
                                            left: rect.left,
                                            right: rect.right,
                                        });
                                    }
                                    break;
                                }
                                container = container.parentElement;
                            }
                        }
                    }

                    colunas.sort((a, b) => a.left - b.left);

                    const regexHorario = /^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/;
                    const blocos: BloqueioGrade[] = [];
                    const assinaturasVistas = new Set<string>();

                    const candidatosBloco = Array.from(
                        document.querySelectorAll('div, article, section, button')
                    );

                    for (const no of candidatosBloco) {
                        const texto = (no as HTMLElement).innerText?.trim() || '';
                        const match = texto.match(regexHorario);
                        if (!match) continue;

                        const rect = no.getBoundingClientRect();
                        if (rect.width < 60 || rect.width > 450 || rect.height < 16) continue;

                        const centroX = rect.left + rect.width / 2;
                        const colunaDona = colunas.find(
                            (c) => centroX >= c.left - 12 && centroX <= c.right + 12
                        );
                        if (!colunaDona) continue;

                        const horaInicio = match[1];
                        let horaFim = match[2];
                        if (horaFim <= horaInicio) {
                            horaFim = '23:59';
                        }

                        const linhasTexto = texto
                            .split('\n')
                            .map((l) => l.trim())
                            .filter((l) => l && l !== '.');
                        const motivo =
                            linhasTexto.slice(1).join(' - ').slice(0, 120) || 'Ocupado no clin.care';

                        const assinatura = `${colunaDona.nome}|${horaInicio}|${horaFim}`;
                        if (!assinaturasVistas.has(assinatura)) {
                            assinaturasVistas.add(assinatura);
                            blocos.push({
                                nomeProfessorBruto: colunaDona.nome,
                                horaInicio,
                                horaFim,
                                motivo,
                            });
                        }
                    }

                    return { blocos };
                });

                await sql`
          DELETE FROM bloqueios_clincare
          WHERE unidade_id = ${unidade.id}
            AND data = ${itemData.data}::date
        `;

                let gravados = 0;
                for (const bl of resultado.blocos) {
                    const profMatch = professoresBanco.find(
                        (p) =>
                            p.unidade_id === unidade.id &&
                            nomesCorrespondem(p.nome, bl.nomeProfessorBruto)
                    );

                    if (!profMatch) continue;

                    await sql`
            INSERT INTO bloqueios_clincare (
              professor_id,
              unidade_id,
              data,
              hora_inicio,
              hora_fim,
              motivo,
              atualizado_em
            )
            VALUES (
              ${profMatch.id},
              ${unidade.id},
              ${itemData.data}::date,
              ${bl.horaInicio}::time,
              ${bl.horaFim}::time,
              ${bl.motivo},
              now()
            )
          `;
                    gravados++;
                }

                console.log(
                    `Concluído ${unidade.nome} (${itemData.data}): ${resultado.blocos.length} bloco(s) lido(s), ${gravados} gravado(s) no Neon.`
                );
            }
        }
    } finally {
        await browser.close();
    }
}

main().catch((err) => {
    console.error('Falha na sincronização com clin.care:', err);
    process.exit(1);
});