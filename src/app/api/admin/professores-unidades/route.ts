import { NextRequest, NextResponse, connection } from 'next/server';
import { sql } from '@/lib/db';
import { verificarAdminAutenticado } from '@/lib/admin-auth';

interface ProfessorDbRow {
    id: number;
    nome: string;
    grupo_professor: string | null;
    unidade_id: number;
    materias: string[] | null;
    materias_series: Record<string, string[]> | null;
    manha_ativo: boolean | null;
    manha_inicio: string | null;
    manha_fim: string | null;
    hora_inicio: string;
    hora_fim: string;
    ativo: boolean;
}

async function garantirEstruturaProfessores() {
    await sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_ativo BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_inicio TIME`;
    await sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_fim TIME`;
    await sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS materias_series JSONB DEFAULT '{}'::jsonb`;
}

async function carregarDadosAgrupados() {
    const unidades = await sql`
        SELECT id, nome
        FROM unidades
        WHERE ativa = true
        ORDER BY id ASC
    `;

    const rows = (await sql`
        SELECT
            id,
            nome,
            grupo_professor,
            unidade_id,
            materias,
            to_char(hora_inicio, 'HH24:MI') AS hora_inicio,
            to_char(hora_fim, 'HH24:MI') AS hora_fim,
            ativo
        FROM professores
        ORDER BY nome ASC, id ASC
    `) as ProfessorDbRow[];

    const mapa = new Map<
        string,
        {
            chave: string;
            grupo_professor: string | null;
            nome: string;
            unidades_ids: number[];
            materias: string[];
            hora_inicio: string;
            hora_fim: string;
            ativo: boolean;
            registros_ids: number[];
        }
    >();

    for (const r of rows) {
        const chave = r.grupo_professor
            ? `grupo:${r.grupo_professor}`
            : `nm:${r.nome.trim().toLowerCase()}`;

        const atual = mapa.get(chave);
        if (!atual) {
            mapa.set(chave, {
                chave,
                grupo_professor: r.grupo_professor,
                nome: r.nome,
                unidades_ids: [r.unidade_id],
                materias: Array.isArray(r.materias) ? r.materias : [],
                hora_inicio: r.hora_inicio || '14:10',
                hora_fim: r.hora_fim || '20:50',
                ativo: r.ativo,
                registros_ids: [r.id],
            });
        } else {
            if (!atual.unidades_ids.includes(r.unidade_id)) {
                atual.unidades_ids.push(r.unidade_id);
            }
            atual.ativo = atual.ativo || r.ativo;
            atual.registros_ids.push(r.id);
        }
    }

    return {
        unidades,
        professores: Array.from(mapa.values()),
        totalRegistrosBrutos: rows.length,
    };
}

export async function GET() {
    await connection();

    if (!(await verificarAdminAutenticado())) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        const dados = await carregarDadosAgrupados();
        return NextResponse.json(dados, {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        console.error('Erro ao listar professores e unidades:', error);
        return NextResponse.json(
            { error: 'Falha ao carregar lista de professores.' },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    if (!(await verificarAdminAutenticado())) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirEstruturaProfessores();
        const body = await req.json();
        const acao = String(body?.acao || '');

        if (acao === 'atualizarUnidades') {
            const registrosIds: number[] = Array.isArray(body?.registrosIds)
                ? body.registrosIds.map(Number).filter(Boolean)
                : [];
            const unidadesIds: number[] = Array.isArray(body?.unidadesIds)
                ? Array.from(new Set(body.unidadesIds.map(Number).filter(Boolean)))
                : [];

            if (registrosIds.length === 0 || unidadesIds.length === 0) {
                return NextResponse.json(
                    { error: 'Selecione ao menos uma unidade para o professor.' },
                    { status: 400 }
                );
            }

            const iniciais = (await sql`
                SELECT id, grupo_professor
                FROM professores
                WHERE id = ANY(${registrosIds}::int[])
                ORDER BY id ASC
            `) as { id: number; grupo_professor: string | null }[];

            if (iniciais.length === 0) {
                return NextResponse.json(
                    { error: 'Professor não encontrado.' },
                    { status: 404 }
                );
            }

            const grupoProfessor = iniciais.find((r) => r.grupo_professor)?.grupo_professor || null;

            const baseRows = (
                grupoProfessor
                    ? await sql`
                        SELECT
                            id,
                            nome,
                            grupo_professor,
                            unidade_id,
                            materias,
                            materias_series,
                            manha_ativo,
                            to_char(manha_inicio, 'HH24:MI') AS manha_inicio,
                            to_char(manha_fim, 'HH24:MI') AS manha_fim,
                            to_char(hora_inicio, 'HH24:MI') AS hora_inicio,
                            to_char(hora_fim, 'HH24:MI') AS hora_fim,
                            ativo
                        FROM professores
                        WHERE id = ANY(${registrosIds}::int[])
                           OR grupo_professor = ${grupoProfessor}
                        ORDER BY id ASC
                    `
                    : await sql`
                        SELECT
                            id,
                            nome,
                            grupo_professor,
                            unidade_id,
                            materias,
                            materias_series,
                            manha_ativo,
                            to_char(manha_inicio, 'HH24:MI') AS manha_inicio,
                            to_char(manha_fim, 'HH24:MI') AS manha_fim,
                            to_char(hora_inicio, 'HH24:MI') AS hora_inicio,
                            to_char(hora_fim, 'HH24:MI') AS hora_fim,
                            ativo
                        FROM professores
                        WHERE id = ANY(${registrosIds}::int[])
                        ORDER BY id ASC
                    `
            ) as ProfessorDbRow[];

            const modelo = baseRows[0];
            const materiasModelo =
                Array.isArray(modelo.materias) && modelo.materias.length > 0
                    ? modelo.materias
                    : ['Reforço Geral'];
            const materiasSeriesJson = JSON.stringify(modelo.materias_series || {});
            const manhaAtivo = Boolean(modelo.manha_ativo);
            const manhaInicio = modelo.manha_inicio || '08:00';
            const manhaFim = modelo.manha_fim || '11:20';
            const horaInicio = modelo.hora_inicio || '14:10';
            const horaFim = modelo.hora_fim || '20:50';

            // 1. Mantém intactos os registros cuja unidade continua selecionada
            const mantidosPorUnidade = new Map<number, ProfessorDbRow>();
            const sobras: ProfessorDbRow[] = [];

            for (const row of baseRows) {
                if (
                    unidadesIds.includes(row.unidade_id) &&
                    !mantidosPorUnidade.has(row.unidade_id)
                ) {
                    mantidosPorUnidade.set(row.unidade_id, row);
                } else {
                    sobras.push(row);
                }
            }

            // 2. Define qual ID sobreviverá para herdar aulas/agendamentos
            const primeiroMantido = Array.from(mantidosPorUnidade.values())[0];
            const idSobrevivente = primeiroMantido ? primeiroMantido.id : sobras[0].id;

            // 3. Remove registros de unidades desmarcadas ANTES de atualizar/inserir
            const idsParaExcluir = sobras
                .map((r) => r.id)
                .filter((id) => id !== idSobrevivente);

            if (idsParaExcluir.length > 0) {
                await sql`
                    UPDATE agendamentos
                    SET professor_id = ${idSobrevivente}
                    WHERE professor_id = ANY(${idsParaExcluir}::int[])
                `;
                await sql`
                    DELETE FROM r4_bloqueios_agenda
                    WHERE professor_id = ANY(${idsParaExcluir}::int[])
                `;
                await sql`
                    DELETE FROM professores
                    WHERE id = ANY(${idsParaExcluir}::int[])
                `;
            }

            // 4. Se nenhuma unidade antiga foi mantida, reaproveita o registro sobrevivente na primeira nova unidade
            const unidadesFaltantes = unidadesIds.filter(
                (uid) => !mantidosPorUnidade.has(uid)
            );

            if (!primeiroMantido && unidadesFaltantes.length > 0) {
                const primeiraNovaUnidade = unidadesFaltantes.shift()!;
                await sql`
                    UPDATE professores
                    SET unidade_id = ${primeiraNovaUnidade}
                    WHERE id = ${idSobrevivente}
                `;
            }

            // 5. Insere apenas as novas unidades adicionadas
            for (const novaUnidadeId of unidadesFaltantes) {
                await sql`
                    INSERT INTO professores (
                        nome,
                        grupo_professor,
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
                        ${modelo.nome},
                        ${modelo.grupo_professor},
                        ${novaUnidadeId},
                        ${materiasModelo}::text[],
                        ${materiasSeriesJson}::jsonb,
                        ${manhaAtivo},
                        ${manhaAtivo ? manhaInicio : null}::time,
                        ${manhaAtivo ? manhaFim : null}::time,
                        ${horaInicio}::time,
                        ${horaFim}::time,
                        ${modelo.ativo}
                    )
                `;
            }

            const dados = await carregarDadosAgrupados();
            return NextResponse.json({ sucesso: true, ...dados });
        }

        if (acao === 'alternarAtivo') {
            const registrosIds: number[] = Array.isArray(body?.registrosIds)
                ? body.registrosIds.map(Number).filter(Boolean)
                : [];
            const ativo = Boolean(body?.ativo);

            if (registrosIds.length > 0) {
                await sql`
                    UPDATE professores
                    SET ativo = ${ativo}
                    WHERE id = ANY(${registrosIds}::int[])
                `;
            }

            const dados = await carregarDadosAgrupados();
            return NextResponse.json({ sucesso: true, ...dados });
        }

        return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    } catch (error) {
        console.error('Erro ao atualizar unidades do professor:', error);
        return NextResponse.json(
            { error: 'Falha ao salvar alteração do professor.' },
            { status: 500 }
        );
    }
}