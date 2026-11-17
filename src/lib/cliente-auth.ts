import crypto from 'crypto';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';
import { formatarTelefone } from '@/lib/cliente-helpers';

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
    if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) {
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

export interface SessaoClientePayload {
    responsavelId: number;
    telefone: string;
    sessaoVersao: number;
}

export function criarTokenSessaoCliente(
    telefoneNorm: string,
    responsavelId = 0,
    sessaoVersao = 1
): string {
    const payload = JSON.stringify({
        rid: responsavelId,
        tel: telefoneNorm,
        ver: sessaoVersao,
        exp: Date.now() + DURACAO_SESSAO_CLIENTE_SEGUNDOS * 1000,
    });
    const payloadB64 = Buffer.from(payload).toString('base64url');
    const assinatura = crypto
        .createHmac('sha256', SEGREDO_SESSAO)
        .update(payloadB64)
        .digest('base64url');
    return `${payloadB64}.${assinatura}`;
}

export async function lerSessaoCliente(): Promise<SessaoClientePayload | null> {
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
        ) as { rid?: number; tel?: string; ver?: number; exp?: number };

        if (!dados.tel || !dados.exp || Date.now() > dados.exp) {
            return null;
        }

        await garantirEstruturaContasResponsaveis();
        const telNorm = normalizarTelefone(dados.tel);

        const contas = (await sql`
      SELECT id, telefone, COALESCE(sessao_versao, 1) AS sessao_versao
      FROM responsaveis
      WHERE telefone = ${telNorm}
      LIMIT 1
    `) as { id: number; telefone: string; sessao_versao: number }[];

        if (contas.length === 0) {
            return null;
        }

        const conta = contas[0];
        if (typeof dados.rid === 'number' && dados.rid > 0 && dados.rid !== conta.id) {
            return null;
        }

        const versaoToken = typeof dados.ver === 'number' ? dados.ver : 1;
        if (versaoToken !== Number(conta.sessao_versao)) {
            return null;
        }

        return {
            responsavelId: conta.id,
            telefone: conta.telefone,
            sessaoVersao: Number(conta.sessao_versao),
        };
    } catch {
        return null;
    }
}

let estruturaGarantida = false;

export async function garantirEstruturaContasResponsaveis(): Promise<void> {
    if (estruturaGarantida) return;

    await sql`
    CREATE TABLE IF NOT EXISTS responsaveis (
      id SERIAL PRIMARY KEY,
      telefone TEXT NOT NULL,
      telefone_formatado TEXT,
      nome TEXT NOT NULL DEFAULT 'Responsável',
      pin_hash TEXT,
      pin_tentativas INTEGER NOT NULL DEFAULT 0,
      pin_bloqueado_ate TIMESTAMPTZ,
      sessao_versao INTEGER NOT NULL DEFAULT 1,
      conflito_migracao BOOLEAN NOT NULL DEFAULT false,
      conflito_detalhes TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

    await sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS telefone_formatado TEXT`;
    await sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS nome TEXT DEFAULT 'Responsável'`;
    await sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS pin_hash TEXT`;
    await sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS pin_tentativas INTEGER DEFAULT 0`;
    await sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS pin_bloqueado_ate TIMESTAMPTZ`;
    await sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS sessao_versao INTEGER DEFAULT 1`;
    await sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS conflito_migracao BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS conflito_detalhes TEXT`;
    await sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ DEFAULT now()`;

    await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_responsaveis_telefone_unico
    ON responsaveis (telefone)
  `;

    // Mantém colunas legadas em alunos sem apagar nada para histórico e auditoria
    await sql`ALTER TABLE alunos ADD COLUMN IF NOT EXISTS responsavel_nome TEXT`;
    await sql`ALTER TABLE alunos ADD COLUMN IF NOT EXISTS pin_hash TEXT`;
    await sql`ALTER TABLE alunos ADD COLUMN IF NOT EXISTS pin_tentativas INTEGER DEFAULT 0`;
    await sql`ALTER TABLE alunos ADD COLUMN IF NOT EXISTS pin_bloqueado_ate TIMESTAMPTZ`;
    await sql`
    ALTER TABLE alunos
    ADD COLUMN IF NOT EXISTS responsavel_id INTEGER REFERENCES responsaveis(id) ON DELETE RESTRICT
  `;
    await sql`
    CREATE INDEX IF NOT EXISTS idx_alunos_responsavel_id
    ON alunos (responsavel_id)
  `;

    await migrarRegistrosLegadosParaResponsaveis();
    estruturaGarantida = true;
}

export async function garantirColunasSegurancaAlunos(): Promise<void> {
    await garantirEstruturaContasResponsaveis();
}

async function migrarRegistrosLegadosParaResponsaveis(): Promise<void> {
    const semConta = (await sql`
    SELECT
      id,
      telefone,
      responsavel_nome,
      nome_aluno,
      pin_hash,
      COALESCE(pin_tentativas, 0) AS pin_tentativas,
      pin_bloqueado_ate::text AS pin_bloqueado_ate,
      ativo
    FROM alunos
    WHERE responsavel_id IS NULL
      AND COALESCE(trim(telefone), '') <> ''
    ORDER BY ativo DESC, id ASC
  `) as {
        id: number;
        telefone: string;
        responsavel_nome: string | null;
        nome_aluno: string;
        pin_hash: string | null;
        pin_tentativas: number;
        pin_bloqueado_ate: string | null;
        ativo: boolean;
    }[];

    if (semConta.length === 0) return;

    const grupos = new Map<string, typeof semConta>();
    for (const row of semConta) {
        const telNorm = normalizarTelefone(row.telefone);
        if (telNorm.length < 10) continue;
        const lista = grupos.get(telNorm) || [];
        lista.push(row);
        grupos.set(telNorm, lista);
    }

    for (const [telNorm, registros] of grupos.entries()) {
        const nomesRespUnicos = new Map<string, string>();
        const pinsUnicos = new Set<string>();
        const nomesAlunosVistos = new Map<string, number>();
        const alunosDuplicados = new Set<string>();

        for (const r of registros) {
            const respLimpo = String(r.responsavel_nome || '').trim();
            if (respLimpo && respLimpo.toLowerCase() !== 'responsável') {
                const chaveResp = respLimpo.toLowerCase();
                if (!nomesRespUnicos.has(chaveResp)) {
                    nomesRespUnicos.set(chaveResp, respLimpo);
                }
            }

            const pinLimpo = String(r.pin_hash || '').trim();
            if (pinLimpo) {
                pinsUnicos.add(pinLimpo);
            }

            if (r.ativo) {
                const alunoChave = String(r.nome_aluno || '').trim().toLowerCase();
                if (alunoChave) {
                    const qtd = (nomesAlunosVistos.get(alunoChave) || 0) + 1;
                    nomesAlunosVistos.set(alunoChave, qtd);
                    if (qtd > 1) {
                        alunosDuplicados.add(r.nome_aluno.trim());
                    }
                }
            }
        }

        const conflitos: string[] = [];
        if (nomesRespUnicos.size > 1) {
            conflitos.push(
                `Responsáveis divergentes na migração: ${Array.from(
                    nomesRespUnicos.values()
                ).join(' / ')}`
            );
        }
        if (pinsUnicos.size > 1) {
            conflitos.push(
                'Múltiplos PINs diferentes encontrados nos cadastros antigos (PIN redefinido para segurança)'
            );
        }
        if (alunosDuplicados.size > 0) {
            conflitos.push(
                `Possível aluno duplicado no mesmo WhatsApp: ${Array.from(
                    alunosDuplicados
                ).join(', ')}`
            );
        }

        const listaNomesResp = Array.from(nomesRespUnicos.values());
        const nomeEscolhido =
            listaNomesResp[listaNomesResp.length - 1] || 'Responsável';

        // Se havia PINs conflitantes entre registros do mesmo número, limpa o PIN para evitar sobrescrita silenciosa
        const pinEscolhido =
            pinsUnicos.size === 1 ? Array.from(pinsUnicos)[0] : null;

        const maxTentativas = registros.reduce(
            (acc, r) => Math.max(acc, Number(r.pin_tentativas || 0)),
            0
        );
        const bloqueioMaisRecente =
            registros
                .map((r) => r.pin_bloqueado_ate)
                .filter((d): d is string => Boolean(d))
                .sort()
                .pop() || null;

        const telFormatado = formatarTelefone(telNorm);
        const temConflito = conflitos.length > 0;
        const detalhesConflito = temConflito ? conflitos.join(' | ') : null;

        const inserido = (await sql`
      INSERT INTO responsaveis (
        telefone,
        telefone_formatado,
        nome,
        pin_hash,
        pin_tentativas,
        pin_bloqueado_ate,
        conflito_migracao,
        conflito_detalhes
      )
      VALUES (
        ${telNorm},
        ${telFormatado},
        ${nomeEscolhido},
        ${pinEscolhido},
        ${pinEscolhido ? maxTentativas : 0},
        ${pinEscolhido ? bloqueioMaisRecente : null}::timestamptz,
        ${temConflito},
        ${detalhesConflito}
      )
      ON CONFLICT (telefone) DO UPDATE SET
        conflito_migracao = responsaveis.conflito_migracao OR EXCLUDED.conflito_migracao,
        conflito_detalhes = COALESCE(
          NULLIF(concat_ws(' | ', responsaveis.conflito_detalhes, EXCLUDED.conflito_detalhes), ''),
          responsaveis.conflito_detalhes
        ),
        atualizado_em = now()
      RETURNING id
    `) as { id: number }[];

        const responsavelId = inserido[0]?.id;
        if (responsavelId) {
            const idsAlunos = registros.map((r) => r.id);
            await sql`
        UPDATE alunos
        SET
          responsavel_id = ${responsavelId},
          telefone = ${telNorm},
          telefone_formatado = ${telFormatado}
        WHERE id = ANY(${idsAlunos}::int[])
          AND responsavel_id IS NULL
      `;
        }
    }
}

export interface AlunoClienteDTO {
    id: number;
    nome_aluno: string;
    responsavel_nome: string;
    telefone: string;
    colegio_id: number | null;
    colegio_nome: string;
    serie: string;
    agendamentos_futuros: number;
}

export interface FamiliaContaDTO {
    responsavelId: number | null;
    responsavelNome: string;
    telefone: string;
    telefoneFormatado: string;
    sessaoVersao: number;
    alunos: AlunoClienteDTO[];
    temPin: boolean;
    pinHash: string | null;
    tentativas: number;
    bloqueadoAte: string | null;
}

export async function buscarFamiliaPorTelefone(
    telefoneNorm: string
): Promise<FamiliaContaDTO> {
    await garantirEstruturaContasResponsaveis();

    const contas = (await sql`
    SELECT
      id,
      COALESCE(NULLIF(trim(nome), ''), 'Responsável') AS nome,
      telefone,
      COALESCE(NULLIF(trim(telefone_formatado), ''), telefone) AS telefone_formatado,
      pin_hash,
      COALESCE(pin_tentativas, 0) AS pin_tentativas,
      pin_bloqueado_ate::text AS pin_bloqueado_ate,
      COALESCE(sessao_versao, 1) AS sessao_versao
    FROM responsaveis
    WHERE telefone = ${telefoneNorm}
    LIMIT 1
  `) as {
        id: number;
        nome: string;
        telefone: string;
        telefone_formatado: string;
        pin_hash: string | null;
        pin_tentativas: number;
        pin_bloqueado_ate: string | null;
        sessao_versao: number;
    }[];

    if (contas.length === 0) {
        return {
            responsavelId: null,
            responsavelNome: '',
            telefone: telefoneNorm,
            telefoneFormatado: formatarTelefone(telefoneNorm),
            sessaoVersao: 1,
            alunos: [],
            temPin: false,
            pinHash: null,
            tentativas: 0,
            bloqueadoAte: null,
        };
    }

    const conta = contas[0];

    const filhos = (await sql`
    SELECT
      al.id,
      COALESCE(NULLIF(trim(al.nome_aluno), ''), 'Aluno') AS nome_aluno,
      al.colegio_id,
      COALESCE(NULLIF(trim(al.colegio_nome), ''), '') AS colegio_nome,
      COALESCE(NULLIF(trim(al.serie), ''), '') AS serie,
      (
        SELECT COUNT(*)::int
        FROM agendamentos ag
        WHERE ag.status = 'confirmado'
          AND ag.data >= (now() AT TIME ZONE 'America/Bahia')::date
          AND (
            ag.aluno_id = al.id
            OR (
              ag.aluno_id IS NULL
              AND lower(trim(COALESCE(ag.aluno_nome, ag.nome_aluno, ''))) = lower(trim(al.nome_aluno))
              AND regexp_replace(
                regexp_replace(COALESCE(ag.aluno_telefone, ag.whatsapp_responsavel, ''), '\D', '', 'g'),
                '^55(?=\d{10,11}$)',
                ''
              ) = ${conta.telefone}
            )
          )
      ) AS agendamentos_futuros
    FROM alunos al
    WHERE al.responsavel_id = ${conta.id}
      AND al.ativo = true
    ORDER BY al.id ASC
  `) as {
        id: number;
        nome_aluno: string;
        colegio_id: number | null;
        colegio_nome: string;
        serie: string;
        agendamentos_futuros: number;
    }[];

    return {
        responsavelId: conta.id,
        responsavelNome: conta.nome,
        telefone: conta.telefone,
        telefoneFormatado: conta.telefone_formatado,
        sessaoVersao: Number(conta.sessao_versao || 1),
        alunos: filhos.map((f) => ({
            id: f.id,
            nome_aluno: f.nome_aluno,
            responsavel_nome: conta.nome,
            telefone: conta.telefone_formatado,
            colegio_id: f.colegio_id,
            colegio_nome: f.colegio_nome,
            serie: f.serie,
            agendamentos_futuros: Number(f.agendamentos_futuros || 0),
        })),
        temPin: Boolean(conta.pin_hash && conta.pin_hash.trim() !== ''),
        pinHash: conta.pin_hash || null,
        tentativas: Number(conta.pin_tentativas || 0),
        bloqueadoAte: conta.pin_bloqueado_ate || null,
    };
}