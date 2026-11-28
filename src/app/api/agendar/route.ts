import { randomBytes, createHash } from 'node:crypto';
import { unidadeOnline } from '@/lib/unidade-online';
import { normalizarTelefone, formatarTelefone } from '@/lib/cliente-helpers';
import { lerOperacaoR4 } from '@/lib/operacao-r4-db';
import { after, NextRequest, NextResponse } from 'next/server';
import { despacharPushDeAgendamento } from '@/lib/push-fila';
import {
    LIMITE_AGENDAMENTOS_SIMULTANEOS,
    buscarFamiliaPorTelefone,
    lerSessaoCliente,
} from '@/lib/cliente-auth';
import { garantirHistoricoAgendamento } from '@/lib/agendamento-historico';
import { materiaBase, rotuloMateriaAula } from '@/lib/materia-aula';
import { horaParaMinutos } from '@/lib/horarios-reforco';
import { sql } from '@/lib/db';
import {
    IntervaloOcupado,
    avaliarStatusChaveMestra,
    gerarDatasDisponiveisSemana,
    gerarTodosSlotsProfessor,
    obterAgoraBahia,
    obterSlotsDisponiveisProfessor,
} from '@/lib/horarios-reforco';
import {
    filtrarMateriasProfessorPorSerie,
    gerarVariantesTelefone,
} from '@/lib/cliente-helpers';
import { notificarGrupoNovoAgendamento, enviarMensagemResponsavel, lembreteCancelamento } from '@/lib/whatsapp-notificacao';
import { obterModoChaveMestra } from '@/app/api/admin/configuracoes/route';

declare global {
    // eslint-disable-next-line no-var
    var __r4AgendarSchemaPromise: Promise<void> | undefined;
}

function garantirTabelaAgendamentos(): Promise<void> {
    if (!globalThis.__r4AgendarSchemaPromise) {
        globalThis.__r4AgendarSchemaPromise = (async () => {
            await sql`
        CREATE TABLE IF NOT EXISTS agendamentos (
          id SERIAL PRIMARY KEY,
          unidade_id INT,
          professor_id INT,
          aluno_id INT,
          materia TEXT,
          data DATE,
          hora_inicio TIME,
          hora_fim TIME,
          aluno_nome TEXT,
          aluno_telefone TEXT,
          colegio_nome TEXT,
          serie TEXT,
          responsavel_nome TEXT,
          observacoes TEXT,
          status TEXT NOT NULL DEFAULT 'confirmado',
          notificado_whatsapp BOOLEAN NOT NULL DEFAULT false,
          criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

            await Promise.all([
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS unidade_id INT`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS professor_id INT`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS aluno_id INT`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS materia TEXT`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS data DATE`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS hora_inicio TIME`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS hora_fim TIME`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS duracao_minutos INTEGER DEFAULT 100`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS aluno_nome TEXT`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS aluno_telefone TEXT`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS colegio_nome TEXT`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS serie TEXT`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS responsavel_nome TEXT`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS observacoes TEXT`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'confirmado'`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS notificado_whatsapp BOOLEAN DEFAULT false`,
                sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ DEFAULT now()`,
                sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS materias_series JSONB DEFAULT '{}'::jsonb`,
                sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_ativo BOOLEAN DEFAULT false`,
                sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_inicio TIME`,
                sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_fim TIME`,
            ]);
        })().catch((err) => {
            globalThis.__r4AgendarSchemaPromise = undefined;
            throw err;
        });
    }
    return globalThis.__r4AgendarSchemaPromise;
}

export async function POST(req: NextRequest) {
    try {
        await garantirTabelaAgendamentos();
        await garantirHistoricoAgendamento();

        const modoChaveMestra = await obterModoChaveMestra();
        const statusSistema = avaliarStatusChaveMestra(modoChaveMestra);
        if (!statusSistema.aberto) {
            return NextResponse.json(
                {
                    error:
                        statusSistema.motivoFechado ||
                        'O agendamento online está fechado no momento.',
                },
                { status: 403 }
            );
        }

        const body = await req.json();
        const remarcarId = Number(body?.remarcarId ?? 0);
        if (!Number.isSafeInteger(remarcarId) || remarcarId < 0) return NextResponse.json({ error: 'Aula inválida.' }, { status: 400 });
        const unidadeId = Number(body?.unidadeId || 0);
        const professorId = Number(body?.professorId || 0);
        const alunoId = Number(body?.alunoId || 0) || null;
        const materia = String(body?.materia || '').trim();
        const data = String(body?.data || '').trim();
        const horaInicio = String(body?.horaInicio || '').trim();
        const observacoes = String(body?.observacoes || '').trim();

        if (
            !unidadeId ||
            !professorId ||
            !materia ||
            !data ||
            !horaInicio ||
            !alunoId
        ) {
            return NextResponse.json(
                { error: 'Dados incompletos para confirmar a aula.' },
                { status: 400 }
            );
        }

        const overridesRaw = await sql`
      SELECT
        to_char(data, 'YYYY-MM-DD') AS data,
        ativo
      FROM datas_liberadas
      WHERE data >= (now() AT TIME ZONE 'America/Bahia')::date
    `;
        const datasPermitidas = gerarDatasDisponiveisSemana(
            modoChaveMestra,
            overridesRaw as { data: string; ativo: boolean }[]
        );

        if (!datasPermitidas.some((d) => d.data === data)) {
            return NextResponse.json(
                {
                    error:
                        'Esta data não está disponível para agendamento online. Aulas para a próxima semana devem ser marcadas com o atendimento humano (segunda a sexta, das 08:00 às 18:00).',
                },
                { status: 400 }
            );
        }

        const profRows = (await sql`
      SELECT
        id,
        nome,
        grupo_professor,
        unidade_id,
        materias, materias_series,
        COALESCE(manha_ativo, false) AS manha_ativo,
        to_char(manha_inicio, 'HH24:MI') AS manha_inicio,
        to_char(manha_fim, 'HH24:MI') AS manha_fim,
        COALESCE(to_char(hora_inicio, 'HH24:MI'), '14:10') AS hora_inicio,
        COALESCE(to_char(hora_fim, 'HH24:MI'), '20:50') AS hora_fim
      FROM professores
      WHERE id = ${professorId}
        AND unidade_id = ${unidadeId}
        AND ativo = true
        AND EXISTS (SELECT 1 FROM unidades u WHERE u.id = ${unidadeId} AND u.ativa)
      LIMIT 1
    `) as {
            id: number;
            nome: string;
            grupo_professor: string | null;
            unidade_id: number;
            materias: string[];
            materias_series: Record<string, string[]> | null;
            manha_ativo: boolean;
            manha_inicio: string | null;
            manha_fim: string | null;
            hora_inicio: string;
            hora_fim: string;
        }[];

        if (profRows.length === 0) {
            return NextResponse.json(
                { error: 'Professor não encontrado ou inativo nesta unidade.' },
                { status: 404 }
            );
        }

        const prof = profRows[0];
        const agora = obterAgoraBahia();
        if (data === agora.dataISO && horaParaMinutos(horaInicio) <= agora.minutosDoDia) {
            return NextResponse.json({ error: 'Este horário já passou.' }, { status: 409 });
        }
        const slotsConfiguradosProf = gerarTodosSlotsProfessor(prof);
        const slotEscolhido = slotsConfiguradosProf.find(
            (s) => s.inicio === horaInicio
        );

        if (!slotEscolhido) {
            return NextResponse.json(
                {
                    error:
                        'Horário inválido para a grade de 100 minutos deste professor.',
                },
                { status: 400 }
            );
        }

        const sessaoCliente = await lerSessaoCliente();
        if (!sessaoCliente) {
            return NextResponse.json(
                { error: 'Sessão expirada. Confirme seu WhatsApp e PIN para agendar.' },
                { status: 401 }
            );
        }

        const familia = await buscarFamiliaPorTelefone(sessaoCliente.telefone);
        const alunoSelecionado = familia.alunos.find(
            (a) => a.id === Number(alunoId)
        );

        if (!alunoSelecionado) {
            return NextResponse.json(
                { error: 'Aluno não vinculado ao WhatsApp autenticado.' },
                { status: 403 }
            );
        }

        const alunoNome = alunoSelecionado.nome_aluno;
        const alunoTelefone = sessaoCliente.telefone;
        const variantesTelefone = gerarVariantesTelefone(alunoTelefone);
        const colegioNome = alunoSelecionado.colegio_nome;
        const serie = alunoSelecionado.serie;
        const materiasPermitidas = filtrarMateriasProfessorPorSerie(prof.materias, prof.materias_series, alunoSelecionado.serie);
        if (!materiasPermitidas.some((opcao) => materiaBase(opcao) === materiaBase(materia))) {
            return NextResponse.json({ error: 'Selecione uma matéria disponível para o professor e a série do aluno.' }, { status: 400 });
        }

        if (
            !remarcarId && alunoSelecionado.agendamentos_futuros >= LIMITE_AGENDAMENTOS_SIMULTANEOS
        ) {
            return NextResponse.json(
                {
                    error: `Este aluno já possui ${LIMITE_AGENDAMENTOS_SIMULTANEOS} aulas futuras agendadas. Conclua ou cancele uma aula antes de marcar outra.`,
                },
                { status: 409 }
            );
        }

        const choqueAluno = (await sql`
      SELECT
        a.id,
        a.materia,
        COALESCE(p.nome, 'Professor') AS professor_nome
      FROM agendamentos a
      LEFT JOIN professores p ON p.id = a.professor_id
      WHERE LEFT(a.data::text, 10) = ${data}
        AND a.id <> ${remarcarId} AND a.excluido_em IS NULL
        AND LEFT(COALESCE(a.hora_inicio, a.horario)::text, 5) = ${slotEscolhido.inicio}
        AND COALESCE(a.status, 'confirmado') IN ('agendado','confirmado','realizado','concluido','reservado','pendente')
        AND (
          (${alunoId}::int IS NOT NULL AND a.aluno_id = ${alunoId})
          OR (
            lower(trim(COALESCE(a.aluno_nome, a.nome_aluno, ''))) = lower(trim(${alunoNome}))
            AND regexp_replace(
              regexp_replace(COALESCE(a.aluno_telefone, a.whatsapp_responsavel, ''), '[^0-9]', '', 'g'),
              '^55(?=[0-9]{10,11}$)',
              ''
            ) = ANY(${variantesTelefone}::text[])
          )
        )
      LIMIT 1
    `) as { id: number; materia: string; professor_nome: string }[];

        if (choqueAluno.length > 0) {
            return NextResponse.json(
                {
                    error: `${alunoNome} já possui uma aula agendada neste mesmo horário (${slotEscolhido.label} — ${choqueAluno[0].materia} com Prof. ${choqueAluno[0].professor_nome}).`,
                },
                { status: 409 }
            );
        }

        let responsavelFinal = familia.responsavelNome || '';
        if (!responsavelFinal && variantesTelefone.length > 0) {
            const respRows = (await sql`
        SELECT responsavel_nome
        FROM alunos
        WHERE regexp_replace(
          regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g'),
          '^55(?=[0-9]{10,11}$)',
          ''
        ) = ANY(${variantesTelefone}::text[])
          AND NULLIF(trim(responsavel_nome), '') IS NOT NULL
        ORDER BY id DESC
        LIMIT 1
      `) as { responsavel_nome: string }[];
            responsavelFinal = respRows[0]?.responsavel_nome?.trim() || '';
        }

        const bloqueiosProf = (await sql`
      SELECT
        LEFT(b.hora_inicio::text, 5) AS hora_inicio,
        LEFT(b.hora_fim::text, 5) AS hora_fim,
        b.motivo
      FROM r4_bloqueios_agenda b
      LEFT JOIN professores p ON p.id = b.professor_id
      WHERE LEFT(b.data::text, 10) = ${data}
        AND (
          b.professor_id = ${prof.id}
          OR (${prof.grupo_professor}::text IS NOT NULL AND p.grupo_professor = ${prof.grupo_professor})
        )
    `) as IntervaloOcupado[];

        const agendamentosProf = (await sql`
      SELECT
        LEFT(coalesce(a.hora_inicio, a.horario)::text, 5) AS hora_inicio,
        LEFT(coalesce(a.hora_fim, coalesce(a.hora_inicio, a.horario) + interval '100 minutes')::text, 5) AS hora_fim
      FROM agendamentos a
      LEFT JOIN professores p ON p.id = a.professor_id
      WHERE LEFT(a.data::text, 10) = ${data}
        AND a.id <> ${remarcarId} AND a.excluido_em IS NULL
        AND coalesce(a.hora_inicio, a.horario) IS NOT NULL
        AND COALESCE(a.status, 'confirmado') IN ('agendado','confirmado','realizado','concluido','reservado','pendente')
        AND (
          a.professor_id = ${prof.id}
          OR (${prof.grupo_professor}::text IS NOT NULL AND p.grupo_professor = ${prof.grupo_professor})
        )
    `) as IntervaloOcupado[];

        const { slotsDisponiveis } = obterSlotsDisponiveisProfessor(
            bloqueiosProf,
            agendamentosProf,
            prof
        );

        const continuaLivre = slotsDisponiveis.some(
            (s) => s.inicio === slotEscolhido.inicio
        );

        if (!continuaLivre) {
            return NextResponse.json(
                {
                    error:
                        'Este horário está bloqueado ou acabou de ser ocupado na agenda do professor. Escolha outro horário.',
                },
                { status: 409 }
            );
        }

        const unidadeRows = (await sql`
      SELECT id, nome, (SELECT online.id FROM unidades online WHERE online.unidade_presencial_id = base.id AND online.ativa) AS online_id,
        (SELECT online.nome FROM unidades online WHERE online.unidade_presencial_id = base.id AND online.ativa) AS online_nome
      FROM unidades base
      WHERE id = ${unidadeId} AND unidade_presencial_id IS NULL AND ativa
      LIMIT 1
    `) as { id: number; nome: string; online_id: number | null; online_nome: string | null }[];

        const unidade = unidadeRows[0];
        if (!unidade || (body.modalidade !== undefined && !['online','presencial'].includes(body.modalidade))) {
            return NextResponse.json({ error: 'Unidade ou modalidade inválida.' }, { status: 400 });
        }
        const onlineDireto = unidadeOnline(unidade.nome);
        const online = onlineDireto || body.modalidade === 'online';
        const unidadeAgendaId = online && !onlineDireto ? unidade.online_id : unidade.id;
        if (!unidadeAgendaId) return NextResponse.json({ error: 'A modalidade online está indisponível nesta unidade.' }, { status: 409 });
        const nomeUnidade = online && !onlineDireto ? unidade.online_nome! : unidade.nome;
        const telefoneAlternativo = String(body.whatsappAluno ?? '').trim();
        const telefoneLink = online ? normalizarTelefone(telefoneAlternativo || alunoTelefone) : null;
        if (online && (!telefoneLink || !/^[1-9][0-9]{9,10}$/.test(telefoneLink))) {
            return NextResponse.json({ error: 'Informe um WhatsApp válido com DDD para receber o link.' }, { status: 400 });
        }
        const token = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(token).digest('hex');
        const materiaAgendada = rotuloMateriaAula(materia, horaParaMinutos(slotEscolhido.fim) - horaParaMinutos(slotEscolhido.inicio));
        const { antecedencia } = await lerOperacaoR4();
        const inicio = slotEscolhido.inicio;
        const fim = slotEscolhido.fim;
        const duracao = horaParaMinutos(fim) - horaParaMinutos(inicio);
        // A leitura de disponibilidade acima explica o conflito. Esta condição é reavaliada
        // depois da trava, na mesma transação que grava ou move a aula.
        const livre = sql`
            SELECT 1 WHERE NOT EXISTS (
                SELECT 1 FROM r4_bloqueios_agenda b
                JOIN professores p ON p.id = b.professor_id
                WHERE b.data = ${data}::date
                  AND (p.id = ${prof.id} OR p.grupo_professor = ${prof.grupo_professor})
                  AND b.hora_inicio < ${fim}::time AND b.hora_fim > ${inicio}::time
            ) AND NOT EXISTS (
                SELECT 1 FROM agendamentos a
                LEFT JOIN professores p ON p.id = a.professor_id
                WHERE a.data = ${data}::date AND a.id <> ${remarcarId} AND a.excluido_em IS NULL
                  AND coalesce(a.status,'confirmado') IN ('agendado','confirmado','realizado','concluido','reservado','pendente')
                  AND (a.aluno_id = ${alunoId} OR p.id = ${prof.id} OR p.grupo_professor = ${prof.grupo_professor})
                  AND coalesce(a.hora_inicio,a.horario) < ${fim}::time
                  AND coalesce(a.hora_fim,coalesce(a.hora_inicio,a.horario) + interval '100 minutes') > ${inicio}::time
            )`;
        const gravacao = remarcarId
            ? sql`UPDATE agendamentos SET unidade_id = ${unidadeAgendaId}, professor_id = ${prof.id},
                materia = ${materiaAgendada}, data = ${data}::date, hora_inicio = ${inicio}::time,
                hora_fim = ${fim}::time, horario = ${inicio}::time, duracao_minutos = ${duracao},
                observacoes = ${observacoes || null}, notificado_whatsapp = false, status = 'agendado',
                whatsapp_link_aula = ${telefoneLink}, resposta_whatsapp_hash = ${tokenHash}
              WHERE id = ${remarcarId} AND aluno_id = ${alunoId} AND excluido_em IS NULL
                AND coalesce(status, 'confirmado') IN ('agendado','confirmado')
                AND ((agendamentos.data + coalesce(hora_inicio, horario)) AT TIME ZONE 'America/Bahia')
                    >= now() + make_interval(hours => ${antecedencia})
                AND EXISTS (${livre}) RETURNING id`
            : sql`INSERT INTO agendamentos (
                unidade_id, professor_id, aluno_id, materia, data, hora_inicio, hora_fim, duracao_minutos,
                aluno_nome, aluno_telefone, colegio_nome, serie, responsavel_nome, observacoes,
                status, notificado_whatsapp, whatsapp_link_aula, resposta_whatsapp_hash
              ) SELECT ${unidadeAgendaId}, ${prof.id}, ${alunoId}, ${materiaAgendada}, ${data}::date,
                ${inicio}::time, ${fim}::time, ${duracao}, ${alunoSelecionado.nome_aluno}, ${sessaoCliente.telefone},
                ${alunoSelecionado.colegio_nome || null}, ${alunoSelecionado.serie || null},
                ${responsavelFinal || null}, ${observacoes || null}, 'agendado', false, ${telefoneLink}, ${tokenHash}
              WHERE EXISTS (${livre})
                AND (SELECT count(*) FROM agendamentos WHERE aluno_id = ${alunoId}
                  AND excluido_em IS NULL AND status IN ('agendado','confirmado')
                  AND ((data + coalesce(hora_inicio, horario)) AT TIME ZONE 'America/Bahia') > now())
                  < ${LIMITE_AGENDAMENTOS_SIMULTANEOS}
              RETURNING id`;
        const [, , , inserido] = await sql.transaction([
            sql`LOCK TABLE agendamentos IN SHARE ROW EXCLUSIVE MODE`,
            sql`LOCK TABLE r4_bloqueios_agenda IN SHARE MODE`,
            sql`SELECT set_config('r4.ator_agenda', ${(responsavelFinal || 'Responsável') + ' · Portal do Aluno'}, true)`,
            gravacao,
        ]);
        const agendamentoId = inserido[0]?.id;
        if (!agendamentoId) return NextResponse.json({
            error: remarcarId ? 'Remarcação indisponível. Confira o prazo e escolha um horário livre.' : 'Horário ocupado ou limite de aulas atingido.',
        }, { status: 409 });

        after(() => despacharPushDeAgendamento(prof.id));

        const origem = process.env.R4_URL_PUBLICA || (process.env.VERCEL_PROJECT_PRODUCTION_URL && 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL) || req.nextUrl.origin;
        const usarBotoesCRM = process.env.R4_DATACRAZY_BOTOES === 'true';
        const entregaWhatsApp = usarBotoesCRM ? false : await (async () => {
            const url = new URL('/responder-aula', origem);
            url.searchParams.set('t', token);
            const primeira = await enviarMensagemResponsavel(alunoTelefone, [
                `Aula agendada na R4 Ensina · ${alunoNome}`,
                `${materiaAgendada} com ${prof.nome} · ${nomeUnidade}`,
                `${data.split('-').reverse().join('/')} · ${inicio} às ${fim}`,
                telefoneLink ? `O professor enviará o link da aula para ${formatarTelefone(telefoneLink)}.` : '',
                lembreteCancelamento(antecedencia),
            ].filter(Boolean).join('\n'), 'aula_agendada');
            if (!primeira.ok) return false;
            const resposta = await enviarMensagemResponsavel(alunoTelefone,
                `Confirme ou cancele sua aula neste link:\n${url.toString()}`, 'responder_aula');
            return resposta.ok;
        })().catch(() => false);

        const notif = await notificarGrupoNovoAgendamento({
            id: agendamentoId,
            unidade: nomeUnidade,
            professor: prof.nome,
            materia: materiaAgendada,
            data,
            horario: slotEscolhido.label,
            responsavelNome: responsavelFinal,
            alunoNome,
            alunoTelefone,
            colegioNome,
            serie,
            observacoes,
        }, usarBotoesCRM ? { token, lembrete: lembreteCancelamento(antecedencia) } : undefined).catch((erro) => {
            console.error('Falha na notificação da aula gravada:', erro);
            return { enviado: false, linkWaMe: null };
        });

        if (notif.enviado && agendamentoId) {
            await sql`
        UPDATE agendamentos
        SET notificado_whatsapp = true
        WHERE id = ${agendamentoId}
      `.catch((erro) => console.error("Falha ao registrar a notificação:", erro));
        }

        return NextResponse.json(
            {
                sucesso: true,
                notificadoWhatsApp: notif.enviado,
                respostaWhatsAppEnviada: usarBotoesCRM ? notif.enviado : entregaWhatsApp,
                agendamento: {
                    id: agendamentoId,
                    unidade: nomeUnidade,
                    professor: prof.nome,
                    materia: materiaAgendada,
                    data,
                    horario: slotEscolhido.label,
                    alunoNome,
                    colegioNome,
                    serie,
                    linkWaMe: notif.linkWaMe,
                },
            },
            { status: remarcarId ? 200 : 201 }
        );
    } catch (error) {
        console.error('Erro ao registrar agendamento:', error);
        return NextResponse.json(
            { error: 'Não foi possível concluir o agendamento.' },
            { status: 500 }
        );
    }
}