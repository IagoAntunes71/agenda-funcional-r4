BEGIN;

ALTER TABLE r4_push_avisos ADD COLUMN IF NOT EXISTS aulas_hoje integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS aulas_amanha integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION r4_push_evento_agenda() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    hoje date := (now() AT TIME ZONE 'America/Bahia')::date;
    grupo text;
BEGIN
    IF NEW.professor_id IS NULL OR NEW.data IS NULL OR NEW.data NOT BETWEEN hoje AND hoje + 1
        OR NEW.excluido_em IS NOT NULL
        OR coalesce(NEW.status, '') NOT IN ('agendado','confirmado','reservado','pendente') THEN
        RETURN NULL;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.professor_id IS NOT DISTINCT FROM OLD.professor_id AND OLD.excluido_em IS NULL
            AND OLD.status IN ('agendado','confirmado','reservado','pendente') THEN
            RETURN NULL;
        END IF;
    END IF;

    SELECT coalesce('grupo:' || nullif(grupo_professor, ''), 'id:' || NEW.professor_id)
    INTO grupo FROM professores WHERE id = NEW.professor_id;

    INSERT INTO r4_push_avisos(professor_id, tipo, deduplicacao, aulas_hoje, aulas_amanha)
    VALUES (NEW.professor_id, 'marcada',
        'marcada:' || txid_current() || ':' || coalesce(grupo, 'id:' || NEW.professor_id),
        (NEW.data = hoje)::int, (NEW.data = hoje + 1)::int)
    ON CONFLICT (deduplicacao) DO UPDATE SET
        aulas_hoje = r4_push_avisos.aulas_hoje + excluded.aulas_hoje,
        aulas_amanha = r4_push_avisos.aulas_amanha + excluded.aulas_amanha;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS r4_push_evento_agenda ON agendamentos;
CREATE TRIGGER r4_push_evento_agenda AFTER INSERT OR UPDATE ON agendamentos
FOR EACH ROW EXECUTE FUNCTION r4_push_evento_agenda();

COMMIT;
