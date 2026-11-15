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

async function importarProfessoresPendentes(
    sql: NeonQueryFunction<false, false>,
    page: Page,
    baseUrl: string,
    unidades: UnidadeRow[]
) {
    const pendentes = (await sql`
    SELECT id, clin_care_id
    FROM importacao_profissionais_clincare
    WHERE status = 'pendente'
    ORDER BY id ASC
  `) as ImportacaoRow[];

    if (pendentes.length === 0) return;

    console.log(`[IMPORT] ${pendentes.length} professor(es) pendente(s) para importar...`);

    const nomesUnidades = unidades.map((u) => ({
        id: u.id,
        nome: u.nome,
        norm: normalizarTexto(u.nome),
    }));

    for (const item of pendentes) {
        const urlPerfil = `${baseUrl}/painel/profissionais/${item.clin_care_id}`;
        console.log(`[IMPORT] Lendo perfil ${urlPerfil}...`);

        try {
            await page.goto(urlPerfil, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => null);
            await page.waitForTimeout(2500);

            const dadosPerfil = await page.evaluate((listaUnidades) => {
                // 1. Nome do profissional (input de nome, h1/h2 ou título do cartão)
                const inputNome = document.querySelector(
                    'input[name*="nome" i], input[name*="name" i], input[placeholder*="nome" i]'
                ) as HTMLInputElement | null;

                const heading = Array.from(document.querySelectorAll('h1, h2, h3'))
                    .map((el) => (el.textContent || '').trim())
                    .find(
                        (t) =>
                            t.length >= 3 &&
                            t.length <= 70 &&
                            !/^(profissionais|editar|dados|unidades|especialidades|servi[cç]os)$/i.test(t)
                    );

                const nomeBruto = (inputNome?.value || heading || '').trim();

                // 2. Unidades marcadas (checkboxes ativos, badges/chips ou texto da seção Unidades)
                const unidadesEncontradas = new Set<string>();
                const checkboxesMarcados = Array.from(
                    document.querySelectorAll('input[type="checkbox"]:checked')
                );
                for (const cb of checkboxesMarcados) {
                    const label =
                        cb.closest('label')?.innerText ||
                        cb.parentElement?.innerText ||
                        '';
                    for (const u of listaUnidades) {
                        if (label.toLowerCase().includes(u.norm)) {
                            unidadesEncontradas.add(u.nome);
                        }
                    }
                }

                // Caso não use checkbox padrão, verifica badges/tags selecionadas na tela
                if (unidadesEncontradas.size === 0) {
                    const blocosTexto = Array.from(
                        document.querySelectorAll('span, div, li, button, option:checked')
                    )
                        .map((el) => (el as HTMLElement).innerText?.trim() || '')
                        .filter((t) => t.length >= 4 && t.length <= 40);

                    for (const txt of blocosTexto) {
                        for (const u of listaUnidades) {
                            if (txt.toLowerCase().includes(u.norm)) {
                                unidadesEncontradas.add(u.nome);
                            }
                        }
                    }
                }

                // 3. Matérias / Especialidades / Serviços vinculados
                const materiasSet = new Set<string>();
                const secoes = Array.from(document.querySelectorAll('section, div, fieldset'));
                for (const sec of secoes) {
                    const titulo = sec.querySelector('h2, h3, h4, label, legend');
                    const tituloTxt = (titulo?.textContent || '').trim();
                    if (/(especialidade|mat[eé]ria|disciplina|servi[cç]o|cargo)/i.test(tituloTxt)) {
                        const tags = Array.from(
                            sec.querySelectorAll('span, li, option:checked, input[type="checkbox"]:checked')
                        );
                        for (const tag of tags) {
                            const val =
                                tag.tagName === 'INPUT'
                                    ? (tag.closest('label')?.innerText || tag.parentElement?.innerText || '').trim()
                                    : (tag.textContent || '').trim();

                            if (
                                val.length >= 3 &&
                                val.length <= 45 &&
                                !/(especialidade|mat[eé]ria|disciplina|servi[cç]o|selecione|adicionar|buscar)/i.test(
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
                };
            }, nomesUnidades);

            const nomeLimpo = limparNomeExibicao(dadosPerfil.nomeBruto);
            if (!nomeLimpo) {
                await sql`
          UPDATE importacao_profissionais_clincare
          SET status = 'erro',
              mensagem = 'Não foi possível ler o nome neste ID. Verifique se o UUID está correto.',
              atualizado_em = now()
          WHERE id = ${item.id}
        `;
                continue;
            }

            const unidadesAlvo =
                dadosPerfil.unidades.length > 0
                    ? unidades.filter((u) => dadosPerfil.unidades.includes(u.nome))
                    : unidades;

            const materiasFinais =
                dadosPerfil.materias.length > 0 ? dadosPerfil.materias : ['Reforço Geral'];

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

        // 1. Importa/atualiza professores pelos IDs enfileirados no /admin
        await importarProfessoresPendentes(sql, page, clinCareBaseUrl, unidades);

        if (datas.length === 0) {
            console.log('Nenhuma data futura liberada para sincronizar horários.');
            return;
        }

        // Carrega a lista atualizada de professores (já incluindo os recém-importados)
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

        // 2. Lê os bloqueios e agendamentos no Mapa de Agenda
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