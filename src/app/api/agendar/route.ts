import { NextRequest, NextResponse } from 'next/server';
import {
    LIMITE_AGENDAMENTOS_SIMULTANEOS,
    buscarFamiliaPorTelefone,
    lerSessaoCliente,
} from '@/lib/cliente-auth';
import { sql } from '@/lib/db';
import {
    IntervaloOcupado,
    avaliarStatusChaveMestra,
    gerarDatasDisponiveisSemana,
    gerarTodosSlotsProfessor,
    obterSlotsDisponiveisProfessor,
} from '@/lib/horarios-reforco';
import {
    gerarVariantesTelefone,
    normalizarTelefone,
} from '@/lib/cliente-helpers';
import { notificarGrupoNovoAgendamento } from '@/lib/whatsapp-notificacao';
import { obterModoChaveMestra } from '@/app/api/admin/configuracoes/route';
import {
    dispararRoboReservaClinCare,
    garantirColunasFilaReserva,
} from '@/lib/clincare-fila';

declare global {
    // eslint-disable-next-line no-var
    var __r4AgendarSchemaPromise: Promise<void> | undefined;
}

function garantirTabelaAgendamentos(): Promise<void> {
    if (!globalThis.__r4AgendarSchemaPromise) {
        globalThis.__r4AgendarSchemaPromise = (async () => {
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

            await Promise.all([
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS unidade_id INT`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS professor_id INT`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS aluno_id INT`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS materia TEXT`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS data DATE`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS hora_inicio TIME`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS hora_fim TIME`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS aluno_nome TEXT`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS aluno_telefone TEXT`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS colegio_nome TEXT`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS serie TEXT`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS responsavel_nome TEXT`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS observacoes TEXT`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'confirmado'`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS notificado_whatsapp BOOLEAN DEFAULT false`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS lancado_clincare BOOLEAN DEFAULT false`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ DEFAULT now()`,
                sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_ativo BOOLEAN DEFAULT false`,
                sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_inicio TIME`,
                sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_fim TIME`,
                garantirColunasFilaReserva(),
            ]);
        })().catch((err) => {
            globalThis.__r4AgendarSchemaPromise = undefined;
            throw err;
        });
    }
    return globalThis.__r4AgendarSchemaPromise;
}

export async function POST(req: NextRequest) {
    try {
        await garantirTabelaAgendamentos();

        const modoChaveMestra = await obterModoChaveMestra();
        const statusSistema = avaliarStatusChaveMestra(modoChaveMestra);
        if (!statusSistema.aberto) {
            return NextResponse.json(
                {
                    error:
                        statusSistema.motivoFechado ||
                        'O agendamento online está fechado no momento.',
                },
                { status: 403 }
            );
        }

        const body = await req.json();
        const unidadeId = Number(body?.unidadeId || 0);
        const professorId = Number(body?.professorId || 0);
        const alunoId = Number(body?.alunoId || 0) || null;
        const materia = String(body?.materia || '').trim();
        const data = String(body?.data || '').trim();
        const horaInicio = String(body?.horaInicio || '').trim();
        const alunoNome = String(body?.alunoNome || '').trim();
        const alunoTelefoneRaw = String(body?.alunoTelefone || '');
        const alunoTelefone = normalizarTelefone(alunoTelefoneRaw);
        const variantesTelefone = gerarVariantesTelefone(alunoTelefoneRaw);
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
            !alunoTelefone ||
            variantesTelefone.length === 0
        ) {
            return NextResponse.json(
                { error: 'Dados incompletos para confirmar a aula.' },
                { status: 400 }
            );
        }

        const overridesRaw = await sql`
      SELECT
        to_char(data, 'YYYY-MM-DD') AS data,
        ativo
      FROM datas_liberadas
      WHERE data >= (now() AT TIME ZONE 'America/Bahia')::date
    `;
        const datasPermitidas = gerarDatasDisponiveisSemana(
            modoChaveMestra,
            overridesRaw as { data: string; ativo: boolean }[]
        );

        if (!datasPermitidas.some((d) => d.data === data)) {
            return NextResponse.json(
                {
                    error:
                        'Esta data não está disponível para agendamento online. Aulas para a próxima semana devem ser marcadas com o atendimento humano (segunda a sexta, das 08:00 às 18:00).',
                },
                { status: 400 }
            );
        }

        const profRows = (await sql`
      SELECT
        id,
        nome,
        clin_care_id,
        unidade_id,
        COALESCE(manha_ativo, false) AS manha_ativo,
        to_char(manha_inicio, 'HH24:MI') AS manha_inicio,
        to_char(manha_fim, 'HH24:MI') AS manha_fim,
        COALESCE(to_char(hora_inicio, 'HH24:MI'), '14:10') AS hora_inicio,
        COALESCE(to_char(hora_fim, 'HH24:MI'), '20:50') AS hora_fim
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
            manha_ativo: boolean;
            manha_inicio: string | null;
            manha_fim: string | null;
            hora_inicio: string;
            hora_fim: string;
        }[];

        if (profRows.length === 0) {
            return NextResponse.json(
                { error: 'Professor não encontrado ou inativo nesta unidade.' },
                { status: 404 }
            );
        }

        const prof = profRows[0];
        const slotsConfiguradosProf = gerarTodosSlotsProfessor(prof);
        const slotEscolhido = slotsConfiguradosProf.find(
            (s) => s.inicio === horaInicio
        );

        if (!slotEscolhido) {
            return NextResponse.json(
                {
                    error:
                        'Horário inválido para a grade de 100 minutos deste professor.',
                },
                { status: 400 }
            );
        }

        const sessaoCliente = await lerSessaoCliente();
        if (!sessaoCliente) {
            return NextResponse.json(
                { error: 'Sessão expirada. Confirme seu WhatsApp e PIN para agendar.' },
                { status: 401 }
            );
        }

        const familia = await buscarFamiliaPorTelefone(sessaoCliente.telefone);
        const alunoSelecionado = familia.alunos.find(
            (a) => a.id === Number(alunoId)
        );

        if (!alunoSelecionado) {
            return NextResponse.json(
                { error: 'Aluno não vinculado ao WhatsApp autenticado.' },
                { status: 403 }
            );
        }

        if (
            alunoSelecionado.agendamentos_futuros >= LIMITE_AGENDAMENTOS_SIMULTANEOS
        ) {
            return NextResponse.json(
                {
                    error: `Este aluno já possui ${LIMITE_AGENDAMENTOS_SIMULTANEOS} aulas futuras agendadas. Conclua ou cancele uma aula antes de marcar outra.`,
                },
                { status: 409 }
            );
        }

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
            AND regexp_replace(
              regexp_replace(COALESCE(a.aluno_telefone, a.whatsapp_responsavel, ''), '\D', '', 'g'),
              '^55(?=\d{10,11}$)',
              ''
            ) = ANY(${variantesTelefone}::text[])
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

        let responsavelFinal = responsavelNome || familia.responsavelNome || '';
        if (!responsavelFinal && variantesTelefone.length > 0) {
            const respRows = (await sql`
        SELECT responsavel_nome
        FROM alunos
        WHERE regexp_replace(
          regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
          '^55(?=\d{10,11}$)',
          ''
        ) = ANY(${variantesTelefone}::text[])
          AND NULLIF(trim(responsavel_nome), '') IS NOT NULL
        ORDER BY id DESC
        LIMIT 1
      `) as { responsavel_nome: string }[];
            responsavelFinal = respRows[0]?.responsavel_nome?.trim() || '';
        }

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

        const { slotsDisponiveis } = obterSlotsDisponiveisProfessor(
            bloqueiosProf,
            agendamentosProf,
            prof
        );

        const continuaLivre = slotsDisponiveis.some(
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

        const unidadeRows = (await sql`
      SELECT nome, COALESCE(clin_care_id, '') AS clin_care_id
      FROM unidades
      WHERE id = ${unidadeId}
      LIMIT 1
    `) as { nome: string; clin_care_id: string }[];

        const nomeUnidade = unidadeRows[0]?.nome || 'Unidade';
        const clinCareUnidadeId = unidadeRows[0]?.clin_care_id || '';
        const unidadeTemClinCare =
            clinCareUnidadeId.length > 0 && !clinCareUnidadeId.startsWith('id-');
        const statusInicialReserva = unidadeTemClinCare
            ? 'pendente'
            : 'nao_aplicavel';

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
        lancado_clincare,
        clincare_reserva_status
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
        false,
        ${statusInicialReserva}
      )
      RETURNING id
    `) as { id: number }[];

        const agendamentoId = inserido[0]?.id;

        if (unidadeTemClinCare && agendamentoId) {
            await dispararRoboReservaClinCare(agendamentoId);
        }

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