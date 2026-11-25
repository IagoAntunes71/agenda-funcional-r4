BEGIN;
SELECT pg_advisory_xact_lock(840426);

ALTER TABLE professores ADD COLUMN IF NOT EXISTS grupo_professor text;
DO $r4$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'professores'::regclass AND attname = 'clin_care_id' AND NOT attisdropped
    ) THEN
        EXECUTE $sql$
            UPDATE professores
            SET grupo_professor = md5('r4:professor:' ||
                coalesce(nullif(trim(clin_care_id), ''), 'nome:' || lower(trim(nome))))
            WHERE grupo_professor IS NULL
        $sql$;
    END IF;
    UPDATE professores SET grupo_professor = md5('r4:nativo:' || id::text)
    WHERE grupo_professor IS NULL;
    IF EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'unidades'::regclass AND attname = 'clin_care_id' AND NOT attisdropped
    ) THEN
        ALTER TABLE unidades ALTER COLUMN clin_care_id DROP NOT NULL;
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'professores'::regclass AND attname = 'clin_care_id' AND NOT attisdropped
    ) THEN
        ALTER TABLE professores ALTER COLUMN clin_care_id DROP NOT NULL;
    END IF;
END $r4$;

-- Preserva a fila histórica e impede que novas aulas caiam nela por omissão.
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS clincare_reserva_status text;
ALTER TABLE agendamentos ALTER COLUMN clincare_reserva_status SET DEFAULT 'nao_aplicavel';

CREATE INDEX IF NOT EXISTS r4_professores_grupo_idx ON professores (grupo_professor);
CREATE TABLE IF NOT EXISTS r4_bloqueios_agenda (
    id serial PRIMARY KEY,
    professor_id integer NOT NULL,
    unidade_id integer NOT NULL,
    data date NOT NULL,
    hora_inicio time NOT NULL,
    hora_fim time NOT NULL,
    motivo text,
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    origem text NOT NULL DEFAULT 'manual',
    descricao text,
    criado_por_nome text
);
CREATE INDEX IF NOT EXISTS r4_bloqueios_dia_idx ON r4_bloqueios_agenda (data, professor_id);

CREATE TABLE IF NOT EXISTS r4_migracoes (chave text PRIMARY KEY);
DO $r4$
BEGIN
    IF to_regclass('bloqueios_clincare') IS NOT NULL AND EXISTS (
        SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('bloqueios_clincare')
          AND attname = 'origem' AND NOT attisdropped
    ) AND NOT EXISTS (SELECT 1 FROM r4_migracoes WHERE chave = 'agenda_nativa_v1') THEN
        EXECUTE $sql$
            INSERT INTO r4_bloqueios_agenda
                (professor_id, unidade_id, data, hora_inicio, hora_fim, motivo, atualizado_em, descricao, criado_por_nome)
            SELECT b.professor_id, b.unidade_id, b.data, b.hora_inicio, b.hora_fim, b.motivo,
                coalesce(b.atualizado_em, now()), to_jsonb(b)->>'descricao', to_jsonb(b)->>'criado_por_nome'
            FROM bloqueios_clincare b
            WHERE b.origem = 'manual'
        $sql$;
        INSERT INTO r4_migracoes VALUES ('agenda_nativa_v1');
    END IF;
END $r4$;
COMMIT;
