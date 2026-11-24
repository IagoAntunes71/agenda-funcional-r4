import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { lerSessaoAdmin, verificarAdminAutenticado } from '@/lib/admin-auth';
import {
    dispararRoboReservaClinCare,
    garantirColunasFilaReserva,
} from '@/lib/clincare-fila';
import { horaParaMinutos, minutosParaHora } from '@/lib/horarios-reforco';

async function garantirColunasExtrasAgendamento() {
    await garantirColunasFilaReserva();
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS lancado_clincare BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS sincronizado_clincare BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS duracao_minutos INTEGER DEFAULT 100`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS feedback_professor TEXT`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS criado_por_nome TEXT`;
}

export async function POST(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    if (!sessao) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirColunasExtrasAgendamento();
        const body = await req.json();

        const unidadeId = Number(body?.unidade_id || 0);
        const professorId = Number(body?.professor_id || 0);
        const materia = String(body?.materia || '').trim();
        const data = String(body?.data || '').trim();
        const horaInicio = String(body?.hora_inicio || '').trim();
        const duracaoMinutos = Number(body?.duracao_minutos || 100);
        const observacoes = String(body?.observacoes || '').trim() || null;
        const status = String(body?.status || 'confirmado').trim();
        const recorrencia = Math.min(Math.max(Number(body?.recorrencia_semanas || 1), 1), 12);

        if (!unidadeId || !professorId || !materia || !data || !horaInicio) {
            return NextResponse.json(
                { error: 'Preencha unidade, professor, matéria, data e horário.' },
                { status: 400 }
            );
        }

        let alunoId = Number(body?.aluno_id || 0);
        let nomeAluno = '';
        let nomeResponsavel = '';
        let telefoneAluno = '';
        let colegioAluno = '';
        let serieAluno = '';

        if (body?.novo_aluno && body.novo_aluno.nome_aluno) {
            nomeAluno = String(body.novo_aluno.nome_aluno).trim();
            nomeResponsavel = String(body.novo_aluno.responsavel_nome || '').trim();
            telefoneAluno = String(body.novo_aluno.telefone || '').trim();
            colegioAluno = String(body.novo_aluno.colegio_nome || '').trim();
            serieAluno = String(body.novo_aluno.serie || '').trim();

            const inseridos = (await sql`
                INSERT INTO alunos (nome_aluno, responsavel_nome, telefone, telefone_formatado, colegio_nome, serie, ativo)
                VALUES (${nomeAluno}, ${nomeResponsavel}, ${telefoneAluno.replace(/\D/g, '')}, ${telefoneAluno}, ${colegioAluno}, ${serieAluno}, true)
                RETURNING id
            `) as { id: number }[];
            alunoId = inseridos[0]?.id || 0;
        } else if (alunoId > 0) {
            const alunosDb = (await sql`
                SELECT
                    al.nome_aluno,
                    COALESCE(NULLIF(trim(r.nome), ''), al.responsavel_nome, '') AS responsavel_nome,
                    COALESCE(NULLIF(trim(r.telefone_formatado), ''), al.telefone_formatado, al.telefone, '') AS telefone,
                    COALESCE(al.colegio_nome, '') AS colegio_nome,
                    COALESCE(al.serie, '') AS serie
                FROM alunos al
                LEFT JOIN responsaveis r ON r.id = al.responsavel_id
                WHERE al.id = ${alunoId}
                LIMIT 1
            `) as {
                nome_aluno: string;
                responsavel_nome: string;
                telefone: string;
                colegio_nome: string;
                serie: string;
            }[];

            if (alunosDb[0]) {
                nomeAluno = alunosDb[0].nome_aluno;
                nomeResponsavel = alunosDb[0].responsavel_nome;
                telefoneAluno = alunosDb[0].telefone;
                colegioAluno = alunosDb[0].colegio_nome;
                serieAluno = alunosDb[0].serie;
            }
        }

        if (!alunoId && !nomeAluno) {
            return NextResponse.json(
                { error: 'Selecione ou cadastre um aluno.' },
                { status: 400 }
            );
        }

        const horaFim = minutosParaHora(horaParaMinutos(horaInicio) + duracaoMinutos);
        const [ano, mes, dia] = data.split('-').map(Number);

        for (let semana = 0; semana < recorrencia; semana++) {
            const dtObj = new Date(ano, mes - 1, dia + semana * 7);
            const dataSemana = `${dtObj.getFullYear()}-${String(dtObj.getMonth() + 1).padStart(
                2,
                '0'
            )}-${String(dtObj.getDate()).padStart(2, '0')}`;

            await sql`
                INSERT INTO agendamentos (
                    unidade_id,
                    professor_id,
                    aluno_id,
                    aluno_nome,
                    responsavel_nome,
                    aluno_telefone,
                    colegio_nome,
                    serie,
                    materia,
                    data,
                    hora_inicio,
                    hora_fim,
                    duracao_minutos,
                    observacoes,
                    status,
                    criado_por_nome
                )
                VALUES (
                    ${unidadeId},
                    ${professorId},
                    ${alunoId || null},
                    ${nomeAluno},
                    ${nomeResponsavel},
                    ${telefoneAluno},
                    ${colegioAluno},
                    ${serieAluno},
                    ${materia},
                    ${dataSemana}::date,
                    ${horaInicio}::time,
                    ${horaFim}::time,
                    ${duracaoMinutos},
                    ${observacoes},
                    ${status},
                    ${sessao.nome}
                )
            `;
        }

        return NextResponse.json({ sucesso: true });
    } catch (error) {
        console.error('Erro ao criar agendamento:', error);
        return NextResponse.json(
            { error: 'Não foi possível criar o agendamento.' },
            { status: 500 }
        );
    }
}

export async function PATCH(req: NextRequest) {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirColunasExtrasAgendamento();

        const body = await req.json();
        const id = Number(body?.id || 0);

        if (!Number.isSafeInteger(id) || id <= 0) {
            return NextResponse.json(
                { error: 'ID do agendamento inválido.' },
                { status: 400 }
            );
        }

        if (body?.reenviar_robo === true) {
            const reenviados = await sql`
                UPDATE agendamentos
                SET clincare_reserva_status = CASE
                      WHEN status = 'cancelado' THEN 'cancelar_pendente'
                      ELSE 'pendente'
                    END,
                    clincare_reserva_erro = NULL
                WHERE id = ${id}
                  AND status IN ('confirmado', 'cancelado')
                RETURNING id
            `;
            if (reenviados.length === 0) {
                return NextResponse.json(
                    { error: 'Agendamento não encontrado ou já concluído.' },
                    { status: 409 }
                );
            }
            const disparo = await dispararRoboReservaClinCare(id);
            if (!disparo.ok) {
                return NextResponse.json(
                    { error: disparo.erro || 'Falha ao acionar robô.' },
                    { status: 500 }
                );
            }
            return NextResponse.json({ sucesso: true });
        }

        // Transferência via Drag & Drop (professor, unidade, data, horário, matéria e/ou duração)
        if (
            typeof body?.professor_id === 'number' ||
            typeof body?.data === 'string' ||
            typeof body?.hora_inicio === 'string' ||
            typeof body?.materia === 'string' ||
            typeof body?.duracao_minutos === 'number'
        ) {
            const atuais = (await sql`
                SELECT
                    professor_id,
                    unidade_id,
                    materia,
                    to_char(data, 'YYYY-MM-DD') AS data,
                    COALESCE(to_char(hora_inicio, 'HH24:MI'), to_char(horario, 'HH24:MI'), '08:00') AS hora_inicio,
                    COALESCE(duracao_minutos, 100) AS duracao_minutos
                FROM agendamentos
                WHERE id = ${id}
                LIMIT 1
            `) as {
                professor_id: number;
                unidade_id: number;
                materia: string;
                data: string;
                hora_inicio: string;
                duracao_minutos: number;
            }[];

            if (atuais.length === 0) {
                return NextResponse.json(
                    { error: 'Agendamento não encontrado.' },
                    { status: 404 }
                );
            }

            const atual = atuais[0];
            const novoProfessorId =
                typeof body?.professor_id === 'number' && body.professor_id > 0
                    ? body.professor_id
                    : atual.professor_id;
            const novaUnidadeId =
                typeof body?.unidade_id === 'number' && body.unidade_id > 0
                    ? body.unidade_id
                    : atual.unidade_id;
            const novaMateria =
                typeof body?.materia === 'string' && body.materia.trim()
                    ? body.materia.trim()
                    : atual.materia;
            const novaDuracao =
                typeof body?.duracao_minutos === 'number' && body.duracao_minutos > 0
                    ? body.duracao_minutos
                    : Number(atual.duracao_minutos || 100);
            const novaData =
                typeof body?.data === 'string' && body.data.trim()
                    ? body.data.trim()
                    : atual.data;
            const novaHoraInicio =
                typeof body?.hora_inicio === 'string' && body.hora_inicio.trim()
                    ? body.hora_inicio.trim()
                    : atual.hora_inicio;
            const novaHoraFim = minutosParaHora(
                horaParaMinutos(novaHoraInicio) + novaDuracao
            );

            await sql`
                UPDATE agendamentos
                SET
                    professor_id = ${novoProfessorId},
                    unidade_id = ${novaUnidadeId},
                    materia = ${novaMateria},
                    duracao_minutos = ${novaDuracao},
                    data = ${novaData}::date,
                    hora_inicio = ${novaHoraInicio}::time,
                    hora_fim = ${novaHoraFim}::time
                WHERE id = ${id}
            `;
        }

        if (typeof body?.feedback_professor === 'string') {
            await sql`
                UPDATE agendamentos
                SET feedback_professor = ${body.feedback_professor}
                WHERE id = ${id}
            `;
        }

        if (typeof body?.lancado_clincare === 'boolean') {
            const lancado = body.lancado_clincare;
            await sql`
                UPDATE agendamentos
                SET
                  lancado_clincare = ${lancado},
                  sincronizado_clincare = ${lancado}
                WHERE id = ${id}
            `;
        }

        if (typeof body?.status === 'string' && body.status) {
            const status = body.status;
            const statusPermitidos = [
                'agendado',
                'confirmado',
                'realizado',
                'desmarcado_com_cobranca',
                'desmarcado_sem_cobranca',
                'cancelado',
                'concluido',
            ];
            if (!statusPermitidos.includes(status)) {
                return NextResponse.json(
                    { error: 'Status inválido.' },
                    { status: 400 }
                );
            }

            if (status === 'cancelado') {
                const cancelados = (await sql`
                    UPDATE agendamentos
                    SET
                      status = 'cancelado',
                      clincare_reserva_status = CASE
                        WHEN status = 'cancelado' AND clincare_reserva_status = 'cancelado_clincare'
                          THEN 'cancelado_clincare'
                        ELSE 'cancelar_pendente'
                      END,
                      clincare_reserva_erro = NULL
                    WHERE id = ${id}
                    RETURNING clincare_reserva_status
                `) as { clincare_reserva_status: string }[];

                if (cancelados.length === 0) {
                    return NextResponse.json(
                        { error: 'Agendamento não encontrado.' },
                        { status: 404 }
                    );
                }
                if (cancelados[0]?.clincare_reserva_status === 'cancelar_pendente') {
                    const disparo = await dispararRoboReservaClinCare(id);
                    if (!disparo.ok) {
                        return NextResponse.json(
                            {
                                error:
                                    disparo.erro ||
                                    'Aula cancelada no sistema, mas não foi possível acionar a remoção no ClinCare.',
                            },
                            { status: 502 }
                        );
                    }
                }
            } else {
                await sql`
                    UPDATE agendamentos
                    SET status = ${status}
                    WHERE id = ${id}
                `;
            }
        }

        return NextResponse.json({ sucesso: true });
    } catch (error) {
        console.error('Erro ao atualizar agendamento:', error);
        return NextResponse.json(
            { error: 'Não foi possível atualizar o agendamento.' },
            { status: 500 }
        );
    }
}