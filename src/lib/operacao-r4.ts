import { LISTA_STATUS_AULA_R4 } from './agenda-status-r4';

export const PERMISSOES_R4 = {
    simultaneos: 'Realizar aulas simultâneas',
    agenda: 'Criar e editar aulas na agenda',
    editarAlunos: 'Editar alunos',
    todosAlunos: 'Visualizar todos os alunos',
    outrasAgendas: 'Visualizar agendas de outros professores',
    condutas: 'Cadastrar orientações pedagógicas',
    anexos: 'Anexar arquivos aos agendamentos',
    feedbackRealiza: 'Feedback marca a aula como realizada',
} as const;
export type PermissaoR4 = keyof typeof PERMISSOES_R4;

const atendimento = {
    simultaneos: true, agenda: true, editarAlunos: true, todosAlunos: true,
    outrasAgendas: true, condutas: false, anexos: true, feedbackRealiza: false,
};
const professor = {
    simultaneos: false, agenda: false, editarAlunos: false, todosAlunos: false,
    outrasAgendas: false, condutas: false, anexos: false, feedbackRealiza: false,
};

export const CORES_STATUS_R4: Record<string, string> = {
    agendado: '#087983', confirmado: '#287b65', realizado: '#89601b',
    desmarcado_com_cobranca: '#925325', desmarcado_sem_cobranca: '#a24944', cancelado: '#596e83',
    reservado: '#238b9d', remanejado: '#71558e', falta: '#a34363', ferias: '#8164a1',
    atestado: '#6c5c9b', pendente: '#356e9f',
};

export const OPERACAO_PADRAO = {
    primeiraHora: 8, ultimaHora: 22, intervalo: 30, acompanhamento: false, bloquearRetroativo: false,
    unidadeObrigatoria: true, exigirPlano: false, exibirHorario: true, prazoFeedback: null as number | null,
    exibirRepasses: true, desmarcadoSemRepasse: false, recepcaoCadastra: true, antecedencia: 2,
    prazoBloqueioProfessor: null as null | 72 | 168,
    permissoes: { atendimento, professor },
    status: Object.fromEntries(LISTA_STATUS_AULA_R4.map(({ valor }, indice) => [
        valor, { ativo: indice < 6, cor: null as string | null },
    ])),
};

export type OperacaoR4 = typeof OPERACAO_PADRAO;
export type PerfilOperacao = 'admin' | 'atendimento' | 'professor';

export function podeOperacao(cfg: OperacaoR4, perfil: PerfilOperacao, acao: PermissaoR4) {
    return perfil === 'admin' || cfg.permissoes[perfil][acao];
}

export function validarOperacao(input: unknown): OperacaoR4 | null {
    if (!input || typeof input !== 'object') return null;
    const v = input as OperacaoR4;
    const inteiro = (numero: unknown, min: number, max: number) =>
        typeof numero === 'number' && Number.isInteger(numero) && numero >= min && numero <= max;
    if (!inteiro(v.primeiraHora, 0, 23) || !inteiro(v.ultimaHora, v.primeiraHora, 23) ||
        ![10, 15, 20, 30, 60].includes(v.intervalo) || !inteiro(v.antecedencia, 0, 168) ||
        !(v.prazoFeedback === null || inteiro(v.prazoFeedback, 0, 3650))) return null;
    if (v.prazoBloqueioProfessor != null && v.prazoBloqueioProfessor !== 72 && v.prazoBloqueioProfessor !== 168) return null;
    const cfg = structuredClone(OPERACAO_PADRAO);
    cfg.prazoBloqueioProfessor = v.prazoBloqueioProfessor ?? null;
    for (const campo of ['acompanhamento', 'bloquearRetroativo', 'unidadeObrigatoria', 'exigirPlano', 'exibirHorario',
        'exibirRepasses', 'desmarcadoSemRepasse', 'recepcaoCadastra'] as const) {
        if (typeof v[campo] !== 'boolean') return null;
        cfg[campo] = v[campo];
    }
    for (const campo of ['primeiraHora', 'ultimaHora', 'intervalo', 'prazoFeedback', 'antecedencia'] as const) {
        Object.assign(cfg, { [campo]: v[campo] });
    }
    for (const perfil of ['atendimento', 'professor'] as const) {
        for (const chave of Object.keys(PERMISSOES_R4) as PermissaoR4[]) {
            if (typeof v.permissoes?.[perfil]?.[chave] !== 'boolean') return null;
            cfg.permissoes[perfil][chave] = v.permissoes[perfil][chave];
        }
    }
    for (const chave of Object.keys(cfg.status)) {
        const item = v.status?.[chave];
        if (!item || typeof item.ativo !== 'boolean' || (item.cor !== null && !/^#[0-9a-f]{6}$/i.test(item.cor))) return null;
        cfg.status[chave] = { ativo: chave === 'realizado' || item.ativo, cor: item.cor };
    }
    return cfg;
}
