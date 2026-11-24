import { NextResponse } from 'next/server';
import { lerSessaoAdmin } from '@/lib/admin-auth';
import { sql } from '@/lib/db';
import { TEXTOS_EDITAVEIS_R4, TEXTOS_INTERFACE_PORTAL_R4, TEXTOS_PUBLICOS_R4 } from '@/lib/textos-interface-catalogo';

const CHAVE = 'r4_interface_textos_v1';
const CHAVE_PORTAL = 'r4_interface_portal_v1';
const permitidosPortal = new Set(TEXTOS_INTERFACE_PORTAL_R4);
const permitidos = new Set<string>(TEXTOS_EDITAVEIS_R4);
const publicos = new Set<string>(TEXTOS_PUBLICOS_R4);

function validar(valor: unknown, lista = permitidos) {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
    return Object.fromEntries(Object.entries(valor).filter(([chave, texto]) =>
        lista.has(chave) && typeof texto === 'string' && texto.trim().length > 0 && texto.length <= 2000));
}

let preparo: Promise<unknown> | undefined;
function preparar() {
    preparo ??= sql.transaction([
        sql`CREATE TABLE IF NOT EXISTS configuracoes_sistema (
            chave text PRIMARY KEY, valor text NOT NULL, atualizado_em timestamptz DEFAULT now()
        )`,
        sql`INSERT INTO configuracoes_sistema (chave, valor)
            SELECT ${CHAVE_PORTAL}, coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)::text
            FROM jsonb_each(coalesce((SELECT valor::jsonb FROM configuracoes_sistema WHERE chave = ${CHAVE}), '{}'::jsonb)) item
            WHERE item.key = ANY(${TEXTOS_INTERFACE_PORTAL_R4}::text[])
            ON CONFLICT (chave) DO NOTHING`,
    ]).catch((error) => { preparo = undefined; throw error; });
    return preparo;
}

async function carregarTextos() {
    const registros = await sql`SELECT chave, valor FROM configuracoes_sistema WHERE chave IN (${CHAVE}, ${CHAVE_PORTAL})`;
    const registro = (chave: string) => JSON.parse(registros.find((item) => item.chave === chave)?.valor || '{}');
    const portal = validar(registro(CHAVE_PORTAL), permitidosPortal);
    return {
        admin: validar(registro(CHAVE)),
        portal: Object.fromEntries(Object.entries(portal).map(([chave, valor]) => ['portal:' + chave, valor])),
    };
}

export async function GET() {
    try {
        await preparar();
        const textos = await carregarTextos();
        const sessao = await lerSessaoAdmin();
        const admin = sessao ? textos.admin : Object.fromEntries(Object.entries(textos.admin).filter(([chave]) => publicos.has(chave)));
        return NextResponse.json({ textos: { ...admin, ...textos.portal } }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Falha ao carregar textos da interface:', error);
        return NextResponse.json({ error: 'Não foi possível carregar os textos.' }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    const sessao = await lerSessaoAdmin();
    if (sessao?.role !== 'admin') return NextResponse.json({ error: 'Acesso exclusivo do administrador.' }, { status: sessao ? 403 : 401 });
    try {
        const { textos, escopo } = await req.json();
        if (!textos || typeof textos !== 'object' || Array.isArray(textos)) {
            return NextResponse.json({ error: 'Formato inválido.' }, { status: 400 });
        }
        const portal = escopo === 'portal';
        const lista = portal ? permitidosPortal : permitidos;
        const chave = portal ? CHAVE_PORTAL : CHAVE;
        const atualizados = validar(textos, lista);
        const redefinidos = Object.keys(textos).filter((chave) => lista.has(chave) && textos[chave] === '');
        await preparar();
        await sql`INSERT INTO configuracoes_sistema (chave, valor) VALUES (${chave}, ${JSON.stringify(atualizados)})
            ON CONFLICT (chave) DO UPDATE SET
                valor = ((configuracoes_sistema.valor::jsonb - ${redefinidos}::text[]) || EXCLUDED.valor::jsonb)::text,
                atualizado_em = now()
            `;
        const atual = await carregarTextos();
        return NextResponse.json({ textos: { ...atual.admin, ...atual.portal } });
    } catch (error) {
        console.error('Falha ao salvar textos da interface:', error);
        return NextResponse.json({ error: 'Não foi possível publicar os textos.' }, { status: 500 });
    }
}
