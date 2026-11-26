BEGIN;
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS unidade_presencial_id integer REFERENCES unidades(id);
CREATE UNIQUE INDEX IF NOT EXISTS r4_unidade_online_por_base ON unidades(unidade_presencial_id);
INSERT INTO unidades (nome, ativa, unidade_presencial_id)
SELECT 'Online ' || nome, true, id FROM unidades
WHERE lower(translate(trim(nome), 'çí', 'ci')) IN ('graca','itaigara','horto','alphaville','imbui')
ON CONFLICT (unidade_presencial_id) DO NOTHING;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS whatsapp_link_aula text,
    ADD COLUMN IF NOT EXISTS resposta_whatsapp_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS r4_resposta_whatsapp_idx ON agendamentos(resposta_whatsapp_hash)
    WHERE resposta_whatsapp_hash IS NOT NULL;
COMMIT;
