import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verificarAdminAutenticado } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const data = String(body?.data || '').trim();
        const descricao = String(body?.descricao || '').trim();
        const ativo = body?.ativo === undefined ? true : Boolean(body.ativo);

        if (!data || !descricao) {
            return NextResponse.json(
                { error: 'Informe a data e a descrição.' },
                { status: 400 }
            );
        }

        await sql`
      INSERT INTO datas_liberadas (data, descricao, ativo)
      VALUES (${data}::date, ${descricao}, ${ativo})
      ON CONFLICT (data)
      DO UPDATE SET descricao = EXCLUDED.descricao, ativo = EXCLUDED.ativo
    `;

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Erro ao salvar data:', error);
        return NextResponse.json(
            { error: 'Falha ao salvar regra de data.' },
            { status: 500 }
        );
    }
}

export async function PATCH(req: NextRequest) {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        const { id, ativo } = await req.json();
        await sql`
      UPDATE datas_liberadas
      SET ativo = ${Boolean(ativo)}
      WHERE id = ${Number(id)}
    `;
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json(
            { error: 'Falha ao atualizar data.' },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest) {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    if (!id) {
        return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
    }

    await sql`DELETE FROM datas_liberadas WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
}