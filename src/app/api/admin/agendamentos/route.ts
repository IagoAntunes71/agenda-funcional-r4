/**
 * ARQUIVO: src/app/api/admin/agendamentos/route.ts
 * FUNÇÃO: Gerencia criação (POST) e atualização (PATCH) de aulas pelo painel interno:
 * - POST (Admin e Atendimento): marca aulas de 50 a 300 min (08:00 às 22:00), suporta duplas/trios/quartetos,
 *   cadastro rápido de aluno/responsável e recorrência semanal.
 * - PATCH: atualiza status, feedback do professor e observações.
 *   REGRA DE SEGURANÇA: Se sessao.role === 'professor', bloqueia qualquer alteração de status
 *   que não seja 'realizado'.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { lerSessaoAdmin } from '@/lib/admin-auth';
import {
    LISTA_STATUS_AULA_R4,
    calcularHoraFim,
    normalizarStatusAulaR4,
} from '@/lib/agenda-status-r4';
import { adicionarDiasISO } from '@/lib/horarios-reforco';
import { formatarTelefone, normalizarTelefone } from '@/lib/cliente-helpers';
import { garantirEstruturaContasResponsaveis } from '@/lib/cliente-auth';
import {
    dispararRoboReservaClinCare,
    garantirColunasFilaReserva,
} from '@/lib/clincare-fila';

export async function POST(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    if (!sessao) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }
    if (sessao.role === 'professor') {
        return NextResponse.json(
            { error: 'Professores não podem criar aulas de alunos; utilize o Bloqueio de Agenda.' },
            { status: 403 }
        );
    }

    try {
        await garantirEstruturaContasResponsaveis();
        await Promise.all([
            garantirColunasFilaReserva(),
            sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS duracao_minutos INT`,
            sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS feedback_professor TEXT`,
            sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS criado_por_nome TEXT`,
            sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'portal'`,
        ]);

        const body = await req.json();
        const unidadeId = Number(body?.unidade_id || 0);
        const professorId = Number(body?.professor_id || 0);
        const materia = String(body?.materia || '').trim();
        const dataBase = String(body?.data || '').trim();
        const horaInicio = String(body?.hora_inicio || '').trim();
        const duracaoMinutos = Number(body?.duracao_minutos || 100);
        const observacoes = String(body?.observacoes || '').trim();
        const statusInicial = normalizarStatusAulaR4(body?.status || 'confirmado');
        const semanasRecorrencia = Math.min(8, Math.max(1, Number(body?.recorrencia_semanas || 1)));

        if (!unidadeId || !professorId || !materia || !dataBase || !horaInicio) {
            return NextResponse.json(
                { error: 'Preencha unidade, professor, matéria, data e horário de início.' },
                { status: 400 }
            );
        }

        if (duracaoMinutos < 50 || duracaoMinutos > 300) {
            return NextResponse.json(
                { error: 'A duração da aula deve estar entre 50 e 300 minutos.' },
                { status: 400 }
            );
        }

        const horaFim = calcularHoraFim(horaInicio, duracaoMinutos);

        // Resolve aluno existente ou realiza cadastro rápido
        let alunoId: number | null = Number(body?.aluno_id || 0) || null;
        let alunoNome = '';
        let alunoTelefone = '';
        let colegioNome = '';
        let serie = '';
        let responsavelNome = '';

        if (alunoId) {
            const rows = (await sql`
        SELECT
          al.id,
          al.nome_aluno,
          COALESCE(NULLIF(trim(r.telefone), ''), al.telefone, '') AS telefone,
          COALESCE(al.colegio_nome, '') AS colegio_nome,
          COALESCE(al.serie, '') AS serie,
          COALESCE(NULLIF(trim(r.nome), ''), al.responsavel_nome, '') AS responsavel_nome
        FROM alunos al
        LEFT JOIN responsaveis r ON r.id = al.responsavel_id
        WHERE al.id = ${alunoId}
        LIMIT 1
      `) as {
                id: number;
                nome_aluno: string;
                telefone: string;
                colegio_nome: string;
                serie: string;
                responsavel_nome: string;
            }[];

            if (rows.length === 0) {
                return NextResponse.json({ error: 'Aluno selecionado não encontrado.' }, { status: 404 });
            }
            alunoNome = rows[0].nome_aluno;
            alunoTelefone = rows[0].telefone;
            colegioNome = rows[0].colegio_nome;
            serie = rows[0].serie;
            responsavelNome = rows[0].responsavel_nome;
        } else if (body?.novo_aluno) {
            alunoNome = String(body.novo_aluno.nome_aluno || '').trim();
            responsavelNome = String(body.novo_aluno.responsavel_nome || '').trim();
            alunoTelefone = normalizarTelefone(String(body.novo_aluno.telefone || ''));
            colegioNome = String(body.novo_aluno.colegio_nome || '').trim();
            serie = String(body.novo_aluno.serie || '').trim();

            if (!alunoNome || alunoTelefone.length < 10) {
                return NextResponse.json(
                    { error: 'Informe o nome do aluno e o WhatsApp com DDD para o cadastro rápido.' },
                    { status: 400 }
                );
            }

            const telFmt = formatarTelefone(alunoTelefone);
            const respInserido = (await sql`
        INSERT INTO responsaveis (nome, telefone, telefone_formatado)
        VALUES (${responsavelNome || 'Responsável'}, ${alunoTelefone}, ${telFmt})
        ON CONFLICT (telefone) DO UPDATE
        SET nome = COALESCE(NULLIF(EXCLUDED.nome, 'Responsável'), responsaveis.nome)
        RETURNING id
      `) as { id: number }[];

            const respId = respInserido[0]?.id || null;
            const alunoInserido = (await sql`
        INSERT INTO alunos (
          responsavel_id,
          telefone,
          telefone_formatado,
          responsavel_nome,
          nome_aluno,
          colegio_nome,
          serie,
          ativo
        )
        VALUES (
          ${respId},
          ${alunoTelefone},
          ${telFmt},
          ${responsavelNome || null},
          ${alunoNome},
          ${colegioNome || 'Não informado'},
          ${serie || 'Não informada'},
          true
        )
        RETURNING id
      `) as { id: number }[];

            alunoId = alunoInserido[0]?.id || null;
        } else {
            return NextResponse.json(
                { error: 'Selecione um aluno ou preencha o cadastro rápido.' },
                { status: 400 }
            );
        }

        const idsCriados: number[] = [];

        for (let i = 0; i < semanasRecorrencia; i++) {
            const dataOcorrencia = i === 0 ? dataBase : adicionarDiasISO(dataBase, i * 7);

            const inseridos = (await sql`
        INSERT INTO agendamentos (
          unidade_id,
          professor_id,
          aluno_id,
          materia,
          data,
          hora_inicio,
          hora_fim,
          duracao_minutos,
          aluno_nome,
          aluno_telefone,
          colegio_nome,
          serie,
          responsavel_nome,
          observacoes,
          status,
          criado_por_nome,
          origem,
          clincare_reserva_status
        )
        VALUES (
          ${unidadeId},
          ${professorId},
          ${alunoId},
          ${materia},
          ${dataOcorrencia}::date,
          ${horaInicio}::time,
          ${horaFim}::time,
          ${duracaoMinutos},
          ${alunoNome},
          ${alunoTelefone},
          ${colegioNome || null},
          ${serie || null},
          ${responsavelNome || null},
          ${observacoes || null},
          ${statusInicial},
          ${sessao.nome},
          'recepcao',
          'nao_aplicavel'
        )
        RETURNING id
      `) as { id: number }[];

            if (inseridos[0]?.id) {
                idsCriados.push(inseridos[0].id);
            }
        }

        return NextResponse.json(
            {
                sucesso: true,
                totalCriados: idsCriados.length,
                mensagem:
                    idsCriados.length > 1
                        ? `${idsCriados.length} aulas agendadas com sucesso!`
                        : 'Aula agendada com sucesso!',
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Erro ao criar agendamento interno:', error);
        return NextResponse.json(
            { error: 'Falha ao salvar agendamento.' },
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
        await Promise.all([
            garantirColunasFilaReserva(),
            sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS feedback_professor TEXT`,
            sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS atualizado_por_nome TEXT`,
            sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS lancado_clincare BOOLEAN DEFAULT false`,
            sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS sincronizado_clincare BOOLEAN DEFAULT false`,
        ]);

        const body = await req.json();
        const id = Number(body?.id || 0);

        if (!Number.isSafeInteger(id) || id <= 0) {
            return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
        }

        // Regras específicas quando o usuário logado é Professor
        if (sessao.role === 'professor') {
            if (body?.status !== undefined && body.status !== 'realizado') {
                return NextResponse.json(
                    { error: 'Professores podem alterar o status da aula apenas para "Realizado".' },
                    { status: 403 }
                );
            }

            if (body?.status === 'realizado') {
                await sql`
          UPDATE agendamentos
          SET status = 'realizado', atualizado_por_nome = ${sessao.nome}
          WHERE id = ${id}
        `;
            }

            if (body?.feedback_professor !== undefined) {
                const feedback = String(body.feedback_professor || '').trim();
                await sql`
          UPDATE agendamentos
          SET feedback_professor = ${feedback || null}, atualizado_por_nome = ${sessao.nome}
          WHERE id = ${id}
        `;
            }

            return NextResponse.json({ sucesso: true });
        }

        // Fluxo para Admin e Atendimento
        if (body?.reenviar_robo === true) {
            await sql`
        UPDATE agendamentos
        SET clincare_reserva_status = CASE WHEN status = 'cancelado' THEN 'cancelar_pendente' ELSE 'pendente' END,
            clincare_reserva_erro = NULL
        WHERE id = ${id}
      `;
            const disparo = await dispararRoboReservaClinCare(id);
            if (!disparo.ok) {
                return NextResponse.json(
                    { error: disparo.erro || 'Falha ao acionar robô.' },
                    { status: 500 }
                );
            }
            return NextResponse.json({ sucesso: true });
        }

        if (typeof body?.lancado_clincare === 'boolean') {
            const lancado = body.lancado_clincare;
            await sql`
        UPDATE agendamentos
        SET lancado_clincare = ${lancado}, sincronizado_clincare = ${lancado}
        WHERE id = ${id}
      `;
        }

        if (body?.feedback_professor !== undefined) {
            const feedback = String(body.feedback_professor || '').trim();
            await sql`
        UPDATE agendamentos
        SET feedback_professor = ${feedback || null}, atualizado_por_nome = ${sessao.nome}
        WHERE id = ${id}
      `;
        }

        if (body?.observacoes !== undefined) {
            const obs = String(body.observacoes || '').trim();
            await sql`
        UPDATE agendamentos
        SET observacoes = ${obs || null}, atualizado_por_nome = ${sessao.nome}
        WHERE id = ${id}
      `;
        }

        if (typeof body?.status === 'string' && body.status) {
            const status = normalizarStatusAulaR4(body.status);
            const valido = LISTA_STATUS_AULA_R4.some((s) => s.valor === status);
            if (!valido) {
                return NextResponse.json({ error: 'Status inválido.' }, { status: 400 });
            }

            const cancelaHorario =
                status === 'cancelado' ||
                status === 'desmarcado_com_cobranca' ||
                status === 'desmarcado_sem_cobranca';

            if (cancelaHorario) {
                const atualizados = (await sql`
          UPDATE agendamentos
          SET
            status = ${status},
            atualizado_por_nome = ${sessao.nome},
            clincare_reserva_status = CASE
              WHEN clincare_reserva_status = 'reservado' THEN 'cancelar_pendente'
              ELSE 'nao_aplicavel'
            END
          WHERE id = ${id}
          RETURNING clincare_reserva_status
        `) as { clincare_reserva_status: string }[];

                if (atualizados[0]?.clincare_reserva_status === 'cancelar_pendente') {
                    await dispararRoboReservaClinCare(id);
                }
            } else {
                await sql`
          UPDATE agendamentos
          SET status = ${status}, atualizado_por_nome = ${sessao.nome}
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