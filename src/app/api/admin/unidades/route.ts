import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verificarAdminAutenticado } from '@/lib/admin-auth';

export async function PATCH(req: NextRequest) {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        const { id, ativa } = await req.json();
        if (!Number.isSafeInteger(Number(id)) || Number(id) < 1 || typeof ativa !== 'boolean') {
            return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
        }

        await sql`
      UPDATE unidades
      SET ativa = ${ativa}
      WHERE id = ${Number(id)}
    `;

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Erro ao atualizar unidade:', error);
        return NextResponse.json({ error: 'Falha ao atualizar unidade.' }, { status: 500 });
    }
}