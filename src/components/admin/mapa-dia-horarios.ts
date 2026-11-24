import { adicionarDiasISO, horaParaMinutos, obterAgoraBahia } from '@/lib/horarios-reforco';
import type { AgendamentoAdmin, BloqueioAdmin } from './types';

export const INICIO_MAPA = 8 * 60;
export const FIM_MAPA = 23 * 60;

export function relogioBahia() {
    const { dataISO, minutosDoDia } = obterAgoraBahia();
    return { data: dataISO, minuto: minutosDoDia };
}

export function intervaloAula(aula: AgendamentoAdmin) {
    const inicio = horaParaMinutos(aula.hora_inicio || aula.horario);
    const fim = horaParaMinutos(aula.hora_fim || '');
    return { inicio, fim: fim > inicio ? fim : inicio + (aula.duracao_minutos || 100) };
}

export function intervaloBloqueio(bloqueio: BloqueioAdmin, data: string) {
    const inicio = horaParaMinutos(bloqueio.hora_inicio);
    const fim = horaParaMinutos(bloqueio.hora_fim);
    if (fim === inicio) return null;
    if (data === bloqueio.data) return { inicio, fim: fim < inicio ? 1440 : fim };
    if (fim < inicio && data === adicionarDiasISO(bloqueio.data, 1)) {
        return { inicio: 0, fim };
    }
    return null;
}

export function recortarIntervalo(intervalo: { inicio: number; fim: number }) {
    const inicio = Math.max(INICIO_MAPA, intervalo.inicio);
    const fim = Math.min(FIM_MAPA, intervalo.fim);
    return fim > inicio ? { inicio, fim } : null;
}

export function distribuirSobreposicoes<T extends { inicio: number; fim: number }>(
    itens: T[],
): (T & { faixa: number; totalFaixas: number })[] {
    const ordenados = [...itens].sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);
    const resultado: (T & { faixa: number; totalFaixas: number })[] = [];
    let fins: number[] = [];
    let grupo: typeof resultado = [];

    function fecharGrupo() {
        resultado.push(...grupo.map((item) => ({ ...item, totalFaixas: fins.length })));
        grupo = [];
        fins = [];
    }

    for (const item of ordenados) {
        if (fins.every((fim) => fim <= item.inicio)) fecharGrupo();
        const livre = fins.findIndex((fim) => fim <= item.inicio);
        const faixa = livre === -1 ? fins.length : livre;
        fins[faixa] = item.fim;
        grupo.push({ ...item, faixa, totalFaixas: 1 });
    }
    fecharGrupo();
    return resultado;
}
