import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    formatarTelefone,
    normalizarTelefone,
} from '@/lib/cliente-helpers';

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
}

async function buscarProximasAulasPorTelefone(telefone: string) {
    if (!telefone) return [];

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
          regexp_replace(COALESCE(a.aluno_telefone, a.whatsapp_responsavel, ''), '\D', '', 'g') = ${telefone}
          OR a.aluno_id IN (
            SELECT id FROM alunos WHERE telefone = ${telefone}
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
        const telefoneRaw = searchParams.get('telefone') || '';
        const telefone = normalizarTelefone(telefoneRaw);

        const colegiosOficiais = (await sql`
      SELECT id, nome
      FROM colegios
      WHERE aprovado = true
      ORDER BY nome ASC
    `) as { id: number; nome: string }[];

        if (!telefone) {
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

        const [alunosRaw, proximasAulas] = await Promise.all([
            sql`
        SELECT
          id,
          telefone,
          telefone_formatado,
          responsavel_nome,
          nome_aluno,
          colegio_id,
          colegio_nome,
          serie
        FROM alunos
        WHERE telefone = ${telefone}
          AND ativo = true
        ORDER BY id ASC
      `,
            buscarProximasAulasPorTelefone(telefone),
        ]);

        const alunos = alunosRaw as {
            id: number;
            telefone: string;
            telefone_formatado: string | null;
            responsavel_nome: string | null;
            nome_aluno: string;
            colegio_id: number | null;
            colegio_nome: string;
            serie: string;
        }[];

        let responsavelNome =
            alunos
                .find((a) => a.responsavel_nome && a.responsavel_nome.trim())
                ?.responsavel_nome?.trim() || '';

        if (!responsavelNome) {
            try {
                const historico = (await sql`
          SELECT COALESCE(NULLIF(trim(responsavel_nome), ''), NULLIF(trim(nome_responsavel), '')) AS resp
          FROM agendamentos
          WHERE regexp_replace(COALESCE(aluno_telefone, whatsapp_responsavel, ''), '\D', '', 'g') = ${telefone}
            AND COALESCE(NULLIF(trim(responsavel_nome), ''), NULLIF(trim(nome_responsavel), '')) IS NOT NULL
          ORDER BY criado_em DESC
          LIMIT 1
        `) as { resp: string | null }[];

                responsavelNome = historico[0]?.resp?.trim() || '';
            } catch {
                responsavelNome = '';
            }
        }

        return NextResponse.json(
            {
                telefone,
                telefoneFormatado: formatarTelefone(telefone),
                responsavelNome,
                alunos,
                proximasAulas,
                colegios: colegiosOficiais,
            },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (error) {
        console.error('Erro ao consultar cliente/alunos:', error);
        return NextResponse.json(
            { error: 'Não foi possível carregar os dados do número informado.' },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        await garantirTabelasClientesEColegios();

        const body = await req.json();
        const acao = String(body?.acao || 'cadastrarAluno');

        if (acao === 'cancelarAgendamento') {
            const agendamentoId = Number(body?.agendamentoId || 0);
            const telefone = normalizarTelefone(String(body?.telefone || ''));

            if (!agendamentoId || telefone.length < 10) {
                return NextResponse.json(
                    { error: 'Dados inválidos para cancelar o agendamento.' },
                    { status: 400 }
                );
            }

            const registros = (await sql`
        SELECT
          a.id,
          COALESCE(a.status, 'confirmado') AS status,
          EXTRACT(
            EPOCH FROM (
              ((a.data + COALESCE(a.hora_inicio, a.horario, '14:10'::time)) AT TIME ZONE 'America/Bahia')
              - NOW()
            )
          ) / 3600.0 AS horas_restantes
        FROM agendamentos a
        WHERE a.id = ${agendamentoId}
          AND (
            regexp_replace(COALESCE(a.aluno_telefone, a.whatsapp_responsavel, ''), '\D', '', 'g') = ${telefone}
            OR a.aluno_id IN (SELECT id FROM alunos WHERE telefone = ${telefone})
          )
        LIMIT 1
      `) as { id: number; status: string; horas_restantes: number }[];

            if (registros.length === 0) {
                return NextResponse.json(
                    { error: 'Agendamento não encontrado para este WhatsApp.' },
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

            await sql`
        UPDATE agendamentos
        SET status = 'cancelado'
        WHERE id = ${agendamentoId}
      `;

            const proximasAulas = await buscarProximasAulasPorTelefone(telefone);

            return NextResponse.json({
                sucesso: true,
                proximasAulas,
            });
        }

        if (acao === 'salvarResponsavel') {
            const telefone = normalizarTelefone(String(body?.telefone || ''));
            const responsavelNome = String(body?.responsavelNome || '').trim();

            if (telefone.length < 10 || telefone.length > 11 || !responsavelNome) {
                return NextResponse.json(
                    { error: 'Informe o nome do responsável e um WhatsApp válido.' },
                    { status: 400 }
                );
            }

            await sql`
        UPDATE alunos
        SET responsavel_nome = ${responsavelNome}
        WHERE telefone = ${telefone}
          AND ativo = true
      `;

            return NextResponse.json({
                sucesso: true,
                responsavelNome,
            });
        }

        if (acao === 'removerAluno') {
            const alunoId = Number(body?.alunoId || 0);
            const telefone = normalizarTelefone(String(body?.telefone || ''));

            if (!alunoId || !telefone) {
                return NextResponse.json(
                    { error: 'Dados inválidos para remover aluno.' },
                    { status: 400 }
                );
            }

            await sql`
        UPDATE alunos
        SET ativo = false
        WHERE id = ${alunoId}
          AND telefone = ${telefone}
      `;

            const restantes = await sql`
        SELECT id, telefone, telefone_formatado, responsavel_nome, nome_aluno, colegio_id, colegio_nome, serie
        FROM alunos
        WHERE telefone = ${telefone}
          AND ativo = true
        ORDER BY id ASC
      `;

            return NextResponse.json({ sucesso: true, alunos: restantes });
        }

        if (acao === 'editarAluno') {
            const alunoId = Number(body?.alunoId || 0);
            const telefone = normalizarTelefone(String(body?.telefone || ''));
            const nomeAluno = String(body?.nomeAluno || '').trim();
            const colegioOpcao = String(body?.colegioOpcao || '').trim();
            const colegioOutroNome = String(body?.colegioOutroNome || '').trim();
            const serie = String(body?.serie || '').trim();

            if (!alunoId || telefone.length < 10 || !nomeAluno || !serie) {
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

            await sql`
        UPDATE alunos
        SET
          nome_aluno = ${nomeAluno},
          colegio_id = ${colegioIdFinal},
          colegio_nome = ${colegioNomeFinal},
          serie = ${serie}
        WHERE id = ${alunoId}
          AND telefone = ${telefone}
          AND ativo = true
      `;

            const todosAlunos = await sql`
        SELECT id, telefone, telefone_formatado, responsavel_nome, nome_aluno, colegio_id, colegio_nome, serie
        FROM alunos
        WHERE telefone = ${telefone}
          AND ativo = true
        ORDER BY id ASC
      `;

            return NextResponse.json({
                sucesso: true,
                alunos: todosAlunos,
            });
        }

        const telefone = normalizarTelefone(String(body?.telefone || ''));
        const responsavelNome = String(body?.responsavelNome || '').trim();
        const nomeAluno = String(body?.nomeAluno || '').trim();
        const colegioOpcao = String(body?.colegioOpcao || '').trim();
        const colegioOutroNome = String(body?.colegioOutroNome || '').trim();
        const serie = String(body?.serie || '').trim();

        if (telefone.length < 10 || telefone.length > 11) {
            return NextResponse.json(
                { error: 'Informe um número de WhatsApp válido com DDD (ex: 71 99999-9999).' },
                { status: 400 }
            );
        }

        if (!nomeAluno || !serie) {
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

        const telFormatado = formatarTelefone(telefone);

        const inserido = (await sql`
      INSERT INTO alunos (
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
        ${telefone},
        ${telFormatado},
        ${responsavelNome || null},
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

        if (responsavelNome) {
            await sql`
        UPDATE alunos
        SET responsavel_nome = ${responsavelNome}
        WHERE telefone = ${telefone}
          AND ativo = true
      `;
        }

        const todosAlunos = await sql`
      SELECT id, telefone, telefone_formatado, responsavel_nome, nome_aluno, colegio_id, colegio_nome, serie
      FROM alunos
      WHERE telefone = ${telefone}
        AND ativo = true
      ORDER BY id ASC
    `;

        return NextResponse.json(
            {
                sucesso: true,
                responsavelNome,
                alunoCriado: inserido[0],
                alunos: todosAlunos,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Erro ao cadastrar aluno:', error);
        return NextResponse.json(
            { error: 'Não foi possível salvar o cadastro do aluno.' },
            { status: 500 }
        );
    }
}