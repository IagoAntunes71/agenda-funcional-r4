import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const whatsapp = searchParams.get('whatsapp') || '';
    const apenasNumeros = whatsapp.replace(/\D/g, '');

    if (apenasNumeros.length < 10) {
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
        to_char(a.horario, 'HH24:MI') AS horario,
        a.nome_aluno,
        a.colegio_aluno,
        a.serie_aluno,
        a.status
      FROM agendamentos a
      JOIN unidades u ON u.id = a.unidade_id
      JOIN professores p ON p.id = a.professor_id
      WHERE regexp_replace(a.whatsapp_responsavel, '\D', '', 'g') = ${apenasNumeros}
        AND a.data >= (now() AT TIME ZONE 'America/Bahia')::date
      ORDER BY a.data ASC, a.horario ASC
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
        const { id, whatsapp } = await req.json();
        const apenasNumeros = String(whatsapp || '').replace(/\D/g, '');

        if (!id || apenasNumeros.length < 10) {
            return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
        }

        const atualizados = await sql`
      UPDATE agendamentos
      SET status = 'cancelado'
      WHERE id = ${Number(id)}
        AND regexp_replace(whatsapp_responsavel, '\D', '', 'g') = ${apenasNumeros}
        AND status = 'confirmado'
      RETURNING id
    `;

        if (atualizados.length === 0) {
            return NextResponse.json(
                { error: 'Agendamento não encontrado ou já cancelado.' },
                { status: 404 }
            );
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