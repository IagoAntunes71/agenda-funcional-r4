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
    data: string; // YYYY-MM-DD
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
    horaInicio: string; // HH:MM
    horaFim: string; // HH:MM
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

    const clinCareUrl = (process.env.CLINCARE_URL || 'https://app.clin.care')
        .trim()
        .replace(/^['"]+|['"]+$/g, '');
    const clinCareEmail = (process.env.CLINCARE_EMAIL || '')
        .trim()
        .replace(/^['"]+|['"]+$/g, '');
    const clinCarePassword = (process.env.CLINCARE_PASSWORD || '')
        .trim()
        .replace(/^['"]+|['"]+$/g, '');

    if (!databaseUrl.startsWith('postgres')) {
        throw new Error(
            'DATABASE_URL inválida nos Secrets do GitHub. Ela deve começar com postgresql://'
        );
    }

    if (!clinCareEmail || !clinCarePassword) {
        throw new Error(
            'Variáveis CLINCARE_EMAIL ou CLINCARE_PASSWORD ausentes nos Secrets do GitHub.'
        );
    }

    const sql = neon(databaseUrl);

    // 1. Busca unidades com UUID válido e datas futuras liberadas
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

    if (unidades.length === 0 || datas.length === 0) {
        console.log('Nenhuma unidade configurada ou data futura liberada para sincronizar.');
        return;
    }

    console.log(
        `Iniciando sincronização: ${unidades.length} unidade(s) e ${datas.length} data(s).`
    );

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        locale: 'pt-BR',
        timezoneId: 'America/Bahia',
    });
    const page = await context.newPage();

    try {
        // 2. Login no clin.care
        console.log('Acessando tela de login do clin.care...');
        await page.goto(clinCareUrl, { waitUntil: 'networkidle', timeout: 60000 });

        await page
            .locator('input[type="email"], input[name*="email" i], input[name*="user" i]')
            .first()
            .fill(clinCareEmail);

        await page
            .locator('input[type="password"]')
            .first()
            .fill(clinCarePassword);

        await page
            .locator('button[type="submit"], button:has-text("Entrar")')
            .first()
            .click();

        await page.waitForLoadState('networkidle', { timeout: 60000 });
        console.log('Login realizado com sucesso.');

        // 3. Navega até o Mapa de Agenda
        const linkMapa = page
            .locator('a:has-text("Mapa de Agenda"), button:has-text("Mapa de Agenda"), a[href*="mapa" i]')
            .first();

        if (await linkMapa.isVisible({ timeout: 10000 }).catch(() => false)) {
            await linkMapa.click();
            await page.waitForLoadState('networkidle', { timeout: 60000 });
        }

        const professoresBanco = (await sql`
      SELECT id, nome, clin_care_id, unidade_id
      FROM professores
      WHERE ativo = true
    `) as ProfessorRow[];

        // 4. Itera por unidade e data liberada para ler horários ocupados
        for (const unidade of unidades) {
            for (const itemData of datas) {
                console.log(`Lendo Mapa de Agenda: ${unidade.nome} | ${itemData.data}...`);

                const bloqueiosExtraidos: BloqueioExtraido[] = [];

                // Intercepta respostas JSON da API interna do Mapa de Agenda do clin.care
                const listener = async (response: import('playwright').Response) => {
                    const url = response.url();
                    if (
                        response.status() === 200 &&
                        (url.includes('agenda') || url.includes('mapa') || url.includes('schedule'))
                    ) {
                        try {
                            const contentType = response.headers()['content-type'] || '';
                            if (!contentType.includes('application/json')) return;
                            const dados = await response.json();

                            // Adapta leitura caso a resposta contenha lista de agendamentos/bloqueios
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
                            // Ignora respostas JSON não relacionadas
                        }
                    }
                };

                page.on('response', listener);

                // Seleciona unidade e data na tela (ou recarrega rota com query params)
                await page.waitForTimeout(2500);
                page.off('response', listener);

                // Atualiza tabela bloqueios_clincare no Neon para esta unidade e data
                await sql`
          DELETE FROM bloqueios_clincare
          WHERE unidade_id = ${unidade.id}
            AND data = ${itemData.data}::date
        `;

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
                }

                console.log(
                    `Concluído ${unidade.nome} (${itemData.data}): ${bloqueiosExtraidos.length} bloqueio(s) processado(s).`
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