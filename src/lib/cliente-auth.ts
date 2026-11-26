import { garantirHistoricoAgendamento } from './agendamento-historico';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';
import {
    formatarTelefone,
    gerarVariantesTelefone,
    normalizarTelefone,
} from '@/lib/cliente-helpers';
import { enviarCodigoVerificacaoWhatsApp } from '@/lib/whatsapp-notificacao';

export { normalizarTelefone, gerarVariantesTelefone };

export const COOKIE_SESSAO_CLIENTE = 'r4_cliente_sessao';
export const DURACAO_SESSAO_CLIENTE_SEGUNDOS = 30 * 24 * 60 * 60; // 30 dias
export const MAX_TENTATIVAS_PIN = 5;
export const BLOQUEIO_PIN_MINUTOS = 15;
export const LIMITE_AGENDAMENTOS_SIMULTANEOS = 2;

export const OTP_VALIDADE_MINUTOS = 10;
export const OTP_COOLDOWN_SEGUNDOS = 60;
export const OTP_MAX_ENVIOS_HORA = 4;
export const OTP_MAX_TENTATIVAS = 5;

const SEGREDO_SESSAO =
    process.env.CLIENT_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    'r4-ensina-chave-sessao-cliente-2026';

declare global {
    // eslint-disable-next-line no-var
    var __r4ContasResponsaveisPromise: Promise<void> | undefined;
}

export function validarFormatoPin(pin: string): boolean {
    return /^\d{4}$/.test(String(pin || '').trim());
}

export function gerarCodigoOtp4Digitos(): string {
    return crypto.randomInt(1000, 10000).toString();
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
    await Promise.all([
        sql`ALTER TABLE alunos ADD COLUMN IF NOT EXISTS responsavel_nome TEXT`,
        sql`ALTER TABLE alunos ADD COLUMN IF NOT EXISTS pin_hash TEXT`,
        sql`ALTER TABLE alunos ADD COLUMN IF NOT EXISTS pin_tentativas INTEGER DEFAULT 0`,
        sql`ALTER TABLE alunos ADD COLUMN IF NOT EXISTS pin_bloqueado_ate TIMESTAMPTZ`,
    ]);
}

async function executarMigracaoContasResponsaveis() {
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

    await sql`
    CREATE TABLE IF NOT EXISTS codigos_verificacao_whatsapp (
      id SERIAL PRIMARY KEY,
      telefone TEXT NOT NULL,
      objetivo TEXT NOT NULL,
      codigo_hash TEXT NOT NULL,
      tentativas INTEGER NOT NULL DEFAULT 0,
      usado BOOLEAN NOT NULL DEFAULT false,
      expira_em TIMESTAMPTZ NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

    await Promise.all([
        sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS telefone_formatado TEXT`,
        sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS nome TEXT NOT NULL DEFAULT 'Responsável'`,
        sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS pin_hash TEXT`,
        sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS pin_tentativas INTEGER NOT NULL DEFAULT 0`,
        sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS pin_bloqueado_ate TIMESTAMPTZ`,
        sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS conflito_migracao BOOLEAN NOT NULL DEFAULT false`,
        sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS conflito_detalhes TEXT`,
        sql`ALTER TABLE responsaveis ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()`,
        sql`
      ALTER TABLE alunos
      ADD COLUMN IF NOT EXISTS responsavel_id INT REFERENCES responsaveis(id) ON DELETE SET NULL
    `,
    ]);

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
      AND nullif(trim(pin_hash), '') IS NOT NULL
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

export function garantirEstruturaContasResponsaveis(): Promise<void> {
    if (!globalThis.__r4ContasResponsaveisPromise) {
        globalThis.__r4ContasResponsaveisPromise =
            executarMigracaoContasResponsaveis().catch((err) => {
                globalThis.__r4ContasResponsaveisPromise = undefined;
                throw err;
            });
    }
    return globalThis.__r4ContasResponsaveisPromise;
}

export async function solicitarCodigoVerificacaoWhatsApp(
    telefoneBruto: string,
    objetivo: 'cadastro' | 'recuperacao_pin',
    nomeResponsavel?: string
): Promise<{
    ok: boolean;
    status?: number;
    erro?: string;
    desativado?: boolean;
    expiraMinutos?: number;
    cooldownSegundos?: number;
    aguardarSegundos?: number;
}> {
    await garantirEstruturaContasResponsaveis();

    const telefoneCanonico = normalizarTelefone(telefoneBruto);
    const variantes = gerarVariantesTelefone(telefoneBruto);

    if (
        telefoneCanonico.length < 10 ||
        telefoneCanonico.length > 11 ||
        variantes.length === 0
    ) {
        return {
            ok: false,
            status: 400,
            erro: 'Informe um número de WhatsApp válido com DDD.',
        };
    }

    const recentes = (await sql`
    SELECT
      EXTRACT(EPOCH FROM (now() - criado_em))::int AS segundos_atras
    FROM codigos_verificacao_whatsapp
    WHERE telefone = ANY(${variantes}::text[])
      AND objetivo = ${objetivo}
      AND criado_em >= now() - interval '1 hour'
    ORDER BY id DESC
  `) as { segundos_atras: number }[];

    if (recentes.length > 0 && recentes[0].segundos_atras < OTP_COOLDOWN_SEGUNDOS) {
        const aguardar = Math.max(
            1,
            OTP_COOLDOWN_SEGUNDOS - recentes[0].segundos_atras
        );
        return {
            ok: false,
            status: 429,
            aguardarSegundos: aguardar,
            erro: `Aguarde ${aguardar} segundo(s) antes de solicitar um novo código.`,
        };
    }

    if (recentes.length >= OTP_MAX_ENVIOS_HORA) {
        return {
            ok: false,
            status: 429,
            erro: 'Muitos códigos solicitados para este número. Tente novamente em alguns minutos.',
        };
    }

    const codigo = gerarCodigoOtp4Digitos();
    const codigoHash = gerarHashPin(codigo);

    const envio = await enviarCodigoVerificacaoWhatsApp(
        telefoneCanonico,
        codigo,
        objetivo,
        nomeResponsavel
    );

    if (!envio.ok) {
        return {
            ok: false,
            status: envio.desativado ? 503 : 502,
            desativado: envio.desativado,
            erro:
                envio.erro ||
                'Não foi possível enviar o código pelo WhatsApp. Tente novamente.',
        };
    }

    await sql`
    UPDATE codigos_verificacao_whatsapp
    SET usado = true
    WHERE telefone = ANY(${variantes}::text[])
      AND objetivo = ${objetivo}
      AND usado = false
  `;

    await sql`
    INSERT INTO codigos_verificacao_whatsapp (
      telefone,
      objetivo,
      codigo_hash,
      tentativas,
      usado,
      expira_em,
      criado_em
    )
    VALUES (
      ${telefoneCanonico},
      ${objetivo},
      ${codigoHash},
      0,
      false,
      now() + (${OTP_VALIDADE_MINUTOS} || ' minutes')::interval,
      now()
    )
  `;

    return {
        ok: true,
        expiraMinutos: OTP_VALIDADE_MINUTOS,
        cooldownSegundos: OTP_COOLDOWN_SEGUNDOS,
    };
}

export async function validarCodigoVerificacaoWhatsApp(
    telefoneBruto: string,
    objetivo: 'cadastro' | 'recuperacao_pin',
    codigoDigitado: string,
    consumir = true
): Promise<{ ok: boolean; status?: number; erro?: string }> {
    await garantirEstruturaContasResponsaveis();

    const codigoLimpo = String(codigoDigitado || '').trim();
    if (!validarFormatoPin(codigoLimpo)) {
        return {
            ok: false,
            status: 400,
            erro: 'Digite o código de 4 dígitos enviado no seu WhatsApp.',
        };
    }

    const variantes = gerarVariantesTelefone(telefoneBruto);
    if (variantes.length === 0) {
        return {
            ok: false,
            status: 400,
            erro: 'Número de WhatsApp inválido.',
        };
    }

    const rows = (await sql`
    SELECT id, codigo_hash, tentativas
    FROM codigos_verificacao_whatsapp
    WHERE telefone = ANY(${variantes}::text[])
      AND objetivo = ${objetivo}
      AND usado = false
      AND expira_em > now()
    ORDER BY id DESC
    LIMIT 1
  `) as { id: number; codigo_hash: string; tentativas: number }[];

    if (rows.length === 0) {
        return {
            ok: false,
            status: 400,
            erro: 'Código expirado ou inválido. Solicite um novo código.',
        };
    }

    const registro = rows[0];

    if (registro.tentativas >= OTP_MAX_TENTATIVAS) {
        await sql`
      UPDATE codigos_verificacao_whatsapp
      SET usado = true
      WHERE id = ${registro.id}
    `;
        return {
            ok: false,
            status: 429,
            erro: 'Muitas tentativas incorretas. Solicite um novo código.',
        };
    }

    if (!verificarHashPin(codigoLimpo, registro.codigo_hash)) {
        const novasTentativas = registro.tentativas + 1;
        const esgotou = novasTentativas >= OTP_MAX_TENTATIVAS;

        await sql`
      UPDATE codigos_verificacao_whatsapp
      SET tentativas = ${novasTentativas},
          usado = ${esgotou}
      WHERE id = ${registro.id}
    `;

        return {
            ok: false,
            status: 401,
            erro: esgotou
                ? 'Código bloqueado por excesso de tentativas. Solicite um novo código.'
                : 'Código incorreto. Verifique a mensagem no WhatsApp e tente novamente.',
        };
    }

    if (consumir) {
        await sql`
      UPDATE codigos_verificacao_whatsapp
      SET usado = true
      WHERE id = ${registro.id}
    `;
    }

    return { ok: true };
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

    await garantirHistoricoAgendamento();
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
        WHERE coalesce(ag.status, 'confirmado') IN ('agendado','confirmado')
          AND ag.excluido_em IS NULL
          AND ((ag.data + coalesce(ag.hora_inicio, ag.horario, '14:10'::time))
            AT TIME ZONE 'America/Bahia') > now()
          AND (
            ag.aluno_id = al.id
            OR (ag.aluno_id IS NULL
              AND lower(trim(coalesce(ag.aluno_nome, ag.nome_aluno, ''))) = lower(trim(al.nome_aluno))
              AND regexp_replace(
                regexp_replace(COALESCE(ag.aluno_telefone, ag.whatsapp_responsavel, ''), '[^0-9]', '', 'g'),
                '^55(?=[0-9]{10,11}$)', ''
              ) = ANY(${variantes}::text[]))
          )
      ) AS agendamentos_futuros
    FROM alunos al
    LEFT JOIN responsaveis r ON r.id = al.responsavel_id
    WHERE al.ativo = true
      AND al.responsavel_id = ${resp?.id ?? null}
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
