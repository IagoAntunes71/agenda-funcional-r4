import { sql } from './db';
import { OPERACAO_PADRAO, validarOperacao, type OperacaoR4 } from './operacao-r4';

const CHAVE = 'operacao_r4_v1';
let preparo: Promise<unknown> | undefined;

export function prepararOperacaoR4() {
    preparo ??= sql.transaction([
        sql`SELECT pg_advisory_xact_lock(840419)`,
        sql`CREATE TABLE IF NOT EXISTS configuracoes_sistema (
            chave text PRIMARY KEY, valor text NOT NULL, atualizado_em timestamptz DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS r4_planos_alunos (
            aluno_id bigint PRIMARY KEY, plano text NOT NULL DEFAULT '',
            orientacoes text NOT NULL DEFAULT '', atualizado_em timestamptz NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS r4_recepcao_registros (
            agendamento_id bigint PRIMARY KEY,
            categoria text NOT NULL DEFAULT '', convenio text NOT NULL DEFAULT '', evento text NOT NULL DEFAULT '',
            entrada text NOT NULL DEFAULT 'pendente', saida text NOT NULL DEFAULT 'pendente',
            atualizado_por text NOT NULL, atualizado_em timestamptz NOT NULL DEFAULT now()
        )`,
        sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS acompanhamento boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS feedback_professor text, ADD COLUMN IF NOT EXISTS duracao_minutos integer DEFAULT 100`,
    ]).catch((erro) => { preparo = undefined; throw erro; });
    return preparo;
}

export async function lerOperacaoR4() {
    await prepararOperacaoR4();
    const [linha] = await sql`SELECT valor FROM configuracoes_sistema WHERE chave = ${CHAVE}`;
    return linha ? validarOperacao(JSON.parse(linha.valor)) || OPERACAO_PADRAO : OPERACAO_PADRAO;
}

export async function gravarOperacaoR4(cfg: OperacaoR4) {
    await prepararOperacaoR4();
    await sql`INSERT INTO configuracoes_sistema(chave, valor) VALUES (${CHAVE}, ${JSON.stringify(cfg)})
        ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = now()`;
}

export function professorDaAula(
    vinculado: { id: number; grupo_professor?: string | null } | undefined,
    destino: { id: number; grupo_professor?: string | null },
) {
    return Boolean(vinculado && (vinculado.id === destino.id ||
        (vinculado.grupo_professor && vinculado.grupo_professor === destino.grupo_professor)));
}
