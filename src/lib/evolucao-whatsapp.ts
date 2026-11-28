import { sql } from '@/lib/db';
import { obterConfigWhatsApp } from '@/lib/whatsapp-notificacao';

export const contatoEvolucao = sql`
    LEFT JOIN alunos al ON al.id = a.aluno_id
    LEFT JOIN responsaveis r ON r.id = al.responsavel_id
    LEFT JOIN LATERAL (
        SELECT CASE WHEN length(digitos) <= 11 THEN '55' || digitos ELSE digitos END AS destino
        FROM unnest(ARRAY[r.telefone_formatado, r.telefone, a.aluno_telefone, a.whatsapp_responsavel])
            WITH ORDINALITY AS contatos(telefone, ordem)
        CROSS JOIN LATERAL (SELECT regexp_replace(telefone, '[^0-9]', '', 'g') AS digitos) normalizado
        WHERE digitos ~ '^(55)?[1-9][0-9]{9,10}$'
        ORDER BY ordem LIMIT 1
    ) contato ON true
`;

export async function dadosEvolucao(id: number) {
    const [dados] = await sql`
        SELECT contato.destino, e.destino AS enviado_para, e.estado, e.erro,
            e.estado = 'enviando' AND e.atualizado_em < now() - interval '2 minutes' AS envio_interrompido
        FROM agendamentos a ${contatoEvolucao}
        LEFT JOIN r4_evolucao_envios e ON e.agendamento_id = a.id AND e.versao = a.evolucao_versao
        WHERE a.id = ${id} AND a.excluido_em IS NULL`;
    return dados ?? null;
}

export async function enviarEvolucao(id: number, contaId: number, versao: number) {
    const cfg = await obterConfigWhatsApp();
    const url = process.env.R4_DATACRAZY_EVOLUCAO_URL?.trim() || (cfg.provedor === 'webhook' ? cfg.url_api : '');
    const [envio] = await sql`
        WITH atual AS (
            SELECT a.id, a.feedback_professor, contato.destino,
                coalesce(nullif(a.aluno_nome, ''), a.nome_aluno) AS aluno,
                a.data::text, a.materia, p.nome AS professor, u.nome AS unidade
            FROM agendamentos a
            JOIN professores p ON p.id = a.professor_id
            JOIN admins_sistema c ON c.id = ${contaId} AND c.ativo AND c.role = 'professor'
            JOIN professores vinculo ON vinculo.id = c.professor_id
            LEFT JOIN unidades u ON u.id = a.unidade_id
            ${contatoEvolucao}
            WHERE a.id = ${id} AND a.evolucao_versao = ${versao} AND a.excluido_em IS NULL
                AND a.status IN ('agendado','confirmado','realizado','concluido','reservado','pendente')
                AND (p.id = vinculo.id OR nullif(p.grupo_professor, '') = nullif(vinculo.grupo_professor, ''))
        )
        UPDATE r4_evolucao_envios e SET estado = 'enviando', destino = atual.destino, erro = NULL, atualizado_em = now()
        FROM atual WHERE e.agendamento_id = atual.id AND e.versao = ${versao}
            AND (e.estado IN ('pendente','erro') OR (e.estado = 'enviando' AND e.atualizado_em < now() - interval '2 minutes'))
        RETURNING e.id AS envio_id, atual.*`;
    if (!envio) return;

    let erro: string | null = null;
    if (!envio.destino) erro = 'Cadastre o WhatsApp do responsável para enviar.';
    else if (!cfg.ativo || !url) erro = 'O webhook de evolução está indisponível.';
    else {
        try {
            const res = await fetch(url, {
                method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
                headers: {
                    'Content-Type': 'application/json', 'Idempotency-Key': envio.envio_id,
                    ...(cfg.token_api ? { Authorization: 'Bearer ' + cfg.token_api } : {}),
                },
                body: JSON.stringify({
                    evento: 'evolucao_aula', evolucaoId: envio.envio_id, agendamentoId: id, telefone: envio.destino,
                    alunoNome: envio.aluno, dataISO: envio.data, materia: envio.materia, professor: envio.professor,
                    unidade: envio.unidade, mensagem: envio.feedback_professor,
                }),
            });
            if (!res.ok) erro = 'DataCrazy retornou HTTP ' + res.status + '.';
        } catch {
            erro = 'O DataCrazy não respondeu. Confira o CRM antes de tentar novamente.';
        }
    }
    await sql`UPDATE r4_evolucao_envios SET estado = ${erro ? 'erro' : 'enviado_ao_crm'}, erro = ${erro},
        atualizado_em = now() WHERE id = ${envio.envio_id}::uuid AND estado = 'enviando'`;
}
