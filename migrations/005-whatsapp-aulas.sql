BEGIN;

ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS versao_whatsapp bigint NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION r4_revisar_whatsapp_aula() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(OLD.data, OLD.hora_inicio, OLD.horario, OLD.hora_fim, OLD.professor_id, OLD.unidade_id,
           OLD.aluno_id, OLD.aluno_telefone, OLD.whatsapp_responsavel, OLD.materia, OLD.excluido_em)
       IS DISTINCT FROM
       ROW(NEW.data, NEW.hora_inicio, NEW.horario, NEW.hora_fim, NEW.professor_id, NEW.unidade_id,
           NEW.aluno_id, NEW.aluno_telefone, NEW.whatsapp_responsavel, NEW.materia, NEW.excluido_em)
       OR (OLD.status IN ('cancelado','desmarcado_com_cobranca','desmarcado_sem_cobranca')
           AND NEW.status IN ('agendado','confirmado')) THEN
        NEW.versao_whatsapp := OLD.versao_whatsapp + 1;
        IF NEW.resposta_whatsapp_hash IS NOT DISTINCT FROM OLD.resposta_whatsapp_hash THEN
            NEW.resposta_whatsapp_hash := NULL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS r4_revisar_whatsapp_aula ON agendamentos;
CREATE TRIGGER r4_revisar_whatsapp_aula BEFORE UPDATE ON agendamentos
FOR EACH ROW EXECUTE FUNCTION r4_revisar_whatsapp_aula();

CREATE TABLE IF NOT EXISTS r4_lembretes_whatsapp (
    id uuid PRIMARY KEY,
    agendamento_id bigint NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
    versao bigint NOT NULL,
    tipo text NOT NULL CHECK (tipo IN ('manual','automatico')),
    responsavel text NOT NULL,
    destinatario text NOT NULL,
    estado text NOT NULL DEFAULT 'em_envio'
        CHECK (estado IN ('em_envio','enviado_ao_crm','entregue','erro','obsoleto')),
    tentado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    retorno_http integer,
    erro text
);
CREATE UNIQUE INDEX IF NOT EXISTS r4_lembrete_automatico_unico
    ON r4_lembretes_whatsapp (agendamento_id, versao) WHERE tipo = 'automatico';
CREATE UNIQUE INDEX IF NOT EXISTS r4_lembrete_em_envio_unico
    ON r4_lembretes_whatsapp (agendamento_id, versao) WHERE estado = 'em_envio';

COMMIT;
