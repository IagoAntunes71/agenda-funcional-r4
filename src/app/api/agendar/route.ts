import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            unidade_id,
            professor_id,
            materia,
            data,
            horario,
            nome_responsavel,
            whatsapp_responsavel,
            nome_aluno,
            serie_aluno,
            observacoes,
        } = body;

        if (
            !unidade_id ||
            !professor_id ||
            !materia ||
            !data ||
            !horario ||
            !nome_responsavel?.trim() ||
            !whatsapp_responsavel?.trim() ||
            !nome_aluno?.trim() ||
            !serie_aluno?.trim()
        ) {
            return NextResponse.json(
                { error: 'Preencha todos os campos obrigatórios antes de confirmar.' },
                { status: 400 }
            );
        }

        const dataValida = await sql`
      SELECT id FROM datas_liberadas
      WHERE data = ${data}::date AND ativo = true
      LIMIT 1
    `;

        if (dataValida.length === 0) {
            return NextResponse.json(
                { error: 'A data selecionada não está disponível para agendamento.' },
                { status: 400 }
            );
        }

        const bloqueado = await sql`
      SELECT id FROM bloqueios_clincare
      WHERE professor_id = ${professor_id}
        AND data = ${data}::date
        AND ${horario}::time >= hora_inicio
        AND ${horario}::time < hora_fim
      LIMIT 1
    `;

        if (bloqueado.length > 0) {
            return NextResponse.json(
                { error: 'Este horário foi bloqueado na agenda da unidade. Escolha outro horário.' },
                { status: 409 }
            );
        }

        const ano = new Date().getFullYear();
        const sufixo = Math.floor(1000 + Math.random() * 9000);
        const protocolo = `AG-${ano}-${sufixo}`;

        const inseridos = await sql`
      INSERT INTO agendamentos (
        protocolo,
        unidade_id,
        professor_id,
        materia,
        data,
        horario,
        nome_responsavel,
        whatsapp_responsavel,
        nome_aluno,
        serie_aluno,
        observacoes
      )
      VALUES (
        ${protocolo},
        ${unidade_id},
        ${professor_id},
        ${materia},
        ${data}::date,
        ${horario}::time,
        ${nome_responsavel.trim()},
        ${whatsapp_responsavel.trim()},
        ${nome_aluno.trim()},
        ${serie_aluno.trim()},
        ${observacoes?.trim() || null}
      )
      RETURNING
        id,
        protocolo,
        to_char(data, 'YYYY-MM-DD') AS data,
        to_char(horario, 'HH24:MI') AS horario
    `;

        return NextResponse.json({
            ok: true,
            agendamento: inseridos[0],
        });
    } catch (err: unknown) {
        const pgErr = err as { code?: string; message?: string };
        if (
            pgErr?.code === '23505' ||
            pgErr?.message?.includes('idx_agendamento_unico_ativo')
        ) {
            return NextResponse.json(
                {
                    error:
                        'Esse horário acabou de ser reservado por outro responsável. Escolha outro horário disponível.',
                },
                { status: 409 }
            );
        }

        console.error('Erro ao salvar agendamento:', err);
        return NextResponse.json(
            { error: 'Não foi possível concluir o agendamento. Tente novamente.' },
            { status: 500 }
        );
    }
}