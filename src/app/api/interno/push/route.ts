import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { configuracaoPush, enviarPushEquipe, type DispositivoPush } from '@/lib/push-equipe';

export const runtime = 'nodejs';
export const maxDuration = 60;

const mensagens: Record<string, string> = {
    marcada: 'Uma aula foi marcada. Confira sua agenda.',
    chegada: 'Sua primeira aula do dia começa em breve. Confira sua agenda.',
};

export async function GET(req: Request) {
    const segredo = process.env.CRON_SECRET;
    const recebido = Buffer.from(req.headers.get('authorization') ?? '');
    const esperado = Buffer.from('Bearer ' + (segredo ?? ''));
    if (!segredo || recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }
    if (!configuracaoPush()) return NextResponse.json({ error: 'Push indisponível.' }, { status: 503 });

    try {
        await sql`
            WITH primeiras AS (
                SELECT DISTINCT ON (coalesce(nullif(p.grupo_professor, ''), 'id:' || p.id), a.data)
                    a.professor_id, coalesce(nullif(p.grupo_professor, ''), 'id:' || p.id) AS grupo,
                    a.data,
                    (a.data + coalesce(a.hora_inicio, a.horario)) AT TIME ZONE 'America/Bahia' AS inicio
                FROM agendamentos a
                JOIN professores p ON p.id = a.professor_id
                WHERE a.data IN ((now() AT TIME ZONE 'America/Bahia')::date,
                    (now() AT TIME ZONE 'America/Bahia')::date + 1)
                    AND a.excluido_em IS NULL AND a.status IN ('agendado','confirmado','reservado','pendente','realizado','concluido')
                    AND coalesce(a.hora_inicio, a.horario) IS NOT NULL
                ORDER BY coalesce(nullif(p.grupo_professor, ''), 'id:' || p.id),
                    a.data, coalesce(a.hora_inicio, a.horario), a.id
            )
            INSERT INTO r4_push_avisos(professor_id, tipo, deduplicacao)
            SELECT professor_id, 'chegada',
                'chegada:' || grupo || ':' || data
            FROM primeiras
            WHERE inicio <= now() + interval '60 minutes' AND inicio > now() + interval '50 minutes'
            ON CONFLICT (deduplicacao) DO NOTHING`;

        const avisos = await sql`
            WITH lote AS (
                SELECT id FROM r4_push_avisos
                WHERE tipo IN ('marcada', 'chegada') AND concluido_em IS NULL AND tentar_em <= now() AND tentativas < 4
                    AND criado_em > now() - interval '20 minutes'
                ORDER BY id LIMIT 30 FOR UPDATE SKIP LOCKED
            )
            UPDATE r4_push_avisos a SET tentativas = a.tentativas + 1,
                tentar_em = now() + interval '2 minutes'
            FROM lote WHERE a.id = lote.id RETURNING a.id, a.professor_id, a.tipo`;

        await Promise.all(avisos.map(async (aviso) => {
            const dispositivos = await sql`
                SELECT s.endpoint, s.p256dh, s.auth, s.conta_id
                FROM r4_push_equipe s
                JOIN admins_sistema conta ON conta.id = s.conta_id AND conta.ativo AND conta.role = 'professor'
                JOIN professores vinculo ON vinculo.id = conta.professor_id
                JOIN professores alvo ON alvo.id = ${aviso.professor_id}
                WHERE vinculo.id = alvo.id OR nullif(vinculo.grupo_professor, '') = nullif(alvo.grupo_professor, '')` as DispositivoPush[];
            const resultados = await Promise.allSettled(dispositivos.map((d) =>
                enviarPushEquipe(d, mensagens[aviso.tipo], `r4-${aviso.tipo}-${aviso.id}`)));
            if (!resultados.some((r) => r.status === 'rejected')) {
                await sql`UPDATE r4_push_avisos SET concluido_em = now() WHERE id = ${aviso.id}`;
            }
        }));
        await sql`DELETE FROM r4_push_avisos WHERE criado_em < now() - interval '7 days'`;
        return NextResponse.json({ processados: avisos.length }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
        return NextResponse.json({ error: 'Falha ao processar avisos.' }, { status: 503 });
    }
}
