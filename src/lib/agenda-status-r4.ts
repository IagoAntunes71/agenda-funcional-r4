/**
 * ARQUIVO: src/lib/agenda-status-r4.ts
 * FUNÇÃO: Centraliza os 6 status oficiais de aula da R4 Ensina (sem "Remanejado"),
 * cores exclusivas da identidade visual R4, validação de permissão por perfil
 * e utilitários de cálculo de duração (50 a 300 min) e horários (08:00 às 22:00).
 */

export type StatusAulaR4 =
    | 'agendado'
    | 'confirmado'
    | 'realizado'
    | 'desmarcado_com_cobranca'
    | 'desmarcado_sem_cobranca'
    | 'cancelado';

export interface MetaStatusAula {
    valor: StatusAulaR4;
    rotulo: string;
    corPonto: string;
    clsBadge: string;
    clsCardAgenda: string;
    ocupaHorario: boolean;
}

export const LISTA_STATUS_AULA_R4: MetaStatusAula[] = [
    {
        valor: 'agendado',
        rotulo: 'Agendado',
        corPonto: 'bg-[#1496A1]',
        clsBadge: 'bg-[#0E7C86]/15 text-[#1496A1] border-[#0E7C86]/40',
        clsCardAgenda: 'bg-[#0E7C86]/15 border-[#0E7C86]/50 hover:border-[#1496A1]',
        ocupaHorario: true,
    },
    {
        valor: 'confirmado',
        rotulo: 'Confirmado',
        corPonto: 'bg-emerald-500',
        clsBadge: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40',
        clsCardAgenda: 'bg-emerald-500/15 border-emerald-500/45 hover:border-emerald-400',
        ocupaHorario: true,
    },
    {
        valor: 'realizado',
        rotulo: 'Realizado',
        corPonto: 'bg-lime-500',
        clsBadge: 'bg-lime-500/15 text-lime-500 border-lime-500/40',
        clsCardAgenda: 'bg-lime-500/15 border-lime-500/45 hover:border-lime-400',
        ocupaHorario: true,
    },
    {
        valor: 'desmarcado_com_cobranca',
        rotulo: 'Desmarcado c/ cobrança',
        corPonto: 'bg-amber-400',
        clsBadge: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
        clsCardAgenda: 'bg-amber-500/15 border-amber-500/45 hover:border-amber-400',
        ocupaHorario: false,
    },
    {
        valor: 'desmarcado_sem_cobranca',
        rotulo: 'Desmarcado s/ cobrança',
        corPonto: 'bg-[#C24124]',
        clsBadge: 'bg-[#C24124]/15 text-[#E07A5F] border-[#C24124]/45',
        clsCardAgenda: 'bg-[#C24124]/15 border-[#C24124]/45 hover:border-[#E07A5F]',
        ocupaHorario: false,
    },
    {
        valor: 'cancelado',
        rotulo: 'Cancelado',
        corPonto: 'bg-stone-400',
        clsBadge: 'bg-stone-500/15 text-stone-400 border-stone-500/35',
        clsCardAgenda: 'bg-stone-500/10 border-stone-500/30 opacity-75',
        ocupaHorario: false,
    },
];

export function normalizarStatusAulaR4(statusBruto: string | null | undefined): StatusAulaR4 {
    const s = String(statusBruto || '').trim().toLowerCase();
    if (s === 'concluido') return 'realizado';
    const encontrado = LISTA_STATUS_AULA_R4.find((item) => item.valor === s);
    return encontrado ? encontrado.valor : 'confirmado';
}

export function obterMetaStatusR4(statusBruto: string | null | undefined): MetaStatusAula {
    const norm = normalizarStatusAulaR4(statusBruto);
    return (
        LISTA_STATUS_AULA_R4.find((item) => item.valor === norm) ||
        LISTA_STATUS_AULA_R4[1]
    );
}

export function calcularHoraFim(horaInicio: string, duracaoMinutos: number): string {
    const [hStr, mStr] = String(horaInicio || '08:00').split(':');
    const inicioMin = (Number(hStr) || 0) * 60 + (Number(mStr) || 0);
    const fimMin = Math.min(23 * 60 + 50, inicioMin + duracaoMinutos);
    const h = Math.floor(fimMin / 60);
    const m = fimMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatarDuracaoLabel(minutos: number): string {
    if (!minutos || minutos <= 0) return '100 min';
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h}h (${minutos} min)`;
    return `${h}h${String(m).padStart(2, '0')} (${minutos} min)`;
}

export const HORAS_GRADE_R4 = Array.from({ length: 15 }, (_, idx) => {
    const hora = 8 + idx; // 08:00 até 22:00
    return `${String(hora).padStart(2, '0')}:00`;
});