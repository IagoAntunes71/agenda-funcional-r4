import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    IntervaloOcupado,
    avaliarStatusChaveMestra,
    gerarDatasDisponiveisSemana,
    obterSlotsDisponiveisProfessor,
} from '@/lib/horarios-reforco';
import { obterModoChaveMestra } from '@/app/api/admin/configuracoes/route';
import {
    MapaMateriasSeries,
    filtrarMateriasProfessorPorSerie,
} from '@/lib/cliente-helpers';

interface ProfessorRow {
    id: number;
    nome: string;
    clin_care_id: string | null;
    unidade_id: number;
    materias: string[] | null;
    materias_series: MapaMateriasSeries | null;
    manha_ativo: boolean | null;
    manha_inicio: string | null;
    manha_fim: string | null;
    hora_inicio: string | null;
    hora_fim: string | null;
}

interface BloqueioRow extends IntervaloOcupado {
    professor_id: number;
    clin_care_id: string | null;
}

declare global {
    // eslint-disable-next-line no-var
    var __r4DispSchemaPromise: Promise<void> | undefined;
}

function garantirEstruturaBanco(): Promise<void> {
    if (!globalThis.__r4DispSchemaPromise) {
        globalThis.__r4DispSchemaPromise = Promise.all([
            sql`
        CREATE TABLE IF NOT EXISTS bloqueios_clincare (
          id SERIAL PRIMARY KEY,
          professor_id INT NOT NULL,
          unidade_id INT NOT NULL,
          data DATE NOT NULL,
          hora_inicio TIME NOT NULL,
          hora_fim TIME NOT NULL,
          motivo TEXT,
          atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `,
            sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_ativo BOOLEAN DEFAULT false`,
            sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_inicio TIME`,
            sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_fim TIME`,
            sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS materias_series JSONB DEFAULT '{}'::jsonb`,
        ])
            .then(() => undefined)
            .catch((err) => {
                globalThis.__r4DispSchemaPromise = undefined;
                throw err;
            });
    }
    return globalThis.__r4DispSchemaPromise;
}

export async function GET(req: NextRequest) {
    try {
        await garantirEstruturaBanco();
        const modoChaveMestra = await obterModoChaveMestra();
        const statusSistema = avaliarStatusChaveMestra(modoChaveMestra);

        const { searchParams } = new URL(req.url);
        const unidadeIdParam = Number(searchParams.get('unidadeId') || 0);
        const dataParam = String(searchParams.get('data') || '').trim();
        const materiaParam = String(searchParams.get('materia') || '').trim();
        const serieParam = String(searchParams.get('serie') || '').trim();

        const unidades = (await sql`
      SELECT id, nome
      FROM unidades
      WHERE ativa = true
      ORDER BY id ASC
    `) as { id: number; nome: string }[];

        const overridesRaw = await sql`
      SELECT
        to_char(data, 'YYYY-MM-DD') AS data,
        ativo
      FROM datas_liberadas
      WHERE data >= (now() AT TIME ZONE 'America/Bahia')::date
    `;
        const overrides = overridesRaw as { data: string; ativo: boolean }[];

        const datas = gerarDatasDisponiveisSemana(modoChaveMestra, overrides);

        if (!statusSistema.aberto) {
            return NextResponse.json(
                {
                    sistemaAberto: false,
                    modoChaveMestra,
                    motivoFechado: statusSistema.motivoFechado,
                    unidadeIdSelecionada: unidades[0]?.id || 0,
                    dataSelecionada: '',
                    unidades,
                    datas: [],
                    materias: [],
                    professores: [],
                },
                { headers: { 'Cache-Control': 'no-store' } }
            );
        }

        const unidadeIdAtiva = unidadeIdParam || unidades[0]?.id || 0;
        const dataValidaNaLista = datas.some((d) => d.data === dataParam);
        const dataAtiva = dataValidaNaLista ? dataParam : datas[0]?.data || '';

        if (!unidadeIdAtiva || !dataAtiva) {
            return NextResponse.json(
                {
                    sistemaAberto: true,
                    modoChaveMestra,
                    motivoFechado: null,
                    unidadeIdSelecionada: unidadeIdAtiva,
                    dataSelecionada: dataAtiva,
                    unidades,
                    datas,
                    materias: [],
                    professores: [],
                },
                { headers: { 'Cache-Control': 'no-store' } }
            );
        }

        const professoresRaw = (await sql`
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
        COALESCE(to_char(hora_fim, 'HH24:MI'), '20:50') AS hora_fim
      FROM professores
      WHERE ativo = true
        AND unidade_id = ${unidadeIdAtiva}
      ORDER BY nome ASC
    `) as ProfessorRow[];

        const bloqueiosDia = (await sql`
      SELECT
        b.professor_id,
        p.clin_care_id,
        LEFT(b.hora_inicio::text, 5) AS hora_inicio,
        LEFT(b.hora_fim::text, 5) AS hora_fim,
        b.motivo
      FROM bloqueios_clincare b
      LEFT JOIN professores p ON p.id = b.professor_id
      WHERE LEFT(b.data::text, 10) = ${dataAtiva}
    `) as BloqueioRow[];

        const agendamentosDia = (await sql`
      SELECT
        a.professor_id,
        p.clin_care_id,
        LEFT(a.hora_inicio::text, 5) AS hora_inicio,
        LEFT(a.hora_fim::text, 5) AS hora_fim
      FROM agendamentos a
      LEFT JOIN professores p ON p.id = a.professor_id
      WHERE LEFT(a.data::text, 10) = ${dataAtiva}
        AND a.hora_inicio IS NOT NULL
        AND a.hora_fim IS NOT NULL
        AND COALESCE(a.status, 'confirmado') <> 'cancelado'
    `) as BloqueioRow[];

        // Filtra as matérias de cada professor conforme a série do aluno
        const professoresElegiveisSerie = professoresRaw
            .map((p) => {
                const todasMaterias = Array.isArray(p.materias) ? p.materias : [];
                const materiasValidas = filtrarMateriasProfessorPorSerie(
                    todasMaterias,
                    p.materias_series,
                    serieParam
                );
                return {
                    ...p,
                    materiasValidas,
                };
            })
            .filter((p) => p.materiasValidas.length > 0);

        const materiasUnicasSet = new Set<string>();
        for (const p of professoresElegiveisSerie) {
            for (const m of p.materiasValidas) {
                if (m && m.trim()) materiasUnicasSet.add(m.trim());
            }
        }
        const materias = Array.from(materiasUnicasSet).sort((a, b) =>
            a.localeCompare(b, 'pt-BR')
        );

        const professoresFiltrados =
            materiaParam && materiaParam !== 'todas'
                ? professoresElegiveisSerie.filter((p) =>
                    p.materiasValidas.some(
                        (m) => m.trim().toLowerCase() === materiaParam.toLowerCase()
                    )
                )
                : professoresElegiveisSerie;

        const professoresComHorarios = professoresFiltrados.map((prof) => {
            const bloqueiosDoProf = bloqueiosDia.filter(
                (b) =>
                    b.professor_id === prof.id ||
                    (prof.clin_care_id && b.clin_care_id === prof.clin_care_id)
            );

            const agendamentosDoProf = agendamentosDia.filter(
                (a) =>
                    a.professor_id === prof.id ||
                    (prof.clin_care_id && a.clin_care_id === prof.clin_care_id)
            );

            const { todosSlots, slotsDisponiveis } = obterSlotsDisponiveisProfessor(
                bloqueiosDoProf,
                agendamentosDoProf,
                {
                    manha_ativo: prof.manha_ativo,
                    manha_inicio: prof.manha_inicio,
                    manha_fim: prof.manha_fim,
                    hora_inicio: prof.hora_inicio,
                    hora_fim: prof.hora_fim,
                }
            );

            return {
                id: prof.id,
                nome: prof.nome,
                unidade_id: prof.unidade_id,
                materias: prof.materiasValidas,
                todosSlots,
                slotsDisponiveis,
            };
        });

        return NextResponse.json(
            {
                sistemaAberto: true,
                modoChaveMestra,
                motivoFechado: null,
                unidadeIdSelecionada: unidadeIdAtiva,
                dataSelecionada: dataAtiva,
                unidades,
                datas,
                materias,
                professores: professoresComHorarios,
            },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (error) {
        console.error('Erro ao consultar disponibilidade:', error);
        const detalhe = error instanceof Error ? error.message : String(error);
        return NextResponse.json(
            {
                error: `Erro interno ao buscar horários disponíveis: ${detalhe}`,
            },
            { status: 500 }
        );
    }
}