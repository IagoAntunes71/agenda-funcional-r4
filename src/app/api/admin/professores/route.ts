import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verificarAdminAutenticado } from '@/lib/admin-auth';

function normalizarMaterias(raw: unknown): string[] {
    if (Array.isArray(raw)) {
        return raw.map((m) => String(m).trim()).filter(Boolean);
    }
    return String(raw || '')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);
}

async function garantirColunasManha() {
    await sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_ativo BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_inicio TIME`;
    await sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_fim TIME`;
}

export async function POST(req: NextRequest) {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirColunasManha();
        const body = await req.json();
        const nome = String(body?.nome || '').trim();
        const clinCareId = String(body?.clin_care_id || '').trim() || null;
        const unidadeId = Number(body?.unidade_id || 0);
        const materias = normalizarMaterias(body?.materias);
        const manhaAtivo = Boolean(body?.manha_ativo);
        const manhaInicio = String(body?.manha_inicio || '08:00').trim();
        const manhaFim = String(body?.manha_fim || '11:20').trim();
        const horaInicio = String(body?.hora_inicio || '14:10').trim();
        const horaFim = String(body?.hora_fim || '20:50').trim();

        if (!nome || !unidadeId || materias.length === 0) {
            return NextResponse.json(
                { error: 'Preencha nome, unidade e pelo menos uma matéria.' },
                { status: 400 }
            );
        }

        await sql`
      INSERT INTO professores (
        nome,
        clin_care_id,
        unidade_id,
        materias,
        manha_ativo,
        manha_inicio,
        manha_fim,
        hora_inicio,
        hora_fim,
        ativo
      )
      VALUES (
        ${nome},
        ${clinCareId},
        ${unidadeId},
        ${materias},
        ${manhaAtivo},
        ${manhaAtivo ? manhaInicio : null}::time,
        ${manhaAtivo ? manhaFim : null}::time,
        ${horaInicio}::time,
        ${horaFim}::time,
        true
      )
    `;

        return NextResponse.json({ sucesso: true }, { status: 201 });
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
        await garantirColunasManha();
        const body = await req.json();
        const id = Number(body?.id || 0);

        if (!id) {
            return NextResponse.json(
                { error: 'ID do professor inválido.' },
                { status: 400 }
            );
        }

        if (
            typeof body?.ativo === 'boolean' &&
            body?.nome === undefined &&
            body?.materias === undefined
        ) {
            await sql`
        UPDATE professores
        SET ativo = ${body.ativo}
        WHERE id = ${id}
      `;
            return NextResponse.json({ sucesso: true });
        }

        const nome = String(body?.nome || '').trim();
        const clinCareId = String(body?.clin_care_id || '').trim() || null;
        const unidadeId = Number(body?.unidade_id || 0);
        const materias = normalizarMaterias(body?.materias);
        const manhaAtivo = Boolean(body?.manha_ativo);
        const manhaInicio = String(body?.manha_inicio || '08:00').trim();
        const manhaFim = String(body?.manha_fim || '11:20').trim();
        const horaInicio = String(body?.hora_inicio || '14:10').trim();
        const horaFim = String(body?.hora_fim || '20:50').trim();

        if (!nome || !unidadeId || materias.length === 0) {
            return NextResponse.json(
                { error: 'Informe nome, unidade e ao menos uma matéria.' },
                { status: 400 }
            );
        }

        await sql`
      UPDATE professores
      SET
        nome = ${nome},
        clin_care_id = ${clinCareId},
        unidade_id = ${unidadeId},
        materias = ${materias},
        manha_ativo = ${manhaAtivo},
        manha_inicio = ${manhaAtivo ? manhaInicio : null}::time,
        manha_fim = ${manhaAtivo ? manhaFim : null}::time,
        hora_inicio = ${horaInicio}::time,
        hora_fim = ${horaFim}::time
      WHERE id = ${id}
    `;

        return NextResponse.json({ sucesso: true });
    } catch (error) {
        console.error('Erro ao editar professor:', error);
        return NextResponse.json(
            { error: 'Falha ao salvar alterações do professor.' },
            { status: 500 }
        );
    }
}