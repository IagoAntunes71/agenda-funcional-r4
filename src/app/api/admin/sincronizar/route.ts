import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verificarAdminAutenticado } from '@/lib/admin-auth';
import { garantirConfiguracoesEUnidadeOnline } from '@/app/api/admin/configuracoes/route';

export type ModoSyncAdmin = 'hoje' | 'semana' | 'mes';

export const CONFIG_SYNC_MODOS: Record<
    ModoSyncAdmin,
    {
        workflow: string;
        cooldownSegundos: number;
        chaveDb: string;
        rotulo: string;
    }
> = {
    hoje: {
        workflow: 'sync-clincare-hoje.yml',
        cooldownSegundos: 5 * 60, // 5 minutos
        chaveDb: 'sync_disparo_hoje',
        rotulo: 'Hoje (Rápido)',
    },
    semana: {
        workflow: 'sync-clincare-semana.yml',
        cooldownSegundos: 30 * 60, // 30 minutos
        chaveDb: 'sync_disparo_semana',
        rotulo: 'Semana (7 dias)',
    },
    mes: {
        workflow: 'sync-clincare.yml',
        cooldownSegundos: 60 * 60, // 60 minutos (1 hora)
        chaveDb: 'sync_disparo_mes',
        rotulo: 'Mês (30 dias)',
    },
};

export async function POST(req: NextRequest) {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirConfiguracoesEUnidadeOnline();

        const body = await req.json();
        const modo = String(body?.modo || '') as ModoSyncAdmin;
        const cfg = CONFIG_SYNC_MODOS[modo];

        if (!cfg) {
            return NextResponse.json(
                { error: 'Modo de sincronização inválido.' },
                { status: 400 }
            );
        }

        // Verifica se ainda está dentro do tempo de espera (cooldown)
        const registroAnterior = (await sql`
      SELECT valor FROM configuracoes_sistema
      WHERE chave = ${cfg.chaveDb}
      LIMIT 1
    `) as { valor: string }[];

        const agora = Date.now();
        if (registroAnterior.length > 0 && registroAnterior[0].valor) {
            const ultimoDisparoMs = new Date(registroAnterior[0].valor).getTime();
            const expiraMs = ultimoDisparoMs + cfg.cooldownSegundos * 1000;
            if (!Number.isNaN(ultimoDisparoMs) && expiraMs > agora) {
                const restanteSegundos = Math.ceil((expiraMs - agora) / 1000);
                return NextResponse.json(
                    {
                        error: `Aguarde o tempo de segurança antes de disparar "${cfg.rotulo}" novamente.`,
                        restanteSegundos,
                        proximoDisponivelEm: new Date(expiraMs).toISOString(),
                    },
                    { status: 429 }
                );
            }
        }

        const githubToken = (process.env.GITHUB_TOKEN || '').trim();
        const githubOwner = (
            process.env.GITHUB_OWNER || 'IagoAntunes71'
        ).trim();
        const githubRepo = (
            process.env.GITHUB_REPO || 'agenda-funcional-r4'
        ).trim();
        const githubBranch = (process.env.GITHUB_BRANCH || 'main').trim();

        if (!githubToken) {
            return NextResponse.json(
                {
                    error:
                        'Variável GITHUB_TOKEN não configurada no servidor (Vercel / .env.local).',
                },
                { status: 500 }
            );
        }

        const urlGithub = `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/${cfg.workflow}/dispatches`;
        const respostaGithub = await fetch(urlGithub, {
            method: 'POST',
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${githubToken}`,
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ref: githubBranch }),
        });

        if (!respostaGithub.ok) {
            const detalhe = await respostaGithub.text().catch(() => '');
            console.error(
                `Erro GitHub Actions (${respostaGithub.status}):`,
                detalhe
            );
            return NextResponse.json(
                {
                    error: `GitHub recusou o disparo (${respostaGithub.status}). Verifique se o GITHUB_TOKEN tem permissão "Actions: Read and write".`,
                },
                { status: 502 }
            );
        }

        const agoraISO = new Date(agora).toISOString();
        const proximoDisponivelEm = new Date(
            agora + cfg.cooldownSegundos * 1000
        ).toISOString();

        await sql`
      INSERT INTO configuracoes_sistema (chave, valor, atualizado_em)
      VALUES (${cfg.chaveDb}, ${agoraISO}, now())
      ON CONFLICT (chave)
      DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()
    `;

        return NextResponse.json({
            sucesso: true,
            modo,
            rotulo: cfg.rotulo,
            proximoDisponivelEm,
            restanteSegundos: cfg.cooldownSegundos,
        });
    } catch (error) {
        console.error('Erro ao disparar sincronização:', error);
        return NextResponse.json(
            { error: 'Falha interna ao iniciar sincronização com o clin.care.' },
            { status: 500 }
        );
    }
}