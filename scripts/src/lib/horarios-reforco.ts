export interface SlotAula {
    inicio: string;
    fim: string;
    label: string;
    periodo: 'manha' | 'tarde';
}

export interface IntervaloOcupado {
    hora_inicio: string;
    hora_fim: string;
    motivo?: string | null;
}

export interface ConfiguracaoProfessorHorario {
    manha_ativo?: boolean | null;
    manha_inicio?: string | null;
    manha_fim?: string | null;
    hora_inicio?: string | null;
    hora_fim?: string | null;
}

export type ModoChaveMestra = 'auto' | 'ativo' | 'inativo';

export const SLOTS_FIXOS_100_MIN: SlotAula[] = [
    { inicio: '14:10', fim: '15:50', label: '14:10 às 15:50', periodo: 'tarde' },
    { inicio: '15:50', fim: '17:30', label: '15:50 às 17:30', periodo: 'tarde' },
    { inicio: '17:30', fim: '19:10', label: '17:30 às 19:10', periodo: 'tarde' },
    { inicio: '19:10', fim: '20:50', label: '19:10 às 20:50', periodo: 'tarde' },
];

export function horaParaMinutos(hora: string): number {
    const [hStr, mStr] = String(hora || '00:00').trim().split(':');
    const h = Number(hStr) || 0;
    const m = Number(mStr) || 0;
    return h * 60 + m;
}

export function minutosParaHora(totalMinutos: number): string {
    const h = Math.floor(totalMinutos / 60);
    const m = totalMinutos % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function gerarSlots100MinNoIntervalo(
    inicio: string | null | undefined,
    fim: string | null | undefined,
    periodo: 'manha' | 'tarde'
): SlotAula[] {
    if (!inicio || !fim) return [];
    const iniMin = horaParaMinutos(inicio);
    const fimMin = horaParaMinutos(fim);
    if (fimMin - iniMin < 100) return [];

    const slots: SlotAula[] = [];
    for (let atual = iniMin; atual + 100 <= fimMin; atual += 100) {
        const sIni = minutosParaHora(atual);
        const sFim = minutosParaHora(atual + 100);
        slots.push({
            inicio: sIni,
            fim: sFim,
            label: `${sIni} às ${sFim}`,
            periodo,
        });
    }
    return slots;
}

export function gerarTodosSlotsProfessor(
    prof: ConfiguracaoProfessorHorario
): SlotAula[] {
    const slotsManha = prof.manha_ativo
        ? gerarSlots100MinNoIntervalo(prof.manha_inicio, prof.manha_fim, 'manha')
        : [];

    const inicioTarde = prof.hora_inicio || '14:10';
    const fimTarde = prof.hora_fim || '20:50';
    const slotsTarde = gerarSlots100MinNoIntervalo(
        inicioTarde,
        fimTarde,
        'tarde'
    );

    const mapa = new Map<string, SlotAula>();
    for (const s of [...slotsManha, ...slotsTarde]) {
        if (!mapa.has(s.inicio)) {
            mapa.set(s.inicio, s);
        }
    }
    return Array.from(mapa.values());
}

export function intervalosSeSobrepoem(
    inicioA: string,
    fimA: string,
    inicioB: string,
    fimB: string
): boolean {
    const aIni = horaParaMinutos(inicioA);
    const aFim = horaParaMinutos(fimA);
    const bIni = horaParaMinutos(inicioB);
    const bFim = horaParaMinutos(fimB);

    return aIni < bFim && aFim > bIni;
}

export function obterSlotsDisponiveisProfessor(
    bloqueiosClinCare: IntervaloOcupado[],
    agendamentosLocais: IntervaloOcupado[] = [],
    profConfig?: ConfiguracaoProfessorHorario
): { todosSlots: SlotAula[]; slotsDisponiveis: SlotAula[] } {
    const todosSlots = profConfig
        ? gerarTodosSlotsProfessor(profConfig)
        : SLOTS_FIXOS_100_MIN;

    const ocupados = [...bloqueiosClinCare, ...agendamentosLocais];

    const slotsDisponiveis = todosSlots.filter((slot) => {
        const temConflito = ocupados.some((bl) =>
            intervalosSeSobrepoem(slot.inicio, slot.fim, bl.hora_inicio, bl.hora_fim)
        );
        return !temConflito;
    });

    return { todosSlots, slotsDisponiveis };
}

export function obterAgoraBahia() {
    const agora = new Date();
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bahia',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(agora);

    const get = (tipo: string) =>
        partes.find((p) => p.type === tipo)?.value || '00';

    const ano = Number(get('year'));
    const mes = Number(get('month'));
    const dia = Number(get('day'));
    const hora = Number(get('hour')) % 24;
    const minuto = Number(get('minute'));

    const dataISO = `${String(ano).padStart(4, '0')}-${String(mes).padStart(
        2,
        '0'
    )}-${String(dia).padStart(2, '0')}`;
    const diaSemana = new Date(ano, mes - 1, dia).getDay(); // 0=Dom ... 6=Sáb
    const minutosDoDia = hora * 60 + minuto;

    return { ano, mes, dia, hora, minuto, dataISO, diaSemana, minutosDoDia };
}

export function adicionarDiasISO(dataISO: string, dias: number): string {
    const [ano, mes, dia] = dataISO.split('-').map(Number);
    const dt = new Date(ano, mes - 1, dia + dias);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(
        2,
        '0'
    )}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function formatarDataISOParaBR(dataISO: string): string {
    const [ano, mes, dia] = dataISO.split('-');
    if (!ano || !mes || !dia) return dataISO;
    return `${dia}/${mes}/${ano}`;
}

export function avaliarStatusChaveMestra(modo: ModoChaveMestra): {
    aberto: boolean;
    motivoFechado: string | null;
} {
    if (modo === 'ativo') {
        return { aberto: true, motivoFechado: null };
    }

    if (modo === 'inativo') {
        return {
            aberto: false,
            motivoFechado:
                'O agendamento online está temporariamente pausado pela coordenação. Para marcar aulas, entre em contato com nosso atendimento humano (segunda a sexta, das 08:00 às 18:00).',
        };
    }

    // Modo 'auto': Segunda (1) a Sexta (5), das 18:00 às 22:00
    const { diaSemana, minutosDoDia } = obterAgoraBahia();
    const ehDiaUtil = diaSemana >= 1 && diaSemana <= 5;
    const dentroHorario = minutosDoDia >= 18 * 60 && minutosDoDia < 22 * 60;

    if (ehDiaUtil && dentroHorario) {
        return { aberto: true, motivoFechado: null };
    }

    return {
        aberto: false,
        motivoFechado:
            'O agendamento online funciona de segunda a sexta, das 18:00 às 22:00 (fora do horário de atendimento humano, que ocorre de segunda a sexta das 08:00 às 18:00).',
    };
}

export function gerarDatasDisponiveisSemana(
    modo: ModoChaveMestra,
    overrides: { data: string; ativo: boolean }[]
): { data: string; data_formatada: string }[] {
    const { dataISO, diaSemana } = obterAgoraBahia();

    const bloqueadas = new Set(
        overrides.filter((o) => !o.ativo).map((o) => o.data)
    );
    const liberadasManualmente = overrides
        .filter((o) => o.ativo && o.data > dataISO)
        .map((o) => o.data);

    const datasSet = new Set<string>();

    // De segunda (1) a sábado (6): de amanhã (+1) até domingo da semana corrente (7 - diaSemana)
    // Se hoje for domingo (0) e o admin forçou 'ativo', libera a semana seguinte (1..7)
    const limiteDias = diaSemana === 0 ? (modo === 'ativo' ? 7 : 0) : 7 - diaSemana;

    for (let offset = 1; offset <= limiteDias; offset++) {
        const dt = adicionarDiasISO(dataISO, offset);
        if (!bloqueadas.has(dt)) {
            datasSet.add(dt);
        }
    }

    // Inclui também datas extras liberadas manualmente pelo admin
    for (const dtExtra of liberadasManualmente) {
        if (!bloqueadas.has(dtExtra)) {
            datasSet.add(dtExtra);
        }
    }

    return Array.from(datasSet)
        .sort((a, b) => a.localeCompare(b))
        .map((dt) => ({
            data: dt,
            data_formatada: formatarDataISOParaBR(dt),
        }));
}