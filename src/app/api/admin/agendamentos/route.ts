import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verificarAdminAutenticado } from '@/lib/admin-auth';

export async function PATCH(req: NextRequest) {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        const { id, status } = await req.json();
        if (!id || !['confirmado', 'cancelado', 'concluido'].includes(status)) {
            return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
        }

        await sql`
      UPDATE agendamentos
      SET status = ${status}
      WHERE id = ${Number(id)}
    `;

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Erro ao atualizar agendamento:', error);
        return NextResponse.json(
            { error: 'Falha ao atualizar status do agendamento.' },
            { status: 500 }
        );
    }
}