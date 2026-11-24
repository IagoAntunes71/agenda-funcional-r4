import { NextResponse } from 'next/server';
import { lerSessaoAdmin } from '@/lib/admin-auth';
import { sql } from '@/lib/db';
import { TEXTOS_EDITAVEIS_R4, TEXTOS_PUBLICOS_R4 } from '@/lib/textos-interface-catalogo';

const CHAVE = 'r4_interface_textos_v1';
const permitidos = new Set<string>(TEXTOS_EDITAVEIS_R4);
const publicos = new Set<string>(TEXTOS_PUBLICOS_R4);

function validar(valor: unknown) {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
    return Object.fromEntries(Object.entries(valor).filter(([chave, texto]) =>
        permitidos.has(chave) && typeof texto === 'string' && texto.trim().length > 0 && texto.length <= 2000));
}

let preparo: Promise<unknown> | undefined;
function preparar() {
    preparo ??= sql`CREATE TABLE IF NOT EXISTS configuracoes_sistema (
        chave text PRIMARY KEY, valor text NOT NULL, atualizado_em timestamptz DEFAULT now()
    )`.catch((error) => { preparo = undefined; throw error; });
    return preparo;
}

export async function GET() {
    try {
        await preparar();
        const [registro] = await sql`SELECT valor FROM configuracoes_sistema WHERE chave = ${CHAVE}`;
        const sessao = await lerSessaoAdmin();
        const textos = registro ? validar(JSON.parse(registro.valor)) : {};
        const visiveis = sessao ? textos : Object.fromEntries(Object.entries(textos).filter(([chave]) => publicos.has(chave)));
        return NextResponse.json({ textos: visiveis }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Falha ao carregar textos da interface:', error);
        return NextResponse.json({ error: 'Não foi possível carregar os textos.' }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    const sessao = await lerSessaoAdmin();
    if (sessao?.role !== 'admin') return NextResponse.json({ error: 'Acesso exclusivo do administrador.' }, { status: sessao ? 403 : 401 });
    try {
        const { textos } = await req.json();
        if (!textos || typeof textos !== 'object' || Array.isArray(textos)) {
            return NextResponse.json({ error: 'Formato inválido.' }, { status: 400 });
        }
        const atualizados = validar(textos);
        const redefinidos = Object.keys(textos).filter((chave) => permitidos.has(chave) && textos[chave] === '');
        await preparar();
        const [registro] = await sql`INSERT INTO configuracoes_sistema (chave, valor) VALUES (${CHAVE}, ${JSON.stringify(atualizados)})
            ON CONFLICT (chave) DO UPDATE SET
                valor = ((configuracoes_sistema.valor::jsonb - ${redefinidos}::text[]) || EXCLUDED.valor::jsonb)::text,
                atualizado_em = now()
            RETURNING valor`;
        return NextResponse.json({ textos: validar(JSON.parse(registro.valor)) });
    } catch (error) {
        console.error('Falha ao salvar textos da interface:', error);
        return NextResponse.json({ error: 'Não foi possível publicar os textos.' }, { status: 500 });
    }
}
