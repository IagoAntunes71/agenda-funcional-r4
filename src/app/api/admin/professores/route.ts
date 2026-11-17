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

function normalizarUnidadesIds(body: Record<string, unknown>): number[] {
    if (Array.isArray(body?.unidades_ids)) {
        const lista = Array.from(
            new Set(body.unidades_ids.map((u) => Number(u)).filter((n) => n > 0))
        );
        if (lista.length > 0) return lista;
    }
    const unica = Number(body?.unidade_id || 0);
    return unica > 0 ? [unica] : [];
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
        const body = (await req.json()) as Record<string, unknown>;
        const nome = String(body?.nome || '').trim();
        const clinCareId = String(body?.clin_care_id || '').trim() || null;
        const unidadesIds = normalizarUnidadesIds(body);
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
                {
                    error:
                        'Preencha nome, pelo menos uma unidade e pelo menos uma matéria.',
                },
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
        const body = (await req.json()) as Record<string, unknown>;
        const id = Number(body?.id || 0);

        if (!id) {
            return NextResponse.json(
                { error: 'ID do professor inválido.' },
                { status: 400 }
            );
        }

        // Alternância rápida de status ativo/inativo (aplica a todas as unidades do mesmo professor)
        if (
            typeof body?.ativo === 'boolean' &&
            body?.nome === undefined &&
            body?.materias === undefined
        ) {
            const alvoRows = (await sql`
        SELECT id, nome, clin_care_id
        FROM professores
        WHERE id = ${id}
        LIMIT 1
      `) as { id: number; nome: string; clin_care_id: string | null }[];

            if (alvoRows.length > 0) {
                const alvo = alvoRows[0];
                if (alvo.clin_care_id) {
                    await sql`
            UPDATE professores
            SET ativo = ${body.ativo}
            WHERE clin_care_id = ${alvo.clin_care_id}
          `;
                } else {
                    await sql`
            UPDATE professores
            SET ativo = ${body.ativo}
            WHERE id = ${id}
               OR lower(trim(nome)) = lower(trim(${alvo.nome}))
          `;
                }
            }

            return NextResponse.json({ sucesso: true });
        }

        const nome = String(body?.nome || '').trim();
        const clinCareId = String(body?.clin_care_id || '').trim() || null;
        const unidadesIds = normalizarUnidadesIds(body);
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
                { error: 'Informe nome, ao menos uma unidade e ao menos uma matéria.' },
                { status: 400 }
            );
        }

        const originais = (await sql`
      SELECT id, nome, clin_care_id, ativo
      FROM professores
      WHERE id = ${id}
      LIMIT 1
    `) as {
            id: number;
            nome: string;
            clin_care_id: string | null;
            ativo: boolean;
        }[];

        if (originais.length === 0) {
            return NextResponse.json(
                { error: 'Professor não encontrado.' },
                { status: 404 }
            );
        }

        const orig = originais[0];
        const chaveClinCare = clinCareId || orig.clin_care_id;

        // Busca todos os vínculos atuais desse mesmo professor nas unidades
        const irmaos = (
            chaveClinCare
                ? await sql`
            SELECT id, unidade_id, ativo
            FROM professores
            WHERE id = ${id}
               OR clin_care_id = ${chaveClinCare}
            ORDER BY (CASE WHEN id = ${id} THEN 0 ELSE 1 END), id ASC
          `
                : await sql`
            SELECT id, unidade_id, ativo
            FROM professores
            WHERE id = ${id}
               OR lower(trim(nome)) = lower(trim(${orig.nome}))
            ORDER BY (CASE WHEN id = ${id} THEN 0 ELSE 1 END), id ASC
          `
        ) as { id: number; unidade_id: number; ativo: boolean }[];

        const ativoAtual = irmaos.some((r) => r.ativo);
        const usadosIds = new Set<number>();
        let principalMantidoId: number | null = null;

        for (const uid of unidadesIds) {
            const existenteUnidade = irmaos.find(
                (r) => r.unidade_id === uid && !usadosIds.has(r.id)
            );

            if (existenteUnidade) {
                usadosIds.add(existenteUnidade.id);
                if (!principalMantidoId) principalMantidoId = existenteUnidade.id;

                await sql`
          UPDATE professores
          SET
            nome = ${nome},
            clin_care_id = ${clinCareId},
            unidade_id = ${uid},
            materias = ${materias},
            materias_series = ${JSON.stringify(materiasSeries)}::jsonb,
            manha_ativo = ${manhaAtivo},
            manha_inicio = ${manhaAtivo ? manhaInicio : null}::time,
            manha_fim = ${manhaAtivo ? manhaFim : null}::time,
            hora_inicio = ${horaInicio}::time,
            hora_fim = ${horaFim}::time
          WHERE id = ${existenteUnidade.id}
        `;
            } else {
                const reaproveitavel = irmaos.find(
                    (r) => !unidadesIds.includes(r.unidade_id) && !usadosIds.has(r.id)
                );

                if (reaproveitavel) {
                    usadosIds.add(reaproveitavel.id);
                    if (!principalMantidoId) principalMantidoId = reaproveitavel.id;

                    await sql`
            UPDATE professores
            SET
              nome = ${nome},
              clin_care_id = ${clinCareId},
              unidade_id = ${uid},
              materias = ${materias},
              materias_series = ${JSON.stringify(materiasSeries)}::jsonb,
              manha_ativo = ${manhaAtivo},
              manha_inicio = ${manhaAtivo ? manhaInicio : null}::time,
              manha_fim = ${manhaAtivo ? manhaFim : null}::time,
              hora_inicio = ${horaInicio}::time,
              hora_fim = ${horaFim}::time
            WHERE id = ${reaproveitavel.id}
          `;
                } else {
                    const inserido = (await sql`
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
              ${ativoAtual}
            )
            RETURNING id
          `) as { id: number }[];
                    if (!principalMantidoId && inserido[0]?.id) {
                        principalMantidoId = inserido[0].id;
                    }
                }
            }
        }

        // Remove vínculos de unidades desmarcadas preservando histórico de agendamentos
        const sobras = irmaos.filter((r) => !usadosIds.has(r.id));
        if (sobras.length > 0 && principalMantidoId) {
            const sobrasIds = sobras.map((s) => s.id);
            await sql`
        UPDATE agendamentos
        SET professor_id = ${principalMantidoId}
        WHERE professor_id = ANY(${sobrasIds}::int[])
      `;
            await sql`
        DELETE FROM bloqueios_clincare
        WHERE professor_id = ANY(${sobrasIds}::int[])
      `;
            await sql`
        DELETE FROM professores
        WHERE id = ANY(${sobrasIds}::int[])
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