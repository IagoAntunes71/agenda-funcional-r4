import { NextRequest, NextResponse } from 'next/server';
import { lerSessaoAdmin } from '@/lib/admin-auth';
import { lerOperacaoR4, gravarOperacaoR4 } from '@/lib/operacao-r4-db';
import { podeOperacao, validarOperacao } from '@/lib/operacao-r4';
import { obterAgoraBahia } from '@/lib/horarios-reforco';
import { normalizarStatusAulaR4 } from '@/lib/agenda-status-r4';
import { garantirHistoricoAgendamento } from '@/lib/agendamento-historico';
import { sql } from '@/lib/db';

function erro(error: string, status: number) { return NextResponse.json({ error }, { status }); }
const mesValido = /^(20\d{2})-(0[1-9]|1[0-2])$/;

export async function GET(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    if (!sessao) return erro('Não autorizado.', 401);
    try {
        const cfg = await lerOperacaoR4();
        const painel = req.nextUrl.searchParams.get('painel');
        if (!painel) return NextResponse.json({ cfg });
        if (!['metas', 'alunos', 'recepcao'].includes(painel)) return erro('Consulta inválida.', 400);
        if (painel === 'metas' && sessao.role === 'atendimento') return erro('Não autorizado.', 403);
        if (painel === 'recepcao' && sessao.role === 'professor' && !cfg.exibirRepasses) return erro('Repasses ocultos.', 403);
        const hoje = obterAgoraBahia().dataISO;
        const mes = req.nextUrl.searchParams.get('mes') || hoje.slice(0, 7);
        if (!mesValido.test(mes)) return erro('Mês inválido.', 400);
        const inicio = mes + '-01';
        const soProprio = (sessao.role === 'professor' && (painel !== 'alunos' || !podeOperacao(cfg, sessao.role, 'outrasAgendas'))) ||
            (painel === 'alunos' && !podeOperacao(cfg, sessao.role, 'outrasAgendas'));
        await garantirHistoricoAgendamento();
        if (painel === 'metas') {
            const metas = await sql`
                SELECT coalesce(nullif(p.clin_care_id, ''), 'r4-' || p.id::text) AS chave,
                    min(p.nome) AS professor, count(*)::int AS total,
                    count(*) FILTER (WHERE nullif(trim(a.feedback_professor), '') IS NOT NULL)::int AS feitos,
                    count(*) FILTER (WHERE nullif(trim(a.feedback_professor), '') IS NULL
                        AND ${cfg.prazoFeedback}::int IS NOT NULL
                        AND ${hoje}::date > a.data + ${cfg.prazoFeedback}::int)::int AS vencidos
                FROM agendamentos a JOIN professores p ON p.id = a.professor_id
                WHERE a.excluido_em IS NULL AND a.status IN ('realizado','concluido')
                  AND a.data >= ${inicio}::date AND a.data < ${inicio}::date + interval '1 month' AND a.data <= ${hoje}::date
                  AND (NOT ${soProprio} OR EXISTS (SELECT 1 FROM professores v WHERE v.id = ${sessao.professor_id}
                    AND (v.id = p.id OR nullif(v.clin_care_id, '') = nullif(p.clin_care_id, ''))))
                GROUP BY 1 ORDER BY min(p.nome)
            `;
            return NextResponse.json({ metas });
        }
        const deslocamento = Math.max(0, Math.min(100000, Math.floor(Number(req.nextUrl.searchParams.get('offset')) || 0)));
        const busca = (req.nextUrl.searchParams.get('busca') || '').trim().slice(0, 100).toLowerCase();
        const unidade = Number(req.nextUrl.searchParams.get('unidade')) || 0;
        const status = req.nextUrl.searchParams.get('status') || '';
        const filtro = painel === 'alunos';
        const linhas = await sql`
            WITH escopo AS (
            SELECT a.id, a.aluno_id, coalesce(nullif(a.aluno_nome,''), a.nome_aluno, 'Aluno') AS aluno,
                p.nome AS professor, u.nome AS unidade, a.materia, a.status, a.acompanhamento,
                to_char(a.data,'YYYY-MM-DD') AS data,
                to_char(coalesce(a.hora_inicio, a.horario),'HH24:MI') AS inicio,
                to_char(a.hora_fim,'HH24:MI') AS fim,
                coalesce(nullif(extract(epoch FROM (a.hora_fim - coalesce(a.hora_inicio,a.horario))) / 60, 0), a.duracao_minutos, 100)::int AS duracao,
                CASE WHEN ${filtro} THEN a.feedback_professor END AS feedback,
                CASE WHEN ${filtro} THEN plano.plano END AS plano,
                CASE WHEN ${filtro} THEN plano.orientacoes END AS orientacoes,
                coalesce(a.status,'confirmado') IN ('agendado','confirmado','pendente','reservado') AS previsao
            FROM agendamentos a LEFT JOIN professores p ON p.id = a.professor_id
                LEFT JOIN unidades u ON u.id = a.unidade_id
                LEFT JOIN r4_planos_alunos plano ON plano.aluno_id = a.aluno_id
            WHERE a.excluido_em IS NULL AND a.data >= ${inicio}::date AND a.data < ${inicio}::date + interval '1 month'
              AND (NOT ${filtro} OR nullif(trim(a.feedback_professor), '') IS NOT NULL
                OR (a.status IN ('realizado', 'concluido') AND a.aluno_id IS NOT NULL))
              AND (${unidade} = 0 OR a.unidade_id = ${unidade})
              AND (${status} = '' OR a.status = ${status} OR (${status} = 'realizado' AND a.status = 'concluido'))
              AND strpos(lower(concat_ws(' ', a.aluno_nome,a.nome_aluno,p.nome,a.materia,u.nome)), ${busca}) > 0
              AND (NOT ${filtro} OR ${podeOperacao(cfg, sessao.role, 'todosAlunos')} OR EXISTS (
                SELECT 1 FROM agendamentos anterior JOIN professores p2 ON p2.id = anterior.professor_id
                JOIN professores v ON v.id = ${sessao.professor_id}
                WHERE anterior.aluno_id = a.aluno_id AND anterior.excluido_em IS NULL
                  AND anterior.status IN ('realizado', 'concluido')
                  AND (v.id = p2.id OR nullif(v.clin_care_id,'') = nullif(p2.clin_care_id,''))
              ) OR (${sessao.role === 'professor'} AND a.aluno_id IS NULL AND EXISTS (
                SELECT 1 FROM professores v WHERE v.id = ${sessao.professor_id}
                AND (v.id = p.id OR nullif(v.clin_care_id,'') = nullif(p.clin_care_id,''))
              )))
              AND (NOT ${soProprio} OR EXISTS (SELECT 1 FROM professores v WHERE v.id = ${sessao.professor_id}
                AND (v.id = p.id OR nullif(v.clin_care_id,'') = nullif(p.clin_care_id,''))))
            ), financeiro AS (
                SELECT *,
                    CASE WHEN (previsao OR status IN ('realizado','concluido','desmarcado_com_cobranca'))
                          AND NOT (coalesce(status,'confirmado') = 'desmarcado_com_cobranca' AND ${cfg.desmarcadoSemRepasse})
                        THEN CASE WHEN duracao >= 100 THEN 60 ELSE 30 END ELSE 0 END AS repasse,
                    CASE WHEN (previsao OR status IN ('realizado','concluido','desmarcado_com_cobranca')) AND NOT acompanhamento
                        THEN CASE WHEN duracao >= 100 THEN 200 ELSE 100 END ELSE 0 END AS cobrar
                FROM escopo
            )
            SELECT *, count(*) OVER ()::int AS total,
                coalesce(sum(repasse) FILTER (WHERE previsao) OVER (),0)::int AS repasse_previsto,
                coalesce(sum(repasse) FILTER (WHERE NOT previsao) OVER (),0)::int AS repasse_apurado,
                coalesce(sum(cobrar) OVER (),0)::int AS total_cobrar
            FROM financeiro
            ORDER BY data DESC, inicio, id
            LIMIT 51 OFFSET ${deslocamento}
        `;
        const resultados = linhas.slice(0, 50).map((linha) => {
            const situacao = normalizarStatusAulaR4(linha.status);
            if (filtro) return {
                id: linha.id, aluno_id: linha.aluno_id, aluno: linha.aluno, professor: linha.professor,
                unidade: linha.unidade, materia: linha.materia, data: linha.data, status: situacao,
                feedback: linha.feedback, plano: linha.plano, orientacoes: linha.orientacoes,
                inicio: cfg.exibirHorario ? linha.inicio : undefined, fim: cfg.exibirHorario ? linha.fim : undefined,
            };
            const { id, data, materia, repasse, previsao } = linha;
            if (sessao.role === 'professor') return { id, data, materia, repasse, previsao, status: situacao };
            return { id, data, materia, repasse, previsao, status: situacao, aluno: linha.aluno,
                professor: linha.professor, unidade: linha.unidade, inicio: linha.inicio, fim: linha.fim,
                cobrar: linha.cobrar, acompanhamento: linha.acompanhamento };
        });
        const primeira = linhas[0];
        const somas = filtro ? undefined : {
            repassePrevisto: primeira?.repasse_previsto ?? 0,
            repasseApurado: primeira?.repasse_apurado ?? 0,
            cobrar: sessao.role === 'professor' ? undefined : primeira?.total_cobrar ?? 0,
        };
        return NextResponse.json({ resultados, somas, total: primeira?.total ?? 0, temMais: linhas.length > 50 });
    } catch (e) {
        console.error('Operação do R4:', e);
        return erro('Não foi possível carregar os dados.', 500);
    }
}

export async function PUT(req: Request) {
    const sessao = await lerSessaoAdmin();
    if (!sessao || sessao.role !== 'admin') return erro('Acesso exclusivo do administrador.', sessao ? 403 : 401);
    try {
        const cfg = validarOperacao((await req.json()).cfg);
        if (!cfg) return erro('Confira os valores antes de salvar.', 400);
        await gravarOperacaoR4(cfg);
        return NextResponse.json({ cfg });
    } catch (e) {
        console.error('Salvar operação do R4:', e);
        return erro('Não foi possível salvar as configurações.', 500);
    }
}

export async function PATCH(req: Request) {
    const sessao = await lerSessaoAdmin();
    if (!sessao) return erro('Não autorizado.', 401);
    try {
        const cfg = await lerOperacaoR4();
        if (!podeOperacao(cfg, sessao.role, 'condutas')) return erro('Seu perfil não pode cadastrar orientações.', 403);
        const dados = await req.json();
        const aluno = Number(dados.aluno_id);
        if (!Number.isSafeInteger(aluno) || aluno <= 0 ||
            typeof dados.plano !== 'string' || typeof dados.orientacoes !== 'string' ||
            dados.plano.length > 5000 || dados.orientacoes.length > 5000) return erro('Dados do plano inválidos.', 400);
        const plano = dados.plano.trim();
        const orientacoes = dados.orientacoes.trim();
        if (cfg.exigirPlano && orientacoes && !plano) return erro('Cadastre o plano antes de registrar orientações.', 400);
        const [acesso] = await sql`
            SELECT al.id FROM alunos al WHERE al.id = ${aluno} AND (${podeOperacao(cfg, sessao.role, 'todosAlunos')} OR EXISTS (
                SELECT 1 FROM agendamentos a JOIN professores p ON p.id = a.professor_id
                JOIN professores v ON v.id = ${sessao.professor_id}
                WHERE a.aluno_id = al.id AND a.excluido_em IS NULL AND a.status IN ('realizado','concluido')
                    AND (v.id = p.id OR nullif(v.clin_care_id,'') = nullif(p.clin_care_id,''))
            ))
        `;
        if (!acesso) return erro('Aluno não disponível para seu perfil.', 404);
        await sql`INSERT INTO r4_planos_alunos (aluno_id, plano, orientacoes)
            VALUES (${aluno}, ${plano}, ${orientacoes})
            ON CONFLICT (aluno_id) DO UPDATE SET plano = excluded.plano, orientacoes = excluded.orientacoes, atualizado_em = now()`;
        return NextResponse.json({ sucesso: true });
    } catch (e) {
        console.error('Plano do aluno:', e);
        return erro('Não foi possível salvar o plano.', 500);
    }
}
