import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { BrowserContext, chromium, Locator, Page } from 'playwright';
import { neon, NeonQueryFunction } from '@neondatabase/serverless';

interface UnidadeRow {
    id: number;
    nome: string;
    clin_care_id: string;
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

interface ReservaFilaRow {
    id: number;
    data: string;
    hora_inicio: string;
    materia: string;
    nome_aluno: string;
    nome_responsavel: string;
    whatsapp_responsavel: string;
    status: string;
    clincare_reserva_status: string;
    professor_id: number;
    professor_nome: string;
    professor_clin_care_id: string | null;
    unidade_id: number;
    unidade_nome: string;
    unidade_clin_care_id: string;
}

type ModoSync = 'hoje' | 'semana' | 'mes' | 'reservas';

const HORA_INICIO_PADRAO = '14:10';
const HORA_FIM_PADRAO = '20:50';
const PACIENTE_RESERVADO_ID = 'a2bb7dbc-b80c-4f99-afe4-f39f7c728db7';
const PACIENTE_RESERVADO_NOME = 'RESERVADO APP';

function obterConfiguracaoModo(): {
    modo: ModoSync;
    dias: number;
    descricao: string;
} {
    const argModo = process.argv.find((a) => a.startsWith('--modo='));
    const bruto = (
        argModo ? argModo.split('=')[1] : process.env.SYNC_MODO || 'mes'
    )
        .trim()
        .toLowerCase();

    if (bruto === 'reservas' || bruto === 'reserva') {
        return {
            modo: 'reservas',
            dias: 0,
            descricao: 'Fila de Reservas Automáticas (RESERVADO APP)',
        };
    }

    if (bruto === 'hoje' || bruto === 'dia') {
        return {
            modo: 'hoje',
            dias: 1,
            descricao: 'Hoje e Amanhã (2 dias)',
        };
    }

    if (bruto === 'semana') {
        return {
            modo: 'semana',
            dias: 7,
            descricao: 'Semana Atual (7 dias)',
        };
    }

    return {
        modo: 'mes',
        dias: 30,
        descricao: 'Mês Completo (30 dias)',
    };
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

function limparNomeMateria(servicoBruto: string): string {
    return servicoBruto
        .replace(/\s+\d+\s*(?:['′"´`]|min(?:utos?)?)?\s*(?:x\b.*)?$/i, '')
        .replace(/\s+-\s+.*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function formatarDataBR(dataISO: string): string {
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
}

function gerarProximosDiasBahia(quantidadeDias: number): string[] {
    const agora = new Date();
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bahia',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(agora);

    const ano = Number(partes.find((p) => p.type === 'year')?.value || 2026);
    const mes = Number(partes.find((p) => p.type === 'month')?.value || 1);
    const dia = Number(partes.find((p) => p.type === 'day')?.value || 1);

    const lista: string[] = [];
    for (let i = 0; i <= quantidadeDias; i++) {
        const dt = new Date(ano, mes - 1, dia + i);
        const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(
            2,
            '0'
        )}-${String(dt.getDate()).padStart(2, '0')}`;
        lista.push(iso);
    }
    return lista;
}

async function ajustarBancoSemSobrescreverTurnos(
    sql: NeonQueryFunction<false, false>
) {
    await sql`
    ALTER TABLE professores
    DROP CONSTRAINT IF EXISTS professores_clin_care_id_key
  `;

    await sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_ativo BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_inicio TIME`;
    await sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_fim TIME`;

    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS clincare_reserva_status TEXT DEFAULT 'pendente'`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS clincare_reserva_erro TEXT`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS clincare_reservado_em TIMESTAMPTZ`;

    await sql`
    DELETE FROM bloqueios_clincare
    WHERE professor_id IN (
      SELECT p.id
      FROM professores p
      WHERE p.clin_care_id IS NOT NULL
        AND p.id NOT IN (
          SELECT MIN(id)
          FROM professores
          WHERE clin_care_id IS NOT NULL
          GROUP BY clin_care_id
        )
    )
  `;

    await sql`
    DELETE FROM professores
    WHERE clin_care_id IS NOT NULL
      AND id NOT IN (
        SELECT MIN(id)
        FROM professores
        WHERE clin_care_id IS NOT NULL
        GROUP BY clin_care_id
      )
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
    await page.waitForTimeout(1500);

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

async function selecionarValorSelect(
    select: Locator,
    valoresPreferidos: string[]
): Promise<boolean> {
    const opcoes = await select
        .locator('option')
        .evaluateAll((els) =>
            els.map((o) => ({
                value: (o as HTMLOptionElement).value,
                text: (o.textContent || '').trim(),
            }))
        )
        .catch(() => []);

    for (const pref of valoresPreferidos) {
        const encontrado = opcoes.find(
            (o) =>
                o.value === pref ||
                o.text === pref ||
                (!Number.isNaN(Number(pref)) &&
                    o.value !== '' &&
                    Number(o.value) === Number(pref))
        );
        if (encontrado) {
            await select.selectOption(encontrado.value).catch(() => null);
            return true;
        }
    }
    return false;
}

async function preencherCampoDropdownModal(
    page: Page,
    textoPlaceholder: string,
    preferencias: string[],
    textoBusca?: string
): Promise<boolean> {
    const alvoNorm = normalizarTexto(textoPlaceholder);

    // 1. Localiza o campo diretamente na tela (input ou texto do placeholder) e clica no centro dele
    const coordsCampo = await page.evaluate((alvo) => {
        const norm = (s: string) =>
            s
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();

        // Tenta primeiro por input[placeholder]
        const inputs = Array.from(document.querySelectorAll('input'));
        for (let i = inputs.length - 1; i >= 0; i--) {
            const inp = inputs[i];
            const ph = norm(inp.getAttribute('placeholder') || '');
            if (ph && ph.includes(alvo)) {
                const r = inp.getBoundingClientRect();
                if (r.width > 40 && r.height > 15) {
                    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                }
            }
        }

        // Tenta por texto visível (span, div, button, label)
        const todos = Array.from(document.querySelectorAll('*'));
        for (let i = todos.length - 1; i >= 0; i--) {
            const el = todos[i] as HTMLElement;
            if (el.children.length > 1) continue;
            const txt = norm(el.innerText || el.textContent || '');
            if (txt === alvo || (txt.length <= 45 && txt.includes(alvo))) {
                const r = el.getBoundingClientRect();
                if (r.width > 30 && r.height > 12) {
                    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                }
            }
        }

        return null;
    }, alvoNorm);

    if (!coordsCampo) {
        return false;
    }

    await page.mouse.click(coordsCampo.x, coordsCampo.y);
    await page.waitForTimeout(450);

    if (textoBusca) {
        const inputFocado = page.locator('input:focus').first();
        if (
            (await inputFocado.isVisible({ timeout: 700 }).catch(() => false)) &&
            (await inputFocado.isEditable().catch(() => false))
        ) {
            await inputFocado.fill('');
            await inputFocado.pressSequentially(textoBusca, { delay: 45 });
            await page.waitForTimeout(1100);
        }
    } else {
        await page.waitForTimeout(550);
    }

    // 2. Procura a opção desejada na lista aberta e clica nas coordenadas dela
    const prefsNorm = preferencias
        .map((p) => normalizarTexto(p))
        .filter(Boolean);

    const coordsOpcao = await page.evaluate((prefs) => {
        const ignorar = new Set([
            'novo agendamento',
            'selecione o profissional',
            'selecione o paciente',
            'selecione o servico',
            'selecione a sala',
            'inicio',
            'inicio *',
            'duracao',
            'duracao *',
            'hr',
            'min',
            'recorrencia',
            'nao se repete',
            'criar atendimento',
            'agendar um evento',
            'bloqueio de agenda',
            'menu da r4 ensina',
            'criar agendamento',
            'novo paciente',
            'nova espera',
            'fatura de entrada',
            'fatura de saida',
            'editar perfil',
            'r4 ensina',
        ]);

        const norm = (s: string) =>
            s
                .replace(/^(\d+\s*\.\s*)+/, '')
                .replace(/\./g, ' ')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();

        const candidatos: { x: number; y: number; txt: string }[] = [];
        const nos = Array.from(
            document.querySelectorAll('li, [role="option"], button, div, span')
        );

        for (const el of nos) {
            const htmlEl = el as HTMLElement;
            if (htmlEl.children.length > 3) continue;
            const r = htmlEl.getBoundingClientRect();
            if (r.width < 60 || r.width > 650 || r.height < 18 || r.height > 75) {
                continue;
            }
            if (r.top < 0 || r.bottom > window.innerHeight) continue;

            const bruto = (htmlEl.innerText || htmlEl.textContent || '').trim();
            if (!bruto || bruto.length > 85) continue;

            const t = norm(bruto);
            if (!t || ignorar.has(t) || /^\d+$/.test(t)) continue;

            candidatos.push({
                x: r.left + r.width / 2,
                y: r.top + r.height / 2,
                txt: t,
            });
        }

        for (const pref of prefs) {
            const alvo = norm(pref);
            if (!alvo) continue;
            const achado = candidatos.find((c) => c.txt.includes(alvo));
            if (achado) return { x: achado.x, y: achado.y };
        }

        return candidatos.length > 0
            ? { x: candidatos[0].x, y: candidatos[0].y }
            : null;
    }, prefsNorm);

    if (coordsOpcao) {
        await page.mouse.click(coordsOpcao.x, coordsOpcao.y);
        await page.waitForTimeout(450);
        return true;
    }

    await page.keyboard.press('ArrowDown').catch(() => null);
    await page.keyboard.press('Enter').catch(() => null);
    await page.waitForTimeout(400);
    return true;
}

async function criarReservaNoClinCare(
    page: Page,
    baseUrl: string,
    ag: ReservaFilaRow
): Promise<void> {
    const servicoPadrao = (process.env.CLINCARE_SERVICO_PADRAO || '').trim();
    const salaPadrao = (process.env.CLINCARE_SALA_PADRAO || '').trim();

    let nomeProfExatoClinCare = ag.professor_nome;

    // 1. Abre o perfil do professor para ler o nome exato cadastrado (ex.: "1.Antonio.Eduardo")
    if (ag.professor_clin_care_id) {
        const urlProf = `${baseUrl}/painel/profissionais/${ag.professor_clin_care_id}`;
        console.log(
            `[RESERVA #${ag.id}] Abrindo perfil do professor em ${urlProf}...`
        );
        await page.goto(urlProf, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1000);

        const nomeLido = await page.evaluate(() => {
            const raiz = document.querySelector('main') || document.body;
            const heading = Array.from(raiz.querySelectorAll('h1, h2, h3'))
                .map((el) => (el.textContent || '').trim())
                .find(
                    (t) =>
                        t.length >= 3 &&
                        t.length <= 70 &&
                        !/^(profissionais|dados pessoais|r4 ensina|formul[aá]rios)/i.test(
                            t
                        )
                );
            return heading || '';
        });

        if (nomeLido) {
            nomeProfExatoClinCare = nomeLido;
        }
    } else {
        await page.goto(`${baseUrl}/painel`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        await page.waitForTimeout(1000);
    }

    // 2. Clica no botão fixo "Criar agendamento" no menu lateral esquerdo
    const btnMenuCriar = page
        .locator(
            'a:has-text("Criar agendamento"), button:has-text("Criar agendamento")'
        )
        .first();

    await btnMenuCriar.waitFor({ state: 'visible', timeout: 10000 });
    await btnMenuCriar.click();

    const tituloModal = page.locator('text="Novo Agendamento"').first();
    await tituloModal.waitFor({ state: 'visible', timeout: 8000 });
    await page.waitForTimeout(800);

    // 3. Profissional
    const primeiroNomeProf = ag.professor_nome.split(' ')[0] || ag.professor_nome;
    const selecionouProf = await preencherCampoDropdownModal(
        page,
        'Selecione o profissional',
        [nomeProfExatoClinCare, ag.professor_nome, primeiroNomeProf],
        primeiroNomeProf
    );
    if (!selecionouProf) {
        const camposVisiveis = await page.evaluate(() =>
            Array.from(document.querySelectorAll('input'))
                .map((i) => i.getAttribute('placeholder') || i.name || i.type)
                .filter(Boolean)
                .join(' | ')
        );
        throw new Error(
            `Campo profissional não localizado para "${nomeProfExatoClinCare}". Inputs visíveis: [${camposVisiveis}]`
        );
    }

    // 4. Paciente -> RESERVADO APP
    const selecionouPaciente = await preencherCampoDropdownModal(
        page,
        'Selecione o paciente',
        [PACIENTE_RESERVADO_NOME, 'RESERVADO', PACIENTE_RESERVADO_ID],
        'RESERVADO'
    );
    if (!selecionouPaciente) {
        throw new Error(
            `Não foi possível selecionar o paciente "${PACIENTE_RESERVADO_NOME}".`
        );
    }

    // 5. Serviço (ex.: Aulas)
    const selecionouServico = await preencherCampoDropdownModal(
        page,
        'Selecione o serviço',
        [servicoPadrao, 'Aulas', ag.materia, 'Reforço', 'Aula']
    );
    if (!selecionouServico) {
        throw new Error('Não foi possível selecionar um serviço obrigatório.');
    }

    // 6. Sala
    const selecionouSala = await preencherCampoDropdownModal(
        page,
        'Selecione a sala',
        [salaPadrao, ag.unidade_nome, 'Sala']
    );
    if (!selecionouSala) {
        throw new Error('Não foi possível selecionar uma sala obrigatória.');
    }

    // 7. Data de início (DD/MM/YYYY)
    const dataBR = formatarDataBR(ag.data);
    const inputData = page
        .locator('input[placeholder*="/" i], input[value*="/202"], input[type="date"]')
        .last();
    if (await inputData.isVisible({ timeout: 1500 }).catch(() => false)) {
        const tipoInput = (await inputData.getAttribute('type')) || '';
        const valorDesejado = tipoInput === 'date' ? ag.data : dataBR;
        await inputData.click({ force: true });
        await inputData.fill(valorDesejado);
        const valorAtual = await inputData.inputValue().catch(() => '');
        if (valorAtual !== valorDesejado) {
            await page.keyboard.press('Control+A').catch(() => null);
            await page.keyboard.type(valorDesejado, { delay: 30 }).catch(() => null);
        }
    }

    // 8. Horário de início e Duração (1 hr 40 min = 100 min)
    const [hhRaw, mmRaw] = ag.hora_inicio.slice(0, 5).split(':');
    const hh = hhRaw.padStart(2, '0');
    const mm = mmRaw.padStart(2, '0');

    const selects = page.locator('select');
    const totalSelects = await selects.count();
    if (totalSelects >= 4) {
        const offset = totalSelects - 4;
        await selecionarValorSelect(selects.nth(offset + 0), [hh, String(Number(hh))]);
        await selecionarValorSelect(selects.nth(offset + 1), [mm, String(Number(mm))]);
        await selecionarValorSelect(selects.nth(offset + 2), ['1', '01']);
        await selecionarValorSelect(selects.nth(3), ['40']);
    }

    // 9. Salvar ("CRIAR ATENDIMENTO")
    const btnCriar = page
        .locator(
            'button:has-text("CRIAR ATENDIMENTO"), button:has-text("Criar atendimento")'
        )
        .last();
    await btnCriar.click({ force: true });
    await page.waitForTimeout(2500);

    const aindaAberto = await tituloModal.isVisible().catch(() => false);
    if (aindaAberto) {
        throw new Error(
            'Modal permaneceu aberto após clicar em CRIAR ATENDIMENTO (verifique se houve choque de horário ou campo obrigatório pendente).'
        );
    }
}

async function cancelarReservaNoClinCare(
    page: Page,
    baseUrl: string,
    ag: ReservaFilaRow
): Promise<void> {
    const urlMapa = `${baseUrl}/painel/mapa-agenda?date=${ag.data}&unitId=${ag.unidade_clin_care_id}`;
    console.log(
        `[CANCELAR RESERVA #${ag.id}] Buscando bloco RESERVADO APP em ${urlMapa}...`
    );

    await page.goto(urlMapa, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page
        .locator('text="08:00", text="14:00", text="14:10"')
        .first()
        .waitFor({ state: 'visible', timeout: 10000 })
        .catch(() => null);
    await page.waitForTimeout(1000);

    const hhmm = ag.hora_inicio.slice(0, 5);

    for (let passo = 0; passo < 4; passo++) {
        const blocoReservado = page
            .locator(`div:has-text("${hhmm}"):has-text("RESERVADO")`)
            .last();

        if (await blocoReservado.isVisible({ timeout: 1200 }).catch(() => false)) {
            await blocoReservado.click({ force: true });
            await page.waitForTimeout(1000);

            const btnExcluir = page
                .locator(
                    'button:has-text("Cancelar"), button:has-text("Excluir"), button:has-text("Desmarcar"), button:has-text("Remover")'
                )
                .first();

            if (await btnExcluir.isVisible({ timeout: 3000 }).catch(() => false)) {
                await btnExcluir.click();
                await page.waitForTimeout(800);

                const btnConfirmar = page
                    .locator(
                        'button:has-text("Confirmar"), button:has-text("Sim"), button:has-text("Excluir")'
                    )
                    .last();
                if (await btnConfirmar.isVisible({ timeout: 2000 }).catch(() => false)) {
                    await btnConfirmar.click();
                    await page.waitForTimeout(1500);
                }
            }
            return;
        }

        await page.evaluate(() => {
            const scrollables = Array.from(document.querySelectorAll('*')).filter(
                (el) => el.scrollWidth > el.clientWidth + 50
            );
            for (const el of scrollables) {
                el.scrollLeft += 1800;
            }
        });
        await page.waitForTimeout(500);
    }
}

async function processarFilaReservas(
    sql: NeonQueryFunction<false, false>,
    page: Page,
    baseUrl: string
) {
    const pendentes = (await sql`
    SELECT
      a.id,
      to_char(a.data, 'YYYY-MM-DD') AS data,
      to_char(a.hora_inicio, 'HH24:MI') AS hora_inicio,
      a.materia,
      a.nome_aluno,
      COALESCE(a.nome_responsavel, '') AS nome_responsavel,
      COALESCE(a.whatsapp_responsavel, '') AS whatsapp_responsavel,
      a.status,
      COALESCE(a.clincare_reserva_status, 'pendente') AS clincare_reserva_status,
      p.id AS professor_id,
      p.nome AS professor_nome,
      p.clin_care_id AS professor_clin_care_id,
      u.id AS unidade_id,
      u.nome AS unidade_nome,
      u.clin_care_id AS unidade_clin_care_id
    FROM agendamentos a
    JOIN professores p ON p.id = a.professor_id
    JOIN unidades u ON u.id = a.unidade_id
    WHERE u.clin_care_id NOT LIKE 'id-%'
      AND (
        (a.status = 'confirmado' AND COALESCE(a.clincare_reserva_status, 'pendente') IN ('pendente', 'reservando'))
        OR (a.status = 'cancelado' AND a.clincare_reserva_status = 'cancelar_pendente')
      )
    ORDER BY a.id ASC
  `) as ReservaFilaRow[];

    if (pendentes.length === 0) {
        console.log('[RESERVAS] Nenhuma reserva ou cancelamento pendente na fila.');
        return;
    }

    console.log(`[RESERVAS] ${pendentes.length} item(ns) na fila para processar...`);

    for (const item of pendentes) {
        if (item.status === 'cancelado') {
            try {
                await cancelarReservaNoClinCare(page, baseUrl, item);
                await sql`
          UPDATE agendamentos
          SET clincare_reserva_status = 'cancelado_clincare',
              clincare_reserva_erro = NULL
          WHERE id = ${item.id}
        `;
                console.log(`[RESERVA #${item.id}] Bloco RESERVADO removido no clin.care.`);
            } catch (err) {
                console.error(`[RESERVA #${item.id}] Falha ao cancelar no clin.care:`, err);
            }
            continue;
        }

        await sql`
      UPDATE agendamentos
      SET clincare_reserva_status = 'reservando',
          clincare_reserva_erro = NULL
      WHERE id = ${item.id}
    `;

        try {
            await criarReservaNoClinCare(page, baseUrl, item);
            await sql`
        UPDATE agendamentos
        SET clincare_reserva_status = 'reservado',
            clincare_reserva_erro = NULL,
            clincare_reservado_em = now()
        WHERE id = ${item.id}
      `;
            console.log(
                `[RESERVA #${item.id}] Sucesso! Reservado como "${PACIENTE_RESERVADO_NOME}" no clin.care.`
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Erro desconhecido';
            console.error(`[RESERVA #${item.id}] Erro:`, msg);
            await sql`
        UPDATE agendamentos
        SET clincare_reserva_status = 'erro',
            clincare_reserva_erro = ${msg.slice(0, 300)}
        WHERE id = ${item.id}
      `;
        }
    }
}

function extrairParesIdNomeDeTexto(texto: string): Map<string, string> {
    const pares = new Map<string, string>();
    const textoDesescapado = texto.replace(/\\"/g, '"');

    const regexIdAntes =
        /"id"\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"[^{}]{0,250}?"(?:nome|name|fullName|full_name)"\s*:\s*"([^"]{2,80})"/gi;
    let m: RegExpExecArray | null;
    while ((m = regexIdAntes.exec(textoDesescapado)) !== null) {
        pares.set(m[1].toLowerCase(), m[2].trim());
    }

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
    await page
        .goto(urlLista, { waitUntil: 'domcontentloaded', timeout: 45000 })
        .catch(() => null);
    await page.waitForTimeout(2000);

    const selectPagina = page
        .locator('select:has(option[value="50"]), select:has(option[value="100"])')
        .first();
    if (await selectPagina.isVisible({ timeout: 1500 }).catch(() => false)) {
        const tem100 = await selectPagina.locator('option[value="100"]').count();
        await selectPagina
            .selectOption(tem100 > 0 ? '100' : '50')
            .catch(() => null);
        await page.waitForTimeout(1500);
    }

    for (let pagina = 1; pagina <= 20; pagina++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(600);

        const htmlAtual = await page.content();
        for (const [uuid, nome] of extrairParesIdNomeDeTexto(htmlAtual)) {
            paresPayloadGlobal.set(uuid, nome);
        }

        const dadosVisiveisMain = await page.evaluate(() => {
            const main = document.querySelector('main') || document.body;
            const linksProf = Array.from(
                main.querySelectorAll('a[href*="/profissionais/"]')
            )
                .map((a) => a.getAttribute('href') || '')
                .filter(Boolean);

            const textosLinhas = Array.from(
                main.querySelectorAll(
                    'tr, [role="row"], tbody td, li, h2, h3, span, p'
                )
            )
                .map((el) => (el as HTMLElement).innerText?.trim() || '')
                .filter((t) => t.length >= 3 && t.length <= 90);

            return {
                linksProf,
                textosLinhas: Array.from(new Set(textosLinhas)),
            };
        });

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

        const textosVisiveisSet = new Set(
            dadosVisiveisMain.textosLinhas.map((t) => t.toLowerCase())
        );

        for (const [uuid, nome] of paresPayloadGlobal.entries()) {
            if (idsUnidadesIgnorar.has(uuid)) continue;
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
            await page.waitForTimeout(1500);
            if (profissionaisEncontrados.size === tamanhoAntes && pagina > 2) break;
        } else {
            break;
        }
    }

    page.off('response', listener);

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

async function lerMateriasDeServicosEValoresNaMesmaAba(
    workerPage: Page
): Promise<string[]> {
    const hrefServicos = await workerPage.evaluate(() => {
        const links = Array.from(document.querySelectorAll('main a'));
        const alvo = links.find((a) =>
            /servi[cç]os\s*e\s*valores/i.test(a.textContent || '')
        ) as HTMLAnchorElement | undefined;
        if (alvo) {
            alvo.removeAttribute('target');
            return alvo.href || '';
        }
        return '';
    });

    if (hrefServicos) {
        await workerPage
            .goto(hrefServicos, { waitUntil: 'domcontentloaded', timeout: 25000 })
            .catch(() => null);
    } else {
        const textoCard = workerPage
            .locator('main :text("Serviços e Valores")')
            .first();
        if (!(await textoCard.isVisible({ timeout: 2000 }).catch(() => false))) {
            return [];
        }
        await textoCard.click({ force: true }).catch(() => null);
    }

    await workerPage
        .locator('text="BUSCAR SERVIÇOS", text="Ativo"')
        .first()
        .waitFor({ state: 'visible', timeout: 7000 })
        .catch(() => null);

    await workerPage.waitForTimeout(450);
    await workerPage.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight)
    );
    await workerPage.waitForTimeout(250);

    const servicosAtivosBrutos = await workerPage.evaluate(() => {
        const raiz = document.querySelector('main') || document.body;
        const titulos: string[] = [];

        const todosNos = Array.from(raiz.querySelectorAll('*'));
        for (const el of todosNos) {
            if (el.children.length === 0 && el.textContent?.trim() === 'Ativo') {
                let card: HTMLElement | null = el.parentElement;
                for (let nivel = 0; nivel < 4 && card; nivel++) {
                    const rect = card.getBoundingClientRect();
                    if (
                        rect.width >= 150 &&
                        rect.width <= 680 &&
                        rect.height >= 45 &&
                        rect.height <= 300
                    ) {
                        const linhas = (card.innerText || '')
                            .split('\n')
                            .map((l) => l.trim())
                            .filter(Boolean);

                        const titulo = linhas[0];
                        if (
                            titulo &&
                            titulo !== 'Ativo' &&
                            titulo !== 'Aulas' &&
                            titulo.length >= 2 &&
                            titulo.length <= 60
                        ) {
                            titulos.push(titulo);
                        }
                        break;
                    }
                    card = card.parentElement;
                }
            }
        }

        return titulos;
    });

    const materiasUnicas = new Map<string, string>();
    for (const bruto of servicosAtivosBrutos) {
        const limpa = limparNomeMateria(bruto);
        const chave = normalizarTexto(limpa);
        if (limpa.length >= 2 && chave && !materiasUnicas.has(chave)) {
            materiasUnicas.set(chave, limpa);
        }
    }

    return Array.from(materiasUnicas.values());
}

async function processarUmProfessor(
    sql: NeonQueryFunction<false, false>,
    workerPage: Page,
    baseUrl: string,
    unidades: UnidadeRow[],
    item: ImportacaoRow
) {
    const unidadePadrao = unidades[0];
    const urlPerfil = `${baseUrl}/painel/profissionais/${item.clin_care_id}`;

    try {
        await workerPage
            .goto(urlPerfil, { waitUntil: 'domcontentloaded', timeout: 30000 })
            .catch(() => null);

        await workerPage
            .locator('main :text("Serviços e Valores")')
            .first()
            .waitFor({ state: 'visible', timeout: 8000 })
            .catch(() => null);

        await workerPage.waitForTimeout(350);

        const nomeBruto = await workerPage.evaluate(() => {
            const raiz = document.querySelector('main') || document.body;
            const heading = Array.from(raiz.querySelectorAll('h1, h2, h3'))
                .map((el) => (el.textContent || '').trim())
                .find(
                    (t) =>
                        t.length >= 3 &&
                        t.length <= 70 &&
                        !/^(profissionais|editar|dados|dados pessoais|unidades|especialidades|servi[cç]os|r4 ensina|agenda|hor[aá]rios)$/i.test(
                            t
                        )
                );
            return heading || '';
        });

        const nomeLimpo = limparNomeExibicao(nomeBruto);

        if (!nomeLimpo) {
            await sql`
        UPDATE importacao_profissionais_clincare
        SET status = 'erro',
            mensagem = 'Não foi possível ler o nome neste ID. Verifique o UUID.',
            atualizado_em = now()
        WHERE id = ${item.id}
      `;
            return;
        }

        const materiasDetectadas = await lerMateriasDeServicosEValoresNaMesmaAba(
            workerPage
        );
        const materiasFinais =
            materiasDetectadas.length > 0 ? materiasDetectadas : ['Reforço Geral'];

        const existentes = (await sql`
      SELECT id, unidade_id
      FROM professores
      WHERE clin_care_id = ${item.clin_care_id}
         OR lower(trim(nome)) = lower(trim(${nomeLimpo}))
      ORDER BY id ASC
    `) as { id: number; unidade_id: number }[];

        let nomesUnidadesAtuais: string[] = [];

        if (existentes.length > 0) {
            await sql`
        UPDATE professores
        SET nome = ${nomeLimpo},
            clin_care_id = ${item.clin_care_id},
            materias = ${materiasFinais}::text[]
        WHERE clin_care_id = ${item.clin_care_id}
           OR lower(trim(nome)) = lower(trim(${nomeLimpo}))
      `;

            const idsUnidades = Array.from(
                new Set(existentes.map((e) => e.unidade_id))
            );
            nomesUnidadesAtuais = unidades
                .filter((u) => idsUnidades.includes(u.id))
                .map((u) => u.nome);
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
          ${unidadePadrao.id},
          ${materiasFinais}::text[],
          ${HORA_INICIO_PADRAO}::time,
          ${HORA_FIM_PADRAO}::time,
          true
        )
      `;
            nomesUnidadesAtuais = [unidadePadrao.nome];
        }

        await sql`
      UPDATE importacao_profissionais_clincare
      SET nome_detectado = ${nomeLimpo},
          unidades_detectadas = ${
            nomesUnidadesAtuais.join(', ') || unidadePadrao.nome
        },
          materias_detectadas = ${materiasFinais.join(', ')},
          status = 'importado',
          mensagem = 'Cadastrado/atualizado com sucesso',
          atualizado_em = now()
      WHERE id = ${item.id}
    `;
    } catch (err) {
        console.error(`[IMPORT] Falha ao importar ${item.clin_care_id}:`, err);
        await sql`
      UPDATE importacao_profissionais_clincare
      SET status = 'erro',
          mensagem = 'Erro ao acessar perfil/serviços no clin.care',
          atualizado_em = now()
      WHERE id = ${item.id}
    `;
    }
}

async function importarProfessoresPendentes(
    sql: NeonQueryFunction<false, false>,
    context: BrowserContext,
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

    const pendentes = (await sql`
    SELECT id, clin_care_id
    FROM importacao_profissionais_clincare
    WHERE status = 'pendente'
      AND clin_care_id <> '__TODOS__'
    ORDER BY id ASC
  `) as ImportacaoRow[];

    if (pendentes.length === 0) return;

    console.log(`[IMPORT] Processando ${pendentes.length} professor(es) pendente(s)...`);

    const fila = [...pendentes];
    const numWorkers = Math.min(4, fila.length);

    const workers = Array.from({ length: numWorkers }, async () => {
        const workerPage = await context.newPage();
        try {
            while (fila.length > 0) {
                const proximo = fila.shift();
                if (!proximo) break;
                await processarUmProfessor(sql, workerPage, baseUrl, unidades, proximo);
            }
        } finally {
            await workerPage.close().catch(() => null);
        }
    });

    await Promise.all(workers);
}

async function abrirMapaAgenda(
    context: BrowserContext,
    page: Page
): Promise<Page> {
    const cardMapa = page.locator('a[aria-label="Mapa de agenda"]').first();
    if (await cardMapa.isVisible({ timeout: 6000 }).catch(() => false)) {
        const popupPromise = context
            .waitForEvent('page', { timeout: 5000 })
            .catch(() => null);
        await cardMapa.click();
        const novaAba = await popupPromise;
        const agendaPage = novaAba ?? page;
        await agendaPage.waitForTimeout(1200);
        return agendaPage;
    }
    return page;
}

async function extrairGradeVisivel(agendaPage: Page): Promise<{
    colunasNomes: string[];
    blocos: BloqueioGrade[];
}> {
    return agendaPage.evaluate(() => {
        const colunas: { nome: string; left: number; right: number }[] = [];

        const todosElementos = Array.from(document.querySelectorAll('*'));
        for (const el of todosElementos) {
            if (el.children.length > 0) continue;
            const textoFolha = (el.textContent || '').trim();

            if (
                textoFolha === 'Aulas' ||
                /^\d+\s*\.\s*[A-Za-zÀ-ÿ]/.test(textoFolha)
            ) {
                let container: HTMLElement | null = el.parentElement;
                for (let nivel = 0; nivel < 5 && container; nivel++) {
                    const rect = container.getBoundingClientRect();
                    const linhas = (container.innerText || '')
                        .split('\n')
                        .map((l) => l.trim())
                        .filter(Boolean);

                    const nomeProf =
                        linhas.find((l) => /^\d+\s*\.\s*[A-Za-zÀ-ÿ]/.test(l)) ||
                        (linhas.indexOf('Aulas') > 0
                            ? linhas[linhas.indexOf('Aulas') - 1]
                            : '');

                    if (
                        nomeProf &&
                        nomeProf !== 'BLOQUEIO' &&
                        nomeProf.length <= 60 &&
                        rect.width >= 90 &&
                        rect.width <= 500 &&
                        rect.height >= 30 &&
                        rect.height <= 300
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

        const regexIntervalo = /(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/;
        const blocos: BloqueioGrade[] = [];
        const assinaturasVistas = new Set<string>();

        const candidatosBloco = Array.from(
            document.querySelectorAll('div, article, section, button')
        );

        for (const no of candidatosBloco) {
            const texto = (no as HTMLElement).innerText?.trim() || '';
            if (!texto || texto.length > 400) continue;

            const linhasTexto = texto
                .split('\n')
                .map((l) => l.trim())
                .filter((l) => l && l !== '.');

            if (linhasTexto.length === 0 || linhasTexto.length > 8) continue;

            const linhaComHorario = linhasTexto
                .slice(0, 3)
                .find((l) => regexIntervalo.test(l));
            if (!linhaComHorario) continue;

            const match = linhaComHorario.match(regexIntervalo);
            if (!match) continue;

            const rect = no.getBoundingClientRect();
            if (rect.width < 55 || rect.width > 500 || rect.height < 14) {
                continue;
            }

            const centroX = rect.left + rect.width / 2;
            const colunaDona = colunas.find(
                (c) => centroX >= c.left - 15 && centroX <= c.right + 15
            );
            if (!colunaDona) continue;

            const horaInicio = match[1];
            let horaFim = match[2];
            if (horaFim <= horaInicio) {
                horaFim = '23:59';
            }

            const ehBloqueioManual = linhasTexto.some((l) => /bloqueio/i.test(l));
            const detalhes = linhasTexto
                .filter((l) => l !== linhaComHorario)
                .join(' - ')
                .slice(0, 120);

            const motivo = ehBloqueioManual
                ? `BLOQUEIO${detalhes ? ` - ${detalhes}` : ''}`
                : detalhes || 'Ocupado no clin.care';

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
            colunasNomes: colunas.map((c) => c.nome),
            blocos,
        };
    });
}

async function main() {
    const configModo = obterConfiguracaoModo();
    console.log(
        `[INÍCIO] Sincronização clin.care | Modo: ${configModo.modo.toUpperCase()} (${configModo.descricao})`
    );

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
    await ajustarBancoSemSobrescreverTurnos(sql);

    const unidades = (await sql`
    SELECT id, nome, clin_care_id
    FROM unidades
    WHERE ativa = true
      AND clin_care_id NOT LIKE 'id-%'
    ORDER BY id ASC
  `) as UnidadeRow[];

    if (unidades.length === 0) {
        console.log('Nenhuma unidade com UUID real configurada.');
        return;
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 4200, height: 2200 },
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'pt-BR',
        timezoneId: 'America/Bahia',
    });
    const page = await context.newPage();

    try {
        await realizarLogin(page, clinCareBaseUrl, clinCareEmail, clinCarePassword);

        // Sempre processa primeiro a fila de reservas/cancelamentos (RESERVADO APP)
        await processarFilaReservas(sql, page, clinCareBaseUrl);

        // Se o workflow foi disparado exclusivamente para reservar horários, encerra aqui
        if (configModo.modo === 'reservas') {
            return;
        }

        const datasAlvo = gerarProximosDiasBahia(configModo.dias);

        await importarProfessoresPendentes(
            sql,
            context,
            page,
            clinCareBaseUrl,
            unidades
        );

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
            for (const dataISO of datasAlvo) {
                const urlMapa = `${clinCareBaseUrl}/painel/mapa-agenda?date=${dataISO}&unitId=${unidade.clin_care_id}`;

                await agendaPage
                    .goto(urlMapa, { waitUntil: 'domcontentloaded', timeout: 30000 })
                    .catch(() => null);

                await agendaPage
                    .locator('text="08:00", text="14:00", text="14:10"')
                    .first()
                    .waitFor({ state: 'visible', timeout: 10000 })
                    .catch(() => null);

                await agendaPage.waitForTimeout(950);

                const colunasTodas = new Set<string>();
                const blocosMapa = new Map<string, BloqueioGrade>();

                for (let passo = 0; passo < 4; passo++) {
                    const parcial = await extrairGradeVisivel(agendaPage);
                    for (const nomeCol of parcial.colunasNomes) {
                        colunasTodas.add(nomeCol);
                    }
                    for (const bl of parcial.blocos) {
                        const chave = `${bl.nomeProfessorBruto}|${bl.horaInicio}|${bl.horaFim}`;
                        if (!blocosMapa.has(chave)) {
                            blocosMapa.set(chave, bl);
                        }
                    }

                    const rolou = await agendaPage.evaluate(() => {
                        const scrollables = Array.from(
                            document.querySelectorAll('*')
                        ).filter((el) => el.scrollWidth > el.clientWidth + 50);
                        let moveu = false;
                        for (const el of scrollables) {
                            const antes = el.scrollLeft;
                            el.scrollLeft += 1800;
                            if (el.scrollLeft !== antes) moveu = true;
                        }
                        return moveu;
                    });

                    if (!rolou) break;
                    await agendaPage.waitForTimeout(500);
                }

                const blocosColetados = Array.from(blocosMapa.values());

                await sql`
          DELETE FROM bloqueios_clincare
          WHERE unidade_id = ${unidade.id}
            AND data = ${dataISO}::date
        `;

                let gravados = 0;
                for (const bl of blocosColetados) {
                    // Ignora blocos criados pelo próprio robô ("RESERVADO APP") para não duplicar com agendamentos
                    if (/reservado\s*app/i.test(bl.motivo)) continue;

                    const profMatch =
                        professoresBanco.find(
                            (p) =>
                                p.unidade_id === unidade.id &&
                                nomesCorrespondem(p.nome, bl.nomeProfessorBruto)
                        ) ||
                        professoresBanco.find((p) =>
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
              ${dataISO}::date,
              ${bl.horaInicio}::time,
              ${bl.horaFim}::time,
              ${bl.motivo},
              now()
            )
          `;
                    gravados++;
                }

                console.log(
                    `[SYNC ${configModo.modo.toUpperCase()}] ${unidade.nome} (${dataISO}): ${blocosColetados.length} lido(s), ${gravados} gravado(s).`
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