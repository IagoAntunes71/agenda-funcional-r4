import { sql } from '@/lib/db';

let instalacao: Promise<unknown> | undefined;

export function garantirHistoricoAgendamento() {
    instalacao ??= sql.transaction([
        sql`SELECT pg_advisory_xact_lock(840413)`,
        sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS excluido_em timestamptz`,
        sql`CREATE TABLE IF NOT EXISTS r4_agendamento_historico (
            id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            agendamento_id bigint NOT NULL,
            acao text NOT NULL,
            responsavel text NOT NULL,
            campos text[] NOT NULL DEFAULT '{}',
            criado_em timestamptz NOT NULL DEFAULT now()
        )`,
        sql`CREATE INDEX IF NOT EXISTS r4_historico_por_aula ON r4_agendamento_historico (agendamento_id, id DESC)`,
        sql`CREATE TABLE IF NOT EXISTS r4_agendamento_anexos (
            id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            agendamento_id bigint NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
            nome text NOT NULL,
            tamanho integer NOT NULL,
            conteudo bytea NOT NULL,
            criado_em timestamptz NOT NULL DEFAULT now()
        )`,
        sql`CREATE INDEX IF NOT EXISTS r4_anexos_por_aula ON r4_agendamento_anexos (agendamento_id)`,
        sql`CREATE OR REPLACE FUNCTION r4_registrar_agendamento() RETURNS trigger LANGUAGE plpgsql AS $r4$
        DECLARE
            anterior jsonb;
            atual jsonb := to_jsonb(NEW);
            campos_alterados text[];
            tipo text;
            ator text := nullif(current_setting('r4.ator_agenda', true), '');
        BEGIN
            IF TG_OP = 'INSERT' THEN
                tipo := 'Agendamento criado';
                campos_alterados := '{}';
                ator := coalesce(ator, nullif(atual->>'criado_por_nome', ''), 'Sistema / integração');
            ELSE
                anterior := to_jsonb(OLD);
                SELECT coalesce(array_agg(campo ORDER BY campo), '{}') INTO campos_alterados
                FROM unnest(ARRAY['unidade_id','professor_id','aluno_id','materia','data','hora_inicio',
                    'hora_fim','duracao_minutos','observacoes','feedback_professor','status',
                    'aluno_nome','responsavel_nome','aluno_telefone','colegio_nome','serie',
                    'excluido_em','lancado_clincare','notificado_whatsapp','clincare_reserva_status']) AS lista(campo)
                WHERE anterior->campo IS DISTINCT FROM atual->campo;
                IF cardinality(campos_alterados) = 0 THEN RETURN NEW; END IF;
                tipo := CASE
                    WHEN 'excluido_em' = ANY(campos_alterados) THEN 'Agendamento excluído'
                    WHEN 'status' = ANY(campos_alterados) THEN
                        'Status: ' || coalesce(anterior->>'status', '—') || ' → ' || coalesce(atual->>'status', '—')
                    WHEN 'feedback_professor' = ANY(campos_alterados) THEN 'Feedback atualizado'
                    WHEN campos_alterados <@ ARRAY['lancado_clincare','notificado_whatsapp','clincare_reserva_status'] THEN 'Integração atualizada'
                    ELSE 'Agendamento editado'
                END;
            END IF;
            INSERT INTO r4_agendamento_historico (agendamento_id, acao, responsavel, campos)
            VALUES (NEW.id, tipo, coalesce(ator, 'Sistema / integração'), campos_alterados);
            RETURN NEW;
        END;
        $r4$`,
        sql`DO $r4$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'r4_agendamento_auditoria' AND tgrelid = 'agendamentos'::regclass) THEN
                CREATE TRIGGER r4_agendamento_auditoria AFTER INSERT OR UPDATE ON agendamentos
                FOR EACH ROW EXECUTE FUNCTION r4_registrar_agendamento();
            END IF;
        END $r4$`,
    ]).catch((error) => {
        instalacao = undefined;
        throw error;
    });
    return instalacao;
}
