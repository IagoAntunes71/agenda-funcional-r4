export interface Unidade {
    id: number;
    nome: string;
    clin_care_id: string;
    ativa: boolean;
}

export interface Professor {
    id: number;
    nome: string;
    clin_care_id: string | null;
    unidade_id: number;
    materias: string[];
    hora_inicio: string;
    hora_fim: string;
    ativo: boolean;
}

export interface DataLiberada {
    id: number;
    data: string;
    descricao: string;
    ativo: boolean;
}

export interface SlotHorario {
    horario: string;
    disponivel: boolean;
    motivoIndisponivel?: string;
}

export interface Agendamento {
    id: number;
    protocolo: string;
    unidade_id: number;
    professor_id: number;
    materia: string;
    data: string;
    horario: string;
    nome_responsavel: string;
    whatsapp_responsavel: string;
    nome_aluno: string;
    serie_aluno: string;
    observacoes?: string;
    status: 'confirmado' | 'cancelado' | 'concluido';
    sincronizado_clincare: boolean;
    criado_em: string;
}