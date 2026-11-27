import { timingSafeEqual } from 'node:crypto';
import { sql } from '@/lib/db';
import { aulasParaLembrar, enviarLembreteAula, expirarTentativasLembrete } from '@/lib/lembretes-whatsapp';

export const runtime = 'nodejs';
export const maxDuration = 60;

function autorizado(req: Request, segredo?: string) {
    const recebido = Buffer.from(req.headers.get('authorization') ?? '');
    const esperado = Buffer.from('Bearer ' + (segredo ?? ''));
    return Boolean(segredo) && recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

export async function GET(req: Request) {
    if (!autorizado(req, process.env.CRON_SECRET)) {
        return Response.json({ error: 'Não autorizado.' }, { status: 401 });
    }
    try {
        await expirarTentativasLembrete();
        const aulas = await aulasParaLembrar();
        const resultados = await Promise.allSettled(aulas.map((aula) => enviarLembreteAula(Number(aula.id))));
        const falhas = resultados.filter((r) => r.status === 'rejected' || Boolean(r.value.erro)).length;
        return Response.json({ selecionadas: aulas.length, falhas }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
        return Response.json({ error: 'Falha ao processar lembretes.' }, { status: 503 });
    }
}

export async function POST(req: Request) {
    if (!autorizado(req, process.env.R4_DATACRAZY_RETORNO_SECRET)) {
        return Response.json({ error: 'Não autorizado.' }, { status: 401 });
    }
    const dados = await req.json().catch(() => null);
    if (typeof dados?.lembreteId !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(dados.lembreteId)
        || dados.status !== 'entregue') {
        return Response.json({ error: 'Confirmação de entrega inválida.' }, { status: 400 });
    }
    const [registro] = await sql`UPDATE r4_lembretes_whatsapp SET estado = 'entregue', erro = NULL, atualizado_em = now()
        WHERE id = ${dados.lembreteId}::uuid AND estado <> 'obsoleto' RETURNING id`;
    return registro ? Response.json({ sucesso: true }) : Response.json({ error: 'Lembrete indisponível.' }, { status: 404 });
}
