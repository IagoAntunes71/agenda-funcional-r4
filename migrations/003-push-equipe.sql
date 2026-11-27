BEGIN;

CREATE TABLE IF NOT EXISTS r4_push_equipe (
    endpoint text PRIMARY KEY,
    conta_id integer NOT NULL REFERENCES admins_sistema(id) ON DELETE CASCADE,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text NOT NULL DEFAULT '',
    teste_em timestamptz
);
CREATE INDEX IF NOT EXISTS r4_push_equipe_conta ON r4_push_equipe(conta_id);

CREATE TABLE IF NOT EXISTS r4_push_avisos (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    professor_id integer NOT NULL,
    deduplicacao text UNIQUE,
    tipo text NOT NULL CHECK (tipo IN ('marcada', 'remarcada', 'cancelada', 'chegada')),
    criado_em timestamptz NOT NULL DEFAULT now(),
    tentar_em timestamptz NOT NULL DEFAULT now(),
    tentativas integer NOT NULL DEFAULT 0,
    concluido_em timestamptz
);
CREATE INDEX IF NOT EXISTS r4_push_avisos_pendentes ON r4_push_avisos(tentar_em)
WHERE concluido_em IS NULL;

CREATE OR REPLACE FUNCTION r4_push_evento_agenda() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    era_ativa boolean := false;
    esta_ativa boolean := false;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        era_ativa := OLD.excluido_em IS NULL AND OLD.status IN ('agendado','confirmado','reservado','pendente');
    END IF;
    IF TG_OP <> 'DELETE' THEN
        esta_ativa := NEW.excluido_em IS NULL AND NEW.status IN ('agendado','confirmado','reservado','pendente');
    END IF;

    IF era_ativa AND OLD.professor_id IS NOT NULL AND OLD.data >= (now() AT TIME ZONE 'America/Bahia')::date THEN
        IF TG_OP = 'DELETE' OR NEW.professor_id IS DISTINCT FROM OLD.professor_id OR
            (NOT esta_ativa AND (NEW.excluido_em IS NOT NULL OR NEW.status IN
                ('cancelado','desmarcado_com_cobranca','desmarcado_sem_cobranca'))) THEN
            INSERT INTO r4_push_avisos(professor_id, tipo) VALUES (OLD.professor_id, 'cancelada');
        END IF;
    END IF;

    IF esta_ativa AND NEW.professor_id IS NOT NULL AND NEW.data >= (now() AT TIME ZONE 'America/Bahia')::date THEN
        IF TG_OP = 'INSERT' OR NOT era_ativa OR NEW.professor_id IS DISTINCT FROM OLD.professor_id THEN
            INSERT INTO r4_push_avisos(professor_id, tipo) VALUES (NEW.professor_id, 'marcada');
        ELSIF ROW(NEW.data, NEW.hora_inicio, NEW.horario, NEW.unidade_id, NEW.hora_fim)
            IS DISTINCT FROM ROW(OLD.data, OLD.hora_inicio, OLD.horario, OLD.unidade_id, OLD.hora_fim) THEN
            INSERT INTO r4_push_avisos(professor_id, tipo) VALUES (NEW.professor_id, 'remarcada');
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS excluido_em timestamptz;
DROP TRIGGER IF EXISTS r4_push_evento_agenda ON agendamentos;
CREATE TRIGGER r4_push_evento_agenda AFTER INSERT OR UPDATE OR DELETE ON agendamentos
FOR EACH ROW EXECUTE FUNCTION r4_push_evento_agenda();

COMMIT;
