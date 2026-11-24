import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { lerSessaoAdmin, type SessaoAdmin } from '@/lib/admin-auth';
import {
    dispararRoboReservaClinCare,
    garantirColunasFilaReserva,
} from '@/lib/clincare-fila';
import { garantirStatusAgendamentoR4 } from '@/lib/agendamento-status-schema';
import { garantirHistoricoAgendamento } from '@/lib/agendamento-historico';
import { materiaBase, materiasBase, rotuloMateriaAula } from '@/lib/materia-aula';
import { LISTA_STATUS_AULA_R4 } from '@/lib/agenda-status-r4';
import { horaParaMinutos, minutosParaHora } from '@/lib/horarios-reforco';

async function garantirColunasExtrasAgendamento() {
    await garantirColunasFilaReserva();
    await garantirHistoricoAgendamento();
    await garantirStatusAgendamentoR4();
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

    if (sessao.role === 'professor') return erro('Este perfil não pode criar aulas.', 403);

    try {
        await garantirColunasExtrasAgendamento();
        const body = await req.json();

        const unidadeId = Number(body?.unidade_id || 0);
        const professorId = Number(body?.professor_id || 0);
        const materia = materiaBase(String(body?.materia || ''));
        const data = String(body?.data || '').trim();
        const horaInicio = String(body?.hora_inicio || '').trim();
        const duracaoMinutos = Number(body?.duracao_minutos || 100);
        const observacoes = String(body?.observacoes || '').trim() || null;
        const status = String(body?.status || 'confirmado').trim();
        const recorrencia = Math.min(Math.max(Number(body?.recorrencia_semanas || 1), 1), 12);

        if (!LISTA_STATUS_AULA_R4.some((item) => item.valor === status)) return erro('Status inválido.', 400);

        if (!unidadeId || !professorId || !materia || !data || !horaInicio) {
            return NextResponse.json(
                { error: 'Preencha unidade, professor, matéria, data e horário.' },
                { status: 400 }
            );
        }

        if (!Number.isInteger(duracaoMinutos) || duracaoMinutos < 10 || duracaoMinutos > 300 ||
            !/^([01]\d|2[0-3]):[0-5]\d$/.test(horaInicio) || horaParaMinutos(horaInicio) + duracaoMinutos >= 1440) {
            return erro('Horário ou duração inválidos.', 400);
        }
        const [destino] = await sql`SELECT materias FROM professores
            WHERE id = ${professorId} AND unidade_id = ${unidadeId} AND ativo`;
        if (!destino || !materiasBase(destino.materias).includes(materia)) {
            return erro('Selecione uma matéria cadastrada para o professor.', 400);
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
                    ${rotuloMateriaAula(materia, duracaoMinutos)},
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

const MAX_ANEXO = 2 * 1024 * 1024;

function erro(error: string, status: number) {
    return NextResponse.json({ error }, { status });
}

function idValido(id: number) {
    return Number.isSafeInteger(id) && id > 0;
}

async function buscarAula(id: number, sessao: SessaoAdmin) {
    const [aula] = await sql`
        SELECT a.*, to_char(a.data, 'YYYY-MM-DD') AS data_iso,
            to_char(coalesce(a.hora_inicio, a.horario), 'HH24:MI') AS inicio,
            to_char(a.hora_fim, 'HH24:MI') AS fim,
            p.nome AS professor_nome, u.nome AS unidade_nome
        FROM agendamentos a
        LEFT JOIN professores p ON p.id = a.professor_id
        LEFT JOIN unidades u ON u.id = a.unidade_id
        WHERE a.id = ${id}
          AND (${sessao.role !== 'professor'} OR EXISTS (
            SELECT 1 FROM professores vinculado
            WHERE vinculado.id = ${sessao.professor_id}
              AND (vinculado.id = p.id OR vinculado.clin_care_id = p.clin_care_id)
          ))
    `;
    return aula;
}

function ator(sessao: SessaoAdmin) {
    return sql`SELECT set_config('r4.ator_agenda', ${sessao.nome}, true)`;
}

export async function GET(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    if (!sessao) return erro('Não autorizado.', 401);
    if (req.nextUrl.searchParams.get('arquivo') === '1') {
        if (sessao.role === 'professor') return erro('Não autorizado.', 403);
        try {
            await garantirHistoricoAgendamento();
            const antesDe = Number(req.nextUrl.searchParams.get('antesDe')) || Number.MAX_SAFE_INTEGER;
            const aulas = await sql`
                SELECT a.id, coalesce(nullif(a.aluno_nome, ''), a.nome_aluno, 'Aluno') AS nome_aluno,
                    to_char(a.data, 'YYYY-MM-DD') AS data, a.materia, a.excluido_em
                FROM agendamentos a WHERE a.excluido_em IS NOT NULL AND a.id < ${antesDe}
                ORDER BY a.id DESC LIMIT 50
            `;
            return NextResponse.json({ aulas });
        } catch (error) {
            console.error('Arquivo da agenda:', error);
            return erro('Não foi possível carregar as aulas excluídas.', 500);
        }
    }
    const id = Number(req.nextUrl.searchParams.get('id'));
    const anexoId = Number(req.nextUrl.searchParams.get('anexo'));
    if (!idValido(id)) return erro('Agendamento inválido.', 400);

    try {
        await garantirColunasExtrasAgendamento();
        const aula = await buscarAula(id, sessao);
        if (!aula || (aula.excluido_em && sessao.role === 'professor')) return erro('Aula não encontrada.', 404);
        if (req.nextUrl.searchParams.has('anexo') && !idValido(anexoId)) return erro('Anexo inválido.', 400);
        if (idValido(anexoId)) {
            if (aula.excluido_em) return erro('Aula excluída.', 404);
            const [anexo] = await sql`
                SELECT nome, encode(conteudo, 'base64') AS dados FROM r4_agendamento_anexos
                WHERE id = ${anexoId} AND agendamento_id = ${id}
            `;
            if (!anexo) return erro('Anexo não encontrado.', 404);
            const nome = encodeURIComponent(anexo.nome).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16));
            return new Response(new Uint8Array(Buffer.from(anexo.dados, 'base64')), {
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Disposition': `attachment; filename*=UTF-8''${nome}`,
                    'X-Content-Type-Options': 'nosniff',
                    'Cache-Control': 'no-store',
                },
            });
        }
        const [historico, anexos] = await Promise.all([
            sql`SELECT id, acao, responsavel, campos, criado_em FROM r4_agendamento_historico
                WHERE agendamento_id = ${id} ORDER BY id DESC`,
            sql`SELECT id, nome, tamanho, criado_em FROM r4_agendamento_anexos
                WHERE agendamento_id = ${id} ORDER BY id DESC`,
        ]);
        if (!historico.some((item) => item.acao === 'Agendamento criado') && aula.criado_em) {
            historico.push({
                id: 'original', acao: 'Registro original do agendamento',
                responsavel: aula.criado_por_nome || 'Responsável não registrado',
                criado_em: aula.criado_em, campos: [],
            });
        }
        return NextResponse.json({
            aula: {
                status: aula.status, aluno_id: aula.aluno_id, data: aula.data_iso,
                hora_inicio: aula.inicio, hora_fim: aula.fim, duracao_minutos: aula.duracao_minutos,
                materia: aula.materia, unidade_id: aula.unidade_id, unidade_nome: aula.unidade_nome,
                professor_id: aula.professor_id, professor_nome: aula.professor_nome,
                nome_aluno: aula.aluno_nome || aula.nome_aluno,
                serie_aluno: aula.serie || aula.serie_aluno,
                colegio_aluno: aula.colegio_nome || aula.colegio_aluno,
                nome_responsavel: aula.responsavel_nome || aula.nome_responsavel,
                whatsapp_responsavel: aula.aluno_telefone || aula.whatsapp_responsavel,
                observacoes: aula.observacoes, feedback_professor: aula.feedback_professor,
                excluido_em: aula.excluido_em,
            },
            historico, anexos,
        });
    } catch (error) {
        console.error('Detalhes do agendamento:', error);
        return erro('Não foi possível carregar o agendamento.', 500);
    }
}

export async function PATCH(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    if (!sessao) return erro('Não autorizado.', 401);
    try {
        const body = await req.json();
        const id = Number(body?.id);
        if (!body || typeof body !== 'object' || !idValido(id)) return erro('Agendamento inválido.', 400);
        const status = body.status === 'concluido' ? 'realizado' : body.status;
        if (status !== undefined && !LISTA_STATUS_AULA_R4.some((item) => item.valor === status)) {
            return erro('Status inválido.', 400);
        }
        const camposAgenda = ['professor_id', 'unidade_id', 'aluno_id', 'data', 'hora_inicio', 'materia', 'duracao_minutos', 'observacoes'];
        const edicao = camposAgenda.some((campo) => campo in body);
        if (sessao.role === 'professor' && (edicao || body.reenviar_robo || 'lancado_clincare' in body ||
            (status !== undefined && status !== 'realizado'))) return erro('Seu perfil não permite essa alteração.', 403);

        await garantirColunasExtrasAgendamento();
        const aula = await buscarAula(id, sessao);
        if (!aula || (aula.excluido_em && !body.reenviar_robo)) return erro('Aula não encontrada.', 404);
        if (body.reenviar_robo === true) {
            const [, linhas] = await sql.transaction([ator(sessao), sql`
                UPDATE agendamentos SET clincare_reserva_status =
                    CASE WHEN status = 'cancelado' THEN 'cancelar_pendente' ELSE 'pendente' END,
                    clincare_reserva_erro = NULL
                WHERE id = ${id} AND status IN ('confirmado', 'cancelado') RETURNING id
            `]);
            if (!linhas.length) return erro('A aula não está disponível para reenvio.', 409);
            const disparo = await dispararRoboReservaClinCare(id);
            return disparo.ok ? NextResponse.json({ sucesso: true }) : erro(disparo.erro || 'Falha no reenvio.', 502);
        }

        const professor = Number(body.professor_id ?? aula.professor_id);
        const unidade = Number(body.unidade_id ?? aula.unidade_id);
        const alunoId = body.aluno_id === undefined ? null : Number(body.aluno_id);
        const materia = materiaBase(String(body.materia ?? aula.materia ?? ''));
        const data = String(body.data ?? aula.data_iso);
        const inicio = String(body.hora_inicio ?? aula.inicio);
        const duracaoOriginal = aula.fim && aula.inicio
            ? horaParaMinutos(aula.fim) - horaParaMinutos(aula.inicio) : 0;
        const duracao = Number(body.duracao_minutos ?? (duracaoOriginal > 0 ? duracaoOriginal : aula.duracao_minutos || 100));
        const fimMinutos = horaParaMinutos(inicio) + duracao;
        if (edicao) {
            const dataValida = new Date(data + 'T12:00:00Z');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !Number.isFinite(dataValida.getTime()) ||
                dataValida.toISOString().slice(0, 10) !== data ||
                !/^([01]\d|2[0-3]):[0-5]\d$/.test(inicio) ||
                !Number.isInteger(duracao) || duracao < 10 || duracao > 300 || fimMinutos >= 1440 ||
                !materia || !idValido(professor) || !idValido(unidade) || (alunoId !== null && !idValido(alunoId))) {
                return erro('Confira aluno, unidade, professor, matéria, data e duração.', 400);
            }
            const [destino] = await sql`
                SELECT p.id, p.materias FROM professores p JOIN unidades u ON u.id = p.unidade_id
                WHERE p.id = ${professor} AND u.id = ${unidade}
                AND ((p.ativo AND u.ativa) OR (p.id = ${aula.professor_id} AND u.id = ${aula.unidade_id}))
            `;
            if (!destino) return erro('Escolha um professor vinculado à unidade selecionada.', 400);
            if ((professor !== aula.professor_id || materia !== materiaBase(aula.materia)) &&
                !materiasBase(destino.materias).includes(materia)) {
                return erro('Selecione uma matéria cadastrada para o professor de destino.', 400);
            }
        }
        const aluno = alunoId === null ? null : (await sql`
            SELECT al.id, al.nome_aluno, al.serie, al.colegio_nome,
                coalesce(nullif(r.nome, ''), al.responsavel_nome, '') AS responsavel,
                coalesce(nullif(r.telefone_formatado, ''), nullif(al.telefone_formatado, ''), al.telefone, '') AS telefone
            FROM alunos al LEFT JOIN responsaveis r ON r.id = al.responsavel_id
            WHERE al.id = ${alunoId} AND al.ativo
        `)[0];
        if (alunoId !== null && !aluno) return erro('Aluno não encontrado.', 400);
        const cancelar = status === 'cancelado';
        const lancado = typeof body.lancado_clincare === 'boolean' ? body.lancado_clincare : null;
        const [, linhas] = await sql.transaction([ator(sessao), sql`
            UPDATE agendamentos a SET
                unidade_id = CASE WHEN ${edicao} THEN ${unidade} ELSE a.unidade_id END,
                professor_id = CASE WHEN ${edicao} THEN ${professor} ELSE a.professor_id END,
                materia = CASE WHEN ${edicao} THEN ${rotuloMateriaAula(materia, duracao)} ELSE a.materia END,
                data = CASE WHEN ${edicao} THEN ${edicao ? data : null}::date ELSE a.data END,
                hora_inicio = CASE WHEN ${edicao} THEN ${edicao ? inicio : null}::time ELSE a.hora_inicio END,
                hora_fim = CASE WHEN ${edicao} THEN ${edicao ? minutosParaHora(fimMinutos) : null}::time ELSE a.hora_fim END,
                duracao_minutos = CASE WHEN ${edicao} THEN ${edicao ? duracao : null} ELSE a.duracao_minutos END,
                aluno_id = coalesce(${aluno?.id ?? null}, a.aluno_id),
                aluno_nome = coalesce(${aluno?.nome_aluno ?? null}, a.aluno_nome),
                serie = coalesce(${aluno ? aluno.serie || '' : null}, a.serie),
                colegio_nome = coalesce(${aluno ? aluno.colegio_nome || '' : null}, a.colegio_nome),
                responsavel_nome = coalesce(${aluno?.responsavel ?? null}, a.responsavel_nome),
                aluno_telefone = coalesce(${aluno?.telefone ?? null}, a.aluno_telefone),
                observacoes = coalesce(${typeof body.observacoes === 'string' ? body.observacoes.trim().slice(0, 10000) : null}, a.observacoes),
                feedback_professor = coalesce(${typeof body.feedback_professor === 'string' ? body.feedback_professor.trim().slice(0, 10000) : null}, a.feedback_professor),
                lancado_clincare = coalesce(${lancado}, a.lancado_clincare),
                sincronizado_clincare = coalesce(${lancado}, a.sincronizado_clincare),
                status = coalesce(${status ?? null}, a.status),
                clincare_reserva_status = CASE
                    WHEN ${cancelar} AND a.clincare_reserva_status IN ('reservado', 'reservando', 'cancelar_pendente', 'cancelando', 'cancelar_erro')
                        THEN 'cancelar_pendente'
                    WHEN ${cancelar} THEN 'cancelado_clincare'
                    WHEN a.status = 'cancelado' AND ${status ?? null}::text IS NOT NULL
                        AND a.clincare_reserva_status IN ('cancelar_pendente', 'cancelar_erro')
                        THEN 'reservado'
                    WHEN ${status ?? null}::text = 'confirmado' AND a.status = 'cancelado'
                        AND a.clincare_reserva_status = 'cancelado_clincare'
                        AND EXISTS (SELECT 1 FROM unidades u WHERE u.id = a.unidade_id
                            AND nullif(trim(u.clin_care_id), '') IS NOT NULL AND u.clin_care_id NOT LIKE 'id-%')
                        THEN 'pendente'
                    ELSE a.clincare_reserva_status END,
                clincare_reserva_erro = CASE WHEN ${cancelar} THEN NULL ELSE a.clincare_reserva_erro END
            WHERE a.id = ${id} AND a.excluido_em IS NULL AND a.professor_id IS NOT DISTINCT FROM ${aula.professor_id}
            RETURNING status, clincare_reserva_status
        `]);
        if (!linhas.length) return erro('A aula foi alterada. Reabra e tente novamente.', 409);
        const reativar = status === 'confirmado' && aula.status === 'cancelado' && linhas[0].clincare_reserva_status === 'pendente';
        const disparo = (cancelar && linhas[0].clincare_reserva_status === 'cancelar_pendente') || reativar
            ? await dispararRoboReservaClinCare(id) : null;
        const mudouAgenda = edicao && (professor !== aula.professor_id || unidade !== aula.unidade_id ||
            data !== aula.data_iso || inicio !== aula.inicio || duracao !== (duracaoOriginal || aula.duracao_minutos));
        const aviso = disparo && !disparo.ok
            ? 'Status salvo no R4. A atualização no ClinCare ficou pendente.'
            : mudouAgenda && (aula.clincare_reserva_status === 'reservado' || aula.lancado_clincare)
                ? 'Alteração salva no R4. Atualize também a reserva já lançada no ClinCare.'
                : null;
        return NextResponse.json({ sucesso: true, status: linhas[0].status, aviso });
    } catch (error) {
        console.error('Atualização do agendamento:', error);
        if (typeof error === 'object' && error && 'code' in error && error.code === '23514') {
            return erro('O banco recusou a alteração por uma restrição de dados. Confira a configuração da agenda.', 409);
        }
        return erro('Não foi possível salvar a alteração.', 500);
    }
}

export async function PUT(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    if (!sessao || sessao.role === 'professor') return erro('Não autorizado.', sessao ? 403 : 401);
    const id = Number(req.nextUrl.searchParams.get('id'));
    if (!idValido(id)) return erro('Agendamento inválido.', 400);
    if (Number(req.headers.get('content-length')) > MAX_ANEXO + 16384) return erro('Limite de 2 MB por anexo.', 413);
    try {
        const arquivo = (await req.formData()).get('arquivo');
        if (!(arquivo instanceof File) || !arquivo.size || arquivo.size > MAX_ANEXO) {
            return erro('Selecione um arquivo de até 2 MB.', 400);
        }
        const nome = arquivo.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180) || 'material';
        const dados = Buffer.from(await arquivo.arrayBuffer()).toString('base64');
        await garantirColunasExtrasAgendamento();
        const [, linhas] = await sql.transaction([
            sql`SELECT id FROM agendamentos WHERE id = ${id} AND excluido_em IS NULL FOR UPDATE`,
            sql`WITH inserido AS (
                INSERT INTO r4_agendamento_anexos (agendamento_id, nome, tamanho, conteudo)
                SELECT id, ${nome}, ${arquivo.size}, decode(${dados}, 'base64')
                FROM agendamentos WHERE id = ${id} AND excluido_em IS NULL
                AND (SELECT count(*) FROM r4_agendamento_anexos WHERE agendamento_id = ${id}) < 10
                RETURNING agendamento_id
            )
            INSERT INTO r4_agendamento_historico (agendamento_id, acao, responsavel)
            SELECT agendamento_id, ${'Anexo adicionado: ' + nome}, ${sessao.nome} FROM inserido RETURNING id`,
        ]);
        return linhas.length ? NextResponse.json({ sucesso: true }) : erro('Aula indisponível ou limite de 10 anexos atingido.', 409);
    } catch (error) {
        console.error('Envio de anexo:', error);
        return erro('Não foi possível anexar o arquivo.', 500);
    }
}

export async function DELETE(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    if (!sessao || sessao.role === 'professor') return erro('Não autorizado.', sessao ? 403 : 401);
    const id = Number(req.nextUrl.searchParams.get('id'));
    const anexo = Number(req.nextUrl.searchParams.get('anexo'));
    if (!idValido(id)) return erro('Agendamento inválido.', 400);
    if (req.nextUrl.searchParams.has('anexo') && !idValido(anexo)) return erro('Anexo inválido.', 400);
    try {
        await garantirColunasExtrasAgendamento();
        if (idValido(anexo)) {
            const linhas = await sql`WITH removido AS (
                DELETE FROM r4_agendamento_anexos WHERE id = ${anexo} AND agendamento_id = ${id}
                    AND EXISTS (SELECT 1 FROM agendamentos WHERE id = ${id} AND excluido_em IS NULL)
                RETURNING agendamento_id, nome
            )
            INSERT INTO r4_agendamento_historico (agendamento_id, acao, responsavel)
            SELECT agendamento_id, 'Anexo removido: ' || nome, ${sessao.nome} FROM removido RETURNING id`;
            return linhas.length ? NextResponse.json({ sucesso: true }) : erro('Anexo não encontrado.', 404);
        }
        const [, linhas] = await sql.transaction([ator(sessao), sql`
            UPDATE agendamentos SET excluido_em = now(), status = 'cancelado',
                clincare_reserva_status = CASE
                    WHEN clincare_reserva_status IN ('reservado', 'reservando', 'cancelando', 'cancelar_pendente', 'cancelar_erro')
                    THEN 'cancelar_pendente' ELSE 'cancelado_clincare' END,
                clincare_reserva_erro = NULL
            WHERE id = ${id} AND excluido_em IS NULL RETURNING clincare_reserva_status
        `]);
        if (!linhas.length) return erro('Aula não encontrada.', 404);
        const disparo = linhas[0].clincare_reserva_status === 'cancelar_pendente'
            ? await dispararRoboReservaClinCare(id) : null;
        return NextResponse.json({ sucesso: true, aviso: disparo && !disparo.ok
            ? 'Aula excluída do R4. A atualização no ClinCare ficou pendente.' : null });
    } catch (error) {
        console.error('Exclusão do agendamento:', error);
        return erro('Não foi possível concluir a exclusão.', 500);
    }
}
