import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db';
import { formatarDestinoApi, obterConfigWhatsApp } from '@/lib/whatsapp-notificacao';

export function destinoLembrete(telefone: string) {
    const destino = formatarDestinoApi(telefone);
    return /^55[1-9][0-9]{9,10}$/.test(destino) ? destino : null;
}

const aulaAtual = sql`
    SELECT a.id, a.versao_whatsapp AS versao, coalesce(nullif(trim(a.aluno_telefone), ''),
        a.whatsapp_responsavel, '') AS telefone,
        coalesce(nullif(a.aluno_nome, ''), a.nome_aluno) AS aluno,
        to_char(a.data, 'YYYY-MM-DD') AS data, to_char(coalesce(a.hora_inicio, a.horario), 'HH24:MI') AS horario,
        a.materia, u.nome AS unidade, p.nome AS professor,
        (a.data + coalesce(a.hora_inicio, a.horario)) AT TIME ZONE 'America/Bahia' AS inicio
    FROM agendamentos a LEFT JOIN unidades u ON u.id = a.unidade_id LEFT JOIN professores p ON p.id = a.professor_id
    WHERE a.excluido_em IS NULL AND coalesce(a.status,'confirmado') IN ('agendado','confirmado')
`;

export async function aulasParaLembrar() {
    // Uma hora de tolerância para atrasos do agendador.
    return await sql`WITH aulas AS (${aulaAtual})
        SELECT id FROM aulas WHERE inicio <= now() + interval '24 hours'
          AND inicio > now() + interval '23 hours'
          AND regexp_replace(telefone, '[^0-9]', '', 'g') ~ '^(55)?[1-9][0-9]{9,10}$'
          AND NOT EXISTS (SELECT 1 FROM r4_lembretes_whatsapp l
            WHERE l.agendamento_id = aulas.id AND l.versao = aulas.versao AND l.tipo = 'automatico')
        ORDER BY inicio, id LIMIT 30`;
}

export async function expirarTentativasLembrete() {
    await sql`UPDATE r4_lembretes_whatsapp SET estado = 'erro',
        erro = 'A tentativa foi interrompida. Entrega desconhecida.', atualizado_em = now()
        WHERE estado = 'em_envio' AND tentado_em < now() - interval '2 minutes'`;
}

export async function enviarLembreteAula(
    agendamentoId: number,
    manual?: { responsavel: string; destino: string; versao: string },
) {
    const [aula] = await sql`WITH aulas AS (${aulaAtual})
        SELECT * FROM aulas WHERE id = ${agendamentoId} AND inicio > now()
          AND (${Boolean(manual)} OR (inicio <= now() + interval '24 hours' AND inicio > now() + interval '23 hours'))`;
    if (!aula) return { erro: 'A aula já começou, mudou ou está indisponível.' };
    const destino = destinoLembrete(aula.telefone);
    if (!destino) return { erro: 'A aula não tem um WhatsApp válido para lembretes.' };
    if (manual && (destino !== manual.destino || String(aula.versao) !== manual.versao)) {
        return { erro: 'O contato ou a aula mudou. Reabra os detalhes antes de enviar.' };
    }

    const cfg = await obterConfigWhatsApp();
    const url = (cfg.provedor === 'webhook' ? cfg.url_webhook_lembrete : '')
        || process.env.R4_DATACRAZY_LEMBRETE_URL?.trim()
        || (cfg.provedor === 'webhook' ? cfg.url_api : '');
    if (!url || !cfg.ativo) return { erro: 'O webhook de lembretes do DataCrazy está indisponível.' };

    const id = randomUUID();
    const tipo = manual ? 'manual' : 'automatico';
    const responsavel = manual?.responsavel ?? 'Sistema · lembrete de 24 h';
    const [tentativa] = await sql`INSERT INTO r4_lembretes_whatsapp
        (id, agendamento_id, versao, tipo, responsavel, destinatario)
        SELECT ${id}::uuid, a.id, a.versao_whatsapp, ${tipo}, ${responsavel}, ${destino}
        FROM agendamentos a WHERE a.id = ${agendamentoId} AND a.versao_whatsapp = ${aula.versao}
          AND a.excluido_em IS NULL AND coalesce(a.status,'confirmado') IN ('agendado','confirmado')
          AND NOT EXISTS (SELECT 1 FROM r4_lembretes_whatsapp l WHERE l.agendamento_id = a.id
            AND l.versao = a.versao_whatsapp AND l.tentado_em > now() - interval '30 seconds')
        ON CONFLICT DO NOTHING RETURNING id`;
    if (!tentativa) return { erro: 'A aula mudou ou existe um disparo recente para ela.' };

    const [atual] = await sql`WITH aulas AS (${aulaAtual})
        SELECT id FROM aulas WHERE id = ${agendamentoId} AND versao = ${aula.versao} AND inicio > now()`;
    if (!atual) {
        await sql`UPDATE r4_lembretes_whatsapp SET estado = 'obsoleto', atualizado_em = now() WHERE id = ${id}::uuid`;
        return { erro: 'A aula mudou antes do envio.' };
    }

    let http: number | null = null;
    let erro: string | null = null;
    try {
        const resposta = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Idempotency-Key': id,
                ...(cfg.token_api ? { Authorization: 'Bearer ' + cfg.token_api } : {}),
            },
            signal: AbortSignal.timeout(8000),
            redirect: 'error',
            body: JSON.stringify({
                evento: 'lembrete_aula',
                lembreteId: id,
                tipo,
                agendamentoId,
                destino,
                telefone: destino,
                agendamento: {
                    alunoNome: aula.aluno, dataISO: aula.data, horario: aula.horario,
                    unidade: aula.unidade, materia: aula.materia, professor: aula.professor,
                },
            }),
        });
        http = resposta.status;
        if (!resposta.ok) erro = 'O CRM retornou HTTP ' + http + '.';
    } catch {
        erro = 'Sem resposta do CRM. Entrega desconhecida.';
    }
    const [registro] = await sql`UPDATE r4_lembretes_whatsapp SET
        estado = CASE WHEN estado = 'entregue' THEN estado ELSE ${erro ? 'erro' : 'enviado_ao_crm'} END,
        erro = CASE WHEN estado = 'entregue' THEN NULL ELSE ${erro} END,
        retorno_http = ${http}, atualizado_em = now()
        WHERE id = ${id}::uuid RETURNING estado, erro`;
    return { estado: String(registro.estado), erro: registro.erro as string | null };
}
