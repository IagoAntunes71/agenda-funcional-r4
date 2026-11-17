import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    dispararRoboReservaClinCare,
    garantirColunasFilaReserva,
} from '@/lib/clincare-fila';
import {
    gerarVariantesTelefone,
    normalizarTelefone,
} from '@/lib/cliente-helpers';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const whatsapp = searchParams.get('whatsapp') || '';
    const telefoneNorm = normalizarTelefone(whatsapp);
    const variantes = gerarVariantesTelefone(whatsapp);

    if (telefoneNorm.length < 10 || variantes.length === 0) {
        return NextResponse.json({ agendamentos: [] });
    }

    try {
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

        const { id, whatsapp } = await req.json();
        const whatsappRaw = String(whatsapp || '');
        const telefoneNorm = normalizarTelefone(whatsappRaw);
        const variantes = gerarVariantesTelefone(whatsappRaw);

        if (!id || telefoneNorm.length < 10 || variantes.length === 0) {
            return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
        }

        const atualizados = (await sql`
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
        AND status = 'confirmado'
      RETURNING id, clincare_reserva_status
    `) as { id: number; clincare_reserva_status: string }[];

        if (atualizados.length === 0) {
            return NextResponse.json(
                { error: 'Agendamento não encontrado ou já cancelado.' },
                { status: 404 }
            );
        }

        if (atualizados[0].clincare_reserva_status === 'cancelar_pendente') {
            await dispararRoboReservaClinCare();
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