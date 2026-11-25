import { NextResponse } from 'next/server';
import { lerSessaoAdmin } from '@/lib/admin-auth';
import { PALETA_R4, problemasContraste, validarPaleta } from '@/lib/cores-r4';
import { sql } from '@/lib/db';

const CHAVE = 'r4_paleta_v1';
let preparo: Promise<unknown> | undefined;
function preparar() {
    preparo ??= sql`CREATE TABLE IF NOT EXISTS configuracoes_sistema (
        chave text PRIMARY KEY, valor text NOT NULL, atualizado_em timestamptz DEFAULT now()
    )`.catch((erro) => { preparo = undefined; throw erro; });
    return preparo;
}

export async function GET() {
    try {
        await preparar();
        const [registro] = await sql`SELECT valor FROM configuracoes_sistema WHERE chave = ${CHAVE}`;
        const paleta = registro ? validarPaleta(JSON.parse(registro.valor)) : null;
        return NextResponse.json({ paleta: paleta || PALETA_R4 }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (erro) {
        console.error('Leitura das cores do R4:', erro);
        return NextResponse.json({ error: 'Não foi possível carregar a paleta.' }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    const sessao = await lerSessaoAdmin();
    if (sessao?.role !== 'admin') return NextResponse.json({ error: 'Acesso exclusivo do administrador.' }, { status: sessao ? 403 : 401 });
    try {
        const paleta = validarPaleta((await req.json()).paleta);
        if (!paleta) return NextResponse.json({ error: 'Paleta inválida.' }, { status: 400 });
        if (problemasContraste(paleta.claro).length || problemasContraste(paleta.escuro).length) {
            return NextResponse.json({ error: 'Ajuste as cores com contraste insuficiente.' }, { status: 400 });
        }
        await preparar();
        await sql`INSERT INTO configuracoes_sistema (chave, valor) VALUES (${CHAVE}, ${JSON.stringify(paleta)})
            ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`;
        return NextResponse.json({ paleta });
    } catch (erro) {
        console.error('Publicação das cores do R4:', erro);
        return NextResponse.json({ error: 'Não foi possível publicar a paleta.' }, { status: 500 });
    }
}
