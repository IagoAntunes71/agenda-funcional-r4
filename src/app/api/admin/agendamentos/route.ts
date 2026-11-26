import { unidadeOnline } from '@/lib/unidade-online';
import { lerOperacaoR4, professorDaAula } from '@/lib/operacao-r4-db';
import { podeOperacao } from '@/lib/operacao-r4';
import { obterAgoraBahia, adicionarDiasISO } from '@/lib/horarios-reforco';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { lerSessaoAdmin, type SessaoAdmin } from '@/lib/admin-auth';
import { garantirStatusAgendamentoR4 } from '@/lib/agendamento-status-schema';
import { garantirHistoricoAgendamento } from '@/lib/agendamento-historico';
import { materiaBase, materiasBase, rotuloMateriaAula } from '@/lib/materia-aula';
import { LISTA_STATUS_AULA_R4 } from '@/lib/agenda-status-r4';
import { horaParaMinutos, minutosParaHora } from '@/lib/horarios-reforco';

async function garantirColunasExtrasAgendamento() {
    await garantirHistoricoAgendamento();
    await garantirStatusAgendamentoR4();
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
        const cfg = await lerOperacaoR4();
        if (!podeOperacao(cfg, sessao.role, 'agenda')) return erro('Seu perfil não pode criar aulas.', 403);
        const body = await req.json();
        const acompanhamento = body?.acompanhamento === true;
        if (acompanhamento && !cfg.acompanhamento) return erro('Aulas de acompanhamento estão desativadas.', 403);

        let unidadeId = Number(body?.unidade_id || 0);
        const professorId = Number(body?.professor_id || 0);
        const materia = materiaBase(String(body?.materia || ''));
        const data = String(body?.data || '').trim();
        const horaInicio = String(body?.hora_inicio || '').trim();
        const duracaoMinutos = Number(body?.duracao_minutos || 100);
        const observacoes = String(body?.observacoes || '').trim() || null;
        const status = String(body?.status || 'confirmado').trim();
        const recorrencia = Math.min(Math.max(Math.floor(Number(body?.recorrencia_semanas) || 1), 1), 12);

        if (!cfg.status[status]?.ativo || (sessao.role === 'professor' && !['agendado', 'confirmado'].includes(status))) return erro('Status indisponível.', 400);
        if (!dataISOValida(data)) return erro('Data inválida.', 400);
        if (sessao.role !== 'admin' && cfg.bloquearRetroativo && data < obterAgoraBahia().dataISO) return erro('Agendamento retroativo bloqueado.', 403);
        if (!unidadeId && !cfg.unidadeObrigatoria) {
            const [prof] = await sql`SELECT unidade_id FROM professores WHERE id = ${professorId}`;
            unidadeId = prof?.unidade_id || 0;
        }

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
        const [destino] = await sql`SELECT p.id, p.grupo_professor, p.materias FROM professores p JOIN unidades u ON u.id = ${unidadeId}
            WHERE p.id = ${professorId} AND p.unidade_id IN (u.id, u.unidade_presencial_id) AND p.ativo AND u.ativa`;
        if (!destino || !materiasBase(destino.materias).includes(materia)) {
            return erro('Selecione uma matéria cadastrada para o professor.', 400);
        }

        if (sessao.role === 'professor' && !professorDaAula(await professorVinculado(sessao), { id: destino.id, grupo_professor: destino.grupo_professor })) {
            return erro('Você só pode agendar na sua própria agenda.', 403);
        }
        if (!podeOperacao(cfg, sessao.role, 'simultaneos')) {
            const datas = Array.from({ length: recorrencia }, (_, i) => adicionarDiasISO(data, i * 7));
            for (const dia of datas) {
                if (await existeSobreposicao(professorId, dia, horaInicio, minutosParaHora(horaParaMinutos(horaInicio) + duracaoMinutos))) {
                    return erro('Já existe uma aula nesse horário.', 409);
                }
            }
        }

        if (Number(body?.aluno_id) > 0 && !podeOperacao(cfg, sessao.role, 'todosAlunos') &&
            !await alunoAtendidoPor(sessao, Number(body.aluno_id))) return erro('Aluno fora do seu acesso.', 403);

        let alunoId = Number(body?.aluno_id || 0);
        let nomeAluno = '';
        let nomeResponsavel = '';
        let telefoneAluno = '';
        let colegioAluno = '';
        let serieAluno = '';

        if (body?.novo_aluno && body.novo_aluno.nome_aluno) {
            if (!podeOperacao(cfg, sessao.role, 'editarAlunos') || (sessao.role === 'atendimento' && !cfg.recepcaoCadastra)) {
                return erro('Seu perfil não pode cadastrar alunos.', 403);
            }
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
                WHERE al.id = ${alunoId} AND coalesce(al.ativo,true)
                LIMIT 1
            `) as {
                nome_aluno: string;
                responsavel_nome: string;
                telefone: string;
                colegio_nome: string;
                serie: string;
            }[];

            if (!alunosDb[0]) return erro('Aluno não encontrado ou inativo.', 404);
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
                    criado_por_nome, acompanhamento
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
                    ${sessao.nome}, ${acompanhamento}
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

function dataISOValida(data: string) {
    const dia = new Date(data + 'T12:00:00Z');
    return /^\d{4}-\d{2}-\d{2}$/.test(data) && Number.isFinite(dia.getTime()) && dia.toISOString().slice(0, 10) === data;
}

async function professorVinculado(sessao: SessaoAdmin) {
    const [prof] = await sql`SELECT id, grupo_professor FROM professores WHERE id = ${sessao.professor_id}`;
    return prof as { id: number; grupo_professor?: string | null } | undefined;
}

async function alunoAtendidoPor(sessao: SessaoAdmin, aluno: number) {
    const [vinculo] = await sql`SELECT a.id FROM agendamentos a
        JOIN professores p ON p.id = a.professor_id JOIN professores v ON v.id = ${sessao.professor_id}
        WHERE a.aluno_id = ${aluno} AND a.excluido_em IS NULL AND a.status IN ('realizado', 'concluido')
            AND (v.id = p.id OR nullif(v.grupo_professor,'') = nullif(p.grupo_professor,''))
        LIMIT 1`;
    return Boolean(vinculo);
}

async function feedbackPermitido(sessao: SessaoAdmin, aula: Record<string, unknown>, prazo: number | null) {
    return sessao.role === 'professor' && !aula.excluido_em &&
        professorDaAula(await professorVinculado(sessao), { id: Number(aula.professor_id), grupo_professor: String(aula.professor_grupo_professor || '') }) &&
        (prazo === null || obterAgoraBahia().dataISO <= adicionarDiasISO(String(aula.data_iso), prazo));
}

async function existeSobreposicao(professor: number, data: string, inicio: string, fim: string, ignorar = 0) {
    const [choque] = await sql`
        SELECT a.id FROM agendamentos a JOIN professores p ON p.id = a.professor_id
        JOIN professores alvo ON alvo.id = ${professor}
        WHERE (p.id = alvo.id OR nullif(p.grupo_professor,'') = nullif(alvo.grupo_professor,''))
          AND a.id <> ${ignorar} AND a.excluido_em IS NULL AND a.data = ${data}::date
          AND coalesce(a.status,'confirmado') IN ('agendado','confirmado','realizado','concluido','reservado','pendente')
          AND coalesce(a.hora_inicio,a.horario) < ${fim}::time
          AND coalesce(a.hora_fim, coalesce(a.hora_inicio,a.horario) + make_interval(mins => coalesce(a.duracao_minutos,100))) > ${inicio}::time
        LIMIT 1
    `;
    return Boolean(choque);
}

async function buscarAula(id: number, sessao: SessaoAdmin, outras = false) {
    const [aula] = await sql`
        SELECT a.*, to_char(a.data, 'YYYY-MM-DD') AS data_iso,
            to_char(coalesce(a.hora_inicio, a.horario), 'HH24:MI') AS inicio,
            to_char(a.hora_fim, 'HH24:MI') AS fim,
            p.nome AS professor_nome, p.grupo_professor AS professor_grupo_professor, u.nome AS unidade_nome
        FROM agendamentos a
        LEFT JOIN professores p ON p.id = a.professor_id
        LEFT JOIN unidades u ON u.id = a.unidade_id
        WHERE a.id = ${id}
          AND (${sessao.role !== 'professor' || outras} OR EXISTS (
            SELECT 1 FROM professores vinculado
            WHERE vinculado.id = ${sessao.professor_id}
              AND (vinculado.id = p.id OR nullif(vinculado.grupo_professor, '') = nullif(p.grupo_professor, ''))
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
        const cfg = await lerOperacaoR4();
        const aula = await buscarAula(id, sessao, podeOperacao(cfg, sessao.role, 'outrasAgendas'));
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
        const professor = sessao.role === 'professor';
        const exibirContato = !professor || unidadeOnline(aula.unidade_nome);
        const [historico, anexos] = await Promise.all([
            professor ? [] : sql`SELECT id, acao, responsavel, campos, criado_em FROM r4_agendamento_historico
                WHERE agendamento_id = ${id} ORDER BY id DESC`,
            sql`SELECT id, nome, tamanho, criado_em FROM r4_agendamento_anexos
                WHERE agendamento_id = ${id} ORDER BY id DESC`,
        ]);
        const registroOriginal = !professor && aula.criado_em && !historico.some((item) => item.acao === 'Agendamento criado')
            ? [{
                id: 'original', acao: 'Registro original do agendamento',
                responsavel: aula.criado_por_nome || 'Responsável não registrado',
                criado_em: aula.criado_em, campos: [],
            }] : [];
        return NextResponse.json({
            aula: {
                status: aula.status, aluno_id: aula.aluno_id, data: aula.data_iso,
                hora_inicio: aula.inicio, hora_fim: aula.fim, duracao_minutos: aula.duracao_minutos,
                materia: aula.materia, unidade_id: aula.unidade_id, unidade_nome: aula.unidade_nome,
                professor_id: aula.professor_id, professor_nome: aula.professor_nome,
                nome_aluno: aula.aluno_nome || aula.nome_aluno,
                serie_aluno: aula.serie || aula.serie_aluno,
                colegio_aluno: aula.colegio_nome || aula.colegio_aluno,
                nome_responsavel: exibirContato ? aula.responsavel_nome || aula.nome_responsavel : '',
                whatsapp_link_aula: exibirContato ? aula.whatsapp_link_aula : null,
                whatsapp_responsavel: exibirContato ? aula.aluno_telefone || aula.whatsapp_responsavel : '',
                observacoes: aula.observacoes, feedback_professor: aula.feedback_professor,
                excluido_em: aula.excluido_em,
            },
            historico: [...historico, ...registroOriginal], anexos,
            podeEditarFeedback: await feedbackPermitido(sessao, aula, cfg.prazoFeedback),
            podeEditarAgenda: podeOperacao(cfg, sessao.role, 'agenda') && !aula.excluido_em &&
                (sessao.role !== 'professor' || professorDaAula(await professorVinculado(sessao), { id: aula.professor_id, grupo_professor: aula.professor_grupo_professor })),
            podeAnexar: podeOperacao(cfg, sessao.role, 'anexos') && !aula.excluido_em &&
                (sessao.role !== 'professor' || professorDaAula(await professorVinculado(sessao), { id: aula.professor_id, grupo_professor: aula.professor_grupo_professor })),
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
        if ('feedback_professor' in body) {
            if (sessao.role !== 'professor') return erro('Somente o professor responsável pode editar o feedback.', 403);
            if (typeof body.feedback_professor !== 'string' || body.feedback_professor.length > 10000) {
                return erro('O feedback deve ter até 10.000 caracteres.', 400);
            }
        }
        const cfg = await lerOperacaoR4();
        let status = body.status === 'concluido' ? 'realizado' : body.status;
        if (status !== undefined && !LISTA_STATUS_AULA_R4.some((item) => item.valor === status)) {
            return erro('Status inválido.', 400);
        }
        const camposAgenda = ['professor_id', 'unidade_id', 'aluno_id', 'data', 'hora_inicio', 'materia', 'duracao_minutos', 'observacoes'];
        const edicao = camposAgenda.some((campo) => campo in body);
        if (sessao.role === 'professor' &&
            status !== undefined && status !== 'realizado') return erro('Seu perfil não permite essa alteração.', 403);

        if (edicao && !podeOperacao(cfg, sessao.role, 'agenda')) {
            return erro('Seu perfil não pode gerenciar a agenda.', 403);
        }
        if (status && !cfg.status[status]?.ativo) return erro('Este status está desativado.', 400);
        await garantirColunasExtrasAgendamento();
        const aula = await buscarAula(id, sessao);
        if (!aula || aula.excluido_em) return erro('Aula não encontrada.', 404);
        if ('feedback_professor' in body) {
            if (!(await feedbackPermitido(sessao, aula, cfg.prazoFeedback))) return erro('O prazo para editar este feedback terminou.', 403);
            if (cfg.permissoes.professor.feedbackRealiza && body.feedback_professor.trim() &&
                ['confirmado', 'agendado', 'reservado', 'pendente'].includes(aula.status)) status = 'realizado';
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
                SELECT p.id, p.grupo_professor, p.materias FROM professores p JOIN unidades u ON u.id = ${unidade}
                WHERE p.id = ${professor} AND p.unidade_id IN (u.id, u.unidade_presencial_id)
                AND ((p.ativo AND u.ativa) OR (p.id = ${aula.professor_id} AND u.id = ${aula.unidade_id}))
            `;
            if (!destino) return erro('Escolha um professor vinculado à unidade selecionada.', 400);
            if (sessao.role === 'professor' && !professorDaAula(await professorVinculado(sessao), { id: destino.id, grupo_professor: destino.grupo_professor })) return erro('Você só pode editar sua própria agenda.', 403);
            if (sessao.role !== 'admin' && cfg.bloquearRetroativo && data !== aula.data_iso && data < obterAgoraBahia().dataISO) {
                return erro('Agendamento retroativo bloqueado.', 403);
            }
            if ((professor !== aula.professor_id || data !== aula.data_iso || inicio !== aula.inicio ||
                duracao !== duracaoOriginal) && !podeOperacao(cfg, sessao.role, 'simultaneos') &&
                await existeSobreposicao(professor, data, inicio, minutosParaHora(fimMinutos), id)) return erro('Já existe uma aula nesse horário.', 409);
            if ((professor !== aula.professor_id || materia !== materiaBase(aula.materia)) &&
                !materiasBase(destino.materias).includes(materia)) {
                return erro('Selecione uma matéria cadastrada para o professor de destino.', 400);
            }
        }
        if (alunoId !== null && !podeOperacao(cfg, sessao.role, 'todosAlunos') &&
            !await alunoAtendidoPor(sessao, alunoId)) return erro('Aluno fora do seu acesso.', 403);
        const aluno = alunoId === null ? null : (await sql`
            SELECT al.id, al.nome_aluno, al.serie, al.colegio_nome,
                coalesce(nullif(r.nome, ''), al.responsavel_nome, '') AS responsavel,
                coalesce(nullif(r.telefone_formatado, ''), nullif(al.telefone_formatado, ''), al.telefone, '') AS telefone
            FROM alunos al LEFT JOIN responsaveis r ON r.id = al.responsavel_id
            WHERE al.id = ${alunoId} AND al.ativo
        `)[0];
        if (alunoId !== null && !aluno) return erro('Aluno não encontrado.', 400);
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
                status = coalesce(${status ?? null}, a.status)
            WHERE a.id = ${id} AND a.excluido_em IS NULL AND a.professor_id IS NOT DISTINCT FROM ${aula.professor_id}
            RETURNING status
        `]);
        if (!linhas.length) return erro('A aula foi alterada. Reabra e tente novamente.', 409);
        return NextResponse.json({ sucesso: true, status: linhas[0].status });
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
    if (!sessao) return erro('Não autorizado.', 401);
    const id = Number(req.nextUrl.searchParams.get('id'));
    if (!idValido(id)) return erro('Agendamento inválido.', 400);
    if (Number(req.headers.get('content-length')) > MAX_ANEXO + 16384) return erro('Limite de 2 MB por anexo.', 413);
    try {
        const cfg = await lerOperacaoR4();
        if (!podeOperacao(cfg, sessao.role, 'anexos')) return erro('Seu perfil não pode anexar arquivos.', 403);
        await garantirColunasExtrasAgendamento();
        const aula = await buscarAula(id, sessao);
        if (!aula || aula.excluido_em) return erro('Aula não encontrada.', 404);
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
    if (!sessao) return erro('Não autorizado.', 401);
    const id = Number(req.nextUrl.searchParams.get('id'));
    const anexo = Number(req.nextUrl.searchParams.get('anexo'));
    if (!idValido(id)) return erro('Agendamento inválido.', 400);
    if (req.nextUrl.searchParams.has('anexo') && !idValido(anexo)) return erro('Anexo inválido.', 400);
    try {
        await garantirColunasExtrasAgendamento();
        const cfg = await lerOperacaoR4();
        if (idValido(anexo) ? !podeOperacao(cfg, sessao.role, 'anexos') :
            sessao.role === 'professor' || !podeOperacao(cfg, sessao.role, 'agenda')) return erro('Não autorizado.', 403);
        const aula = await buscarAula(id, sessao);
        if (!aula || aula.excluido_em) return erro('Aula não encontrada.', 404);
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
            UPDATE agendamentos SET excluido_em = now(), status = 'cancelado'
            WHERE id = ${id} AND excluido_em IS NULL RETURNING id
        `]);
        if (!linhas.length) return erro('Aula não encontrada.', 404);
        return NextResponse.json({ sucesso: true });
    } catch (error) {
        console.error('Exclusão do agendamento:', error);
        return erro('Não foi possível concluir a exclusão.', 500);
    }
}
