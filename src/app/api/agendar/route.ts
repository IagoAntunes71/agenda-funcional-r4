import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    IntervaloOcupado,
    SLOTS_FIXOS_100_MIN,
    obterSlotsDisponiveisProfessor,
} from '@/lib/horarios-reforco';

async function garantirTabelaAgendamentos() {
    await sql`
    CREATE TABLE IF NOT EXISTS agendamentos (
      id SERIAL PRIMARY KEY,
      unidade_id INT NOT NULL,
      professor_id INT NOT NULL,
      materia TEXT NOT NULL,
      data DATE NOT NULL,
      hora_inicio TIME NOT NULL,
      hora_fim TIME NOT NULL,
      aluno_nome TEXT NOT NULL,
      aluno_telefone TEXT NOT NULL,
      responsavel_nome TEXT,
      observacoes TEXT,
      status TEXT NOT NULL DEFAULT 'confirmado',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

export async function POST(req: NextRequest) {
    try {
        await garantirTabelaAgendamentos();

        const body = await req.json();
        const unidadeId = Number(body?.unidadeId || 0);
        const professorId = Number(body?.professorId || 0);
        const materia = String(body?.materia || '').trim();
        const data = String(body?.data || '').trim();
        const horaInicio = String(body?.horaInicio || '').trim();
        const alunoNome = String(body?.alunoNome || '').trim();
        const alunoTelefone = String(body?.alunoTelefone || '').trim();
        const responsavelNome = String(body?.responsavelNome || '').trim();
        const observacoes = String(body?.observacoes || '').trim();

        if (
            !unidadeId ||
            !professorId ||
            !materia ||
            !data ||
            !horaInicio ||
            !alunoNome ||
            !alunoTelefone
        ) {
            return NextResponse.json(
                { error: 'Preencha todos os campos obrigatórios para confirmar a aula.' },
                { status: 400 }
            );
        }

        const slotEscolhido = SLOTS_FIXOS_100_MIN.find(
            (s) => s.inicio === horaInicio
        );
        if (!slotEscolhido) {
            return NextResponse.json(
                {
                    error:
                        'Horário inválido. As aulas de reforço seguem turnos fixos de 100 minutos entre 14:10 e 20:50.',
                },
                { status: 400 }
            );
        }

        const dataValida = (await sql`
      SELECT id
      FROM datas_liberadas
      WHERE data = ${data}::date
        AND ativo = true
      LIMIT 1
    `) as { id: number }[];

        if (dataValida.length === 0) {
            return NextResponse.json(
                { error: 'A data selecionada não está liberada para agendamento.' },
                { status: 400 }
            );
        }

        const profRows = (await sql`
      SELECT id, nome, clin_care_id, unidade_id
      FROM professores
      WHERE id = ${professorId}
        AND unidade_id = ${unidadeId}
        AND ativo = true
      LIMIT 1
    `) as {
            id: number;
            nome: string;
            clin_care_id: string | null;
            unidade_id: number;
        }[];

        if (profRows.length === 0) {
            return NextResponse.json(
                { error: 'Professor não encontrado ou inativo nesta unidade.' },
                { status: 404 }
            );
        }

        const prof = profRows[0];

        const bloqueiosProf = (await sql`
      SELECT
        to_char(b.hora_inicio, 'HH24:MI') AS hora_inicio,
        to_char(b.hora_fim, 'HH24:MI') AS hora_fim,
        b.motivo
      FROM bloqueios_clincare b
      LEFT JOIN professores p ON p.id = b.professor_id
      WHERE b.data = ${data}::date
        AND (
          b.professor_id = ${prof.id}
          OR (${prof.clin_care_id}::text IS NOT NULL AND p.clin_care_id = ${prof.clin_care_id})
        )
    `) as IntervaloOcupado[];

        const agendamentosProf = (await sql`
      SELECT
        to_char(a.hora_inicio, 'HH24:MI') AS hora_inicio,
        to_char(a.hora_fim, 'HH24:MI') AS hora_fim
      FROM agendamentos a
      LEFT JOIN professores p ON p.id = a.professor_id
      WHERE a.data = ${data}::date
        AND a.status <> 'cancelado'
        AND (
          a.professor_id = ${prof.id}
          OR (${prof.clin_care_id}::text IS NOT NULL AND p.clin_care_id = ${prof.clin_care_id})
        )
    `) as IntervaloOcupado[];

        const slotsLivres = obterSlotsDisponiveisProfessor(
            bloqueiosProf,
            agendamentosProf
        );

        const continuaLivre = slotsLivres.some(
            (s) => s.inicio === slotEscolhido.inicio
        );

        if (!continuaLivre) {
            return NextResponse.json(
                {
                    error:
                        'Este horário está bloqueado ou acabou de ser ocupado na agenda do professor. Escolha outro horário.',
                },
                { status: 409 }
            );
        }

        const inserido = (await sql`
      INSERT INTO agendamentos (
        unidade_id,
        professor_id,
        materia,
        data,
        hora_inicio,
        hora_fim,
        aluno_nome,
        aluno_telefone,
        responsavel_nome,
        observacoes,
        status
      )
      VALUES (
        ${unidadeId},
        ${prof.id},
        ${materia},
        ${data}::date,
        ${slotEscolhido.inicio}::time,
        ${slotEscolhido.fim}::time,
        ${alunoNome},
        ${alunoTelefone},
        ${responsavelNome || null},
        ${observacoes || null},
        'confirmado'
      )
      RETURNING id
    `) as { id: number }[];

        const unidadeRows = (await sql`
      SELECT nome FROM unidades WHERE id = ${unidadeId} LIMIT 1
    `) as { nome: string }[];

        return NextResponse.json(
            {
                sucesso: true,
                agendamento: {
                    id: inserido[0]?.id,
                    unidade: unidadeRows[0]?.nome || '',
                    professor: prof.nome,
                    materia,
                    data,
                    horario: slotEscolhido.label,
                    alunoNome,
                },
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Erro ao registrar agendamento:', error);
        return NextResponse.json(
            { error: 'Não foi possível concluir o agendamento. Tente novamente.' },
            { status: 500 }
        );
    }
}