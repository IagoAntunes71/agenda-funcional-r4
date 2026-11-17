import crypto from 'crypto';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';
import {
    formatarTelefone,
    gerarVariantesTelefone,
    normalizarTelefone,
} from '@/lib/cliente-helpers';

export { normalizarTelefone, gerarVariantesTelefone };

export const COOKIE_SESSAO_CLIENTE = 'r4_cliente_sessao';
export const DURACAO_SESSAO_CLIENTE_SEGUNDOS = 30 * 24 * 60 * 60; // 30 dias
export const MAX_TENTATIVAS_PIN = 5;
export const BLOQUEIO_PIN_MINUTOS = 15;
export const LIMITE_AGENDAMENTOS_SIMULTANEOS = 2;

const SEGREDO_SESSAO =
    process.env.CLIENT_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    'r4-ensina-chave-sessao-cliente-2026';

export function validarFormatoPin(pin: string): boolean {
    return /^\d{4}$/.test(String(pin || '').trim());
}

export function gerarHashPin(pin: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(pin, salt, 32).toString('hex');
    return `${salt}:${hash}`;
}

export function verificarHashPin(pin: string, armazenado: string): boolean {
    const [salt, hashOriginal] = String(armazenado || '').split(':');
    if (!salt || !hashOriginal) return false;

    const hashTentativa = crypto.scryptSync(pin, salt, 32).toString('hex');
    const bufOriginal = Buffer.from(hashOriginal, 'hex');
    const bufTentativa = Buffer.from(hashTentativa, 'hex');

    if (bufOriginal.length !== bufTentativa.length) return false;
    return crypto.timingSafeEqual(bufOriginal, bufTentativa);
}

export function criarTokenSessaoCliente(telefoneNorm: string): string {
    const telefoneCanonico = normalizarTelefone(telefoneNorm);
    const payload = JSON.stringify({
        tel: telefoneCanonico,
        exp: Date.now() + DURACAO_SESSAO_CLIENTE_SEGUNDOS * 1000,
    });
    const payloadB64 = Buffer.from(payload).toString('base64url');
    const assinatura = crypto
        .createHmac('sha256', SEGREDO_SESSAO)
        .update(payloadB64)
        .digest('base64url');
    return `${payloadB64}.${assinatura}`;
}

export async function lerSessaoCliente(): Promise<{ telefone: string } | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get(COOKIE_SESSAO_CLIENTE)?.value;
        if (!token) return null;

        const [payloadB64, assinatura] = token.split('.');
        if (!payloadB64 || !assinatura) return null;

        const assinaturaEsperada = crypto
            .createHmac('sha256', SEGREDO_SESSAO)
            .update(payloadB64)
            .digest('base64url');

        const a = Buffer.from(assinatura);
        const b = Buffer.from(assinaturaEsperada);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
            return null;
        }

        const dados = JSON.parse(
            Buffer.from(payloadB64, 'base64url').toString('utf8')
        ) as { tel?: string; exp?: number };

        if (!dados.tel || !dados.exp || Date.now() > dados.exp) {
            return null;
        }

        return { telefone: normalizarTelefone(dados.tel) };
    } catch {
        return null;
    }
}

export async function garantirColunasSegurancaAlunos() {
    await sql`ALTER TABLE alunos ADD COLUMN IF NOT EXISTS responsavel_nome TEXT`;
    await sql`ALTER TABLE alunos ADD COLUMN IF NOT EXISTS pin_hash TEXT`;
    await sql`ALTER TABLE alunos ADD COLUMN IF NOT EXISTS pin_tentativas INTEGER DEFAULT 0`;
    await sql`ALTER TABLE alunos ADD COLUMN IF NOT EXISTS pin_bloqueado_ate TIMESTAMPTZ`;
}

export async function garantirEstruturaContasResponsaveis() {
    await garantirColunasSegurancaAlunos();

    await sql`
    CREATE TABLE IF NOT EXISTS responsaveis (
      id SERIAL PRIMARY KEY,
      telefone TEXT NOT NULL,
      telefone_formatado TEXT,
      nome TEXT NOT NULL DEFAULT 'Responsável',
      pin_hash TEXT,
      pin_tentativas INTEGER NOT NULL DEFAULT 0,
      pin_bloqueado_ate TIMESTAMPTZ,
      conflito_migracao BOOLEAN NOT NULL DEFAULT false,
      conflito_detalhes TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

    await sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS telefone_formatado TEXT`;
    await sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS nome TEXT NOT NULL DEFAULT 'Responsável'`;
    await sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS pin_hash TEXT`;
    await sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS pin_tentativas INTEGER NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS pin_bloqueado_ate TIMESTAMPTZ`;
    await sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS conflito_migracao BOOLEAN NOT NULL DEFAULT false`;
    await sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS conflito_detalhes TEXT`;
    await sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()`;

    await sql`
    ALTER TABLE alunos
    ADD COLUMN IF NOT EXISTS responsavel_id INT REFERENCES responsaveis(id) ON DELETE SET NULL
  `;

    // 1. Vincula alunos antigos que ainda não têm responsavel_id
    const alunosSemConta = (await sql`
    SELECT
      id,
      COALESCE(telefone, '') AS telefone,
      COALESCE(NULLIF(trim(responsavel_nome), ''), 'Responsável') AS responsavel_nome,
      pin_hash,
      COALESCE(pin_tentativas, 0) AS pin_tentativas,
      pin_bloqueado_ate::text AS pin_bloqueado_ate
    FROM alunos
    WHERE responsavel_id IS NULL
      AND COALESCE(trim(telefone), '') <> ''
    ORDER BY id ASC
  `) as {
        id: number;
        telefone: string;
        responsavel_nome: string;
        pin_hash: string | null;
        pin_tentativas: number;
        pin_bloqueado_ate: string | null;
    }[];

    for (const al of alunosSemConta) {
        const telCanonico = normalizarTelefone(al.telefone);
        const variantes = gerarVariantesTelefone(al.telefone);
        if (telCanonico.length < 10 || variantes.length === 0) continue;

        const telFmt = formatarTelefone(telCanonico);
        const existentes = (await sql`
      SELECT id, nome, pin_hash
      FROM responsaveis
      WHERE regexp_replace(
        regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
        '^55(?=\d{10,11}$)',
        ''
      ) = ANY(${variantes}::text[])
      ORDER BY (CASE WHEN pin_hash IS NOT NULL AND trim(pin_hash) <> '' THEN 0 ELSE 1 END), id ASC
      LIMIT 1
    `) as { id: number; nome: string; pin_hash: string | null }[];

        let respId: number;

        if (existentes.length > 0) {
            respId = existentes[0].id;
            const pinAtual = existentes[0].pin_hash?.trim() || '';
            const pinAluno = al.pin_hash?.trim() || '';

            const temConflito =
                (pinAtual !== '' && pinAluno !== '' && pinAtual !== pinAluno) ||
                (existentes[0].nome.trim().toLowerCase() !==
                    al.responsavel_nome.trim().toLowerCase() &&
                    existentes[0].nome.trim() !== 'Responsável' &&
                    al.responsavel_nome.trim() !== 'Responsável');

            const detalheConflito = temConflito
                ? `Cadastros agrupados automaticamente: ${existentes[0].nome} / ${al.responsavel_nome}`
                : null;

            await sql`
        UPDATE responsaveis
        SET
          telefone = ${telCanonico},
          telefone_formatado = ${telFmt},
          pin_hash = COALESCE(NULLIF(trim(pin_hash), ''), ${pinAluno || null}),
          conflito_migracao = CASE WHEN ${temConflito} THEN true ELSE conflito_migracao END,
          conflito_detalhes = COALESCE(${detalheConflito}, conflito_detalhes),
          atualizado_em = now()
        WHERE id = ${respId}
      `;
        } else {
            const novoResp = (await sql`
        INSERT INTO responsaveis (
          telefone,
          telefone_formatado,
          nome,
          pin_hash,
          pin_tentativas,
          pin_bloqueado_ate
        )
        VALUES (
          ${telCanonico},
          ${telFmt},
          ${al.responsavel_nome},
          ${al.pin_hash || null},
          ${Number(al.pin_tentativas || 0)},
          ${al.pin_bloqueado_ate ? al.pin_bloqueado_ate : null}::timestamptz
        )
        RETURNING id
      `) as { id: number }[];
            respId = novoResp[0].id;
        }

        await sql`
      UPDATE alunos
      SET
        responsavel_id = ${respId},
        telefone = ${telCanonico},
        telefone_formatado = ${telFmt}
      WHERE id = ${al.id}
    `;
    }

    // 2. Unifica contas duplicadas em responsaveis que difiram apenas pelo dígito 9
    const todasContas = (await sql`
    SELECT id, telefone, nome, pin_hash
    FROM responsaveis
    ORDER BY (CASE WHEN pin_hash IS NOT NULL AND trim(pin_hash) <> '' THEN 0 ELSE 1 END), id ASC
  `) as { id: number; telefone: string; nome: string; pin_hash: string | null }[];

    const porCanonico = new Map<
        string,
        { id: number; telefone: string; nome: string; pin_hash: string | null }[]
    >();

    for (const c of todasContas) {
        const canonico = normalizarTelefone(c.telefone);
        if (!canonico) continue;
        const lista = porCanonico.get(canonico) || [];
        lista.push(c);
        porCanonico.set(canonico, lista);
    }

    for (const [canonico, grupo] of porCanonico.entries()) {
        const telFmt = formatarTelefone(canonico);
        const principal = grupo[0];

        if (grupo.length === 1) {
            if (principal.telefone !== canonico) {
                await sql`
          UPDATE responsaveis
          SET telefone = ${canonico},
              telefone_formatado = ${telFmt},
              atualizado_em = now()
          WHERE id = ${principal.id}
        `;
                await sql`
          UPDATE alunos
          SET telefone = ${canonico},
              telefone_formatado = ${telFmt}
          WHERE responsavel_id = ${principal.id}
        `;
            }
            continue;
        }

        const nomesDistintos = Array.from(
            new Set(
                grupo
                    .map((g) => g.nome.trim())
                    .filter((n) => n && n !== 'Responsável')
            )
        );
        const pinPrincipal =
            grupo.find((g) => g.pin_hash && g.pin_hash.trim() !== '')?.pin_hash ||
            null;
        const temConflito = nomesDistintos.length > 1;
        const detalhe = temConflito
            ? `Contas unificadas (variação do dígito 9): ${nomesDistintos.join(' / ')}`
            : null;

        await sql`
      UPDATE responsaveis
      SET
        telefone = ${canonico},
        telefone_formatado = ${telFmt},
        nome = ${nomesDistintos[0] || principal.nome || 'Responsável'},
        pin_hash = COALESCE(${pinPrincipal}, pin_hash),
        conflito_migracao = CASE WHEN ${temConflito} THEN true ELSE conflito_migracao END,
        conflito_detalhes = COALESCE(${detalhe}, conflito_detalhes),
        atualizado_em = now()
      WHERE id = ${principal.id}
    `;

        for (let i = 1; i < grupo.length; i++) {
            const dup = grupo[i];
            await sql`
        UPDATE alunos
        SET
          responsavel_id = ${principal.id},
          telefone = ${canonico},
          telefone_formatado = ${telFmt},
          responsavel_nome = ${nomesDistintos[0] || principal.nome}
        WHERE responsavel_id = ${dup.id}
      `;
            await sql`
        DELETE FROM responsaveis
        WHERE id = ${dup.id}
      `;
        }
    }
}

export interface AlunoClienteDTO {
    id: number;
    nome_aluno: string;
    responsavel_nome: string;
    telefone: string;
    colegio_nome: string;
    serie: string;
    agendamentos_futuros: number;
}

export async function buscarFamiliaPorTelefone(telefoneBruto: string): Promise<{
    responsavelId: number | null;
    responsavelNome: string;
    alunos: AlunoClienteDTO[];
    temPin: boolean;
    pinHash: string | null;
    tentativas: number;
    bloqueadoAte: string | null;
}> {
    await garantirEstruturaContasResponsaveis();

    const telefoneCanonico = normalizarTelefone(telefoneBruto);
    const variantes = gerarVariantesTelefone(telefoneBruto);

    if (variantes.length === 0) {
        return {
            responsavelId: null,
            responsavelNome: '',
            alunos: [],
            temPin: false,
            pinHash: null,
            tentativas: 0,
            bloqueadoAte: null,
        };
    }

    const respRows = (await sql`
    SELECT
      id,
      COALESCE(NULLIF(trim(nome), ''), 'Responsável') AS nome,
      pin_hash,
      COALESCE(pin_tentativas, 0) AS pin_tentativas,
      pin_bloqueado_ate::text AS pin_bloqueado_ate
    FROM responsaveis
    WHERE regexp_replace(
      regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
      '^55(?=\d{10,11}$)',
      ''
    ) = ANY(${variantes}::text[])
    ORDER BY id ASC
    LIMIT 1
  `) as {
        id: number;
        nome: string;
        pin_hash: string | null;
        pin_tentativas: number;
        pin_bloqueado_ate: string | null;
    }[];

    const resp = respRows[0] || null;

    const registros = (await sql`
    SELECT
      al.id,
      COALESCE(NULLIF(trim(al.nome_aluno), ''), 'Aluno') AS nome_aluno,
      COALESCE(NULLIF(trim(r.nome), ''), NULLIF(trim(al.responsavel_nome), ''), 'Responsável') AS responsavel_nome,
      COALESCE(NULLIF(trim(al.telefone_formatado), ''), NULLIF(trim(al.telefone), ''), '') AS telefone,
      COALESCE(NULLIF(trim(al.colegio_nome), ''), '') AS colegio_nome,
      COALESCE(NULLIF(trim(al.serie), ''), '') AS serie,
      al.pin_hash,
      COALESCE(al.pin_tentativas, 0) AS pin_tentativas,
      al.pin_bloqueado_ate::text AS pin_bloqueado_ate,
      (
        SELECT COUNT(*)::int
        FROM agendamentos ag
        WHERE ag.status = 'confirmado'
          AND ag.data >= (now() AT TIME ZONE 'America/Bahia')::date
          AND (
            ag.aluno_id = al.id
            OR regexp_replace(
              regexp_replace(COALESCE(ag.aluno_telefone, ag.whatsapp_responsavel, ''), '\D', '', 'g'),
              '^55(?=\d{10,11}$)',
              ''
            ) = ANY(${variantes}::text[])
          )
      ) AS agendamentos_futuros
    FROM alunos al
    LEFT JOIN responsaveis r ON r.id = al.responsavel_id
    WHERE al.ativo = true
      AND (
        (${resp?.id || 0} > 0 AND al.responsavel_id = ${resp?.id || 0})
        OR regexp_replace(
          regexp_replace(COALESCE(al.telefone, ''), '\D', '', 'g'),
          '^55(?=\d{10,11}$)',
          ''
        ) = ANY(${variantes}::text[])
      )
    ORDER BY al.id ASC
  `) as {
        id: number;
        nome_aluno: string;
        responsavel_nome: string;
        telefone: string;
        colegio_nome: string;
        serie: string;
        pin_hash: string | null;
        pin_tentativas: number;
        pin_bloqueado_ate: string | null;
        agendamentos_futuros: number;
    }[];

    const pinHashFinal =
        (resp?.pin_hash && resp.pin_hash.trim() !== '' ? resp.pin_hash : null) ||
        registros.find((r) => r.pin_hash && r.pin_hash.trim() !== '')?.pin_hash ||
        null;

    const bloqueadoResp =
        resp?.pin_bloqueado_ate &&
        new Date(resp.pin_bloqueado_ate).getTime() > Date.now()
            ? resp.pin_bloqueado_ate
            : null;
    const bloqueadoAluno =
        registros.find(
            (r) =>
                r.pin_bloqueado_ate &&
                new Date(r.pin_bloqueado_ate).getTime() > Date.now()
        )?.pin_bloqueado_ate || null;

    const maxTentativas = registros.reduce(
        (acc, r) => Math.max(acc, Number(r.pin_tentativas || 0)),
        Number(resp?.pin_tentativas || 0)
    );

    const responsavelNomeFinal =
        resp?.nome || registros[0]?.responsavel_nome || 'Responsável';

    return {
        responsavelId: resp?.id || null,
        responsavelNome: responsavelNomeFinal,
        alunos: registros.map((r) => ({
            id: r.id,
            nome_aluno: r.nome_aluno,
            responsavel_nome: responsavelNomeFinal,
            telefone: formatarTelefone(telefoneCanonico) || r.telefone,
            colegio_nome: r.colegio_nome,
            serie: r.serie,
            agendamentos_futuros: Number(r.agendamentos_futuros || 0),
        })),
        temPin: Boolean(pinHashFinal),
        pinHash: pinHashFinal,
        tentativas: maxTentativas,
        bloqueadoAte: bloqueadoResp || bloqueadoAluno,
    };
}