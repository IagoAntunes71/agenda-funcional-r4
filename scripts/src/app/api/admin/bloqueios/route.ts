/**
 * ARQUIVO: src/app/api/admin/bloqueios/route.ts
 * FUNÇÃO: Cria (POST) e exclui (DELETE) bloqueios de agenda na tabela `bloqueios_clincare`
 * com origem = 'manual'. Permite que tanto Atendimento/Admin quanto o próprio Professor
 * bloqueiem horários na agenda (com início, duração e recorrência), refletindo também
 * no Portal do Aluno para impedir reservas nesses intervalos.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { lerSessaoAdmin } from '@/lib/admin-auth';
import { calcularHoraFim } from '@/lib/agenda-status-r4';
import { adicionarDiasISO } from '@/lib/horarios-reforco';

async function garantirColunasBloqueios() {
    await Promise.all([
        sql`ALTER TABLE bloqueios_clincare ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'clincare'`,
        sql`ALTER TABLE bloqueios_clincare ADD COLUMN IF NOT EXISTS descricao TEXT`,
        sql`ALTER TABLE bloqueios_clincare ADD COLUMN IF NOT EXISTS criado_por_nome TEXT`,
    ]);
}

export async function POST(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    if (!sessao) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirColunasBloqueios();

        const body = await req.json();
        const professorIdInput =
            sessao.role === 'professor'
                ? Number(sessao.professor_id || 0)
                : Number(body?.professor_id || 0);
        const titulo = String(body?.motivo || '').trim() || 'Bloqueio de agenda';
        const descricao = String(body?.descricao || '').trim();
        const dataBase = String(body?.data || '').trim();
        const horaInicio = String(body?.hora_inicio || '').trim();
        const duracaoMinutos = Number(body?.duracao_minutos || 60);
        const semanasRecorrencia = Math.min(
            8,
            Math.max(1, Number(body?.recorrencia_semanas || 1))
        );

        if (!professorIdInput || !dataBase || !horaInicio) {
            return NextResponse.json(
                { error: 'Informe professor, data e horário de início do bloqueio.' },
                { status: 400 }
            );
        }

        if (duracaoMinutos < 10 || duracaoMinutos > 840) {
            return NextResponse.json(
                { error: 'Duração do bloqueio inválida.' },
                { status: 400 }
            );
        }

        const horaFim = calcularHoraFim(horaInicio, duracaoMinutos);

        // Localiza todos os registros do mesmo professor (caso atue em mais de uma unidade)
        const profRows = (await sql`
      SELECT id, nome, clin_care_id, unidade_id
      FROM professores
      WHERE id = ${professorIdInput}
      LIMIT 1
    `) as {
            id: number;
            nome: string;
            clin_care_id: string | null;
            unidade_id: number;
        }[];

        if (profRows.length === 0) {
            return NextResponse.json({ error: 'Professor não encontrado.' }, { status: 404 });
        }

        const alvo = profRows[0];
        const unidadesDoProf = (await sql`
      SELECT id AS professor_id, unidade_id
      FROM professores
      WHERE id = ${alvo.id}
         OR (${alvo.clin_care_id}::text IS NOT NULL AND clin_care_id = ${alvo.clin_care_id})
         OR lower(trim(nome)) = lower(trim(${alvo.nome}))
    `) as { professor_id: number; unidade_id: number }[];

        for (let i = 0; i < semanasRecorrencia; i++) {
            const dataOcorrencia = i === 0 ? dataBase : adicionarDiasISO(dataBase, i * 7);

            for (const reg of unidadesDoProf) {
                await sql`
          INSERT INTO bloqueios_clincare (
            professor_id,
            unidade_id,
            data,
            hora_inicio,
            hora_fim,
            motivo,
            descricao,
            origem,
            criado_por_nome,
            atualizado_em
          )
          VALUES (
            ${reg.professor_id},
            ${reg.unidade_id},
            ${dataOcorrencia}::date,
            ${horaInicio}::time,
            ${horaFim}::time,
            ${titulo},
            ${descricao || null},
            'manual',
            ${sessao.nome},
            now()
          )
        `;
            }
        }

        return NextResponse.json(
            {
                sucesso: true,
                mensagem:
                    semanasRecorrencia > 1
                        ? `Bloqueio registrado para ${semanasRecorrencia} semanas!`
                        : 'Bloqueio registrado na agenda!',
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Erro ao criar bloqueio:', error);
        return NextResponse.json(
            { error: 'Não foi possível salvar o bloqueio.' },
            { status: 500 }
        );
    }
}

export async function PATCH(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    if (!sessao) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirColunasBloqueios();

        const body = await req.json();
        const id = Number(body?.id || 0);
        const titulo = String(body?.motivo || '').trim() || 'Bloqueio de agenda';
        const descricao = String(body?.descricao || '').trim();
        const data = String(body?.data || '').trim();
        const horaInicio = String(body?.hora_inicio || '').trim();
        const duracaoMinutos = Number(body?.duracao_minutos || 60);

        if (!id || !data || !horaInicio) {
            return NextResponse.json(
                { error: 'Informe ID, data e horário de início do bloqueio.' },
                { status: 400 }
            );
        }

        if (duracaoMinutos < 10 || duracaoMinutos > 840) {
            return NextResponse.json(
                { error: 'Duração do bloqueio inválida.' },
                { status: 400 }
            );
        }

        const horaFim = calcularHoraFim(horaInicio, duracaoMinutos);

        if (sessao.role === 'professor') {
            await sql`
                UPDATE bloqueios_clincare
                SET
                    motivo = ${titulo},
                    descricao = ${descricao || null},
                    data = ${data}::date,
                    hora_inicio = ${horaInicio}::time,
                    hora_fim = ${horaFim}::time,
                    atualizado_em = now()
                WHERE id = ${id}
                  AND professor_id IN (
                      SELECT id FROM professores
                      WHERE id = ${sessao.professor_id || 0}
                         OR lower(trim(nome)) = lower(trim(${sessao.nome}))
                  )
            `;
        } else {
            await sql`
                UPDATE bloqueios_clincare
                SET
                    motivo = ${titulo},
                    descricao = ${descricao || null},
                    data = ${data}::date,
                    hora_inicio = ${horaInicio}::time,
                    hora_fim = ${horaFim}::time,
                    atualizado_em = now()
                WHERE id = ${id}
            `;
        }

        return NextResponse.json({ sucesso: true });
    } catch (error) {
        console.error('Erro ao editar bloqueio:', error);
        return NextResponse.json(
            { error: 'Não foi possível atualizar o bloqueio.' },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    if (!sessao) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const id = Number(searchParams.get('id') || 0);
        if (!id) {
            return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
        }

        if (sessao.role === 'professor') {
            await sql`
        DELETE FROM bloqueios_clincare
        WHERE id = ${id}
          AND professor_id IN (
            SELECT id FROM professores
            WHERE id = ${sessao.professor_id || 0}
               OR lower(trim(nome)) = lower(trim(${sessao.nome}))
          )
      `;
        } else {
            await sql`DELETE FROM bloqueios_clincare WHERE id = ${id}`;
        }

        return NextResponse.json({ sucesso: true });
    } catch (error) {
        console.error('Erro ao excluir bloqueio:', error);
        return NextResponse.json(
            { error: 'Não foi possível remover o bloqueio.' },
            { status: 500 }
        );
    }
}