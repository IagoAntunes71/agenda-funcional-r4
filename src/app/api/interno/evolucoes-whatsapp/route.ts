import { timingSafeEqual } from 'node:crypto';
import { sql } from '@/lib/db';

export async function POST(req: Request) {
    const segredo = process.env.R4_DATACRAZY_RETORNO_SECRET;
    const esperado = Buffer.from('Bearer ' + (segredo ?? ''));
    const recebido = Buffer.from(req.headers.get('authorization') ?? '');
    if (!segredo || esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) {
        return Response.json({ error: 'Não autorizado.' }, { status: 401 });
    }
    const dados = await req.json().catch(() => null);
    if (dados?.status !== 'entregue' || typeof dados.evolucaoId !== 'string' ||
        !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(dados.evolucaoId)) {
        return Response.json({ error: 'Confirmação inválida.' }, { status: 400 });
    }
    const [envio] = await sql`UPDATE r4_evolucao_envios SET estado = 'entregue', erro = NULL, atualizado_em = now()
        WHERE id = ${dados.evolucaoId}::uuid AND estado IN ('enviando','enviado_ao_crm','entregue','erro')
          AND destino IS NOT NULL RETURNING id`;
    return envio ? Response.json({ sucesso: true }) : Response.json({ error: 'Envio indisponível.' }, { status: 404 });
}
