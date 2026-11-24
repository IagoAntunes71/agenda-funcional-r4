import { NextRequest, NextResponse } from 'next/server';
import { garantirHistoricoAgendamento } from '@/lib/agendamento-historico';
import { sql } from '@/lib/db';
import {
    dispararRoboReservaClinCare,
    garantirColunasFilaReserva,
} from '@/lib/clincare-fila';
import {
    gerarVariantesTelefone,
    normalizarTelefone,
} from '@/lib/cliente-helpers';
import { notificarGrupoCancelamentoAgendamento } from '@/lib/whatsapp-notificacao';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const whatsapp = searchParams.get('whatsapp') || '';
    const telefoneNorm = normalizarTelefone(whatsapp);
    const variantes = gerarVariantesTelefone(whatsapp);

    if (telefoneNorm.length < 10 || variantes.length === 0) {
        return NextResponse.json({ agendamentos: [] });
    }

    try {
        await garantirHistoricoAgendamento();
        const agendamentos = await sql`
      SELECT
        a.id,
        a.protocolo,
        u.nome AS unidade_nome,
        p.nome AS professor_nome,
        a.materia,
        to_char(a.data, 'YYYY-MM-DD') AS data,
        to_char(COALESCE(a.hora_inicio, a.horario), 'HH24:MI') AS horario,
        COALESCE(a.aluno_nome, a.nome_aluno) AS nome_aluno,
        COALESCE(a.colegio_nome, a.colegio_aluno) AS colegio_aluno,
        COALESCE(a.serie, a.serie_aluno) AS serie_aluno,
        a.status
      FROM agendamentos a
      JOIN unidades u ON u.id = a.unidade_id
      JOIN professores p ON p.id = a.professor_id
      WHERE regexp_replace(
        regexp_replace(COALESCE(a.aluno_telefone, a.whatsapp_responsavel, ''), '\D', '', 'g'),
        '^55(?=\d{10,11}$)',
        ''
      ) = ANY(${variantes}::text[])
        AND a.excluido_em IS NULL
        AND a.data >= (now() AT TIME ZONE 'America/Bahia')::date
      ORDER BY a.data ASC, COALESCE(a.hora_inicio, a.horario) ASC
      LIMIT 20
    `;

        return NextResponse.json({ agendamentos });
    } catch (error) {
        console.error('Erro ao listar agendamentos do cliente:', error);
        return NextResponse.json(
            { error: 'Falha ao consultar agendamentos.' },
            { status: 500 }
        );
    }
}

export async function PATCH(req: NextRequest) {
    try {
        await garantirColunasFilaReserva();
        await garantirHistoricoAgendamento();

        const { id, whatsapp } = await req.json();
        const whatsappRaw = String(whatsapp || '');
        const telefoneNorm = normalizarTelefone(whatsappRaw);
        const variantes = gerarVariantesTelefone(whatsappRaw);

        if (!id || telefoneNorm.length < 10 || variantes.length === 0) {
            return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
        }

        const [, atualizados] = await sql.transaction([
            sql`SELECT set_config('r4.ator_agenda', 'Responsável · Portal do Aluno', true)`,
            sql`
      UPDATE agendamentos
      SET
        status = 'cancelado',
        clincare_reserva_status = CASE
          WHEN COALESCE(clincare_reserva_status, '') IN ('reservado', 'reservando') THEN 'cancelar_pendente'
          ELSE 'cancelado_clincare'
        END
      WHERE id = ${Number(id)}
        AND regexp_replace(
          regexp_replace(COALESCE(aluno_telefone, whatsapp_responsavel, ''), '\D', '', 'g'),
          '^55(?=\d{10,11}$)',
          ''
        ) = ANY(${variantes}::text[])
        AND status = 'confirmado' AND excluido_em IS NULL
      RETURNING id, clincare_reserva_status
    `,
        ]);

        if (atualizados.length === 0) {
            return NextResponse.json(
                { error: 'Agendamento não encontrado ou já cancelado.' },
                { status: 404 }
            );
        }

        if (atualizados[0].clincare_reserva_status === 'cancelar_pendente') {
            await dispararRoboReservaClinCare();
        }

        const detalhesRows = (await sql`
      SELECT
        a.id,
        COALESCE(u.nome, 'Unidade') AS unidade_nome,
        COALESCE(p.nome, 'Professor') AS professor_nome,
        COALESCE(a.materia, '') AS materia,
        to_char(a.data, 'YYYY-MM-DD') AS data,
        COALESCE(
          CASE
            WHEN a.hora_inicio IS NOT NULL AND a.hora_fim IS NOT NULL
              THEN to_char(a.hora_inicio, 'HH24:MI') || ' às ' || to_char(a.hora_fim, 'HH24:MI')
            WHEN a.hora_inicio IS NOT NULL
              THEN to_char(a.hora_inicio, 'HH24:MI')
            ELSE NULL
          END,
          to_char(a.horario, 'HH24:MI'),
          ''
        ) AS horario,
        COALESCE(NULLIF(trim(a.aluno_nome), ''), NULLIF(trim(a.nome_aluno), ''), 'Aluno') AS aluno_nome,
        COALESCE(NULLIF(trim(a.aluno_telefone), ''), NULLIF(trim(a.whatsapp_responsavel), ''), ${telefoneNorm}) AS aluno_telefone,
        COALESCE(NULLIF(trim(a.responsavel_nome), ''), NULLIF(trim(r.nome), ''), NULLIF(trim(al.responsavel_nome), ''), '') AS responsavel_nome
      FROM agendamentos a
      LEFT JOIN unidades u ON u.id = a.unidade_id
      LEFT JOIN professores p ON p.id = a.professor_id
      LEFT JOIN alunos al ON al.id = a.aluno_id
      LEFT JOIN responsaveis r ON r.id = al.responsavel_id
      WHERE a.id = ${Number(id)}
      LIMIT 1
    `) as {
            id: number;
            unidade_nome: string;
            professor_nome: string;
            materia: string;
            data: string;
            horario: string;
            aluno_nome: string;
            aluno_telefone: string;
            responsavel_nome: string;
        }[];

        if (detalhesRows.length > 0) {
            const d = detalhesRows[0];
            await notificarGrupoCancelamentoAgendamento({
                id: d.id,
                unidade: d.unidade_nome,
                professor: d.professor_nome,
                materia: d.materia,
                data: d.data,
                horario: d.horario,
                responsavelNome: d.responsavel_nome,
                alunoNome: d.aluno_nome,
                alunoTelefone: d.aluno_telefone || telefoneNorm,
            }).catch((err) => {
                console.error('Erro ao notificar cancelamento para o grupo:', err);
            });
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Erro ao cancelar agendamento:', error);
        return NextResponse.json(
            { error: 'Não foi possível cancelar o agendamento.' },
            { status: 500 }
        );
    }
}