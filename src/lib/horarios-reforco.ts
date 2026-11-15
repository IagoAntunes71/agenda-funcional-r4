export interface SlotAula {
    inicio: string;
    fim: string;
    label: string;
}

export interface IntervaloOcupado {
    hora_inicio: string;
    hora_fim: string;
    motivo?: string | null;
}

// Grade fixa de 100 minutos (1h40): 14:10 até 20:50
export const SLOTS_FIXOS_100_MIN: SlotAula[] = [
    { inicio: '14:10', fim: '15:50', label: '14:10 às 15:50' },
    { inicio: '15:50', fim: '17:30', label: '15:50 às 17:30' },
    { inicio: '17:30', fim: '19:10', label: '17:30 às 19:10' },
    { inicio: '19:10', fim: '20:50', label: '19:10 às 20:50' },
];

export function horaParaMinutos(hora: string): number {
    const [hStr, mStr] = String(hora || '00:00').trim().split(':');
    const h = Number(hStr) || 0;
    const m = Number(mStr) || 0;
    return h * 60 + m;
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

    // Qualquer interseção entre o turno de 100 min e o bloqueio/aula impede o agendamento
    return aIni < bFim && aFim > bIni;
}

export function obterSlotsDisponiveisProfessor(
    bloqueiosClinCare: IntervaloOcupado[],
    agendamentosLocais: IntervaloOcupado[] = []
): SlotAula[] {
    const ocupados = [...bloqueiosClinCare, ...agendamentosLocais];

    return SLOTS_FIXOS_100_MIN.filter((slot) => {
        const temConflito = ocupados.some((bl) =>
            intervalosSeSobrepoem(slot.inicio, slot.fim, bl.hora_inicio, bl.hora_fim)
        );
        return !temConflito;
    });
}