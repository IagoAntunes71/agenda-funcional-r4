import { alunoImportadoAguardandoVinculo } from '@/lib/cadastro-aluno-r4';
import { lerOperacaoR4 } from '@/lib/operacao-r4-db';
import { NextRequest, NextResponse } from 'next/server';
import { garantirHistoricoAgendamento } from '@/lib/agendamento-historico';
import { sql } from '@/lib/db';
import {
    formatarTelefone,
    gerarVariantesTelefone,
    normalizarTelefone,
} from '@/lib/cliente-helpers';
import { garantirEstruturaContasResponsaveis } from '@/lib/cliente-auth';
import { notificarGrupoCancelamentoAgendamento } from '@/lib/whatsapp-notificacao';

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

    await garantirEstruturaContasResponsaveis();

    await sql`
    CREATE INDEX IF NOT EXISTS idx_alunos_telefone
    ON alunos (telefone)
  `;
}

async function buscarProximasAulasPorTelefone(telefoneBruto: string) {
    const variantes = gerarVariantesTelefone(telefoneBruto);
    if (variantes.length === 0) return [];

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
          regexp_replace(
            regexp_replace(COALESCE(a.aluno_telefone, a.whatsapp_responsavel, ''), '\D', '', 'g'),
            '^55(?=\d{10,11}$)',
            ''
          ) = ANY(${variantes}::text[])
          OR a.aluno_id IN (
            SELECT id
            FROM alunos
            WHERE regexp_replace(
              regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
              '^55(?=\d{10,11}$)',
              ''
            ) = ANY(${variantes}::text[])
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
        const variantes = gerarVariantesTelefone(telefoneRaw);

        const colegiosOficiais = (await sql`
      SELECT id, nome
      FROM colegios
      WHERE aprovado = true
      ORDER BY nome ASC
    `) as { id: number; nome: string }[];

        if (!telefone || variantes.length === 0) {
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

        const [respRows, alunosRaw, proximasAulas] = await Promise.all([
            sql`
        SELECT id, nome
        FROM responsaveis
        WHERE regexp_replace(
          regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
          '^55(?=\d{10,11}$)',
          ''
        ) = ANY(${variantes}::text[])
        ORDER BY id ASC
        LIMIT 1
      `,
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
        WHERE regexp_replace(
          regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
          '^55(?=\d{10,11}$)',
          ''
        ) = ANY(${variantes}::text[])
          AND ativo = true
        ORDER BY id ASC
      `,
            buscarProximasAulasPorTelefone(telefoneRaw),
        ]);

        const respLista = respRows as { id: number; nome: string }[];
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
            respLista[0]?.nome?.trim() ||
            alunos
                .find((a) => a.responsavel_nome && a.responsavel_nome.trim())
                ?.responsavel_nome?.trim() ||
            '';

        if (!responsavelNome) {
            try {
                const historico = (await sql`
          SELECT COALESCE(NULLIF(trim(responsavel_nome), ''), NULLIF(trim(nome_responsavel), '')) AS resp
          FROM agendamentos
          WHERE regexp_replace(
            regexp_replace(COALESCE(aluno_telefone, whatsapp_responsavel, ''), '\D', '', 'g'),
            '^55(?=\d{10,11}$)',
            ''
          ) = ANY(${variantes}::text[])
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
            const telefoneRaw = String(body?.telefone || '');
            const telefone = normalizarTelefone(telefoneRaw);
            const variantes = gerarVariantesTelefone(telefoneRaw);

            if (!agendamentoId || telefone.length < 10 || variantes.length === 0) {
                return NextResponse.json(
                    { error: 'Dados inválidos para cancelar o agendamento.' },
                    { status: 400 }
                );
            }

            const registros = (await sql`
        SELECT
          a.id,
          COALESCE(a.status, 'confirmado') AS status,
          COALESCE(u.nome, 'Unidade') AS unidade_nome,
          COALESCE(p.nome, 'Professor') AS professor_nome,
          COALESCE(a.materia, '') AS materia,
          to_char(a.data, 'YYYY-MM-DD') AS data,
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
            NULLIF(trim(a.aluno_telefone), ''),
            NULLIF(trim(a.whatsapp_responsavel), ''),
            ${telefone}
          ) AS aluno_telefone,
          COALESCE(
            NULLIF(trim(a.responsavel_nome), ''),
            NULLIF(trim(r.nome), ''),
            NULLIF(trim(al.responsavel_nome), ''),
            ''
          ) AS responsavel_nome,
          EXTRACT(
            EPOCH FROM (
              ((a.data + COALESCE(a.hora_inicio, a.horario, '14:10'::time)) AT TIME ZONE 'America/Bahia')
              - NOW()
            )
          ) / 3600.0 AS horas_restantes
        FROM agendamentos a
        LEFT JOIN unidades u ON u.id = a.unidade_id
        LEFT JOIN professores p ON p.id = a.professor_id
        LEFT JOIN alunos al ON al.id = a.aluno_id
        LEFT JOIN responsaveis r ON r.id = al.responsavel_id
        WHERE a.id = ${agendamentoId}
          AND (
            regexp_replace(
              regexp_replace(COALESCE(a.aluno_telefone, a.whatsapp_responsavel, ''), '\D', '', 'g'),
              '^55(?=\d{10,11}$)',
              ''
            ) = ANY(${variantes}::text[])
            OR a.aluno_id IN (
              SELECT id
              FROM alunos
              WHERE regexp_replace(
                regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
                '^55(?=\d{10,11}$)',
                ''
              ) = ANY(${variantes}::text[])
            )
          )
        LIMIT 1
      `) as {
                id: number;
                status: string;
                unidade_nome: string;
                professor_nome: string;
                materia: string;
                data: string;
                horario: string;
                aluno_nome: string;
                aluno_telefone: string;
                responsavel_nome: string;
                horas_restantes: number;
            }[];

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

            const { antecedencia } = await lerOperacaoR4();
            if (Number(ag.horas_restantes) < antecedencia) {
                return NextResponse.json(
                    {
                        error:
                            `Cancelamentos pelo site exigem pelo menos ${antecedencia} hora(s) de antecedência. Fale com a secretaria pelo WhatsApp.`,
                    },
                    { status: 400 }
                );
            }

            await garantirHistoricoAgendamento();
            await sql.transaction([
                sql`SELECT set_config('r4.ator_agenda', ${(ag.responsavel_nome || 'Responsável') + ' · Portal do Aluno'}, true)`,
                sql`UPDATE agendamentos SET status = 'cancelado'
                    WHERE id = ${agendamentoId} AND excluido_em IS NULL`,
            ]);

            await notificarGrupoCancelamentoAgendamento({
                id: ag.id,
                unidade: ag.unidade_nome,
                professor: ag.professor_nome,
                materia: ag.materia,
                data: ag.data,
                horario: ag.horario,
                responsavelNome: ag.responsavel_nome,
                alunoNome: ag.aluno_nome,
                alunoTelefone: ag.aluno_telefone || telefone,
            }).catch((err) => {
                console.error('Erro ao notificar cancelamento para o grupo:', err);
            });

            const proximasAulas = await buscarProximasAulasPorTelefone(telefoneRaw);

            return NextResponse.json({
                sucesso: true,
                proximasAulas,
            });
        }

        if (acao === 'salvarResponsavel') {
            const telefoneRaw = String(body?.telefone || '');
            const telefone = normalizarTelefone(telefoneRaw);
            const variantes = gerarVariantesTelefone(telefoneRaw);
            const responsavelNome = String(body?.responsavelNome || '').trim();

            if (
                telefone.length < 10 ||
                telefone.length > 11 ||
                !responsavelNome ||
                variantes.length === 0
            ) {
                return NextResponse.json(
                    { error: 'Informe o nome do responsável e um WhatsApp válido.' },
                    { status: 400 }
                );
            }

            const telFmt = formatarTelefone(telefone);

            await sql`
        UPDATE responsaveis
        SET
          nome = ${responsavelNome},
          telefone = ${telefone},
          telefone_formatado = ${telFmt},
          atualizado_em = now()
        WHERE regexp_replace(
          regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
          '^55(?=\d{10,11}$)',
          ''
        ) = ANY(${variantes}::text[])
      `;

            await sql`
        UPDATE alunos
        SET
          responsavel_nome = ${responsavelNome},
          telefone = ${telefone},
          telefone_formatado = ${telFmt}
        WHERE regexp_replace(
          regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
          '^55(?=\d{10,11}$)',
          ''
        ) = ANY(${variantes}::text[])
          AND ativo = true
      `;

            return NextResponse.json({
                sucesso: true,
                responsavelNome,
            });
        }

        if (acao === 'removerAluno') {
            const alunoId = Number(body?.alunoId || 0);
            const telefoneRaw = String(body?.telefone || '');
            const telefone = normalizarTelefone(telefoneRaw);
            const variantes = gerarVariantesTelefone(telefoneRaw);

            if (!alunoId || !telefone || variantes.length === 0) {
                return NextResponse.json(
                    { error: 'Dados inválidos para remover aluno.' },
                    { status: 400 }
                );
            }

            await sql`
        UPDATE alunos
        SET ativo = false
        WHERE id = ${alunoId}
          AND regexp_replace(
            regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
            '^55(?=\d{10,11}$)',
            ''
          ) = ANY(${variantes}::text[])
      `;

            const restantes = await sql`
        SELECT id, telefone, telefone_formatado, responsavel_nome, nome_aluno, colegio_id, colegio_nome, serie
        FROM alunos
        WHERE regexp_replace(
          regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
          '^55(?=\d{10,11}$)',
          ''
        ) = ANY(${variantes}::text[])
          AND ativo = true
        ORDER BY id ASC
      `;

            return NextResponse.json({ sucesso: true, alunos: restantes });
        }

        if (acao === 'editarAluno') {
            const alunoId = Number(body?.alunoId || 0);
            const telefoneRaw = String(body?.telefone || '');
            const telefone = normalizarTelefone(telefoneRaw);
            const variantes = gerarVariantesTelefone(telefoneRaw);
            const nomeAluno = String(body?.nomeAluno || '').trim();
            const colegioOpcao = String(body?.colegioOpcao || '').trim();
            const colegioOutroNome = String(body?.colegioOutroNome || '').trim();
            const serie = String(body?.serie || '').trim();

            if (
                !alunoId ||
                telefone.length < 10 ||
                !nomeAluno ||
                !serie ||
                variantes.length === 0
            ) {
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

            const telFmt = formatarTelefone(telefone);

            await sql`
        UPDATE alunos
        SET
          nome_aluno = ${nomeAluno},
          colegio_id = ${colegioIdFinal},
          colegio_nome = ${colegioNomeFinal},
          serie = ${serie},
          telefone = ${telefone},
          telefone_formatado = ${telFmt}
        WHERE id = ${alunoId}
          AND regexp_replace(
            regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
            '^55(?=\d{10,11}$)',
            ''
          ) = ANY(${variantes}::text[])
          AND ativo = true
      `;

            const todosAlunos = await sql`
        SELECT id, telefone, telefone_formatado, responsavel_nome, nome_aluno, colegio_id, colegio_nome, serie
        FROM alunos
        WHERE regexp_replace(
          regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
          '^55(?=\d{10,11}$)',
          ''
        ) = ANY(${variantes}::text[])
          AND ativo = true
        ORDER BY id ASC
      `;

            return NextResponse.json({
                sucesso: true,
                alunos: todosAlunos,
            });
        }

        // Cadastro de novo aluno (vinculando à conta única do responsável)
        const telefoneRaw = String(body?.telefone || '');
        const telefone = normalizarTelefone(telefoneRaw);
        const variantes = gerarVariantesTelefone(telefoneRaw);
        const responsavelNome = String(body?.responsavelNome || '').trim();
        const nomeAluno = String(body?.nomeAluno || '').trim();
        const colegioOpcao = String(body?.colegioOpcao || '').trim();
        const colegioOutroNome = String(body?.colegioOutroNome || '').trim();
        const serie = String(body?.serie || '').trim();

        if (telefone.length < 10 || telefone.length > 11 || variantes.length === 0) {
            return NextResponse.json(
                {
                    error:
                        'Informe um número de WhatsApp válido com DDD (ex: 71 99999-9999).',
                },
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

        if (await alunoImportadoAguardandoVinculo(nomeAluno, telefone)) {
            return NextResponse.json({ error: 'Peça à recepção para confirmar o vínculo do aluno com sua conta.' }, { status: 409 });
        }

        const telFormatado = formatarTelefone(telefone);

        // Localiza ou cria a conta única do responsável (com 9 ou sem 9)
        const respExistente = (await sql`
      SELECT id, nome, pin_hash
      FROM responsaveis
      WHERE regexp_replace(
        regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
        '^55(?=\d{10,11}$)',
        ''
      ) = ANY(${variantes}::text[])
      ORDER BY id ASC
      LIMIT 1
    `) as { id: number; nome: string; pin_hash: string | null }[];

        let responsavelIdFinal: number;
        let pinHerdado: string | null = null;
        let nomeRespFinal = responsavelNome;

        if (respExistente.length > 0) {
            responsavelIdFinal = respExistente[0].id;
            pinHerdado = respExistente[0].pin_hash || null;
            if (!nomeRespFinal) {
                nomeRespFinal = respExistente[0].nome;
            } else {
                await sql`
          UPDATE responsaveis
          SET nome = ${nomeRespFinal},
              telefone = ${telefone},
              telefone_formatado = ${telFormatado},
              atualizado_em = now()
          WHERE id = ${responsavelIdFinal}
        `;
            }
        } else {
            const novoResp = (await sql`
        INSERT INTO responsaveis (telefone, telefone_formatado, nome)
        VALUES (${telefone}, ${telFormatado}, ${nomeRespFinal || 'Responsável'})
        RETURNING id, nome
      `) as { id: number; nome: string }[];
            responsavelIdFinal = novoResp[0].id;
            nomeRespFinal = novoResp[0].nome;
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
        pin_hash,
        ativo
      )
      VALUES (
        ${responsavelIdFinal},
        ${telefone},
        ${telFormatado},
        ${nomeRespFinal || null},
        ${nomeAluno},
        ${colegioIdFinal},
        ${colegioNomeFinal},
        ${serie},
        ${pinHerdado},
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

        await sql`
      UPDATE alunos
      SET
        responsavel_id = ${responsavelIdFinal},
        telefone = ${telefone},
        telefone_formatado = ${telFormatado},
        responsavel_nome = COALESCE(NULLIF(${nomeRespFinal}, ''), responsavel_nome),
        pin_hash = COALESCE(NULLIF(trim(pin_hash), ''), ${pinHerdado})
      WHERE regexp_replace(
        regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
        '^55(?=\d{10,11}$)',
        ''
      ) = ANY(${variantes}::text[])
        AND ativo = true
    `;

        const todosAlunos = await sql`
      SELECT id, telefone, telefone_formatado, responsavel_nome, nome_aluno, colegio_id, colegio_nome, serie
      FROM alunos
      WHERE responsavel_id = ${responsavelIdFinal}
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
        console.error('Erro ao cadastrar aluno:', error);
        return NextResponse.json(
            { error: 'Não foi possível salvar o cadastro do aluno.' },
            { status: 500 }
        );
    }
}