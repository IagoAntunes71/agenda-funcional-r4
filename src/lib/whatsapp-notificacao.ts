import { sql } from '@/lib/db';
import { formatarTelefone } from '@/lib/cliente-helpers';

export interface DadosNotificacaoAgendamento {
    id: number;
    unidade: string;
    professor: string;
    materia: string;
    data: string; // YYYY-MM-DD
    horario: string; // Ex: 14:10 às 15:50
    alunoNome: string;
    alunoTelefone: string;
    colegioNome?: string;
    serie?: string;
    observacoes?: string;
}

export interface ConfigWhatsApp {
    ativo: boolean; // Opção 1: Envio automático via API (grupo ou número)
    provedor: 'evolution' | 'zapi' | 'webhook';
    url_api: string;
    url_webhook_otp: string; // URL separada opcional para códigos OTP / recuperação de PIN via Webhook
    token_api: string;
    client_token: string;
    instancia: string;
    grupo_id: string;
    wame_ativo: boolean; // Opção 2: Botão gratuito wa.me na tela do cliente
    wame_numero: string;
    alerta_sonoro_ativo: boolean; // Opção 3: Alerta sonoro automático no /admin
    verificar_cadastro_whatsapp: boolean; // Opção 4: Exigir código OTP no cadastro
}

export async function garantirTabelaConfigWhatsApp() {
    await sql`
    CREATE TABLE IF NOT EXISTS config_whatsapp_grupo (
      id INT PRIMARY KEY DEFAULT 1,
      ativo BOOLEAN NOT NULL DEFAULT false,
      provedor TEXT NOT NULL DEFAULT 'evolution',
      url_api TEXT NOT NULL DEFAULT '',
      url_webhook_otp TEXT NOT NULL DEFAULT '',
      token_api TEXT NOT NULL DEFAULT '',
      client_token TEXT NOT NULL DEFAULT '',
      instancia TEXT NOT NULL DEFAULT '',
      grupo_id TEXT NOT NULL DEFAULT '',
      wame_ativo BOOLEAN NOT NULL DEFAULT false,
      wame_numero TEXT NOT NULL DEFAULT '',
      alerta_sonoro_ativo BOOLEAN NOT NULL DEFAULT true,
      verificar_cadastro_whatsapp BOOLEAN NOT NULL DEFAULT true,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

    await sql`ALTER TABLE config_whatsapp_grupo ADD COLUMN IF NOT EXISTS url_webhook_otp TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE config_whatsapp_grupo ADD COLUMN IF NOT EXISTS wame_ativo BOOLEAN NOT NULL DEFAULT false`;
    await sql`ALTER TABLE config_whatsapp_grupo ADD COLUMN IF NOT EXISTS wame_numero TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE config_whatsapp_grupo ADD COLUMN IF NOT EXISTS alerta_sonoro_ativo BOOLEAN NOT NULL DEFAULT true`;
    await sql`ALTER TABLE config_whatsapp_grupo ADD COLUMN IF NOT EXISTS verificar_cadastro_whatsapp BOOLEAN NOT NULL DEFAULT true`;

    await sql`
    INSERT INTO config_whatsapp_grupo (id, ativo, wame_ativo, alerta_sonoro_ativo, verificar_cadastro_whatsapp)
    VALUES (1, false, false, true, true)
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function obterConfigWhatsApp(): Promise<ConfigWhatsApp> {
    await garantirTabelaConfigWhatsApp();

    const rows = (await sql`
    SELECT
      ativo,
      provedor,
      url_api,
      COALESCE(url_webhook_otp, '') AS url_webhook_otp,
      token_api,
      client_token,
      instancia,
      grupo_id,
      COALESCE(wame_ativo, false) AS wame_ativo,
      COALESCE(wame_numero, '') AS wame_numero,
      COALESCE(alerta_sonoro_ativo, true) AS alerta_sonoro_ativo,
      COALESCE(verificar_cadastro_whatsapp, true) AS verificar_cadastro_whatsapp
    FROM config_whatsapp_grupo
    WHERE id = 1
    LIMIT 1
  `) as ConfigWhatsApp[];

    const dbCfg = rows[0];

    return {
        ativo: dbCfg?.ativo || process.env.WHATSAPP_GRUPO_ATIVO === 'true',
        provedor: (dbCfg?.provedor ||
            process.env.WHATSAPP_PROVEDOR ||
            'evolution') as ConfigWhatsApp['provedor'],
        url_api: (dbCfg?.url_api || process.env.WHATSAPP_API_URL || '').trim(),
        url_webhook_otp: (
            dbCfg?.url_webhook_otp ||
            process.env.WHATSAPP_WEBHOOK_OTP_URL ||
            ''
        ).trim(),
        token_api: (dbCfg?.token_api || process.env.WHATSAPP_API_TOKEN || '').trim(),
        client_token: (
            dbCfg?.client_token ||
            process.env.WHATSAPP_CLIENT_TOKEN ||
            ''
        ).trim(),
        instancia: (
            dbCfg?.instancia ||
            process.env.WHATSAPP_INSTANCIA ||
            ''
        ).trim(),
        grupo_id: (dbCfg?.grupo_id || process.env.WHATSAPP_GRUPO_ID || '').trim(),
        wame_ativo: Boolean(dbCfg?.wame_ativo),
        wame_numero: (dbCfg?.wame_numero || '').trim(),
        alerta_sonoro_ativo:
            dbCfg?.alerta_sonoro_ativo !== undefined
                ? Boolean(dbCfg.alerta_sonoro_ativo)
                : true,
        verificar_cadastro_whatsapp:
            dbCfg?.verificar_cadastro_whatsapp !== undefined
                ? Boolean(dbCfg.verificar_cadastro_whatsapp)
                : true,
    };
}

function formatarDataBR(isoDate: string): string {
    const limpo = String(isoDate || '').trim().slice(0, 10);
    const [ano, mes, dia] = limpo.split('-');
    if (!ano || !mes || !dia || ano.length !== 4) return isoDate;
    return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${ano}`;
}

function formatarDataComDia(isoDate: string): string {
    const [ano, mes, dia] = isoDate.split('-').map(Number);
    if (!ano || !mes || !dia) return isoDate;
    const dt = new Date(ano, mes - 1, dia);
    const diaSem = dt
        .toLocaleDateString('pt-BR', { weekday: 'short' })
        .replace('.', '')
        .toUpperCase();
    const dd = String(dia).padStart(2, '0');
    const mm = String(mes).padStart(2, '0');
    return `${dd}/${mm}/${ano} (${diaSem})`;
}

export function formatarDestinoApi(destinoBruto: string): string {
    const limpo = destinoBruto.trim();
    if (limpo.includes('@') || limpo.includes('-group')) {
        return limpo;
    }
    const digitos = limpo.replace(/\D/g, '');
    if (digitos.length === 10 || digitos.length === 11) {
        return `55${digitos}`;
    }
    return digitos || limpo;
}

export function montarMensagemAgendamento(
    dados: DadosNotificacaoAgendamento
): string {
    const linhas = [
        `📚 *NOVO AGENDAMENTO DE REFORÇO*`,
        `*Unidade:* ${dados.unidade}`,
        `*Data:* ${formatarDataComDia(dados.data)}`,
        `*Horário:* ${dados.horario} (100 min)`,
        `*Professor(a):* ${dados.professor}`,
        `*Matéria:* ${dados.materia}`,
        ``,
        `👤 *Aluno(a):* ${dados.alunoNome}`,
        dados.colegioNome || dados.serie
            ? `🏫 *Escola:* ${[dados.colegioNome, dados.serie].filter(Boolean).join(' • ')}`
            : null,
        `📱 *WhatsApp:* ${formatarTelefone(dados.alunoTelefone)}`,
        dados.observacoes ? `📝 *Obs:* ${dados.observacoes}` : null,
        ``,
        `⚠️ _Confirmar e lançar este horário na agenda do professor no Clin Care._`,
    ].filter((l): l is string => l !== null);

    return linhas.join('\n');
}

export function gerarLinkWaMe(
    numeroSecretaria: string,
    dados: DadosNotificacaoAgendamento
): string | null {
    let digitos = String(numeroSecretaria || '').replace(/\D/g, '');
    if (!digitos) return null;
    if (digitos.length === 10 || digitos.length === 11) {
        digitos = `55${digitos}`;
    }
    const texto = montarMensagemAgendamento(dados);
    return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`;
}

async function dispararRequisicaoWhatsApp(
    cfg: ConfigWhatsApp,
    destino: string,
    texto: string,
    payloadExtra?: Record<string, unknown>
): Promise<{ ok: boolean; erro?: string }> {
    if (!cfg.url_api) {
        return { ok: false, erro: 'URL da API do WhatsApp não configurada.' };
    }

    try {
        if (cfg.provedor === 'evolution') {
            if (!cfg.instancia || !destino) {
                return {
                    ok: false,
                    erro: 'Preencha o nome da Instância e o Destino (ID do Grupo ou Número com DDD).',
                };
            }

            const base = cfg.url_api.replace(/\/$/, '');
            const endpoint = `${base}/message/sendText/${encodeURIComponent(cfg.instancia)}`;

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(cfg.token_api ? { apikey: cfg.token_api } : {}),
                },
                body: JSON.stringify({
                    number: destino,
                    text: texto,
                }),
            });

            if (!res.ok) {
                const detalhe = await res.text().catch(() => '');
                return {
                    ok: false,
                    erro: `Evolution API retornou HTTP ${res.status}: ${detalhe.slice(0, 180)}`,
                };
            }

            return { ok: true };
        }

        if (cfg.provedor === 'zapi') {
            if (!destino) {
                return {
                    ok: false,
                    erro: 'Informe o ID do Grupo ou o Número de WhatsApp de destino.',
                };
            }

            const limpa = cfg.url_api.replace(/\/$/, '');
            const endpoint = limpa.endsWith('/send-text')
                ? limpa
                : `${limpa}/send-text`;

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(cfg.client_token ? { 'Client-Token': cfg.client_token } : {}),
                },
                body: JSON.stringify({
                    phone: destino,
                    message: texto,
                }),
            });

            if (!res.ok) {
                const detalhe = await res.text().catch(() => '');
                return {
                    ok: false,
                    erro: `Z-API retornou HTTP ${res.status}: ${detalhe.slice(0, 180)}`,
                };
            }

            return { ok: true };
        }

        // Modo Webhook genérico (DataCrazy, n8n, Make, Zapier, etc.)
        const res = await fetch(cfg.url_api, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(cfg.token_api ? { Authorization: `Bearer ${cfg.token_api}` } : {}),
            },
            body: JSON.stringify({
                destino,
                grupoId: destino,
                mensagem: texto,
                ...payloadExtra,
            }),
        });

        if (!res.ok) {
            const detalhe = await res.text().catch(() => '');
            return {
                ok: false,
                erro: `Webhook retornou HTTP ${res.status}: ${detalhe.slice(0, 180)}`,
            };
        }

        return { ok: true };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, erro: `Falha de conexão com API WhatsApp: ${msg}` };
    }
}

export async function enviarTextoParaGrupo(
    cfg: ConfigWhatsApp,
    texto: string,
    payloadExtra?: Record<string, unknown>
): Promise<{ ok: boolean; erro?: string }> {
    const destino = formatarDestinoApi(cfg.grupo_id);
    return dispararRequisicaoWhatsApp(cfg, destino, texto, payloadExtra);
}

export async function enviarCodigoVerificacaoWhatsApp(
    telefoneBruto: string,
    codigo: string,
    objetivo: 'cadastro' | 'recuperacao_pin',
    nomeResponsavel?: string
): Promise<{ ok: boolean; desativado?: boolean; erro?: string }> {
    const cfg = await obterConfigWhatsApp();
    const urlDestino =
        cfg.provedor === 'webhook' && cfg.url_webhook_otp
            ? cfg.url_webhook_otp
            : cfg.url_api;

    if (!cfg.ativo || !urlDestino) {
        return {
            ok: false,
            desativado: true,
            erro: 'O envio automático pelo WhatsApp está desativado no momento. Solicite apoio à recepção.',
        };
    }

    const cfgEfetiva: ConfigWhatsApp = {
        ...cfg,
        url_api: urlDestino,
    };

    const destino = formatarDestinoApi(telefoneBruto);
    const telefoneSemDdi = destino.startsWith('55') ? destino.slice(2) : destino;
    const nomeLimpo = String(nomeResponsavel || '').trim() || 'Responsável R4 Ensina';

    const texto =
        objetivo === 'cadastro'
            ? [
                `🔐 *R4 Ensina — Código de Verificação*`,
                ``,
                `Seu código para confirmar o cadastro é: *${codigo}*`,
                ``,
                `_Válido por 10 minutos. Não compartilhe este código._`,
            ].join('\n')
            : [
                `🔑 *R4 Ensina — Recuperação de PIN*`,
                ``,
                `Seu código para redefinir o PIN de acesso é: *${codigo}*`,
                ``,
                `_Válido por 10 minutos. Se você não solicitou, ignore esta mensagem._`,
            ].join('\n');

    return dispararRequisicaoWhatsApp(cfgEfetiva, destino, texto, {
        evento: 'codigo_verificacao',
        objetivo,
        nome: nomeLimpo,
        telefone: destino,
        telefoneSemDdi,
        codigo,
    });
}

export async function notificarGrupoNovoAgendamento(
    dados: DadosNotificacaoAgendamento
): Promise<{ enviado: boolean; erro?: string; linkWaMe: string | null }> {
    const cfg = await obterConfigWhatsApp();
    const linkWaMe = cfg.wame_ativo
        ? gerarLinkWaMe(cfg.wame_numero, dados)
        : null;

    if (!cfg.ativo) {
        return {
            enviado: false,
            erro: 'Notificação automática via API desativada.',
            linkWaMe,
        };
    }

    const mensagem = montarMensagemAgendamento(dados);
    const resultado = await enviarTextoParaGrupo(cfg, mensagem, {
        evento: 'novo_agendamento',
        agendamento: {
            ...dados,
            data: formatarDataBR(dados.data),
            dataISO: dados.data,
            dataComDia: formatarDataComDia(dados.data),
        },
    });

    return {
        enviado: resultado.ok,
        erro: resultado.erro,
        linkWaMe,
    };
}
