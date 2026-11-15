import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { BrowserContext, chromium, Page } from 'playwright';
import { neon } from '@neondatabase/serverless';

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

interface BloqueioGrade {
    nomeProfessorBruto: string;
    horaInicio: string;
    horaFim: string;
    motivo: string;
}

function normalizarNomeProfessor(texto: string): string {
    return texto
        .replace(/^\d+\s*\.\s*/, '') // Remove prefixo numérico ("1." ou "2.")
        .replace(/\./g, ' ') // Converte pontos em espaços ("Arthur.Sarquis" -> "Arthur Sarquis")
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

async function realizarLoginEAbrirMapa(
    context: BrowserContext,
    page: Page,
    baseUrl: string,
    email: string,
    senha: string
): Promise<Page> {
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

    // Seleciona especificamente o link do cartão "Mapa de agenda" visível no painel
    const cardMapa = page.locator('a[aria-label="Mapa de agenda"]').first();
    await cardMapa.waitFor({ state: 'visible', timeout: 15000 });

    const popupPromise = context.waitForEvent('page', { timeout: 6000 }).catch(() => null);
    await cardMapa.click();
    const novaAba = await popupPromise;

    const agendaPage = novaAba ?? page;
    await agendaPage
        .waitForURL((url) => url.pathname.includes('/painel/mapa-agenda'), {
            timeout: 20000,
        })
        .catch(() => null);

    await agendaPage.waitForTimeout(3000);
    console.log(`[MAPA] Tela aberta em: ${agendaPage.url()}`);
    return agendaPage;
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

    console.log(
        `[CONFIG] Unidades válidas: ${unidades.length} | Datas futuras ativas: ${datas.length}`
    );

    if (unidades.length === 0 || datas.length === 0) {
        console.log('Nenhuma unidade com UUID real ou data futura liberada encontrada.');
        return;
    }

    const professoresBanco = (await sql`
    SELECT id, nome, clin_care_id, unidade_id
    FROM professores
    WHERE ativo = true
  `) as ProfessorRow[];

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
        const agendaPage = await realizarLoginEAbrirMapa(
            context,
            page,
            clinCareBaseUrl,
            clinCareEmail,
            clinCarePassword
        );

        for (const unidade of unidades) {
            for (const itemData of datas) {
                const urlMapa = `${clinCareBaseUrl}/painel/mapa-agenda?date=${itemData.data}&unitId=${unidade.clin_care_id}`;
                console.log(`[SYNC] Abrindo ${unidade.nome} | ${itemData.data}...`);

                await agendaPage.goto(urlMapa, {
                    waitUntil: 'networkidle',
                    timeout: 60000,
                }).catch(() => null);

                await agendaPage
                    .locator('text="08:00"')
                    .first()
                    .waitFor({ state: 'visible', timeout: 15000 })
                    .catch(() => null);

                await agendaPage.waitForTimeout(2500);

                const resultado = await agendaPage.evaluate(() => {
                    const colunas: { nome: string; left: number; right: number }[] = [];

                    // Localiza os cabeçalhos das colunas dos professores ("1.Nome.Sobrenome" / "Aulas")
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

                    // Captura os cartões de agendamento/bloqueio ("HH:MM - HH:MM") dentro de cada coluna
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

                    return {
                        urlAtual: window.location.href,
                        nomesColunas: colunas.map((c) => c.nome),
                        blocos,
                        amostraTexto:
                            colunas.length === 0
                                ? (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 250)
                                : '',
                    };
                });

                console.log(`[MAPA] URL lida: ${resultado.urlAtual}`);
                console.log(
                    `[GRADE] Colunas detetadas em ${unidade.nome}: ${
                        resultado.nomesColunas.join(', ') || 'nenhuma'
                    }`
                );

                if (resultado.nomesColunas.length === 0 && resultado.amostraTexto) {
                    console.log(`[DEBUG] Texto visível na tela: ${resultado.amostraTexto}`);
                }

                await sql`
          DELETE FROM bloqueios_clincare
          WHERE unidade_id = ${unidade.id}
            AND data = ${itemData.data}::date
        `;

                let gravados = 0;
                for (const bl of resultado.blocos) {
                    const nomeNormalizado = normalizarNomeProfessor(bl.nomeProfessorBruto);

                    const profMatch = professoresBanco.find(
                        (p) =>
                            p.unidade_id === unidade.id &&
                            normalizarNomeProfessor(p.nome) === nomeNormalizado
                    );

                    if (!profMatch) {
                        console.log(
                            `[AVISO] Bloco ${bl.horaInicio}-${bl.horaFim} de "${bl.nomeProfessorBruto}" ignorado (professor não cadastrado no /admin para ${unidade.nome}).`
                        );
                        continue;
                    }

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