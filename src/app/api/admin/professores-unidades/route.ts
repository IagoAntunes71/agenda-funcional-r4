import { NextRequest, NextResponse, connection } from 'next/server';
import { sql } from '@/lib/db';
import { verificarAdminAutenticado } from '@/lib/admin-auth';

interface ProfessorDbRow {
    id: number;
    nome: string;
    clin_care_id: string | null;
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

async function garantirColunas() {
    await sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_ativo BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_inicio TIME`;
    await sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_fim TIME`;
    await sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS materias_series JSONB DEFAULT '{}'::jsonb`;
}

async function mesclarDuplicadosInterno() {
    const duplicados = (await sql`
    SELECT p.id, p.clin_care_id
    FROM professores p
    WHERE p.clin_care_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM professores p2
        WHERE p2.clin_care_id = p.clin_care_id
          AND p2.unidade_id = p.unidade_id
          AND p2.id < p.id
      )
  `) as { id: number; clin_care_id: string }[];

    for (const dup of duplicados) {
        const principal = (await sql`
      SELECT id
      FROM professores
      WHERE clin_care_id = ${dup.clin_care_id}
      ORDER BY id ASC
      LIMIT 1
    `) as { id: number }[];

        if (principal[0]?.id) {
            await sql`
        UPDATE agendamentos
        SET professor_id = ${principal[0].id}
        WHERE professor_id = ${dup.id}
      `;
        }

        await sql`
      DELETE FROM bloqueios_clincare
      WHERE professor_id = ${dup.id}
    `;
        await sql`
      DELETE FROM professores
      WHERE id = ${dup.id}
    `;
    }
}

async function carregarDadosAgrupados() {
    await garantirColunas();

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
      clin_care_id,
      unidade_id,
      materias,
      COALESCE(materias_series, '{}'::jsonb) AS materias_series,
      COALESCE(manha_ativo, false) AS manha_ativo,
      to_char(manha_inicio, 'HH24:MI') AS manha_inicio,
      to_char(manha_fim, 'HH24:MI') AS manha_fim,
      COALESCE(to_char(hora_inicio, 'HH24:MI'), '14:10') AS hora_inicio,
      COALESCE(to_char(hora_fim, 'HH24:MI'), '20:50') AS hora_fim,
      ativo
    FROM professores
    ORDER BY nome ASC, id ASC
  `) as ProfessorDbRow[];

    const mapa = new Map<
        string,
        {
            chave: string;
            clin_care_id: string | null;
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
        const chave = r.clin_care_id
            ? `cc:${r.clin_care_id}`
            : `nm:${r.nome.trim().toLowerCase()}`;

        const atual = mapa.get(chave);
        if (!atual) {
            mapa.set(chave, {
                chave,
                clin_care_id: r.clin_care_id,
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
        await garantirColunas();
        const body = await req.json();
        const acao = String(body?.acao || '');

        if (acao === 'mesclarDuplicados') {
            await mesclarDuplicadosInterno();
            const dados = await carregarDadosAgrupados();
            return NextResponse.json({ sucesso: true, ...dados });
        }

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

            const baseRows = (await sql`
        SELECT
          id,
          nome,
          clin_care_id,
          unidade_id,
          materias,
          COALESCE(materias_series, '{}'::jsonb) AS materias_series,
          COALESCE(manha_ativo, false) AS manha_ativo,
          to_char(manha_inicio, 'HH24:MI') AS manha_inicio,
          to_char(manha_fim, 'HH24:MI') AS manha_fim,
          COALESCE(to_char(hora_inicio, 'HH24:MI'), '14:10') AS hora_inicio,
          COALESCE(to_char(hora_fim, 'HH24:MI'), '20:50') AS hora_fim,
          ativo
        FROM professores
        WHERE id = ANY(${registrosIds}::int[])
        ORDER BY id ASC
      `) as ProfessorDbRow[];

            if (baseRows.length === 0) {
                return NextResponse.json(
                    { error: 'Professor não encontrado.' },
                    { status: 404 }
                );
            }

            const modelo = baseRows[0];
            const materiasModelo =
                Array.isArray(modelo.materias) && modelo.materias.length > 0
                    ? modelo.materias
                    : ['Reforço Geral'];
            const materiasSeriesJson = JSON.stringify(modelo.materias_series || {});

            const primeiraUnidade = unidadesIds[0];
            await sql`
        UPDATE professores
        SET unidade_id = ${primeiraUnidade}
        WHERE id = ${modelo.id}
      `;

            const outrosIds = baseRows.slice(1).map((r) => r.id);
            if (outrosIds.length > 0) {
                await sql`
          UPDATE agendamentos
          SET professor_id = ${modelo.id}
          WHERE professor_id = ANY(${outrosIds}::int[])
        `;
                await sql`
          DELETE FROM bloqueios_clincare
          WHERE professor_id = ANY(${outrosIds}::int[])
        `;
                await sql`
          DELETE FROM professores
          WHERE id = ANY(${outrosIds}::int[])
        `;
            }

            for (const extraUnidadeId of unidadesIds.slice(1)) {
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
            ${modelo.nome},
            ${modelo.clin_care_id},
            ${extraUnidadeId},
            ${materiasModelo}::text[],
            ${materiasSeriesJson}::jsonb,
            ${Boolean(modelo.manha_ativo)},
            ${modelo.manha_ativo ? modelo.manha_inicio || '08:00' : null}::time,
            ${modelo.manha_ativo ? modelo.manha_fim || '11:20' : null}::time,
            ${modelo.hora_inicio || '14:10'}::time,
            ${modelo.hora_fim || '20:50'}::time,
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