/**
 * ARQUIVO: src/components/admin/types.ts
 * FUNÇÃO: Define todas as interfaces TypeScript compartilhadas entre o PainelAdmin,
 * Mapa da Agenda, Modais de Marcação/Detalhes e Gestão de Perfis, além de helpers de data e avatar.
 */

import { RoleSistema } from '@/lib/admin-auth';
import { StatusAulaR4 } from '@/lib/agenda-status-r4';
import { MapaMateriasSeries } from '@/lib/cliente-helpers';

export interface UnidadeAdmin {
    id: number;
    nome: string;
    ativa: boolean;
    unidade_presencial_id?: number | null;
}

export interface ProfessorAdmin {
    foto_url?: string | null;
    id: number;
    nome: string;
    grupo_professor: string | null;
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
    aluno_id?: number | null;
    excluido_em?: string | null;
    id: number;
    unidade_id: number;
    unidade_nome: string;
    professor_id: number;
    professor_nome: string;
    professor_grupo_professor?: string | null;
    materia: string;
    data: string;
    hora_inicio: string;
    hora_fim?: string;
    duracao_minutos?: number;
    horario: string;
    nome_responsavel: string;
    whatsapp_responsavel: string;
    whatsapp_link_aula?: string | null;
    nome_aluno: string;
    colegio_aluno: string;
    serie_aluno: string;
    observacoes: string | null;
    feedback_professor?: string | null;
    feedback_feito?: boolean;
    criado_por_nome?: string | null;
    origem?: string;
    status: StatusAulaR4 | 'concluido';
    criado_em_formatado: string;
}

export interface BloqueioAdmin {
    id: number;
    professor_id: number | null;
    unidade_id?: number | null;
    professor_grupo_professor: string | null;
    data: string;
    hora_inicio: string;
    hora_fim: string;
    motivo: string;
    descricao?: string | null;
    origem?: string;
    criado_por_nome?: string | null;
}


export interface PerfilAdmin {
    id: number;
    nome: string;
    email: string;
    foto_url: string | null;
    role: RoleSistema;
    professor_id?: number | null;
    professor_nome?: string | null;
    ativo?: boolean;
    criado_em?: string;
}

export type { PaginaAdmin as AbaAdmin } from '@/lib/admin-navegacao';

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