BEGIN;

ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS aula_iniciada_em timestamptz,
    ADD COLUMN IF NOT EXISTS aula_iniciada_por integer,
    ADD COLUMN IF NOT EXISTS evolucao_versao integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS r4_evolucao_envios (
    id uuid PRIMARY KEY,
    agendamento_id bigint NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
    versao integer NOT NULL,
    destino text,
    estado text NOT NULL CHECK (estado IN ('pendente','enviando','enviado_ao_crm','entregue','erro')),
    erro text,
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    UNIQUE (agendamento_id, versao)
);

ALTER TABLE r4_push_avisos ADD COLUMN IF NOT EXISTS agendamento_id bigint,
    ADD COLUMN IF NOT EXISTS agenda_versao bigint,
    ADD COLUMN IF NOT EXISTS dia_resumo date;

CREATE OR REPLACE FUNCTION r4_push_mudanca_aula() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    ativo_antes boolean := coalesce(OLD.status, '') IN ('agendado','confirmado','reservado','pendente')
        AND OLD.excluido_em IS NULL;
    cancelada boolean := coalesce(NEW.status, '') IN ('cancelado','desmarcado_com_cobranca','desmarcado_sem_cobranca')
        OR NEW.excluido_em IS NOT NULL;
    antigo_grupo text;
    novo_grupo text;
BEGIN
    IF NOT ativo_antes OR OLD.professor_id IS NULL THEN RETURN NULL; END IF;
    IF cancelada THEN
        INSERT INTO r4_push_avisos (professor_id,tipo,deduplicacao,agendamento_id,agenda_versao)
        VALUES (OLD.professor_id,'cancelada','mudanca:' || NEW.id || ':' || txid_current() || ':cancelada',NEW.id,NEW.versao_whatsapp)
        ON CONFLICT (deduplicacao) DO NOTHING;
    ELSIF NEW.professor_id IS NOT NULL AND ROW(OLD.professor_id,OLD.data,OLD.hora_inicio,OLD.horario,OLD.unidade_id)
        IS DISTINCT FROM ROW(NEW.professor_id,NEW.data,NEW.hora_inicio,NEW.horario,NEW.unidade_id) THEN
        INSERT INTO r4_push_avisos (professor_id,tipo,deduplicacao,agendamento_id,agenda_versao)
        VALUES (NEW.professor_id,'remarcada','mudanca:' || NEW.id || ':' || txid_current() || ':atual',NEW.id,NEW.versao_whatsapp)
        ON CONFLICT (deduplicacao) DO NOTHING;
        IF OLD.professor_id <> NEW.professor_id THEN
            SELECT nullif(grupo_professor,'') INTO antigo_grupo FROM professores WHERE id = OLD.professor_id;
            SELECT nullif(grupo_professor,'') INTO novo_grupo FROM professores WHERE id = NEW.professor_id;
            IF antigo_grupo IS NULL OR antigo_grupo IS DISTINCT FROM novo_grupo THEN
                INSERT INTO r4_push_avisos (professor_id,tipo,deduplicacao,agendamento_id,agenda_versao)
                VALUES (OLD.professor_id,'remarcada','mudanca:' || NEW.id || ':' || txid_current() || ':anterior',NEW.id,NEW.versao_whatsapp)
                ON CONFLICT (deduplicacao) DO NOTHING;
            END IF;
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS r4_push_mudanca_aula ON agendamentos;
CREATE TRIGGER r4_push_mudanca_aula AFTER UPDATE ON agendamentos
FOR EACH ROW EXECUTE FUNCTION r4_push_mudanca_aula();

CREATE TABLE IF NOT EXISTS r4_excecoes_bloqueio (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    professor_id integer NOT NULL REFERENCES professores(id),
    solicitado_por integer NOT NULL,
    solicitado_em timestamptz NOT NULL DEFAULT now(),
    datas date[] NOT NULL,
    inicio time NOT NULL,
    fim time NOT NULL,
    motivo text NOT NULL,
    descricao text NOT NULL,
    estado text NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente','autorizado','recusado')),
    decidido_por integer,
    decidido_nome text,
    decidido_em timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS r4_excecao_bloqueio_pendente
    ON r4_excecoes_bloqueio (professor_id,datas,inicio,fim) WHERE estado = 'pendente';

COMMIT;
