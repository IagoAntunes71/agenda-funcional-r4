import { NextRequest, NextResponse } from 'next/server';
import { garantirTabelaAdmins, lerSessaoAdmin } from '@/lib/admin-auth';
import { sql } from '@/lib/db';
import { adaptarLayoutAnterior, PAGINA_LAYOUT_ADMIN, temaLayoutValido, validarLayoutAdmin } from '@/lib/layout-admin';

let preparo: Promise<unknown> | undefined;

function preparar() {
    preparo ??= sql`
        CREATE TABLE IF NOT EXISTS layouts_admin_r4 (
            pagina text PRIMARY KEY,
            layout jsonb NOT NULL,
            atualizado_em timestamptz NOT NULL DEFAULT now()
        )`.catch((erro) => { preparo = undefined; throw erro; });
    return preparo;
}

export async function GET(req: NextRequest) {
    if (!await lerSessaoAdmin()) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    if (req.nextUrl.searchParams.get('pagina') !== PAGINA_LAYOUT_ADMIN) {
        return NextResponse.json({ error: 'Página inválida.' }, { status: 400 });
    }
    const tema = req.nextUrl.searchParams.get('tema') ?? 'claro';
    if (!temaLayoutValido(tema)) return NextResponse.json({ error: 'Tema inválido.' }, { status: 400 });
    const chave = PAGINA_LAYOUT_ADMIN + ':' + tema;
    try {
        await preparar();
        const [registro] = await sql`SELECT pagina, layout FROM layouts_admin_r4
            WHERE pagina IN (${chave}, ${PAGINA_LAYOUT_ADMIN})
            ORDER BY (pagina = ${chave}) DESC LIMIT 1`;
        const validado = validarLayoutAdmin(registro?.layout) ?? {};
        const layout = registro?.pagina === PAGINA_LAYOUT_ADMIN ? adaptarLayoutAnterior(validado, tema) : validado;
        return NextResponse.json({ layout }, {
            headers: { 'Cache-Control': 'private, no-store' },
        });
    } catch {
        return NextResponse.json({ error: 'Não foi possível carregar o layout.' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    if (!sessao) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    if (sessao.role !== 'admin') return NextResponse.json({ error: 'Apenas administradores podem editar o layout.' }, { status: 403 });

    const corpo = await req.json().catch(() => null);
    const layout = validarLayoutAdmin(corpo?.layout);
    const tema = corpo?.tema ?? 'claro';
    if (!layout || !temaLayoutValido(tema) || corpo?.pagina !== PAGINA_LAYOUT_ADMIN) {
        return NextResponse.json({ error: 'Configuração de layout inválida.' }, { status: 400 });
    }
    try {
        if (sessao.id > 0) {
            await garantirTabelaAdmins();
            const [conta] = await sql`SELECT id FROM admins_sistema WHERE id = ${sessao.id} AND ativo AND role = 'admin'`;
            if (!conta) return NextResponse.json({ error: 'Permissão de administrador necessária.' }, { status: 403 });
        }
        await preparar();
        const chave = PAGINA_LAYOUT_ADMIN + ':' + tema;
        await sql`INSERT INTO layouts_admin_r4 (pagina, layout) VALUES (${chave}, ${JSON.stringify(layout)}::jsonb)
            ON CONFLICT (pagina) DO UPDATE SET layout = excluded.layout, atualizado_em = now()`;
        return NextResponse.json({ layout });
    } catch {
        return NextResponse.json({ error: 'Não foi possível salvar o layout.' }, { status: 500 });
    }
}
