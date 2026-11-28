import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { configuracaoPush } from '@/lib/push-equipe';
import { processarFilaPush } from '@/lib/push-fila';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

        const resultado = await processarFilaPush();
        await sql`DELETE FROM r4_push_avisos WHERE criado_em < now() - interval '7 days'`;
        return NextResponse.json(resultado, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
        return NextResponse.json({ error: 'Falha ao processar avisos.' }, { status: 503 });
    }
}
