import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    formatarTelefone,
    normalizarTelefone,
} from '@/lib/cliente-helpers';
import {
    garantirEstruturaContasResponsaveis,
    lerSessaoCliente,
} from '@/lib/cliente-auth';
import {
    dispararRoboReservaClinCare,
    garantirColunasFilaReserva,
} from '@/lib/clincare-fila';

export async function garantirTabelasClientesEColegios() {
    await sql`
    CREATE TABLE IF NOT EXISTS colegios (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      aprovado BOOLEAN NOT NULL DEFAULT true,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

    await sql`
    CREATE TABLE IF NOT EXISTS alunos (
      id SERIAL PRIMARY KEY,
      telefone TEXT NOT NULL,
      telefone_formatado TEXT,
      responsavel_nome TEXT,
      nome_aluno TEXT NOT NULL,
      colegio_id INT REFERENCES colegios(id) ON DELETE SET NULL,
      colegio_nome TEXT NOT NULL,
      serie TEXT NOT NULL,
      ativo BOOLEAN NOT NULL DEFAULT true,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

    await sql`ALTER TABLE alunos ADD COLUMN IF NOT EXISTS responsavel_nome TEXT`;

    await sql`
    CREATE INDEX IF NOT EXISTS idx_alunos_telefone
    ON alunos (telefone)
  `;

    await garantirEstruturaContasResponsaveis();
}

async function buscarProximasAulasDaConta(
    responsavelId: number,
    telefone: string
) {
    if (!responsavelId || !telefone) return [];

    try {
        const rows = await sql`
      SELECT
        a.id,
        COALESCE(u.nome, 'Unidade') AS unidade_nome,
        COALESCE(p.nome, 'Professor') AS professor_nome,
        a.materia,
        to_char(a.data, 'YYYY-MM-DD') AS data,
        to_char(a.data, 'DD/MM/YYYY') AS data_formatada,
        COALESCE(
          to_char(a.hora_inicio, 'HH24:MI'),
          to_char(a.horario, 'HH24:MI'),
          ''
        ) AS hora_inicio,
        COALESCE(
          CASE
            WHEN a.hora_inicio IS NOT NULL AND a.hora_fim IS NOT NULL
              THEN to_char(a.hora_inicio, 'HH24:MI') || ' às ' || to_char(a.hora_fim, 'HH24:MI')
            WHEN a.hora_inicio IS NOT NULL
              THEN to_char(a.hora_inicio, 'HH24:MI')
            ELSE NULL
          END,
          to_char(a.horario, 'HH24:MI'),
          ''
        ) AS horario,
        COALESCE(
          NULLIF(trim(a.aluno_nome), ''),
          NULLIF(trim(a.nome_aluno), ''),
          'Aluno'
        ) AS aluno_nome,
        COALESCE(
          NULLIF(trim(a.colegio_nome), ''),
          NULLIF(trim(a.colegio_aluno), ''),
          ''
        ) AS colegio_nome,
        COALESCE(
          NULLIF(trim(a.serie), ''),
          NULLIF(trim(a.serie_aluno), ''),
          ''
        ) AS serie,
        a.observacoes,
        (
          EXTRACT(
            EPOCH FROM (
              ((a.data + COALESCE(a.hora_inicio, a.horario, '14:10'::time)) AT TIME ZONE 'America/Bahia')
              - NOW()
            )
          ) / 3600.0
        ) >= 2 AS pode_cancelar
      FROM agendamentos a
      LEFT JOIN unidades u ON u.id = a.unidade_id
      LEFT JOIN professores p ON p.id = a.professor_id
      WHERE COALESCE(a.status, 'confirmado') = 'confirmado'
        AND ((a.data + COALESCE(a.hora_fim, a.hora_inicio, a.horario, '20:50'::time)) AT TIME ZONE 'America/Bahia') >= NOW()
        AND (
          a.aluno_id IN (
            SELECT id FROM alunos WHERE responsavel_id = ${responsavelId}
          )
          OR (
            a.aluno_id IS NULL
            AND regexp_replace(
              regexp_replace(COALESCE(a.aluno_telefone, a.whatsapp_responsavel, ''), '\D', '', 'g'),
              '^55(?=\d{10,11}$)',
              ''
            ) = ${telefone}
          )
        )
      ORDER BY a.data ASC, COALESCE(a.hora_inicio, a.horario) ASC
    `;
        return rows;
    } catch {
        return [];
    }
}

export async function GET(req: NextRequest) {
    try {
        await garantirTabelasClientesEColegios();

        const { searchParams } = new URL(req.url);
        const telefoneParam = normalizarTelefone(
            searchParams.get('telefone') || ''
        );
        const sessao = await lerSessaoCliente();

        const colegiosOficiais = (await sql`
      SELECT id, nome
      FROM colegios
      WHERE aprovado = true
      ORDER BY nome ASC
    `) as { id: number; nome: string }[];

        // Consulta inicial pública apenas para listar colégios
        if (!telefoneParam && !sessao) {
            return NextResponse.json(
                {
                    telefone: '',
                    telefoneFormatado: '',
                    responsavelNome: '',
                    alunos: [],
                    proximasAulas: [],
                    colegios: colegiosOficiais,
                },
                { headers: { 'Cache-Control': 'no-store' } }
            );
        }

        if (!sessao) {
            return NextResponse.json(
                { error: 'Autenticação necessária para consultar os dados da conta.' },
                { status: 401 }
            );
        }

        if (telefoneParam && telefoneParam !== sessao.telefone) {
            return NextResponse.json(
                { error: 'Acesso negado aos dados de outro número.' },
                { status: 403 }
            );
        }

        const contas = (await sql`
      SELECT
        id,
        telefone,
        COALESCE(NULLIF(trim(telefone_formatado), ''), telefone) AS telefone_formatado,
        COALESCE(NULLIF(trim(nome), ''), 'Responsável') AS nome
      FROM responsaveis
      WHERE id = ${sessao.responsavelId}
      LIMIT 1
    `) as {
            id: number;
            telefone: string;
            telefone_formatado: string;
            nome: string;
        }[];

        if (contas.length === 0) {
            return NextResponse.json(
                { error: 'Conta do responsável não encontrada.' },
                { status: 404 }
            );
        }

        const conta = contas[0];

        const [alunosRaw, proximasAulas] = await Promise.all([
            sql`
        SELECT
          id,
          telefone,
          telefone_formatado,
          ${conta.nome}::text AS responsavel_nome,
          nome_aluno,
          colegio_id,
          colegio_nome,
          serie
        FROM alunos
        WHERE responsavel_id = ${conta.id}
          AND ativo = true
        ORDER BY id ASC
      `,
            buscarProximasAulasDaConta(conta.id, conta.telefone),
        ]);

        return NextResponse.json(
            {
                responsavelId: conta.id,
                telefone: conta.telefone,
                telefoneFormatado:
                    conta.telefone_formatado || formatarTelefone(conta.telefone),
                responsavelNome: conta.nome,
                alunos: alunosRaw,
                proximasAulas,
                colegios: colegiosOficiais,
            },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (error) {
        console.error('Erro ao consultar cliente/alunos:', error);
        return NextResponse.json(
            { error: 'Não foi possível carregar os dados da conta.' },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        await garantirTabelasClientesEColegios();
        await garantirColunasFilaReserva();

        const sessao = await lerSessaoCliente();
        if (!sessao) {
            return NextResponse.json(
                {
                    error:
                        'Sessão expirada ou não autenticada. Entre com seu WhatsApp e PIN para continuar.',
                },
                { status: 401 }
            );
        }

        const contas = (await sql`
      SELECT
        id,
        telefone,
        COALESCE(NULLIF(trim(telefone_formatado), ''), telefone) AS telefone_formatado,
        COALESCE(NULLIF(trim(nome), ''), 'Responsável') AS nome
      FROM responsaveis
      WHERE id = ${sessao.responsavelId}
      LIMIT 1
    `) as {
            id: number;
            telefone: string;
            telefone_formatado: string;
            nome: string;
        }[];

        if (contas.length === 0) {
            return NextResponse.json(
                { error: 'Conta do responsável não encontrada.' },
                { status: 404 }
            );
        }

        const conta = contas[0];
        const body = await req.json();
        const acao = String(body?.acao || 'cadastrarAluno');

        if (acao === 'cancelarAgendamento') {
            const agendamentoId = Number(body?.agendamentoId || 0);

            if (!agendamentoId) {
                return NextResponse.json(
                    { error: 'Agendamento inválido para cancelamento.' },
                    { status: 400 }
                );
            }

            const registros = (await sql`
        SELECT
          a.id,
          COALESCE(a.status, 'confirmado') AS status,
          COALESCE(a.clincare_reserva_status, 'pendente') AS clincare_reserva_status,
          EXTRACT(
            EPOCH FROM (
              ((a.data + COALESCE(a.hora_inicio, a.horario, '14:10'::time)) AT TIME ZONE 'America/Bahia')
              - NOW()
            )
          ) / 3600.0 AS horas_restantes
        FROM agendamentos a
        WHERE a.id = ${agendamentoId}
          AND (
            a.aluno_id IN (SELECT id FROM alunos WHERE responsavel_id = ${conta.id})
            OR (
              a.aluno_id IS NULL
              AND regexp_replace(
                regexp_replace(COALESCE(a.aluno_telefone, a.whatsapp_responsavel, ''), '\D', '', 'g'),
                '^55(?=\d{10,11}$)',
                ''
              ) = ${conta.telefone}
            )
          )
        LIMIT 1
      `) as {
                id: number;
                status: string;
                clincare_reserva_status: string;
                horas_restantes: number;
            }[];

            if (registros.length === 0) {
                return NextResponse.json(
                    { error: 'Agendamento não encontrado para esta conta.' },
                    { status: 404 }
                );
            }

            const ag = registros[0];
            if (ag.status !== 'confirmado') {
                return NextResponse.json(
                    { error: 'Este agendamento já foi cancelado ou concluído.' },
                    { status: 400 }
                );
            }

            if (Number(ag.horas_restantes) < 2) {
                return NextResponse.json(
                    {
                        error:
                            'Cancelamentos pelo site exigem no mínimo 2 horas de antecedência. Entre em contato com a secretaria pelo WhatsApp.',
                    },
                    { status: 400 }
                );
            }

            const atualizados = (await sql`
        UPDATE agendamentos
        SET
          status = 'cancelado',
          clincare_reserva_status = CASE
            WHEN COALESCE(clincare_reserva_status, '') IN ('reservado', 'reservando') THEN 'cancelar_pendente'
            ELSE 'cancelado_clincare'
          END,
          clincare_reserva_erro = NULL
        WHERE id = ${agendamentoId}
          AND status = 'confirmado'
        RETURNING clincare_reserva_status
      `) as { clincare_reserva_status: string }[];

            if (atualizados[0]?.clincare_reserva_status === 'cancelar_pendente') {
                await dispararRoboReservaClinCare(agendamentoId);
            }

            const proximasAulas = await buscarProximasAulasDaConta(
                conta.id,
                conta.telefone
            );

            return NextResponse.json({
                sucesso: true,
                proximasAulas,
            });
        }

        if (acao === 'salvarResponsavel') {
            const responsavelNome = String(body?.responsavelNome || '').trim();

            if (responsavelNome.length < 2) {
                return NextResponse.json(
                    { error: 'Informe o nome completo do responsável.' },
                    { status: 400 }
                );
            }

            await sql`
        UPDATE responsaveis
        SET nome = ${responsavelNome},
            atualizado_em = now()
        WHERE id = ${conta.id}
      `;

            await sql`
        UPDATE alunos
        SET responsavel_nome = ${responsavelNome}
        WHERE responsavel_id = ${conta.id}
      `;

            return NextResponse.json({
                sucesso: true,
                responsavelNome,
            });
        }

        if (acao === 'removerAluno') {
            const alunoId = Number(body?.alunoId || 0);

            if (!alunoId) {
                return NextResponse.json(
                    { error: 'Aluno inválido para remoção.' },
                    { status: 400 }
                );
            }

            const removidos = await sql`
        UPDATE alunos
        SET ativo = false
        WHERE id = ${alunoId}
          AND responsavel_id = ${conta.id}
          AND ativo = true
        RETURNING id
      `;

            if (removidos.length === 0) {
                return NextResponse.json(
                    { error: 'Aluno não encontrado nesta conta.' },
                    { status: 404 }
                );
            }

            const restantes = await sql`
        SELECT id, telefone, telefone_formatado, ${conta.nome}::text AS responsavel_nome, nome_aluno, colegio_id, colegio_nome, serie
        FROM alunos
        WHERE responsavel_id = ${conta.id}
          AND ativo = true
        ORDER BY id ASC
      `;

            return NextResponse.json({ sucesso: true, alunos: restantes });
        }

        if (acao === 'editarAluno') {
            const alunoId = Number(body?.alunoId || 0);
            const nomeAluno = String(body?.nomeAluno || '').trim();
            const colegioOpcao = String(body?.colegioOpcao || '').trim();
            const colegioOutroNome = String(body?.colegioOutroNome || '').trim();
            const serie = String(body?.serie || '').trim();

            if (!alunoId || nomeAluno.length < 2 || !serie) {
                return NextResponse.json(
                    { error: 'Preencha todos os dados para atualizar o aluno.' },
                    { status: 400 }
                );
            }

            let colegioIdFinal: number | null = null;
            let colegioNomeFinal = '';

            if (colegioOpcao === 'outros') {
                if (colegioOutroNome.length < 2) {
                    return NextResponse.json(
                        { error: 'Digite o nome do colégio na opção "Outros".' },
                        { status: 400 }
                    );
                }
                colegioNomeFinal = colegioOutroNome.replace(/\s+/g, ' ').trim();
                const existente = (await sql`
          SELECT id, nome FROM colegios
          WHERE lower(trim(nome)) = lower(trim(${colegioNomeFinal}))
          LIMIT 1
        `) as { id: number; nome: string }[];

                if (existente.length > 0) {
                    colegioIdFinal = existente[0].id;
                    colegioNomeFinal = existente[0].nome;
                } else {
                    const novoColegio = (await sql`
            INSERT INTO colegios (nome, aprovado)
            VALUES (${colegioNomeFinal}, false)
            RETURNING id, nome
          `) as { id: number; nome: string }[];
                    colegioIdFinal = novoColegio[0].id;
                    colegioNomeFinal = novoColegio[0].nome;
                }
            } else {
                const idNum = Number(colegioOpcao);
                const colRows = (await sql`
          SELECT id, nome FROM colegios WHERE id = ${idNum} LIMIT 1
        `) as { id: number; nome: string }[];

                if (colRows.length === 0) {
                    return NextResponse.json(
                        { error: 'Colégio selecionado não encontrado.' },
                        { status: 404 }
                    );
                }
                colegioIdFinal = colRows[0].id;
                colegioNomeFinal = colRows[0].nome;
            }

            const editados = await sql`
        UPDATE alunos
        SET
          nome_aluno = ${nomeAluno},
          colegio_id = ${colegioIdFinal},
          colegio_nome = ${colegioNomeFinal},
          serie = ${serie}
        WHERE id = ${alunoId}
          AND responsavel_id = ${conta.id}
          AND ativo = true
        RETURNING id
      `;

            if (editados.length === 0) {
                return NextResponse.json(
                    { error: 'Aluno não encontrado nesta conta.' },
                    { status: 404 }
                );
            }

            const todosAlunos = await sql`
        SELECT id, telefone, telefone_formatado, ${conta.nome}::text AS responsavel_nome, nome_aluno, colegio_id, colegio_nome, serie
        FROM alunos
        WHERE responsavel_id = ${conta.id}
          AND ativo = true
        ORDER BY id ASC
      `;

            return NextResponse.json({
                sucesso: true,
                alunos: todosAlunos,
            });
        }

        // Cadastrar novo filho na conta autenticada
        const responsavelNomeInformado = String(body?.responsavelNome || '').trim();
        const nomeAluno = String(body?.nomeAluno || '').trim();
        const colegioOpcao = String(body?.colegioOpcao || '').trim();
        const colegioOutroNome = String(body?.colegioOutroNome || '').trim();
        const serie = String(body?.serie || '').trim();

        if (nomeAluno.length < 2 || !serie) {
            return NextResponse.json(
                { error: 'Preencha o nome completo do aluno e a série.' },
                { status: 400 }
            );
        }

        let colegioIdFinal: number | null = null;
        let colegioNomeFinal = '';

        if (colegioOpcao === 'outros') {
            if (colegioOutroNome.length < 2) {
                return NextResponse.json(
                    { error: 'Digite o nome do colégio na opção "Outros".' },
                    { status: 400 }
                );
            }

            colegioNomeFinal = colegioOutroNome.replace(/\s+/g, ' ').trim();

            const existente = (await sql`
        SELECT id, nome
        FROM colegios
        WHERE lower(trim(nome)) = lower(trim(${colegioNomeFinal}))
        LIMIT 1
      `) as { id: number; nome: string }[];

            if (existente.length > 0) {
                colegioIdFinal = existente[0].id;
                colegioNomeFinal = existente[0].nome;
            } else {
                const novoColegio = (await sql`
          INSERT INTO colegios (nome, aprovado)
          VALUES (${colegioNomeFinal}, false)
          RETURNING id, nome
        `) as { id: number; nome: string }[];

                colegioIdFinal = novoColegio[0].id;
                colegioNomeFinal = novoColegio[0].nome;
            }
        } else {
            const idNum = Number(colegioOpcao);
            if (!idNum) {
                return NextResponse.json(
                    { error: 'Selecione um colégio ou escolha "Outros".' },
                    { status: 400 }
                );
            }

            const colRows = (await sql`
        SELECT id, nome
        FROM colegios
        WHERE id = ${idNum}
        LIMIT 1
      `) as { id: number; nome: string }[];

            if (colRows.length === 0) {
                return NextResponse.json(
                    { error: 'Colégio selecionado não encontrado.' },
                    { status: 404 }
                );
            }

            colegioIdFinal = colRows[0].id;
            colegioNomeFinal = colRows[0].nome;
        }

        const nomeRespFinal = responsavelNomeInformado || conta.nome;
        const telFormatado =
            conta.telefone_formatado || formatarTelefone(conta.telefone);

        if (responsavelNomeInformado && responsavelNomeInformado !== conta.nome) {
            await sql`
        UPDATE responsaveis
        SET nome = ${responsavelNomeInformado},
            atualizado_em = now()
        WHERE id = ${conta.id}
      `;
        }

        const inserido = (await sql`
      INSERT INTO alunos (
        responsavel_id,
        telefone,
        telefone_formatado,
        responsavel_nome,
        nome_aluno,
        colegio_id,
        colegio_nome,
        serie,
        ativo
      )
      VALUES (
        ${conta.id},
        ${conta.telefone},
        ${telFormatado},
        ${nomeRespFinal},
        ${nomeAluno},
        ${colegioIdFinal},
        ${colegioNomeFinal},
        ${serie},
        true
      )
      RETURNING id, telefone, telefone_formatado, responsavel_nome, nome_aluno, colegio_id, colegio_nome, serie
    `) as {
            id: number;
            telefone: string;
            telefone_formatado: string;
            responsavel_nome: string | null;
            nome_aluno: string;
            colegio_id: number | null;
            colegio_nome: string;
            serie: string;
        }[];

        const todosAlunos = await sql`
      SELECT id, telefone, telefone_formatado, ${nomeRespFinal}::text AS responsavel_nome, nome_aluno, colegio_id, colegio_nome, serie
      FROM alunos
      WHERE responsavel_id = ${conta.id}
        AND ativo = true
      ORDER BY id ASC
    `;

        return NextResponse.json(
            {
                sucesso: true,
                responsavelNome: nomeRespFinal,
                alunoCriado: inserido[0],
                alunos: todosAlunos,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Erro ao processar operação do cliente:', error);
        return NextResponse.json(
            { error: 'Não foi possível concluir a operação.' },
            { status: 500 }
        );
    }
}