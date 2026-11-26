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

export async function alunoJaCadastradoNoTelefone(nome: string, telefone: string) {
    await prepararCadastroAlunoR4();
    const [aluno] = await sql`
        SELECT id FROM alunos
        WHERE lower(regexp_replace(trim(nome_aluno), '[[:space:]]+', ' ', 'g')) = ${nome.trim().replace(/\s+/g, ' ').toLowerCase()}
          AND regexp_replace(regexp_replace(coalesce(nullif(telefone,''),contato_importado,''), '[^0-9]', '', 'g'),
              '^55(?=[0-9]{10,11}$)', '') = ANY(${gerarVariantesTelefone(telefone)}::text[])
        LIMIT 1`;
    return Boolean(aluno);
}

export async function temFichasPendentes(telefone: string) {
    await prepararCadastroAlunoR4();
    const [ficha] = await sql`
        SELECT id FROM alunos WHERE ativo AND responsavel_id IS NULL
          AND regexp_replace(regexp_replace(coalesce(nullif(contato_importado,''), telefone, ''), '[^0-9]', '', 'g'),
              '^55(?=[0-9]{10,11}$)', '') = ANY(${gerarVariantesTelefone(telefone)}::text[])
        LIMIT 1`;
    return Boolean(ficha);
}

export async function vincularFichasPendentes(telefone: string) {
    await prepararCadastroAlunoR4();
    return sql`
        WITH contas AS (
            SELECT id, telefone, telefone_formatado, nome FROM responsaveis
            WHERE regexp_replace(regexp_replace(telefone, '[^0-9]', '', 'g'), '^55(?=[0-9]{10,11}$)', '')
                = ANY(${gerarVariantesTelefone(telefone)}::text[])
              AND NOT coalesce(conflito_migracao, false)
        ), conta AS (
            SELECT * FROM contas WHERE (SELECT count(*) FROM contas) = 1
        )
        UPDATE alunos a SET responsavel_id = conta.id, telefone = conta.telefone,
            telefone_formatado = conta.telefone_formatado,
            responsavel_nome = coalesce(nullif(trim(a.responsavel_nome), ''), conta.nome)
        FROM conta WHERE a.ativo AND a.responsavel_id IS NULL
            AND regexp_replace(regexp_replace(coalesce(nullif(a.contato_importado,''), a.telefone, ''), '[^0-9]', '', 'g'),
                '^55(?=[0-9]{10,11}$)', '') = ANY(${gerarVariantesTelefone(telefone)}::text[])
        RETURNING a.id, a.nome_aluno`;
}
