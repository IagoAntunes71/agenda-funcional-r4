import crypto from 'crypto';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';

export const COOKIE_SESSAO_CLIENTE = 'r4_cliente_sessao';
export const DURACAO_SESSAO_CLIENTE_SEGUNDOS = 30 * 24 * 60 * 60; // 30 dias
export const MAX_TENTATIVAS_PIN = 5;
export const BLOQUEIO_PIN_MINUTOS = 15;
export const LIMITE_AGENDAMENTOS_SIMULTANEOS = 2;

const SEGREDO_SESSAO =
    process.env.CLIENT_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    'r4-ensina-chave-sessao-cliente-2026';

export function normalizarTelefone(telefone: string): string {
    let digitos = String(telefone || '').replace(/\D/g, '');
    if (digitos.startsWith('0')) {
        digitos = digitos.replace(/^0+/, '');
    }
    if (digitos.length >= 12 && digitos.startsWith('55')) {
        digitos = digitos.slice(2);
    }
    return digitos;
}

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
    const payload = JSON.stringify({
        tel: telefoneNorm,
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

        return { telefone: dados.tel };
    } catch {
        return null;
    }
}

export async function garantirColunasSegurancaAlunos() {
    await sql`ALTER TABLE alunos ADD COLUMN IF NOT EXISTS pin_hash TEXT`;
    await sql`ALTER TABLE alunos ADD COLUMN IF NOT EXISTS pin_tentativas INTEGER DEFAULT 0`;
    await sql`ALTER TABLE alunos ADD COLUMN IF NOT EXISTS pin_bloqueado_ate TIMESTAMPTZ`;
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

export async function buscarFamiliaPorTelefone(telefoneNorm: string): Promise<{
    alunos: AlunoClienteDTO[];
    temPin: boolean;
    pinHash: string | null;
    tentativas: number;
    bloqueadoAte: string | null;
}> {
    await garantirColunasSegurancaAlunos();

    const registros = (await sql`
    SELECT
      al.id,
      COALESCE(NULLIF(trim(al.nome_aluno), ''), 'Aluno') AS nome_aluno,
      COALESCE(NULLIF(trim(al.responsavel_nome), ''), 'Responsável') AS responsavel_nome,
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
            ) = ${telefoneNorm}
          )
      ) AS agendamentos_futuros
    FROM alunos al
    WHERE regexp_replace(
      regexp_replace(COALESCE(al.telefone, ''), '\D', '', 'g'),
      '^55(?=\d{10,11}$)',
      ''
    ) = ${telefoneNorm}
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

    const comPin = registros.find((r) => r.pin_hash && r.pin_hash.trim() !== '');
    const bloqueado = registros.find(
        (r) => r.pin_bloqueado_ate && new Date(r.pin_bloqueado_ate).getTime() > Date.now()
    );
    const maxTentativas = registros.reduce(
        (acc, r) => Math.max(acc, Number(r.pin_tentativas || 0)),
        0
    );

    return {
        alunos: registros.map((r) => ({
            id: r.id,
            nome_aluno: r.nome_aluno,
            responsavel_nome: r.responsavel_nome,
            telefone: r.telefone,
            colegio_nome: r.colegio_nome,
            serie: r.serie,
            agendamentos_futuros: Number(r.agendamentos_futuros || 0),
        })),
        temPin: Boolean(comPin),
        pinHash: comPin?.pin_hash || null,
        tentativas: maxTentativas,
        bloqueadoAte: bloqueado?.pin_bloqueado_ate || null,
    };
}