import { sql } from '@/lib/db';

// O limite exato fica reservado até a definição da regra pela R4.
export function cancelamentoAula(antecedencia: number) {
    const inicio = sql`((data + coalesce(hora_inicio, horario)) AT TIME ZONE 'America/Bahia')`;
    const limite = sql`statement_timestamp() + make_interval(hours => ${antecedencia})`;
    return {
        futuro: sql`${inicio} > statement_timestamp()`,
        foraDoLimiteExato: sql`${inicio} <> ${limite}`,
        gratuito: sql`${inicio} > ${limite}`,
        status: sql`CASE WHEN ${inicio} > ${limite}
            THEN 'desmarcado_sem_cobranca' ELSE 'desmarcado_com_cobranca' END`,
    };
}
