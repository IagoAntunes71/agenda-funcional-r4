import { NextRequest, NextResponse, connection } from 'next/server';
import { sql } from '@/lib/db';
import { verificarAdminAutenticado } from '@/lib/admin-auth';

async function garantirTabelaImportacao() {
    await sql`
    CREATE TABLE IF NOT EXISTS importacao_profissionais_clincare (
      id SERIAL PRIMARY KEY,
      clin_care_id TEXT UNIQUE NOT NULL,
      nome_detectado TEXT,
      unidades_detectadas TEXT,
      materias_detectadas TEXT,
      status TEXT NOT NULL DEFAULT 'pendente',
      mensagem TEXT,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

async function listarItens() {
    return await sql`
    SELECT
      id,
      clin_care_id,
      nome_detectado,
      unidades_detectadas,
      materias_detectadas,
      status,
      mensagem,
      to_char(atualizado_em AT TIME ZONE 'America/Bahia', 'DD/MM HH24:MI') AS atualizado_em
    FROM importacao_profissionais_clincare
    ORDER BY id DESC
  `;
}

export async function GET() {
    await connection();

    if (!(await verificarAdminAutenticado())) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirTabelaImportacao();
        const itens = await listarItens();

        return NextResponse.json(
            { itens },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (error) {
        console.error('Erro ao listar importações de professores:', error);
        return NextResponse.json(
            { error: 'Falha ao carregar lista de IDs do banco.' },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    if (!(await verificarAdminAutenticado())) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirTabelaImportacao();
        const body = await req.json();

        if (body?.reimportarMaterias === true) {
            await sql`
        UPDATE importacao_profissionais_clincare
        SET status = 'pendente',
            mensagem = 'Aguardando leitura de Serviços e Valores',
            atualizado_em = now()
        WHERE clin_care_id <> '__TODOS__'
      `;

            const itens = await listarItens();
            return NextResponse.json({
                sucesso: true,
                reimportar: true,
                itens,
            });
        }

        if (body?.descobrirTodos === true) {
            await sql`
        INSERT INTO importacao_profissionais_clincare (
          clin_care_id,
          nome_detectado,
          status,
          mensagem,
          atualizado_em
        )
        VALUES (
          '__TODOS__',
          'Varredura automática (/painel/profissionais)',
          'pendente',
          'Aguardando execução do robô no GitHub Actions',
          now()
        )
        ON CONFLICT (clin_care_id)
        DO UPDATE SET
          status = 'pendente',
          mensagem = 'Aguardando nova varredura completa',
          atualizado_em = now()
      `;

            const itens = await listarItens();
            return NextResponse.json({
                sucesso: true,
                modoTodos: true,
                itens,
            });
        }

        const textoBruto = String(body?.ids || '').trim();
        const uuids =
            textoBruto.match(
                /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
            ) || [];

        const idsUnicos = Array.from(new Set(uuids.map((id) => id.toLowerCase())));

        if (idsUnicos.length === 0) {
            return NextResponse.json(
                { error: 'Nenhum ID (UUID) válido foi encontrado no texto colado.' },
                { status: 400 }
            );
        }

        for (const clinCareId of idsUnicos) {
            await sql`
        INSERT INTO importacao_profissionais_clincare (clin_care_id, status, mensagem, atualizado_em)
        VALUES (${clinCareId}, 'pendente', 'Aguardando sincronização no GitHub Actions', now())
        ON CONFLICT (clin_care_id)
        DO UPDATE SET
          status = 'pendente',
          mensagem = 'Reenfileirado para atualização',
          atualizado_em = now()
      `;
        }

        const itens = await listarItens();

        return NextResponse.json({
            sucesso: true,
            total: idsUnicos.length,
            itens,
        });
    } catch (error) {
        console.error('Erro ao enfileirar IDs de professores:', error);
        return NextResponse.json(
            { error: 'Erro interno ao gravar IDs no banco Neon.' },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest) {
    if (!(await verificarAdminAutenticado())) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirTabelaImportacao();
        const { searchParams } = new URL(req.url);
        const id = Number(searchParams.get('id'));

        if (!id) {
            return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
        }

        await sql`DELETE FROM importacao_profissionais_clincare WHERE id = ${id}`;
        const itens = await listarItens();

        return NextResponse.json({ sucesso: true, itens });
    } catch (error) {
        console.error('Erro ao remover item de importação:', error);
        return NextResponse.json({ error: 'Falha ao remover ID.' }, { status: 500 });
    }
}