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
                    colegios: colegiosOficiais,
                },
                { headers: { 'Cache-Control': 'no-store' } }
            );
        }

        const alunos = (await sql`
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
    `) as {
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
            alunos.find((a) => a.responsavel_nome && a.responsavel_nome.trim())
                ?.responsavel_nome?.trim() || '';

        if (!responsavelNome) {
            const historico = (await sql`
        SELECT COALESCE(NULLIF(trim(responsavel_nome), ''), NULLIF(trim(nome_responsavel), '')) AS resp
        FROM agendamentos
        WHERE regexp_replace(COALESCE(aluno_telefone, whatsapp_responsavel, ''), '\D', '', 'g') = ${telefone}
          AND COALESCE(NULLIF(trim(responsavel_nome), ''), NULLIF(trim(nome_responsavel), '')) IS NOT NULL
        ORDER BY criado_em DESC
        LIMIT 1
      `) as { resp: string | null }[];

            responsavelNome = historico[0]?.resp?.trim() || '';
        }

        return NextResponse.json(
            {
                telefone,
                telefoneFormatado: formatarTelefone(telefone),
                responsavelNome,
                alunos,
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