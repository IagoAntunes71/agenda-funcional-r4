import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    IntervaloOcupado,
    SLOTS_FIXOS_100_MIN,
    obterSlotsDisponiveisProfessor,
} from '@/lib/horarios-reforco';
import { normalizarTelefone } from '@/lib/cliente-helpers';
import { notificarGrupoNovoAgendamento } from '@/lib/whatsapp-notificacao';

async function garantirTabelaAgendamentos() {
    await sql`
    CREATE TABLE IF NOT EXISTS agendamentos (
      id SERIAL PRIMARY KEY,
      unidade_id INT,
      professor_id INT,
      aluno_id INT,
      materia TEXT,
      data DATE,
      hora_inicio TIME,
      hora_fim TIME,
      aluno_nome TEXT,
      aluno_telefone TEXT,
      colegio_nome TEXT,
      serie TEXT,
      responsavel_nome TEXT,
      observacoes TEXT,
      status TEXT NOT NULL DEFAULT 'confirmado',
      notificado_whatsapp BOOLEAN NOT NULL DEFAULT false,
      lancado_clincare BOOLEAN NOT NULL DEFAULT false,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS unidade_id INT`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS professor_id INT`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS aluno_id INT`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS materia TEXT`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS data DATE`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS hora_inicio TIME`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS hora_fim TIME`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS aluno_nome TEXT`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS aluno_telefone TEXT`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS colegio_nome TEXT`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS serie TEXT`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS responsavel_nome TEXT`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS observacoes TEXT`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'confirmado'`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS notificado_whatsapp BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS lancado_clincare BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ DEFAULT now()`;

    await sql`
    DO $$
    DECLARE
      col record;
    BEGIN
      FOR col IN
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'agendamentos'
          AND is_nullable = 'NO'
          AND column_name NOT IN (
            'id', 'unidade_id', 'professor_id', 'materia', 'data',
            'hora_inicio', 'hora_fim', 'aluno_nome', 'aluno_telefone', 'status'
          )
      LOOP
        EXECUTE format('ALTER TABLE agendamentos ALTER COLUMN %I DROP NOT NULL', col.column_name);
      END LOOP;
    END $$;
  `;
}

export async function POST(req: NextRequest) {
    try {
        await garantirTabelaAgendamentos();

        const body = await req.json();
        const unidadeId = Number(body?.unidadeId || 0);
        const professorId = Number(body?.professorId || 0);
        const alunoId = Number(body?.alunoId || 0) || null;
        const materia = String(body?.materia || '').trim();
        const data = String(body?.data || '').trim();
        const horaInicio = String(body?.horaInicio || '').trim();
        const alunoNome = String(body?.alunoNome || '').trim();
        const alunoTelefone = normalizarTelefone(String(body?.alunoTelefone || ''));
        const colegioNome = String(body?.colegioNome || '').trim();
        const serie = String(body?.serie || '').trim();
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
                { error: 'Dados incompletos para confirmar a aula.' },
                { status: 400 }
            );
        }

        let responsavelFinal = responsavelNome;
        if (!responsavelFinal && alunoTelefone) {
            const respRows = (await sql`
        SELECT responsavel_nome
        FROM alunos
        WHERE telefone = ${alunoTelefone}
          AND NULLIF(trim(responsavel_nome), '') IS NOT NULL
        ORDER BY id DESC
        LIMIT 1
      `) as { responsavel_nome: string }[];
            responsavelFinal = respRows[0]?.responsavel_nome?.trim() || '';
        } else if (responsavelFinal && alunoTelefone) {
            await sql`
        UPDATE alunos
        SET responsavel_nome = ${responsavelFinal}
        WHERE telefone = ${alunoTelefone}
          AND COALESCE(trim(responsavel_nome), '') = ''
      `;
        }

        const slotEscolhido = SLOTS_FIXOS_100_MIN.find(
            (s) => s.inicio === horaInicio
        );
        if (!slotEscolhido) {
            return NextResponse.json(
                {
                    error:
                        'Horário inválido. As aulas seguem turnos fixos de 100 minutos entre 14:10 e 20:50.',
                },
                { status: 400 }
            );
        }

        const dataValida = (await sql`
      SELECT data
      FROM datas_liberadas
      WHERE data = ${data}::date
        AND ativo = true
      LIMIT 1
    `) as { data: string }[];

        if (dataValida.length === 0) {
            return NextResponse.json(
                { error: 'A data selecionada não está liberada para agendamento.' },
                { status: 400 }
            );
        }

        // TRAVA DE CHOQUE DE HORÁRIO DO MESMO ALUNO
        const choqueAluno = (await sql`
      SELECT
        a.id,
        a.materia,
        COALESCE(p.nome, 'Professor') AS professor_nome
      FROM agendamentos a
      LEFT JOIN professores p ON p.id = a.professor_id
      WHERE LEFT(a.data::text, 10) = ${data}
        AND LEFT(COALESCE(a.hora_inicio, a.horario)::text, 5) = ${slotEscolhido.inicio}
        AND COALESCE(a.status, 'confirmado') <> 'cancelado'
        AND (
          (${alunoId}::int IS NOT NULL AND a.aluno_id = ${alunoId})
          OR (
            lower(trim(COALESCE(a.aluno_nome, a.nome_aluno, ''))) = lower(trim(${alunoNome}))
            AND regexp_replace(COALESCE(a.aluno_telefone, a.whatsapp_responsavel, ''), '\D', '', 'g') = ${alunoTelefone}
          )
        )
      LIMIT 1
    `) as { id: number; materia: string; professor_nome: string }[];

        if (choqueAluno.length > 0) {
            return NextResponse.json(
                {
                    error: `${alunoNome} já possui uma aula agendada neste mesmo horário (${slotEscolhido.label} — ${choqueAluno[0].materia} com Prof. ${choqueAluno[0].professor_nome}).`,
                },
                { status: 409 }
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
        LEFT(b.hora_inicio::text, 5) AS hora_inicio,
        LEFT(b.hora_fim::text, 5) AS hora_fim,
        b.motivo
      FROM bloqueios_clincare b
      LEFT JOIN professores p ON p.id = b.professor_id
      WHERE LEFT(b.data::text, 10) = ${data}
        AND (
          b.professor_id = ${prof.id}
          OR (${prof.clin_care_id}::text IS NOT NULL AND p.clin_care_id = ${prof.clin_care_id})
        )
    `) as IntervaloOcupado[];

        const agendamentosProf = (await sql`
      SELECT
        LEFT(a.hora_inicio::text, 5) AS hora_inicio,
        LEFT(a.hora_fim::text, 5) AS hora_fim
      FROM agendamentos a
      LEFT JOIN professores p ON p.id = a.professor_id
      WHERE LEFT(a.data::text, 10) = ${data}
        AND a.hora_inicio IS NOT NULL
        AND a.hora_fim IS NOT NULL
        AND COALESCE(a.status, 'confirmado') <> 'cancelado'
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
        aluno_id,
        materia,
        data,
        hora_inicio,
        hora_fim,
        aluno_nome,
        aluno_telefone,
        colegio_nome,
        serie,
        responsavel_nome,
        observacoes,
        status,
        notificado_whatsapp,
        lancado_clincare
      )
      VALUES (
        ${unidadeId},
        ${prof.id},
        ${alunoId},
        ${materia},
        ${data}::date,
        ${slotEscolhido.inicio}::time,
        ${slotEscolhido.fim}::time,
        ${alunoNome},
        ${alunoTelefone},
        ${colegioNome || null},
        ${serie || null},
        ${responsavelFinal || null},
        ${observacoes || null},
        'confirmado',
        false,
        false
      )
      RETURNING id
    `) as { id: number }[];

        const agendamentoId = inserido[0]?.id;

        const unidadeRows = (await sql`
      SELECT nome FROM unidades WHERE id = ${unidadeId} LIMIT 1
    `) as { nome: string }[];
        const nomeUnidade = unidadeRows[0]?.nome || 'Unidade';

        const notif = await notificarGrupoNovoAgendamento({
            id: agendamentoId,
            unidade: nomeUnidade,
            professor: prof.nome,
            materia,
            data,
            horario: slotEscolhido.label,
            alunoNome,
            alunoTelefone,
            colegioNome,
            serie,
            observacoes,
        });

        if (notif.enviado && agendamentoId) {
            await sql`
        UPDATE agendamentos
        SET notificado_whatsapp = true
        WHERE id = ${agendamentoId}
      `;
        }

        return NextResponse.json(
            {
                sucesso: true,
                notificadoWhatsApp: notif.enviado,
                agendamento: {
                    id: agendamentoId,
                    unidade: nomeUnidade,
                    professor: prof.nome,
                    materia,
                    data,
                    horario: slotEscolhido.label,
                    alunoNome,
                    colegioNome,
                    serie,
                    linkWaMe: notif.linkWaMe,
                },
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Erro ao registrar agendamento:', error);
        const detalhe = error instanceof Error ? error.message : String(error);
        return NextResponse.json(
            { error: `Não foi possível concluir o agendamento: ${detalhe}` },
            { status: 500 }
        );
    }
}