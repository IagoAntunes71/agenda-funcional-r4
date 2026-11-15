import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verificarAdminAutenticado } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        const { nome, unidade_id, materias, hora_inicio, hora_fim, clin_care_id } =
            await req.json();

        const listaMaterias = Array.isArray(materias)
            ? materias
            : String(materias || '')
                .split(',')
                .map((m) => m.trim())
                .filter(Boolean);

        if (!nome?.trim() || !unidade_id || listaMaterias.length === 0) {
            return NextResponse.json(
                { error: 'Preencha nome, unidade e ao menos uma matéria.' },
                { status: 400 }
            );
        }

        await sql`
      INSERT INTO professores (
        nome,
        clin_care_id,
        unidade_id,
        materias,
        hora_inicio,
        hora_fim,
        ativo
      )
      VALUES (
        ${nome.trim()},
        ${clin_care_id?.trim() || null},
        ${Number(unidade_id)},
        ${listaMaterias},
        ${hora_inicio || '08:00'}::time,
        ${hora_fim || '17:00'}::time,
        true
      )
    `;

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Erro ao cadastrar professor:', error);
        return NextResponse.json(
            { error: 'Falha ao cadastrar professor.' },
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
      UPDATE professores
      SET ativo = ${Boolean(ativo)}
      WHERE id = ${Number(id)}
    `;
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ error: 'Falha ao atualizar professor.' }, { status: 500 });
    }
}