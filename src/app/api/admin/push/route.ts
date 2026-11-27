import { NextRequest, NextResponse } from 'next/server';
import { lerSessaoAdmin } from '@/lib/admin-auth';
import { sql } from '@/lib/db';
import { configuracaoPush, endpointPushValido, enviarPushEquipe, type DispositivoPush } from '@/lib/push-equipe';

export const runtime = 'nodejs';
function resposta(dados: object, status = 200) {
    return NextResponse.json(dados, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function contaProfessor() {
    const sessao = await lerSessaoAdmin();
    if (!sessao || sessao.role !== 'professor') return null;
    const [conta] = await sql`SELECT id FROM admins_sistema WHERE id = ${sessao.id}
        AND role = 'professor' AND ativo AND professor_id IS NOT NULL`;
    return conta?.id ?? null;
}

export async function GET() {
    if (!(await contaProfessor())) return resposta({ error: 'Acesso reservado a professores.' }, 403);
    const config = configuracaoPush();
    return config ? resposta({ chave: config.publicKey }) : resposta({ error: 'Push ainda não configurado.' }, 503);
}

export async function POST(req: NextRequest) {
    if (req.headers.get('origin') !== req.nextUrl.origin) return resposta({ error: 'Origem inválida.' }, 403);
    const contaId = await contaProfessor();
    if (!contaId) return resposta({ error: 'Acesso reservado a professores.' }, 403);
    const dados = await req.json().catch(() => null);
    const endpoint = dados?.endpoint;
    if (!endpointPushValido(endpoint)) return resposta({ error: 'Inscrição inválida.' }, 400);

    try {
        if (dados.acao === 'desativar') {
            await sql`DELETE FROM r4_push_equipe WHERE endpoint = ${endpoint} AND conta_id = ${contaId}`;
            return resposta({ ok: true });
        }
        if (!configuracaoPush()) return resposta({ error: 'Push ainda não configurado.' }, 503);
        if (dados.acao === 'ativar') {
            const { p256dh, auth } = dados.keys ?? {};
            if (typeof p256dh !== 'string' || !/^[A-Za-z0-9_-]{87}$/.test(p256dh) ||
                typeof auth !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(auth)) {
                return resposta({ error: 'Chaves da inscrição inválidas.' }, 400);
            }
            await sql`INSERT INTO r4_push_equipe(endpoint, conta_id, p256dh, auth, user_agent)
                VALUES (${endpoint}, ${contaId}, ${p256dh}, ${auth}, ${(req.headers.get('user-agent') || '').slice(0, 300)})
                ON CONFLICT (endpoint) DO UPDATE SET conta_id = excluded.conta_id,
                    p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`;
            return resposta({ ok: true });
        }
        if (dados.acao === 'status') {
            const [inscricao] = await sql`SELECT 1 FROM r4_push_equipe WHERE endpoint = ${endpoint} AND conta_id = ${contaId}`;
            return resposta({ ativo: Boolean(inscricao) });
        }
        if (dados.acao !== 'teste') return resposta({ error: 'Ação inválida.' }, 400);
        const [dispositivo] = await sql`UPDATE r4_push_equipe SET teste_em = now()
            WHERE endpoint = ${endpoint} AND conta_id = ${contaId}
                AND (teste_em IS NULL OR teste_em < now() - interval '1 minute')
            RETURNING endpoint, p256dh, auth, conta_id` as DispositivoPush[];
        if (!dispositivo) return resposta({ error: 'Ative neste aparelho ou aguarde um minuto antes de testar de novo.' }, 409);
        const enviado = await enviarPushEquipe(dispositivo, 'Notificações ativadas neste aparelho.', 'r4-teste');
        return enviado ? resposta({ ok: true }) : resposta({ error: 'Inscrição expirada. Desative e ative novamente.' }, 410);
    } catch {
        return resposta({ error: 'Não foi possível concluir. Verifique a configuração de push da Agenda.' }, 503);
    }
}
