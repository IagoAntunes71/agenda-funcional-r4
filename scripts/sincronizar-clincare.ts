import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { chromium } from 'playwright';
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

interface BloqueioExtraido {
    clinCareProfId?: string;
    nomeProfessor: string;
    horaInicio: string;
    horaFim: string;
    motivo: string;
}

function normalizarNome(texto: string): string {
    return texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
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
        .replace(/\/login\/?$/i, '')
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

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        locale: 'pt-BR',
        timezoneId: 'America/Bahia',
    });
    const page = await context.newPage();

    try {
        const loginUrl = `${clinCareBaseUrl}/login`;
        console.log(`[LOGIN] Acedendo a ${loginUrl}...`);
        await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Aguarda os campos do formulário ficarem visíveis no ecrã
        await page.locator('input:visible').first().waitFor({ timeout: 20000 });

        const inputsVisiveis = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('input')).map((el) => ({
                type: el.type,
                name: el.name,
                id: el.id,
                placeholder: el.placeholder,
                visible: el.offsetParent !== null,
            }));
        });
        console.log('[LOGIN] Campos detetados no ecrã:', JSON.stringify(inputsVisiveis));

        const campoSenha = page.locator('input[type="password"]:visible').first();
        const campoUsuario = page
            .locator(
                'input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):visible'
            )
            .first();

        await campoUsuario.fill(clinCareEmail);
        await campoSenha.fill(clinCarePassword);

        const botaoEntrar = page
            .locator(
                'button[type="submit"]:visible, button:has-text("Entrar"):visible, button:has-text("Acessar"):visible, button:has-text("Login"):visible'
            )
            .first();

        if (await botaoEntrar.isVisible().catch(() => false)) {
            await botaoEntrar.click();
        } else {
            await campoSenha.press('Enter');
        }

        // Aguarda até 15 segundos para sair da rota /login
        await page
            .waitForURL((url) => !url.pathname.toLowerCase().includes('/login'), {
                timeout: 15000,
            })
            .catch(() => null);

        await page.waitForTimeout(2000);
        console.log(`[LOGIN] URL após submeter: ${page.url()}`);

        if (page.url().toLowerCase().includes('/login')) {
            const textoErro = await page.evaluate(() => {
                const textos = Array.from(
                    document.querySelectorAll('[role="alert"], .alert, .error, .toast, p, span')
                )
                    .map((el) => el.textContent?.trim() || '')
                    .filter((t) => t.length > 3 && t.length < 140);
                return Array.from(new Set(textos)).slice(0, 8);
            });
            console.log(
                '[LOGIN] Permaneceu em /login. Mensagens visíveis no ecrã:',
                JSON.stringify(textoErro)
            );
            return;
        }

        // Lista os links disponíveis no painel autenticado para localizar o Mapa de Agenda
        const linksMenu = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a[href]')).map((a) => ({
                texto: (a.textContent || '').trim(),
                href: a.getAttribute('href') || '',
            }));
        });
        console.log('[MENU] Rotas encontradas:', JSON.stringify(linksMenu.slice(0, 25)));

        const linkMapa = page
            .locator(
                'a:has-text("Mapa de Agenda"), button:has-text("Mapa de Agenda"), a[href*="mapa" i], a[href*="agenda" i]'
            )
            .first();

        if (await linkMapa.isVisible({ timeout: 8000 }).catch(() => false)) {
            await linkMapa.click();
            await page.waitForTimeout(3000);
            console.log(`[MAPA] Navegou para: ${page.url()}`);
        }

        const professoresBanco = (await sql`
      SELECT id, nome, clin_care_id, unidade_id
      FROM professores
      WHERE ativo = true
    `) as ProfessorRow[];

        console.log(`[BANCO] Professores ativos cadastrados: ${professoresBanco.length}`);

        for (const unidade of unidades) {
            for (const itemData of datas) {
                console.log(
                    `[SYNC] Lendo ${unidade.nome} (${unidade.clin_care_id}) | ${itemData.data}...`
                );

                const bloqueiosExtraidos: BloqueioExtraido[] = [];
                const urlsJsonDetectadas: string[] = [];

                const listener = async (response: import('playwright').Response) => {
                    const url = response.url();
                    const contentType = response.headers()['content-type'] || '';
                    if (response.status() === 200 && contentType.includes('application/json')) {
                        urlsJsonDetectadas.push(url);
                        try {
                            const dados = await response.json();
                            const lista = Array.isArray(dados)
                                ? dados
                                : Array.isArray(dados?.data)
                                    ? dados.data
                                    : Array.isArray(dados?.agendamentos)
                                        ? dados.agendamentos
                                        : [];

                            for (const item of lista) {
                                const horaIni = String(
                                    item.hora_inicio || item.horaInicio || item.start || ''
                                ).slice(0, 5);
                                const horaFim = String(
                                    item.hora_fim || item.horaFim || item.end || ''
                                ).slice(0, 5);
                                const nomeProf = String(
                                    item.profissional_nome ||
                                    item.profissional?.nome ||
                                    item.professor ||
                                    ''
                                ).trim();
                                const idProf = item.profissional_id || item.profissional?.id || null;

                                if (horaIni && horaFim && (nomeProf || idProf)) {
                                    bloqueiosExtraidos.push({
                                        clinCareProfId: idProf ? String(idProf) : undefined,
                                        nomeProfessor: nomeProf,
                                        horaInicio: horaIni,
                                        horaFim: horaFim,
                                        motivo: 'Ocupado no clin.care',
                                    });
                                }
                            }
                        } catch {
                            // Ignora respostas JSON não estruturadas
                        }
                    }
                };

                page.on('response', listener);
                await page.waitForTimeout(3000);
                page.off('response', listener);

                console.log(
                    `[DEBUG] Endpoints JSON capturados: ${
                        urlsJsonDetectadas.slice(0, 8).join(' | ') || 'nenhum'
                    }`
                );

                await sql`
          DELETE FROM bloqueios_clincare
          WHERE unidade_id = ${unidade.id}
            AND data = ${itemData.data}::date
        `;

                let gravados = 0;
                for (const bl of bloqueiosExtraidos) {
                    const profMatch = professoresBanco.find(
                        (p) =>
                            p.unidade_id === unidade.id &&
                            ((bl.clinCareProfId && p.clin_care_id === bl.clinCareProfId) ||
                                normalizarNome(p.nome) === normalizarNome(bl.nomeProfessor))
                    );

                    if (!profMatch) continue;

                    if (bl.clinCareProfId && !profMatch.clin_care_id) {
                        await sql`
              UPDATE professores
              SET clin_care_id = ${bl.clinCareProfId}
              WHERE id = ${profMatch.id}
            `;
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
                    `Concluído ${unidade.nome} (${itemData.data}): ${gravados} bloqueio(s) gravado(s) no Neon.`
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