/**
 * ARQUIVO: src/app/api/admin/bloqueios/route.ts
 * FUNÇÃO: Cria (POST) e exclui (DELETE) bloqueios de agenda na tabela `r4_bloqueios_agenda`
 * com origem = 'manual'. Permite que tanto Atendimento/Admin quanto o próprio Professor
 * bloqueiem horários na agenda (com início, duração e recorrência), refletindo também
 * no Portal do Aluno para impedir reservas nesses intervalos.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { lerSessaoAdmin } from '@/lib/admin-auth';
import { calcularHoraFim } from '@/lib/agenda-status-r4';
import { lerOperacaoR4 } from '@/lib/operacao-r4-db';
import { podeOperacao } from '@/lib/operacao-r4';
import { adicionarDiasISO, horaParaMinutos } from '@/lib/horarios-reforco';

async function garantirColunasBloqueios() {
    await Promise.all([
        sql`ALTER TABLE r4_bloqueios_agenda ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'manual'`,
        sql`ALTER TABLE r4_bloqueios_agenda ADD COLUMN IF NOT EXISTS descricao TEXT`,
        sql`ALTER TABLE r4_bloqueios_agenda ADD COLUMN IF NOT EXISTS criado_por_nome TEXT`,
    ]);
}

const grupoProfessor = sql`(p.id = alvo.id OR nullif(p.grupo_professor,'') = nullif(alvo.grupo_professor,''))`;

async function aulasAfetadas(professorId: number, datas: string[], inicio: string, fim: string) {
    return sql`
        SELECT a.id, coalesce(a.aluno_nome,a.nome_aluno) AS aluno, a.data::text,
            to_char(coalesce(a.hora_inicio,a.horario),'HH24:MI') AS hora, a.materia
        FROM agendamentos a JOIN professores p ON p.id = a.professor_id
        JOIN professores alvo ON alvo.id = ${professorId} AND ${grupoProfessor}
        WHERE a.data = ANY(${datas}::date[]) AND a.excluido_em IS NULL
          AND coalesce(a.status,'confirmado') IN ('agendado','confirmado','reservado','pendente')
          AND coalesce(a.hora_inicio,a.horario) < ${fim}::time
          AND coalesce(a.hora_fim,coalesce(a.hora_inicio,a.horario) + make_interval(mins => coalesce(a.duracao_minutos,100))) > ${inicio}::time
        ORDER BY a.data, coalesce(a.hora_inicio,a.horario), a.id`;
}

export async function GET() {
    const sessao = await lerSessaoAdmin();
    if (!sessao) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    const cfg = await lerOperacaoR4();
    if (sessao.role !== 'professor' && !podeOperacao(cfg, sessao.role, 'agenda')) {
        return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 });
    }
    const pedidos = await sql`
        SELECT e.id::text, e.professor_id, e.datas::text[], e.inicio::text, e.fim::text, e.motivo,
            e.descricao, e.estado, e.decidido_nome, e.decidido_em, p.nome AS professor
        FROM r4_excecoes_bloqueio e JOIN professores p ON p.id = e.professor_id
        WHERE (${sessao.role !== 'professor'} OR solicitado_por = ${sessao.id})
        ORDER BY (e.estado = 'pendente') DESC, e.id DESC LIMIT 30`;
    const resultados = await Promise.all(pedidos.map(async (e) => ({
        ...e, aulas: e.estado === 'pendente' ? await aulasAfetadas(e.professor_id, e.datas, e.inicio, e.fim) : [],
    })));
    return NextResponse.json({ pedidos: resultados }, { headers: { 'Cache-Control': 'private, no-store' } });
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
            Math.max(1, Math.floor(Number(body?.recorrencia_semanas) || 1))
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
        const cfg = await lerOperacaoR4();
        const prazo = cfg.prazoBloqueioProfessor;
        const dias = Array.from({ length: semanasRecorrencia }, (_, i) => adicionarDiasISO(dataBase, i * 7));
        if (sessao.role === 'professor' && prazo !== null) {
            const [janela] = await sql`SELECT
                ((${dataBase}::date + ${horaInicio}::time) AT TIME ZONE 'America/Bahia') <= now() AS passado,
                ((${dataBase}::date + ${horaInicio}::time) AT TIME ZONE 'America/Bahia') < now() + make_interval(hours => ${prazo}) AS excecao`;
            if (janela.passado || !Number.isInteger(duracaoMinutos) || horaParaMinutos(horaInicio) + duracaoMinutos >= 1440) {
                return NextResponse.json({ error: 'Escolha um intervalo futuro que termine no mesmo dia.' }, { status: 400 });
            }
            if (janela.excecao) {
                const aulas = await aulasAfetadas(professorIdInput, dias, horaInicio, horaFim);
                if (body?.acao !== 'solicitarExcecao') return NextResponse.json({
                    error: 'Este bloqueio precisa de autorização.', excecao: true, aulas,
                }, { status: 409 });
                await sql`INSERT INTO r4_excecoes_bloqueio (professor_id,solicitado_por,datas,inicio,fim,motivo,descricao)
                    VALUES (${professorIdInput},${sessao.id},${dias}::date[],${horaInicio}::time,${horaFim}::time,${titulo},${descricao})
                    ON CONFLICT (professor_id,datas,inicio,fim) WHERE estado = 'pendente' DO NOTHING`;
                return NextResponse.json({ sucesso: true, solicitado: true, mensagem: 'Solicitação enviada para autorização.' }, { status: 201 });
            }
        }
        if (body?.acao === 'solicitarExcecao') return NextResponse.json({
            error: 'A janela mudou. Revise e envie o bloqueio novamente.',
        }, { status: 409 });

        // Localiza todos os registros do mesmo professor (caso atue em mais de uma unidade)
        const profRows = (await sql`
      SELECT id, nome, grupo_professor, unidade_id
      FROM professores
      WHERE id = ${professorIdInput}
      LIMIT 1
    `) as {
            id: number;
            nome: string;
            grupo_professor: string | null;
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
         OR (${alvo.grupo_professor}::text IS NOT NULL AND grupo_professor = ${alvo.grupo_professor})
         OR (${sessao.role !== 'professor'} AND lower(trim(nome)) = lower(trim(${alvo.nome})))
    `) as { professor_id: number; unidade_id: number }[];

        for (let i = 0; i < semanasRecorrencia; i++) {
            const dataOcorrencia = i === 0 ? dataBase : adicionarDiasISO(dataBase, i * 7);

            for (const reg of unidadesDoProf) {
                await sql`
          INSERT INTO r4_bloqueios_agenda (
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
        const cfg = await lerOperacaoR4();
        if (body?.acao === 'decidirExcecao') {
            if (sessao.role === 'professor' || !podeOperacao(cfg,sessao.role,'agenda')) {
                return NextResponse.json({ error: 'Seu perfil não pode decidir solicitações.' }, { status: 403 });
            }
            const id = String(body.id || '');
            const decisao = body.decisao;
            if (!/^\d{1,18}$/.test(id) || !['autorizado','recusado'].includes(decisao)) {
                return NextResponse.json({ error: 'Informe a solicitação e a decisão.' }, { status: 400 });
            }
            const [, , linhas] = await sql.transaction([
                sql`LOCK TABLE agendamentos IN SHARE ROW EXCLUSIVE MODE`,
                sql`LOCK TABLE r4_bloqueios_agenda IN SHARE ROW EXCLUSIVE MODE`,
                sql`WITH pedido AS (
                    UPDATE r4_excecoes_bloqueio SET estado = ${decisao}, decidido_por = ${sessao.id},
                        decidido_nome = ${sessao.nome}, decidido_em = now()
                    WHERE id = ${id}::bigint AND estado = 'pendente'
                      AND (${decisao === 'recusado'} OR NOT EXISTS (
                          SELECT 1 FROM unnest(datas) AS dias(data)
                          WHERE ((dias.data + inicio) AT TIME ZONE 'America/Bahia') <= now()
                      ))
                    RETURNING *
                ), bloqueios AS (
                    INSERT INTO r4_bloqueios_agenda (professor_id,unidade_id,data,hora_inicio,hora_fim,motivo,descricao,origem,criado_por_nome)
                    SELECT p.id,p.unidade_id,dias.data,pedido.inicio,pedido.fim,pedido.motivo,pedido.descricao,'manual',${sessao.nome}
                    FROM pedido JOIN professores alvo ON alvo.id = pedido.professor_id
                    JOIN professores p ON ${grupoProfessor}
                    CROSS JOIN LATERAL unnest(pedido.datas) AS dias(data)
                    WHERE pedido.estado = 'autorizado'
                ) SELECT id FROM pedido`,
            ]);
            return linhas.length ? NextResponse.json({ sucesso: true }) :
                NextResponse.json({ error: 'A solicitação já foi decidida ou inclui um horário que passou.' }, { status: 409 });
        }

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

        if (sessao.role === 'professor' && cfg.prazoBloqueioProfessor !== null) {
            const [janela] = await sql`SELECT ((${data}::date + ${horaInicio}::time) AT TIME ZONE 'America/Bahia')
                < now() + make_interval(hours => ${cfg.prazoBloqueioProfessor}) AS excecao`;
            if (janela.excecao) return NextResponse.json({
                error: 'Para bloquear neste prazo, solicite uma exceção pelo formulário de novo bloqueio.',
            }, { status: 409 });
        }
        if (sessao.role === 'professor') {
            await sql`
                UPDATE r4_bloqueios_agenda
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
                UPDATE r4_bloqueios_agenda
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
        DELETE FROM r4_bloqueios_agenda
        WHERE id = ${id}
          AND professor_id IN (
            SELECT id FROM professores
            WHERE id = ${sessao.professor_id || 0}
               OR lower(trim(nome)) = lower(trim(${sessao.nome}))
          )
      `;
        } else {
            await sql`DELETE FROM r4_bloqueios_agenda WHERE id = ${id}`;
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