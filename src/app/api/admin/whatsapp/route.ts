import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { garantirHistoricoAgendamento } from '@/lib/agendamento-historico';
import { lerSessaoAdmin, verificarAdminAutenticado } from '@/lib/admin-auth';
import {
    enviarTextoParaGrupo,
    formatarDestinoApi,
    garantirTabelaConfigWhatsApp,
    notificarGrupoNovoAgendamento,
    obterConfigWhatsApp,
} from '@/lib/whatsapp-notificacao';

async function carregarPainelWhatsApp() {
    const config = await obterConfigWhatsApp();

    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS notificado_whatsapp BOOLEAN DEFAULT false`;

    const recentes = await sql`
    SELECT
      a.id,
      COALESCE(u.nome, 'Unidade') AS unidade_nome,
      COALESCE(p.nome, 'Professor') AS professor_nome,
      a.materia,
      to_char(a.data, 'YYYY-MM-DD') AS data,
      to_char(a.data, 'DD/MM/YYYY') AS data_formatada,
      LEFT(a.hora_inicio::text, 5) AS hora_inicio,
      LEFT(a.hora_fim::text, 5) AS hora_fim,
      a.aluno_nome,
      a.aluno_telefone,
      a.colegio_nome,
      a.serie,
      a.observacoes,
      COALESCE(a.notificado_whatsapp, false) AS notificado_whatsapp
    FROM agendamentos a
    LEFT JOIN unidades u ON u.id = a.unidade_id
    LEFT JOIN professores p ON p.id = a.professor_id
    WHERE COALESCE(a.status, 'confirmado') <> 'cancelado'
    ORDER BY a.id DESC
    LIMIT 25
  `;

    return { config, recentes };
}

export async function GET() {
    if (!(await verificarAdminAutenticado())) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        const dados = await carregarPainelWhatsApp();
        return NextResponse.json(dados, {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        console.error('Erro ao carregar config WhatsApp:', error);
        return NextResponse.json(
            { error: 'Erro ao carregar configurações de notificação.' },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    if (!sessao) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    if (sessao.role === 'professor') return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    try {
        await garantirTabelaConfigWhatsApp();
        const body = await req.json();
        const acao = String(body?.acao || '');

        if (acao === 'salvarConfig') {
            const ativo = Boolean(body?.ativo);
            const provedor = String(body?.provedor || 'evolution');
            const urlApi = String(body?.url_api || '').trim();
            const urlWebhookOtp = String(body?.url_webhook_otp || '').trim();
            const urlWebhookGrupo = String(body?.url_webhook_grupo || '').trim();
            const urlLembrete = typeof body?.url_webhook_lembrete === 'string'
                ? body.url_webhook_lembrete.trim() : null;
            if (urlLembrete) {
                const destino = URL.canParse(urlLembrete) ? new URL(urlLembrete) : null;
                if (!destino || destino.protocol !== 'https:' || destino.username || destino.password) {
                    return NextResponse.json({ error: 'Informe uma URL HTTPS válida para o webhook de lembretes.' }, { status: 400 });
                }
            }
            const tokenApi = String(body?.token_api || '').trim();
            const clientToken = String(body?.client_token || '').trim();
            const instancia = String(body?.instancia || '').trim();
            const grupoId = String(body?.grupo_id || '').trim();
            const wameAtivo = Boolean(body?.wame_ativo);
            const wameNumero = String(body?.wame_numero || '').trim();
            const alertaSonoroAtivo = Boolean(body?.alerta_sonoro_ativo);
            const verificarCadastroWhatsApp =
                body?.verificar_cadastro_whatsapp !== undefined
                    ? Boolean(body.verificar_cadastro_whatsapp)
                    : true;

            await sql`
        UPDATE config_whatsapp_grupo
        SET ativo = ${ativo},
            provedor = ${provedor},
            url_api = ${urlApi},
            url_webhook_otp = ${urlWebhookOtp},
            url_webhook_grupo = ${urlWebhookGrupo},
            url_webhook_lembrete = coalesce(${urlLembrete}, url_webhook_lembrete),
            token_api = ${tokenApi},
            client_token = ${clientToken},
            instancia = ${instancia},
            grupo_id = ${grupoId},
            wame_ativo = ${wameAtivo},
            wame_numero = ${wameNumero},
            alerta_sonoro_ativo = ${alertaSonoroAtivo},
            verificar_cadastro_whatsapp = ${verificarCadastroWhatsApp},
            atualizado_em = now()
        WHERE id = 1
      `;

            const dados = await carregarPainelWhatsApp();
            return NextResponse.json({ sucesso: true, ...dados });
        }

        if (acao === 'testarEnvio') {
            const cfg = await obterConfigWhatsApp();
            const resTeste = await enviarTextoParaGrupo(
                cfg,
                '✅ *Teste de Integração R4 Ensina*\nAs notificações de novos agendamentos estão conectadas a este destino!',
                { evento: 'teste_conexao' }
            );

            if (!resTeste.ok) {
                return NextResponse.json(
                    { error: resTeste.erro || 'Falha no teste de envio.' },
                    { status: 400 }
                );
            }

            return NextResponse.json({ sucesso: true });
        }

        if (acao === 'testarEnvioGrupo') {
            const cfg = await obterConfigWhatsApp();
            const destinoGrupo = formatarDestinoApi(cfg.grupo_id);
            if (!destinoGrupo) {
                return NextResponse.json(
                    { error: 'Preencha o Destino Padrão (ID do Grupo @g.us) antes de testar.' },
                    { status: 400 }
                );
            }
            if (!cfg.url_webhook_grupo) {
                return NextResponse.json(
                    { error: 'Preencha a URL do Webhook do Grupo antes de testar.' },
                    { status: 400 }
                );
            }

            const cfgGrupo = { ...cfg, url_api: cfg.url_webhook_grupo };
            const resTeste = await enviarTextoParaGrupo(
                cfgGrupo,
                [
                    `✅ *TESTE GRUPO — R4 Ensina*`,
                    ``,
                    `👤 *Cliente:* Responsável Teste`,
                    `🎓 *Aluno(a):* Aluno Teste`,
                    `📱 *Telefone:* (71) 99999-9999`,
                    `📅 *Aula:* Teste de conexão do Webhook do Grupo`,
                ].join('\n'),
                {
                    evento: 'grupo_teste_conexao',
                    clienteNome: 'Responsável Teste',
                    alunoNome: 'Aluno Teste',
                    telefone: '5571999999999',
                    telefoneFormatado: '(71) 99999-9999',
                }
            );

            if (!resTeste.ok) {
                return NextResponse.json(
                    { error: resTeste.erro || 'Falha no teste de envio para o grupo.' },
                    { status: 400 }
                );
            }

            return NextResponse.json({ sucesso: true });
        }

        if (acao === 'reenviarAgendamento') {
            const agendamentoId = Number(body?.agendamentoId || 0);
            const rows = (await sql`
        SELECT
          a.id,
          COALESCE(u.nome, 'Unidade') AS unidade,
          COALESCE(p.nome, 'Professor') AS professor,
          a.materia,
          to_char(a.data, 'YYYY-MM-DD') AS data,
          LEFT(a.hora_inicio::text, 5) AS hora_inicio,
          LEFT(a.hora_fim::text, 5) AS hora_fim,
          a.aluno_nome,
          a.aluno_telefone,
          a.colegio_nome,
          a.serie,
          a.observacoes
        FROM agendamentos a
        LEFT JOIN unidades u ON u.id = a.unidade_id
        LEFT JOIN professores p ON p.id = a.professor_id
        WHERE a.id = ${agendamentoId}
        LIMIT 1
      `) as {
                id: number;
                unidade: string;
                professor: string;
                materia: string;
                data: string;
                hora_inicio: string;
                hora_fim: string;
                aluno_nome: string;
                aluno_telefone: string;
                colegio_nome: string | null;
                serie: string | null;
                observacoes: string | null;
            }[];

            if (rows.length === 0) {
                return NextResponse.json(
                    { error: 'Agendamento não encontrado.' },
                    { status: 404 }
                );
            }

            const item = rows[0];
            const notif = await notificarGrupoNovoAgendamento({
                id: item.id,
                unidade: item.unidade,
                professor: item.professor,
                materia: item.materia,
                data: item.data,
                horario: `${item.hora_inicio} às ${item.hora_fim}`,
                alunoNome: item.aluno_nome,
                alunoTelefone: item.aluno_telefone,
                colegioNome: item.colegio_nome || undefined,
                serie: item.serie || undefined,
                observacoes: item.observacoes || undefined,
            });

            if (!notif.enviado) {
                return NextResponse.json(
                    { error: notif.erro || 'Não foi possível reenviar.' },
                    { status: 400 }
                );
            }

            await garantirHistoricoAgendamento();
            await sql.transaction([
                sql`SELECT set_config('r4.ator_agenda', ${sessao.nome}, true)`,
                sql`UPDATE agendamentos SET notificado_whatsapp = true
                    WHERE id = ${agendamentoId} AND excluido_em IS NULL`,
            ]);

            const dados = await carregarPainelWhatsApp();
            return NextResponse.json({ sucesso: true, ...dados });
        }


        return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    } catch (error) {
        console.error('Erro na rota admin/whatsapp:', error);
        return NextResponse.json(
            { error: 'Erro interno ao processar ação.' },
            { status: 500 }
        );
    }
}
