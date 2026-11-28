import { sql } from '@/lib/db';
import { configuracaoPush, enviarPushEquipe, type DispositivoPush } from '@/lib/push-equipe';

function tituloMarcacao(hoje: number, amanha: number) {
    const total = hoje + amanha;
    const periodo = hoje && amanha ? 'hoje e amanhã' : hoje ? 'hoje' : 'amanhã';
    return total === 1 ? `Nova aula para ${periodo}` : `${total} novas aulas para ${periodo}`;
}

export async function processarFilaPush(professorId?: number) {
    if (!configuracaoPush()) return { processados: 0, aceitos: 0 };

    const avisos = await sql`
        WITH lote AS (
            SELECT id FROM r4_push_avisos fila
            WHERE (tipo = 'chegada' OR (tipo = 'marcada' AND aulas_hoje + aulas_amanha > 0)) AND concluido_em IS NULL AND tentar_em <= now() AND tentativas < 4
                AND criado_em > now() - interval '20 minutes'
                AND (${professorId === undefined} OR (tipo = 'marcada' AND (
                    fila.professor_id = ${professorId ?? null} OR EXISTS (
                        SELECT 1 FROM professores alvo JOIN professores origem
                          ON nullif(origem.grupo_professor, '') = nullif(alvo.grupo_professor, '')
                        WHERE alvo.id = fila.professor_id AND origem.id = ${professorId ?? null}
                    )
                )))
            ORDER BY id LIMIT 30 FOR UPDATE SKIP LOCKED
        )
        UPDATE r4_push_avisos a SET tentativas = a.tentativas + 1,
            tentar_em = now() + interval '2 minutes'
        FROM lote WHERE a.id = lote.id RETURNING a.id, a.professor_id, a.tipo, a.aulas_hoje, a.aulas_amanha`;

    const resultadosFila = await Promise.all(avisos.map(async (aviso) => {
        const dispositivos = await sql`
            SELECT s.endpoint, s.p256dh, s.auth, s.conta_id
            FROM r4_push_equipe s
            JOIN admins_sistema conta ON conta.id = s.conta_id AND conta.ativo AND conta.role = 'professor'
            JOIN professores vinculo ON vinculo.id = conta.professor_id
            JOIN professores alvo ON alvo.id = ${aviso.professor_id}
            WHERE vinculo.id = alvo.id OR nullif(vinculo.grupo_professor, '') = nullif(alvo.grupo_professor, '')` as DispositivoPush[];
        const lembrete = aviso.tipo === 'chegada';
        const titulo = lembrete ? 'Lembrete da primeira aula' : tituloMarcacao(aviso.aulas_hoje, aviso.aulas_amanha);
        const mensagem = lembrete ? 'Sua primeira aula do dia começa em breve. Confira sua agenda.' : 'Confira os horários na sua agenda.';
        const resultados = await Promise.allSettled(dispositivos.map((d) =>
            enviarPushEquipe(d, mensagem, `r4-${aviso.tipo}-${aviso.id}`, titulo)));
        const aceito = resultados.some((r) => r.status === 'fulfilled' && r.value);
        if (aceito && !resultados.some((r) => r.status === 'rejected')) {
            await sql`UPDATE r4_push_avisos SET concluido_em = now() WHERE id = ${aviso.id}`;
        }
        return aceito;
    }));
    return { processados: avisos.length, aceitos: resultadosFila.filter(Boolean).length };
}

export async function despacharPushDeAgendamento(professorId: number) {
    try {
        await processarFilaPush(professorId);
    } catch (error) {
        console.error('Falha ao processar push de agendamento:', error);
    }
}
