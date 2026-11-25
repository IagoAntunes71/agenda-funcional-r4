import { sql } from './db';
import { gerarVariantesTelefone } from './cliente-helpers';

let preparo: Promise<unknown> | undefined;

export function prepararCadastroAlunoR4() {
    preparo ??= sql.transaction([
        sql`SELECT pg_advisory_xact_lock(840420)`,
        sql`ALTER TABLE alunos ADD COLUMN IF NOT EXISTS contato_importado text NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS nascimento date,
            ADD COLUMN IF NOT EXISTS sexo text NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS cpf text NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS endereco text NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS foto_ficha text NOT NULL DEFAULT ''`,
        sql`CREATE TABLE IF NOT EXISTS r4_contatos_aluno (
            id serial PRIMARY KEY, aluno_id integer NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
            nome text NOT NULL, parentesco text NOT NULL DEFAULT '', telefone text NOT NULL DEFAULT '',
            email text NOT NULL DEFAULT '', cpf text NOT NULL DEFAULT '', observacoes text NOT NULL DEFAULT ''
        )`,
        sql`CREATE INDEX IF NOT EXISTS r4_contatos_aluno_por_aluno ON r4_contatos_aluno(aluno_id)`,
    ]).catch((erro) => { preparo = undefined; throw erro; });
    return preparo;
}

export async function alunoImportadoAguardandoVinculo(nome: string, telefone: string) {
    await prepararCadastroAlunoR4();
    const [aluno] = await sql`
        SELECT id FROM alunos
        WHERE contato_importado <> ''
          AND lower(regexp_replace(trim(nome_aluno), '\\s+', ' ', 'g')) = ${nome.trim().replace(/\s+/g, ' ').toLowerCase()}
          AND coalesce(nullif(telefone,''),contato_importado) = ANY(${gerarVariantesTelefone(telefone)}::text[])
        LIMIT 1`;
    return Boolean(aluno);
}
