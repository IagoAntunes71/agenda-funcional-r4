import { sql } from '@/lib/db';

let preparo: Promise<unknown> | undefined;
export function garantirStatusAgendamentoR4() {
    preparo ??= sql.transaction([
        sql`SELECT pg_advisory_xact_lock(840415)`,
        sql`DO $r4$
        DECLARE
            restricao record;
        BEGIN
            -- Atualiza apenas CHECKs antigos cujo único critério é a lista de status.
            FOR restricao IN
                SELECT c.conname, pg_get_expr(c.conbin, c.conrelid) AS expressao
                FROM pg_constraint c
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname = 'status'
                WHERE c.conrelid = 'agendamentos'::regclass AND c.contype = 'c'
                    AND c.conkey = ARRAY[a.attnum]
            LOOP
                IF position('atestado' IN restricao.expressao) = 0
                    AND restricao.expressao ~ '^[(]*status[)]*(::text)?[[:space:]]*=[[:space:]]*ANY[[:space:]]*[(].*ARRAY'
                    AND restricao.expressao !~* '[[:space:]](AND|OR)[[:space:]]'
                THEN
                    EXECUTE format('ALTER TABLE agendamentos DROP CONSTRAINT %I', restricao.conname);
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'agendamentos'::regclass AND conname = 'r4_agendamentos_status_check') THEN
                        ALTER TABLE agendamentos ADD CONSTRAINT r4_agendamentos_status_check
                            CHECK (status::text IN ('agendado', 'confirmado', 'realizado', 'concluido',
                                'desmarcado_com_cobranca', 'desmarcado_sem_cobranca', 'cancelado',
                                'reservado', 'remanejado', 'falta', 'ferias', 'atestado', 'pendente')) NOT VALID;
                    END IF;
                END IF;
            END LOOP;
        END $r4$`,
    ]).catch((erro) => { preparo = undefined; throw erro; });
    return preparo;
}
