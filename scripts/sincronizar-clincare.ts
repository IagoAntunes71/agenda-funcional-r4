import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { chromium, Page } from 'playwright';
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
        .replace(/^\d+\s*\.\s*/, '') // Remove prefixo como "1." ou "2."
        .replace(/\./g, ' ') // Troca pontos por espaços ("Arthur.Sarquis" -> "Arthur Sarquis")
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

async function realizarLogin(page: Page, baseUrl: string, email: string, senha: string) {
    const destinoInicial = `${baseUrl}/painel/mapa-agenda`;
    console.log(`[LOGIN] Acedendo a ${destinoInicial}...`);

    await page.goto(destinoInicial, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    if (page.url().includes('/painel/mapa-agenda')) {
        console.log('[LOGIN] Sessão já autenticada.');
        return;
    }

    console.log(`[LOGIN] Redirecionado para tela de acesso: ${page.url()}`);

    // Procura campos visíveis na página principal ou dentro de iframes
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

    console.log(`[LOGIN] Autenticado com sucesso: ${page.url()}`);
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
        viewport: { width: 3200, height: 1400 },
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'pt-BR',
        timezoneId: 'America/Bahia',
    });
    const page = await context.newPage();

    try {
        await realizarLogin(page, clinCareBaseUrl, clinCareEmail, clinCarePassword);

        for (const unidade of unidades) {
            for (const itemData of datas) {
                const urlMapa = `${clinCareBaseUrl}/painel/mapa-agenda?date=${itemData.data}&unitId=${unidade.clin_care_id}`;
                console.log(`[SYNC] Abrindo ${unidade.nome} | ${itemData.data}...`);

                await page.goto(urlMapa, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await page.waitForTimeout(4500);

                // Extrai as colunas dos professores e os cartões de horário/bloqueio pela posição na grelha
                const resultado = await page.evaluate(() => {
                    const colunas: { nome: string; left: number; right: number }[] = [];

                    // Localiza os cabeçalhos de cada coluna (ex: "1.Arthur.Sarquis\nAulas")
                    const elementos = Array.from(document.querySelectorAll('div, header, th'));
                    for (const el of elementos) {
                        const texto = (el as HTMLElement).innerText?.trim() || '';
                        const linhas = texto
                            .split('\n')
                            .map((l) => l.trim())
                            .filter(Boolean);

                        if (
                            linhas.length >= 2 &&
                            linhas.length <= 4 &&
                            linhas[1] === 'Aulas' &&
                            linhas[0].length >= 3 &&
                            linhas[0].length <= 50
                        ) {
                            const rect = el.getBoundingClientRect();
                            if (rect.width >= 100 && rect.width <= 450 && rect.height >= 40) {
                                const jaExiste = colunas.some(
                                    (c) => Math.abs(c.left - rect.left) < 25
                                );
                                if (!jaExiste) {
                                    colunas.push({
                                        nome: linhas[0],
                                        left: rect.left,
                                        right: rect.right,
                                    });
                                }
                            }
                        }
                    }

                    colunas.sort((a, b) => a.left - b.left);

                    // Localiza todos os blocos horários na grelha (ex: "08:30 - 20:30\nBLOQUEIO\n...")
                    const regexHorario = /^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/;
                    const blocos: BloqueioGrade[] = [];
                    const assinaturasVistas = new Set<string>();

                    const todosNos = Array.from(document.querySelectorAll('div, article, section'));
                    for (const no of todosNos) {
                        const texto = (no as HTMLElement).innerText?.trim() || '';
                        const match = texto.match(regexHorario);
                        if (!match) continue;

                        const rect = no.getBoundingClientRect();
                        if (rect.width < 60 || rect.width > 450 || rect.height < 18) continue;

                        const centroX = rect.left + rect.width / 2;
                        const colunaDona = colunas.find(
                            (c) => centroX >= c.left - 10 && centroX <= c.right + 10
                        );
                        if (!colunaDona) continue;

                        const horaInicio = match[1];
                        let horaFim = match[2];
                        // Se terminar após a meia-noite (ex: "14:00 - 02:00"), limita até 23:59 no dia
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
                        nomesColunas: colunas.map((c) => c.nome),
                        blocos,
                    };
                });

                console.log(
                    `[GRADE] Colunas detetadas em ${unidade.nome}: ${
                        resultado.nomesColunas.join(', ') || 'nenhuma'
                    }`
                );

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