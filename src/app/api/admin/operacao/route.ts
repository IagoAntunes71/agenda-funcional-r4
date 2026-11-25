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
            const chaveMeta = req.nextUrl.searchParams.get('chaveMeta');
            if (chaveMeta !== null) {
                if (sessao.role !== 'admin') return erro('Não autorizado.', 403);
                if (!chaveMeta || chaveMeta.length > 160) return erro('Professor inválido.', 400);
                const aulas = await sql`
                    SELECT a.id, to_char(a.data, 'YYYY-MM-DD') AS data,
                        coalesce(nullif(a.aluno_nome,''), a.nome_aluno, 'Aluno') AS aluno,
                        a.materia, nullif(trim(a.feedback_professor), '') AS feedback,
                        (${cfg.prazoFeedback}::int IS NOT NULL AND ${hoje}::date > a.data + ${cfg.prazoFeedback}::int) AS vencido
                    FROM agendamentos a JOIN professores p ON p.id = a.professor_id
                    WHERE a.excluido_em IS NULL AND a.status IN ('realizado','concluido')
                      AND a.data >= ${inicio}::date AND a.data < ${inicio}::date + interval '1 month' AND a.data <= ${hoje}::date
                      AND coalesce(nullif(p.grupo_professor, ''), 'r4-' || p.id::text) = ${chaveMeta}
                    ORDER BY a.data DESC, a.id DESC
                `;
                return NextResponse.json({ aulas }, { headers: { 'Cache-Control': 'private, no-store' } });
            }
            const metas = await sql`
                SELECT coalesce(nullif(p.grupo_professor, ''), 'r4-' || p.id::text) AS chave,
                    min(p.nome) AS professor, count(*)::int AS total,
                    count(*) FILTER (WHERE nullif(trim(a.feedback_professor), '') IS NOT NULL)::int AS feitos,
                    count(*) FILTER (WHERE nullif(trim(a.feedback_professor), '') IS NULL
                        AND ${cfg.prazoFeedback}::int IS NOT NULL
                        AND ${hoje}::date > a.data + ${cfg.prazoFeedback}::int)::int AS vencidos
                FROM agendamentos a JOIN professores p ON p.id = a.professor_id
                WHERE a.excluido_em IS NULL AND a.status IN ('realizado','concluido')
                  AND a.data >= ${inicio}::date AND a.data < ${inicio}::date + interval '1 month' AND a.data <= ${hoje}::date
                  AND (NOT ${soProprio} OR EXISTS (SELECT 1 FROM professores v WHERE v.id = ${sessao.professor_id}
                    AND (v.id = p.id OR nullif(v.grupo_professor, '') = nullif(p.grupo_professor, ''))))
                GROUP BY 1 ORDER BY min(p.nome)
            `;
            return NextResponse.json({ metas });
        }
        const deslocamento = Math.max(0, Math.min(100000, Math.floor(Number(req.nextUrl.searchParams.get('offset')) || 0)));
        const busca = (req.nextUrl.searchParams.get('busca') || '').trim().slice(0, 100).toLowerCase();
        const unidade = Number(req.nextUrl.searchParams.get('unidade')) || 0;
        const status = req.nextUrl.searchParams.get('status') || '';
        const recepcao = painel === 'recepcao' && sessao.role !== 'professor';
        const params = req.nextUrl.searchParams;
        const termo = (chave: string) => recepcao ? (params.get(chave) || '').trim().slice(0, 100).toLowerCase() : '';
        const diaValido = (valor: string) => /^20\d{2}-\d{2}-\d{2}$/.test(valor) &&
            Number.isFinite(Date.parse(valor)) && new Date(valor + 'T00:00:00Z').toISOString().slice(0, 10) === valor;
        const de = termo('de');
        const ate = termo('ate');
        if ((de && !diaValido(de)) || (ate && !diaValido(ate)) || (de && ate && ate < de)) return erro('Período inválido.', 400);
        if (de && ate && Date.parse(ate) - Date.parse(de) > 366 * 86400000) return erro('Escolha um período de até um ano.', 400);
        const limite = recepcao && params.get('exportar') === '1' ? 5001 : 51;
        const filtro = painel === 'alunos';
        const linhas = await sql`
            WITH escopo AS (
            SELECT a.id, a.aluno_id, coalesce(nullif(a.aluno_nome,''), a.nome_aluno, 'Aluno') AS aluno,
                p.nome AS professor, p.id AS professor_id, u.nome AS unidade, a.unidade_id,
                a.materia, a.status, a.acompanhamento,
                coalesce(al.serie,a.serie,a.serie_aluno) AS serie, coalesce(al.colegio_nome,a.colegio_nome,a.colegio_aluno) AS colegio,
                coalesce(r.categoria,'') AS categoria, coalesce(r.convenio,'') AS convenio, coalesce(r.evento,'') AS evento,
                coalesce(r.entrada,'pendente') AS entrada, coalesce(r.saida,'pendente') AS saida,
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
                LEFT JOIN alunos al ON al.id = a.aluno_id
                LEFT JOIN r4_recepcao_registros r ON r.agendamento_id = a.id
                LEFT JOIN r4_planos_alunos plano ON plano.aluno_id = a.aluno_id
            WHERE a.excluido_em IS NULL AND a.data >= coalesce(nullif(${de}, '')::date, ${inicio}::date)
              AND a.data < coalesce(nullif(${ate}, '')::date + 1, (${inicio}::date + interval '1 month')::date)
              AND (${termo('professorAtivo')} <> 'sim' OR coalesce(p.ativo,true))
              AND (${termo('alunoAtivo')} <> 'sim' OR coalesce(al.ativo,true))
              AND (strpos(lower(coalesce(p.nome,'')), ${termo('professor')}) > 0)
              AND (strpos(lower(coalesce(a.aluno_nome,a.nome_aluno,'')), ${termo('aluno')}) > 0)
              AND (strpos(lower(coalesce(a.materia,'')), ${termo('materia')}) > 0)
              AND (strpos(lower(coalesce(r.categoria,'')), ${termo('categoria')}) > 0)
              AND (strpos(lower(coalesce(r.convenio,'')), ${termo('convenio')}) > 0)
              AND (strpos(lower(coalesce(r.evento,'')), ${termo('evento')}) > 0)
              AND (${termo('entrada')} = '' OR coalesce(r.entrada,'pendente') = ${termo('entrada')})
              AND (${termo('saida')} = '' OR coalesce(r.saida,'pendente') = ${termo('saida')})
              AND (${termo('acompanhamento')} = '' OR a.acompanhamento = (${termo('acompanhamento')} = 'sim'))
              AND (${termo('feedback')} = '' OR (nullif(trim(a.feedback_professor),'') IS NOT NULL) = (${termo('feedback')} = 'sim'))
              AND (${termo('dia')} = '' OR extract(dow FROM a.data)::text = ${termo('dia')})
              AND (${termo('periodo')} = '' OR CASE
                WHEN coalesce(a.hora_inicio,a.horario) < time '12:00' THEN 'manha'
                WHEN coalesce(a.hora_inicio,a.horario) < time '18:00' THEN 'tarde'
                ELSE 'noite' END = ${termo('periodo')})
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
                  AND (v.id = p2.id OR nullif(v.grupo_professor,'') = nullif(p2.grupo_professor,''))
              ) OR (${sessao.role === 'professor'} AND a.aluno_id IS NULL AND EXISTS (
                SELECT 1 FROM professores v WHERE v.id = ${sessao.professor_id}
                AND (v.id = p.id OR nullif(v.grupo_professor,'') = nullif(p.grupo_professor,''))
              )))
              AND (NOT ${soProprio} OR EXISTS (SELECT 1 FROM professores v WHERE v.id = ${sessao.professor_id}
                AND (v.id = p.id OR nullif(v.grupo_professor,'') = nullif(p.grupo_professor,''))))
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
                coalesce(sum(cobrar) OVER (),0)::int AS total_cobrar,
                coalesce(sum(cobrar) FILTER (WHERE entrada = 'pendente') OVER (),0)::int AS a_receber,
                coalesce(sum(repasse) FILTER (WHERE saida = 'pendente') OVER (),0)::int AS a_pagar,
                coalesce(sum(duracao) OVER (),0)::int AS minutos,
                (SELECT count(DISTINCT professor_id)::int FROM financeiro) AS professores,
                (SELECT count(DISTINCT materia)::int FROM financeiro) AS materias,
                (SELECT count(DISTINCT coalesce(aluno_id::text, aluno))::int FROM financeiro) AS alunos,
                (SELECT count(DISTINCT nullif(convenio,''))::int FROM financeiro) AS convenios
            FROM financeiro
            ORDER BY data DESC, inicio, id
            LIMIT ${limite} OFFSET ${limite === 51 ? deslocamento : 0}
        `;
        if (limite > 51 && linhas.length === limite) return erro('Refine os filtros para exportar até 5.000 aulas.', 400);
        const resultados = linhas.slice(0, limite === 51 ? 50 : limite).map((linha) => {
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
                cobrar: linha.cobrar, acompanhamento: linha.acompanhamento, aluno_id: linha.aluno_id,
                professor_id: linha.professor_id, unidade_id: linha.unidade_id, duracao: linha.duracao,
                serie: linha.serie, colegio: linha.colegio, categoria: linha.categoria, convenio: linha.convenio,
                evento: linha.evento, entrada: linha.entrada, saida: linha.saida };
        });
        const primeira = linhas[0];
        const somas = filtro ? undefined : {
            repassePrevisto: primeira?.repasse_previsto ?? 0,
            repasseApurado: primeira?.repasse_apurado ?? 0,
            cobrar: sessao.role === 'professor' ? undefined : primeira?.total_cobrar ?? 0,
        };
        const resumo = recepcao ? {
            receber: primeira?.a_receber ?? 0, pagar: primeira?.a_pagar ?? 0,
            repasses: (primeira?.repasse_previsto ?? 0) + (primeira?.repasse_apurado ?? 0), minutos: primeira?.minutos ?? 0,
            professores: primeira?.professores ?? 0, materias: primeira?.materias ?? 0,
            alunos: primeira?.alunos ?? 0, convenios: primeira?.convenios ?? 0,
        } : undefined;
        const bloqueios = recepcao && params.get('bloqueios') === '1' && limite === 51 && !deslocamento ? await sql`
            SELECT DISTINCT b.data::text AS data, b.hora_inicio::text AS inicio, b.hora_fim::text AS fim,
                p.nome AS professor, u.nome AS unidade,
                b.motivo AS motivo
            FROM r4_bloqueios_agenda b JOIN professores p ON p.id = b.professor_id JOIN unidades u ON u.id = p.unidade_id
            WHERE b.data BETWEEN coalesce(nullif(${de},'')::date, ${inicio}::date)
                AND coalesce(nullif(${ate},'')::date, (${inicio}::date + interval '1 month - 1 day')::date)
                AND (${unidade} = 0 OR p.unidade_id = ${unidade})
                AND strpos(lower(p.nome), ${termo('professor')}) > 0
            ORDER BY data, inicio LIMIT 200
        ` : [];
        return NextResponse.json({ resultados, somas, resumo, bloqueios, total: primeira?.total ?? 0, temMais: limite === 51 && linhas.length > 50 });
    } catch (e) {
        console.error('Operação do R4:', e);
        return erro('Não foi possível carregar os dados.', 500);
    }
}

export async function PUT(req: Request) {
    const sessao = await lerSessaoAdmin();
    if (!sessao || sessao.role !== 'admin') return erro('Acesso exclusivo do administrador.', sessao ? 403 : 401);
    try {
        const corpo = await req.json();
        const anterior = await lerOperacaoR4();
        const entrada = corpo.escopo === 'portal'
            ? { ...anterior, antecedencia: corpo.cfg?.antecedencia }
            : corpo.escopo === 'agenda'
                ? { ...corpo.cfg, antecedencia: anterior.antecedencia }
                : corpo.cfg;
        const cfg = validarOperacao(entrada);
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
                    AND (v.id = p.id OR nullif(v.grupo_professor,'') = nullif(p.grupo_professor,''))
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

export async function POST(req: Request) {
    const sessao = await lerSessaoAdmin();
    if (!sessao) return erro('Não autorizado.', 401);
    try {
        const cfg = await lerOperacaoR4();
        if (sessao.role === 'professor' || !podeOperacao(cfg, sessao.role, 'agenda')) return erro('Sem permissão para editar lançamentos.', 403);
        const { ids, campo, valor } = await req.json();
        const campos = ['categoria', 'convenio', 'evento', 'entrada', 'saida'] as const;
        if (!Array.isArray(ids) || !ids.length || ids.length > 5000 ||
            ids.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
            !campos.includes(campo) || typeof valor !== 'string' || valor.length > 100 ||
            (['entrada', 'saida'].includes(campo) && !['pendente', 'baixado', 'isento'].includes(valor))) {
            return erro('Confira o campo e as aulas selecionadas.', 400);
        }
        await garantirHistoricoAgendamento();
        const [resultado] = await sql`
            WITH afetados AS (
                INSERT INTO r4_recepcao_registros (agendamento_id, categoria, convenio, evento, entrada, saida, atualizado_por)
                SELECT id, CASE WHEN ${campo} = 'categoria' THEN ${valor} ELSE '' END,
                    CASE WHEN ${campo} = 'convenio' THEN ${valor} ELSE '' END,
                    CASE WHEN ${campo} = 'evento' THEN ${valor} ELSE '' END,
                    CASE WHEN ${campo} = 'entrada' THEN ${valor} ELSE 'pendente' END,
                    CASE WHEN ${campo} = 'saida' THEN ${valor} ELSE 'pendente' END, ${sessao.nome}
                FROM agendamentos WHERE id = ANY(${ids}::bigint[]) AND excluido_em IS NULL
                ON CONFLICT (agendamento_id) DO UPDATE SET
                    categoria = CASE WHEN ${campo} = 'categoria' THEN excluded.categoria ELSE r4_recepcao_registros.categoria END,
                    convenio = CASE WHEN ${campo} = 'convenio' THEN excluded.convenio ELSE r4_recepcao_registros.convenio END,
                    evento = CASE WHEN ${campo} = 'evento' THEN excluded.evento ELSE r4_recepcao_registros.evento END,
                    entrada = CASE WHEN ${campo} = 'entrada' THEN excluded.entrada ELSE r4_recepcao_registros.entrada END,
                    saida = CASE WHEN ${campo} = 'saida' THEN excluded.saida ELSE r4_recepcao_registros.saida END,
                    atualizado_por = excluded.atualizado_por, atualizado_em = now()
                RETURNING agendamento_id
            ), historico AS (
                INSERT INTO r4_agendamento_historico (agendamento_id, acao, responsavel)
                SELECT agendamento_id, ${'Recepção: ' + campo + ' → ' + (valor || 'sem classificação')}, ${sessao.nome} FROM afetados
            )
            SELECT count(*)::int AS total FROM afetados
        `;
        return NextResponse.json({ total: resultado.total });
    } catch (e) {
        console.error('Atualização da recepção:', e);
        return erro('Não foi possível salvar os lançamentos.', 500);
    }
}
