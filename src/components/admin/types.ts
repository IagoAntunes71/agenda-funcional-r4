import { MapaMateriasSeries } from '@/lib/cliente-helpers';

export interface UnidadeAdmin {
    id: number;
    nome: string;
    clin_care_id: string;
    ativa: boolean;
}

export interface ProfessorAdmin {
    id: number;
    nome: string;
    clin_care_id: string | null;
    unidade_id: number;
    unidade_nome: string;
    materias: string[];
    materias_series?: MapaMateriasSeries;
    manha_ativo: boolean;
    manha_inicio: string;
    manha_fim: string;
    hora_inicio: string;
    hora_fim: string;
    ativo: boolean;
}

export interface AlunoAdmin {
    id: number;
    nome_aluno: string;
    responsavel_nome: string;
    telefone: string;
    telefone_formatado: string;
    colegio_nome: string;
    serie: string;
    tem_pin: boolean;
    pin_bloqueado: boolean;
    total_aulas: number;
}

export interface ResponsavelContaAdmin {
    id: number;
    nome: string;
    telefone: string;
    telefone_formatado: string;
    tem_pin: boolean;
    pin_bloqueado: boolean;
    conflito_migracao: boolean;
    conflito_detalhes: string | null;
    total_aulas: number;
    filhos: AlunoAdmin[];
}

export interface DataAdmin {
    id: number;
    data: string;
    descricao: string;
    ativo: boolean;
}

export interface AgendamentoAdmin {
    id: number;
    unidade_id: number;
    unidade_nome: string;
    professor_id: number;
    professor_nome: string;
    professor_clin_care_id?: string | null;
    materia: string;
    data: string;
    hora_inicio: string;
    horario: string;
    nome_responsavel: string;
    whatsapp_responsavel: string;
    nome_aluno: string;
    colegio_aluno: string;
    serie_aluno: string;
    observacoes: string | null;
    status: 'confirmado' | 'cancelado' | 'concluido';
    sincronizado_clincare: boolean;
    criado_em_formatado: string;
    clincare_reserva_status?: string;
    clincare_reserva_erro?: string | null;
}

export interface BloqueioAdmin {
    id: number;
    professor_id: number | null;
    professor_clin_care_id: string | null;
    data: string;
    hora_inicio: string;
    hora_fim: string;
    motivo: string;
}

export interface CooldownsSync {
    hoje: string | null;
    semana: string | null;
    mes: string | null;
}

export interface PerfilAdmin {
    id: number;
    nome: string;
    email: string;
    foto_url: string | null;
    ativo?: boolean;
    criado_em?: string;
}

export type AbaAdmin =
    | 'agendamentos'
    | 'mapa'
    | 'alunos'
    | 'textos'
    | 'datas'
    | 'professores'
    | 'unidades';

export interface TemaClasses {
    clsCard: string;
    clsSubCard: string;
    clsInput: string;
    clsTitulo: string;
    clsSubtexto: string;
}

export function formatarDataBR(dataISO: string): string {
    if (!dataISO) return '';
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
}

export function obterIniciais(nome: string): string {
    const partes = nome.trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return 'R4';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function comprimirImagemAvatar(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const tamanho = 240;
                const canvas = document.createElement('canvas');
                canvas.width = tamanho;
                canvas.height = tamanho;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Falha ao processar imagem.'));
                    return;
                }
                const menorLado = Math.min(img.width, img.height);
                const sx = (img.width - menorLado) / 2;
                const sy = (img.height - menorLado) / 2;
                ctx.drawImage(img, sx, sy, menorLado, menorLado, 0, 0, tamanho, tamanho);
                resolve(canvas.toDataURL('image/jpeg', 0.82));
            };
            img.onerror = () => reject(new Error('Imagem inválida.'));
            img.src = String(reader.result);
        };
        reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
        reader.readAsDataURL(file);
    });
}