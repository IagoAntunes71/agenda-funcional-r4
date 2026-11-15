import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    IntervaloOcupado,
    obterSlotsDisponiveisProfessor,
} from '@/lib/horarios-reforco';

interface ProfessorRow {
    id: number;
    nome: string;
    clin_care_id: string | null;
    unidade_id: number;
    materias: string[] | null;
}

interface BloqueioRow extends IntervaloOcupado {
    professor_id: number;
    clin_care_id: string | null;
}

async function garantirEstruturaBanco() {
    await sql`
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
  `;

    await sql`
    CREATE TABLE IF NOT EXISTS agendamentos (
      id SERIAL PRIMARY KEY,
      unidade_id INT,
      professor_id INT,
      materia TEXT,
      data DATE,
      hora_inicio TIME,
      hora_fim TIME,
      aluno_nome TEXT,
      aluno_telefone TEXT,
      responsavel_nome TEXT,
      observacoes TEXT,
      status TEXT NOT NULL DEFAULT 'confirmado',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS unidade_id INT`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS professor_id INT`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS materia TEXT`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS data DATE`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS hora_inicio TIME`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS hora_fim TIME`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS aluno_nome TEXT`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS aluno_telefone TEXT`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS responsavel_nome TEXT`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS observacoes TEXT`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'confirmado'`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ DEFAULT now()`;
}

export async function GET(req: NextRequest) {
    try {
        await garantirEstruturaBanco();

        const { searchParams } = new URL(req.url);
        const unidadeIdParam = Number(searchParams.get('unidadeId') || 0);
        const dataParam = String(searchParams.get('data') || '').trim();
        const materiaParam = String(searchParams.get('materia') || '').trim();

        const unidades = (await sql`
      SELECT id, nome
      FROM unidades
      WHERE ativa = true
      ORDER BY id ASC
    `) as { id: number; nome: string }[];

        const datas = (await sql`
      SELECT
        to_char(data, 'YYYY-MM-DD') AS data,
        to_char(data, 'DD/MM/YYYY') AS data_formatada
      FROM datas_liberadas
      WHERE ativo = true
        AND data >= (now() AT TIME ZONE 'America/Bahia')::date
      ORDER BY data ASC
    `) as { data: string; data_formatada: string }[];

        const unidadeIdAtiva = unidadeIdParam || unidades[0]?.id || 0;
        const dataAtiva = dataParam || datas[0]?.data || '';

        if (!unidadeIdAtiva || !dataAtiva) {
            return NextResponse.json(
                {
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
        materias
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

        const materiasUnicasSet = new Set<string>();
        for (const p of professoresRaw) {
            if (Array.isArray(p.materias)) {
                for (const m of p.materias) {
                    if (m && m.trim()) materiasUnicasSet.add(m.trim());
                }
            }
        }
        const materias = Array.from(materiasUnicasSet).sort((a, b) =>
            a.localeCompare(b, 'pt-BR')
        );

        const professoresFiltrados =
            materiaParam && materiaParam !== 'todas'
                ? professoresRaw.filter((p) =>
                    Array.isArray(p.materias)
                        ? p.materias.some(
                            (m) => m.trim().toLowerCase() === materiaParam.toLowerCase()
                        )
                        : false
                )
                : professoresRaw;

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

            const slotsDisponiveis = obterSlotsDisponiveisProfessor(
                bloqueiosDoProf,
                agendamentosDoProf
            );

            return {
                id: prof.id,
                nome: prof.nome,
                unidade_id: prof.unidade_id,
                materias: Array.isArray(prof.materias) ? prof.materias : [],
                slotsDisponiveis,
                bloqueios: bloqueiosDoProf.map((b) => ({
                    hora_inicio: b.hora_inicio,
                    hora_fim: b.hora_fim,
                    motivo: b.motivo || 'Ocupado',
                })),
            };
        });

        return NextResponse.json(
            {
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