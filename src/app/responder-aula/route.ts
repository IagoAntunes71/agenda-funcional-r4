import { cancelamentoAula } from '@/lib/cancelamento-aula';
import { garantirHistoricoAgendamento } from '@/lib/agendamento-historico';
import { garantirStatusAgendamentoR4 } from '@/lib/agendamento-status-schema';
import { createHash } from 'node:crypto';
import { sql } from '@/lib/db';
import { lerOperacaoR4 } from '@/lib/operacao-r4-db';
import { enviarMensagemResponsavel, lembreteCancelamento } from '@/lib/whatsapp-notificacao';

function tela(texto: string, token?: string, status = 200, aceitarCobranca = false) {
    return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Responder à aula · R4 Ensina</title>
    <style>body{margin:0;padding:2rem 1rem;background:#f1f5f9;color:#0f172a;font:1rem/1.5 system-ui}
    main{max-width:32rem;margin:auto;padding:1.5rem;border:1px solid #cbd5e1;border-radius:1rem;background:white}
    button{padding:.75rem 1rem;margin:.25rem;border:1px solid #0369a1;border-radius:.5rem;background:#fff;color:#075985;cursor:pointer}
    button:first-of-type{background:#0369a1;color:white}</style>
    <main><h1>R4 Ensina</h1><p>${texto}</p>${token ? `<form method="post">
    <input type="hidden" name="t" value="${token}">
    <button name="acao" value="confirmar">Confirmar aula</button>
    ${aceitarCobranca ? '<input type="hidden" name="aceitarCobranca" value="sim">' : ''}
    <button name="acao" value="cancelar">${aceitarCobranca ? 'Cancelar aula com cobrança' : 'Cancelar aula'}</button></form>` : ''}</main></html>`, {
        status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow',
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" },
    });
}

const tokenValido = (t: unknown): t is string => typeof t === 'string' && /^[a-f0-9]{64}$/.test(t);
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function GET(req: Request) {
    const token = new URL(req.url).searchParams.get('t');
    if (!tokenValido(token)) return tela('Link inválido. Fale com a secretaria da R4.', undefined, 400);
    try {
        const { antecedencia } = await lerOperacaoR4();
        const regra = cancelamentoAula(antecedencia);
        const [aula] = await sql`SELECT ${regra.gratuito} AS gratuito, ${regra.foraDoLimiteExato} AS fora_limite
            FROM agendamentos WHERE resposta_whatsapp_hash = ${hash(token)}
            AND excluido_em IS NULL AND status IN ('agendado','confirmado')
            AND ((data + coalesce(hora_inicio, horario)) AT TIME ZONE 'America/Bahia') > now()`;
        if (!aula) return tela('Este link já foi usado ou a aula está indisponível. Fale com a secretaria da R4.', undefined, 404);
        return tela(lembreteCancelamento(antecedencia), token, 200, aula.fora_limite && !aula.gratuito);
    } catch { return tela('Não foi possível consultar a aula. Tente novamente.', undefined, 503); }
}

export async function POST(req: Request) {
    const json = req.headers.get('content-type')?.split(';')[0]?.trim() === 'application/json';
    const responder = (mensagem: string, status = 200, estado?: string) => json
        ? Response.json({
            sucesso: status === 200, mensagem,
            status: estado?.startsWith('desmarcado_') ? 'cancelado' : estado,
            statusAplicado: estado,
        }, {
            status, headers: { 'Cache-Control': 'no-store' },
        })
        : tela(mensagem, undefined, status);
    const dados = json ? await req.json().catch(() => null) : await req.formData().catch(() => null);
    const token = json ? dados?.token : dados?.get('t');
    const acao = json ? dados?.acao : dados?.get('acao');
    if (!tokenValido(token) || (acao !== 'confirmar' && acao !== 'cancelar')) {
        return responder('Resposta inválida.', 400);
    }
    try {
        const { antecedencia } = await lerOperacaoR4();
        await garantirHistoricoAgendamento();
        await garantirStatusAgendamentoR4();
        const regra = cancelamentoAula(antecedencia);
        const confirmar = acao === 'confirmar';
        const aceitarCobranca = json || dados?.get('aceitarCobranca') === 'sim';
        const [, aulas] = await sql.transaction([
            sql`SELECT set_config('r4.ator_agenda', 'Responsável · Botão do WhatsApp', true)`,
            sql`UPDATE agendamentos
                SET status = ${confirmar ? sql`'confirmado'` : regra.status},
                    resposta_whatsapp_hash = CASE WHEN ${confirmar} THEN resposta_whatsapp_hash ELSE NULL END
                WHERE resposta_whatsapp_hash = ${hash(token)} AND excluido_em IS NULL
                    AND (status = 'agendado' OR (NOT ${confirmar} AND status = 'confirmado'))
                    AND ${regra.futuro}
                    AND (${confirmar} OR (${regra.foraDoLimiteExato} AND (${aceitarCobranca} OR ${regra.gratuito})))
                RETURNING aluno_telefone, status`,
        ]);
        if (!aulas.length) return responder(confirmar
            ? 'A aula já foi respondida ou este link não está mais disponível.'
            : 'Não foi possível cancelar. Reabra o link para conferir o prazo ou fale com a secretaria da R4.', 409);
        if (!json && confirmar && aulas[0].aluno_telefone) {
            await enviarMensagemResponsavel(aulas[0].aluno_telefone,
                'Sua aula na R4 Ensina foi confirmada. ' + lembreteCancelamento(antecedencia), 'aula_confirmada').catch(() => undefined);
        }
        const estado = aulas[0].status;
        if (confirmar) return responder('Aula confirmada. ' + lembreteCancelamento(antecedencia), 200, estado);
        const mensagem = estado === 'desmarcado_com_cobranca' ? 'Aula cancelada com cobrança.' : 'Aula cancelada sem cobrança.';
        return responder(mensagem, 200, estado);
    } catch { return responder('Não foi possível registrar sua resposta. Tente novamente.', 503); }
}
