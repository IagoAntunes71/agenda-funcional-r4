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
      nome_aluno TEXT NOT NULL,
      colegio_id INT REFERENCES colegios(id) ON DELETE SET NULL,
      colegio_nome TEXT NOT NULL,
      serie TEXT NOT NULL,
      ativo BOOLEAN NOT NULL DEFAULT true,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

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
            nome_aluno: string;
            colegio_id: number | null;
            colegio_nome: string;
            serie: string;
        }[];

        return NextResponse.json(
            {
                telefone,
                telefoneFormatado: formatarTelefone(telefone),
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
        SELECT id, telefone, telefone_formatado, nome_aluno, colegio_id, colegio_nome, serie
        FROM alunos
        WHERE telefone = ${telefone}
          AND ativo = true
        ORDER BY id ASC
      `;

            return NextResponse.json({ sucesso: true, alunos: restantes });
        }

        const telefone = normalizarTelefone(String(body?.telefone || ''));
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

            // Verifica se já existe no banco (oficial ou pendente)
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
                // Salva com aprovado = false para aparecer no painel Admin
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
        nome_aluno,
        colegio_id,
        colegio_nome,
        serie,
        ativo
      )
      VALUES (
        ${telefone},
        ${telFormatado},
        ${nomeAluno},
        ${colegioIdFinal},
        ${colegioNomeFinal},
        ${serie},
        true
      )
      RETURNING id, telefone, telefone_formatado, nome_aluno, colegio_id, colegio_nome, serie
    `) as {
            id: number;
            telefone: string;
            telefone_formatado: string;
            nome_aluno: string;
            colegio_id: number | null;
            colegio_nome: string;
            serie: string;
        }[];

        const todosAlunos = await sql`
      SELECT id, telefone, telefone_formatado, nome_aluno, colegio_id, colegio_nome, serie
      FROM alunos
      WHERE telefone = ${telefone}
        AND ativo = true
      ORDER BY id ASC
    `;

        return NextResponse.json(
            {
                sucesso: true,
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