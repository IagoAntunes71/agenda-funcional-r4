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
            WHERE (tipo = 'chegada' OR (tipo = 'marcada' AND aulas_hoje + aulas_amanha > 0)
                OR (${process.env.R4_PUSH_MUDANCAS_AULA === 'true'} AND agendamento_id IS NOT NULL
                    AND tipo IN ('remarcada','cancelada'))) AND concluido_em IS NULL AND tentar_em <= now() AND tentativas < 4
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
        FROM lote WHERE a.id = lote.id RETURNING a.id, a.professor_id, a.tipo, a.aulas_hoje, a.aulas_amanha, a.agendamento_id, a.agenda_versao, a.dia_resumo`;

    const resultadosFila = await Promise.all(avisos.map(async (aviso) => {
        const dispositivos = await sql`
            SELECT s.endpoint, s.p256dh, s.auth, s.conta_id
            FROM r4_push_equipe s
            JOIN admins_sistema conta ON conta.id = s.conta_id AND conta.ativo AND conta.role = 'professor'
            JOIN professores vinculo ON vinculo.id = conta.professor_id
            JOIN professores alvo ON alvo.id = ${aviso.professor_id}
            WHERE vinculo.id = alvo.id OR nullif(vinculo.grupo_professor, '') = nullif(alvo.grupo_professor, '')` as DispositivoPush[];
        const lembrete = aviso.tipo === 'chegada';
        let titulo = lembrete ? 'Resumo da agenda do dia' : tituloMarcacao(aviso.aulas_hoje, aviso.aulas_amanha);
        let mensagem = 'Confira os horários na sua agenda.';
        if (lembrete) {
            const [dia] = await sql`
                SELECT count(*)::int AS total,
                    array_agg(to_char(coalesce(a.hora_inicio,a.horario), 'HH24:MI')
                        ORDER BY coalesce(a.hora_inicio,a.horario), a.id) AS horarios
                FROM agendamentos a JOIN professores p ON p.id = a.professor_id
                JOIN professores alvo ON alvo.id = ${aviso.professor_id}
                WHERE (p.id = alvo.id OR nullif(p.grupo_professor,'') = nullif(alvo.grupo_professor,''))
                  AND a.data = coalesce(${aviso.dia_resumo ?? null}::date, (now() AT TIME ZONE 'America/Bahia')::date)
                  AND a.excluido_em IS NULL AND a.status IN ('agendado','confirmado','reservado','pendente')
                  AND ((a.data + coalesce(a.hora_inicio,a.horario)) AT TIME ZONE 'America/Bahia') > now()`;
            if (!dia?.total) return false;
            const horarios = [...new Set(dia.horarios as string[])];
            const proximos = horarios.slice(0, 5).join(', ');
            mensagem = `${dia.total} ${dia.total === 1 ? 'aula' : 'aulas'} na agenda · ${proximos}${horarios.length > 5 ? ' e mais' : ''}.`;
        } else if (aviso.agendamento_id) {
            const [aula] = await sql`
                SELECT a.professor_id, a.excluido_em, a.status, u.nome AS unidade,
                    to_char(a.data,'DD/MM') AS dia, to_char(coalesce(a.hora_inicio,a.horario),'HH24:MI') AS hora
                FROM agendamentos a LEFT JOIN unidades u ON u.id = a.unidade_id
                WHERE a.id = ${aviso.agendamento_id} AND a.versao_whatsapp = ${aviso.agenda_versao}`;
            const cancelada = aula && (aula.excluido_em || ['cancelado','desmarcado_com_cobranca','desmarcado_sem_cobranca'].includes(aula.status));
            if (!aula || (aviso.tipo === 'cancelada' ? !cancelada : cancelada ||
                !['agendado','confirmado','reservado','pendente'].includes(aula.status))) {
                await sql`UPDATE r4_push_avisos SET concluido_em = now() WHERE id = ${aviso.id}`;
                return false;
            }
            titulo = cancelada ? 'Aula cancelada' : Number(aula.professor_id) === Number(aviso.professor_id)
                ? 'Aula atualizada na agenda' : 'Aula transferida para outro professor';
            if (cancelada || Number(aula.professor_id) === Number(aviso.professor_id)) {
                mensagem = [aula.dia, aula.hora, aula.unidade].filter(Boolean).join(' · ');
            }
        }
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
