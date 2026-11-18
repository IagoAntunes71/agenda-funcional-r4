import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verificarAdminAutenticado } from '@/lib/admin-auth';
import { MapaMateriasSeries, SERIES_ESCOLARES } from '@/lib/cliente-helpers';

function normalizarMaterias(raw: unknown): string[] {
    if (Array.isArray(raw)) {
        return raw.map((m) => String(m).trim()).filter(Boolean);
    }
    return String(raw || '')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);
}

function normalizarMateriasSeries(
    raw: unknown,
    materiasValidas: string[]
): MapaMateriasSeries {
    if (!raw || typeof raw !== 'object') return {};
    const entrada = raw as Record<string, unknown>;
    const resultado: MapaMateriasSeries = {};

    for (const mat of materiasValidas) {
        const chaveEntrada = Object.keys(entrada).find(
            (k) => k.trim().toLowerCase() === mat.toLowerCase()
        );
        if (!chaveEntrada) continue;

        const listaBruta = entrada[chaveEntrada];
        if (!Array.isArray(listaBruta)) continue;

        const seriesFiltradas = listaBruta
            .map((s) => String(s).trim())
            .filter((s) => SERIES_ESCOLARES.includes(s));

        if (seriesFiltradas.length > 0) {
            resultado[mat] = Array.from(new Set(seriesFiltradas));
        }
    }

    return resultado;
}

async function garantirColunasProfessor() {
    await sql`
        ALTER TABLE professores
        DROP CONSTRAINT IF EXISTS professores_clin_care_id_key
    `;
    await sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_ativo BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_inicio TIME`;
    await sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_fim TIME`;
    await sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS materias_series JSONB DEFAULT '{}'::jsonb`;
}

export async function POST(req: NextRequest) {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirColunasProfessor();
        const body = await req.json();
        const nome = String(body?.nome || '').trim();
        const clinCareId = String(body?.clin_care_id || '').trim() || null;

        const unidadesIds: number[] = Array.isArray(body?.unidades_ids)
            ? Array.from(new Set(body.unidades_ids.map(Number).filter(Boolean)))
            : Number(body?.unidade_id || 0) > 0
                ? [Number(body.unidade_id)]
                : [];

        const materias = normalizarMaterias(body?.materias);
        const materiasSeries = normalizarMateriasSeries(
            body?.materias_series,
            materias
        );
        const manhaAtivo = Boolean(body?.manha_ativo);
        const manhaInicio = String(body?.manha_inicio || '08:00').trim();
        const manhaFim = String(body?.manha_fim || '11:20').trim();
        const horaInicio = String(body?.hora_inicio || '14:10').trim();
        const horaFim = String(body?.hora_fim || '20:50').trim();

        if (!nome || unidadesIds.length === 0 || materias.length === 0) {
            return NextResponse.json(
                { error: 'Preencha nome, unidade e pelo menos uma matéria.' },
                { status: 400 }
            );
        }

        for (const uid of unidadesIds) {
            await sql`
                INSERT INTO professores (
                    nome,
                    clin_care_id,
                    unidade_id,
                    materias,
                    materias_series,
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
                    ${uid},
                    ${materias},
                    ${JSON.stringify(materiasSeries)}::jsonb,
                    ${manhaAtivo},
                    ${manhaAtivo ? manhaInicio : null}::time,
                    ${manhaAtivo ? manhaFim : null}::time,
                    ${horaInicio}::time,
                    ${horaFim}::time,
                    true
                )
            `;
        }

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
        await garantirColunasProfessor();
        const body = await req.json();
        const id = Number(body?.id || 0);

        if (!id) {
            return NextResponse.json(
                { error: 'ID do professor inválido.' },
                { status: 400 }
            );
        }

        const refRows = (await sql`
            SELECT id, nome, clin_care_id, ativo
            FROM professores
            WHERE id = ${id}
        `) as { id: number; nome: string; clin_care_id: string | null; ativo: boolean }[];

        if (refRows.length === 0) {
            return NextResponse.json(
                { error: 'Professor não encontrado.' },
                { status: 404 }
            );
        }

        const ref = refRows[0];

        if (
            typeof body?.ativo === 'boolean' &&
            body?.nome === undefined &&
            body?.materias === undefined
        ) {
            if (ref.clin_care_id) {
                await sql`
                    UPDATE professores
                    SET ativo = ${body.ativo}
                    WHERE clin_care_id = ${ref.clin_care_id}
                `;
            } else {
                await sql`
                    UPDATE professores
                    SET ativo = ${body.ativo}
                    WHERE lower(trim(nome)) = lower(trim(${ref.nome}))
                `;
            }
            return NextResponse.json({ sucesso: true });
        }

        const nome = String(body?.nome || '').trim();
        const clinCareId = String(body?.clin_care_id || '').trim() || null;

        const unidadesIds: number[] = Array.isArray(body?.unidades_ids)
            ? Array.from(new Set(body.unidades_ids.map(Number).filter(Boolean)))
            : Number(body?.unidade_id || 0) > 0
                ? [Number(body.unidade_id)]
                : [];

        const materias = normalizarMaterias(body?.materias);
        const materiasSeries = normalizarMateriasSeries(
            body?.materias_series,
            materias
        );
        const manhaAtivo = Boolean(body?.manha_ativo);
        const manhaInicio = String(body?.manha_inicio || '08:00').trim();
        const manhaFim = String(body?.manha_fim || '11:20').trim();
        const horaInicio = String(body?.hora_inicio || '14:10').trim();
        const horaFim = String(body?.hora_fim || '20:50').trim();

        if (!nome || unidadesIds.length === 0 || materias.length === 0) {
            return NextResponse.json(
                { error: 'Informe nome, unidade e ao menos uma matéria.' },
                { status: 400 }
            );
        }

        const grupoRows = (
            ref.clin_care_id
                ? await sql`
                    SELECT id, unidade_id
                    FROM professores
                    WHERE clin_care_id = ${ref.clin_care_id}
                       OR id = ${id}
                    ORDER BY id ASC
                `
                : await sql`
                    SELECT id, unidade_id
                    FROM professores
                    WHERE lower(trim(nome)) = lower(trim(${ref.nome}))
                       OR id = ${id}
                    ORDER BY id ASC
                `
        ) as { id: number; unidade_id: number }[];

        const mantidosPorUnidade = new Map<number, number>();
        const sobrasIds: number[] = [];

        for (const r of grupoRows) {
            if (
                unidadesIds.includes(r.unidade_id) &&
                !mantidosPorUnidade.has(r.unidade_id)
            ) {
                mantidosPorUnidade.set(r.unidade_id, r.id);
            } else {
                sobrasIds.push(r.id);
            }
        }

        const primeiroMantidoId = Array.from(mantidosPorUnidade.values())[0];
        const idSobrevivente = primeiroMantidoId || sobrasIds[0] || id;

        const idsParaExcluir = sobrasIds.filter((rowId) => rowId !== idSobrevivente);
        if (idsParaExcluir.length > 0) {
            await sql`
                UPDATE agendamentos
                SET professor_id = ${idSobrevivente}
                WHERE professor_id = ANY(${idsParaExcluir}::int[])
            `;
            await sql`
                DELETE FROM bloqueios_clincare
                WHERE professor_id = ANY(${idsParaExcluir}::int[])
            `;
            await sql`
                DELETE FROM professores
                WHERE id = ANY(${idsParaExcluir}::int[])
            `;
        }

        const unidadesFaltantes = unidadesIds.filter(
            (uid) => !mantidosPorUnidade.has(uid)
        );

        if (!primeiroMantidoId && unidadesFaltantes.length > 0) {
            const primeiraNovaUnidade = unidadesFaltantes.shift()!;
            await sql`
                UPDATE professores
                SET unidade_id = ${primeiraNovaUnidade}
                WHERE id = ${idSobrevivente}
            `;
        }

        // Atualiza dados gerais em todos os registros mantidos
        const idsMantidosFinais = [
            ...Array.from(mantidosPorUnidade.values()),
            ...(primeiroMantidoId ? [] : [idSobrevivente]),
        ];

        await sql`
            UPDATE professores
            SET
                nome = ${nome},
                clin_care_id = ${clinCareId},
                materias = ${materias},
                materias_series = ${JSON.stringify(materiasSeries)}::jsonb,
                manha_ativo = ${manhaAtivo},
                manha_inicio = ${manhaAtivo ? manhaInicio : null}::time,
                manha_fim = ${manhaAtivo ? manhaFim : null}::time,
                hora_inicio = ${horaInicio}::time,
                hora_fim = ${horaFim}::time
            WHERE id = ANY(${idsMantidosFinais}::int[])
        `;

        // Insere eventuais unidades novas
        for (const novaUnidadeId of unidadesFaltantes) {
            await sql`
                INSERT INTO professores (
                    nome,
                    clin_care_id,
                    unidade_id,
                    materias,
                    materias_series,
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
                    ${novaUnidadeId},
                    ${materias},
                    ${JSON.stringify(materiasSeries)}::jsonb,
                    ${manhaAtivo},
                    ${manhaAtivo ? manhaInicio : null}::time,
                    ${manhaAtivo ? manhaFim : null}::time,
                    ${horaInicio}::time,
                    ${horaFim}::time,
                    ${ref.ativo}
                )
            `;
        }

        return NextResponse.json({ sucesso: true });
    } catch (error) {
        console.error('Erro ao editar professor:', error);
        return NextResponse.json(
            { error: 'Falha ao salvar alterações do professor.' },
            { status: 500 }
        );
    }
}