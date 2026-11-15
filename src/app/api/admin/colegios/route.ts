import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verificarAdminAutenticado } from '@/lib/admin-auth';
import { garantirTabelasClientesEColegios } from '@/app/api/cliente/route';

async function carregarColegiosAdmin() {
    const rows = (await sql`
    SELECT
      c.id,
      c.nome,
      c.aprovado,
      COUNT(a.id)::int AS total_alunos
    FROM colegios c
    LEFT JOIN alunos a ON a.colegio_id = c.id AND a.ativo = true
    GROUP BY c.id, c.nome, c.aprovado
    ORDER BY c.aprovado ASC, c.nome ASC
  `) as {
        id: number;
        nome: string;
        aprovado: boolean;
        total_alunos: number;
    }[];

    return {
        pendentes: rows.filter((r) => !r.aprovado),
        oficiais: rows.filter((r) => r.aprovado),
    };
}

export async function GET() {
    if (!(await verificarAdminAutenticado())) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirTabelasClientesEColegios();
        const dados = await carregarColegiosAdmin();
        return NextResponse.json(dados, {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        console.error('Erro ao listar colégios:', error);
        return NextResponse.json(
            { error: 'Falha ao carregar colégios.' },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    if (!(await verificarAdminAutenticado())) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirTabelasClientesEColegios();

        const body = await req.json();
        const acao = String(body?.acao || '');

        if (acao === 'adicionar') {
            const nome = String(body?.nome || '').replace(/\s+/g, ' ').trim();
            if (nome.length < 2) {
                return NextResponse.json(
                    { error: 'Informe o nome do colégio.' },
                    { status: 400 }
                );
            }

            const jaExiste = (await sql`
        SELECT id
        FROM colegios
        WHERE lower(trim(nome)) = lower(trim(${nome}))
        LIMIT 1
      `) as { id: number }[];

            if (jaExiste.length > 0) {
                await sql`
          UPDATE colegios
          SET nome = ${nome},
              aprovado = true
          WHERE id = ${jaExiste[0].id}
        `;
            } else {
                await sql`
          INSERT INTO colegios (nome, aprovado)
          VALUES (${nome}, true)
        `;
            }

            const dados = await carregarColegiosAdmin();
            return NextResponse.json({ sucesso: true, ...dados });
        }

        if (acao === 'aprovar') {
            const id = Number(body?.id || 0);
            const nomeAjustado = String(body?.nome || '').replace(/\s+/g, ' ').trim();

            if (!id || nomeAjustado.length < 2) {
                return NextResponse.json(
                    { error: 'Dados inválidos para aprovar colégio.' },
                    { status: 400 }
                );
            }

            await sql`
        UPDATE colegios
        SET nome = ${nomeAjustado},
            aprovado = true
        WHERE id = ${id}
      `;

            // Atualiza também o nome padronizado nos alunos já vinculados a esse colégio
            await sql`
        UPDATE alunos
        SET colegio_nome = ${nomeAjustado}
        WHERE colegio_id = ${id}
      `;

            const dados = await carregarColegiosAdmin();
            return NextResponse.json({ sucesso: true, ...dados });
        }

        if (acao === 'mesclar') {
            const origemId = Number(body?.origemId || 0);
            const destinoId = Number(body?.destinoId || 0);

            if (!origemId || !destinoId || origemId === destinoId) {
                return NextResponse.json(
                    { error: 'Selecione um colégio oficial válido para mesclar.' },
                    { status: 400 }
                );
            }

            const destinoRows = (await sql`
        SELECT id, nome
        FROM colegios
        WHERE id = ${destinoId}
          AND aprovado = true
        LIMIT 1
      `) as { id: number; nome: string }[];

            if (destinoRows.length === 0) {
                return NextResponse.json(
                    { error: 'Colégio oficial de destino não encontrado.' },
                    { status: 404 }
                );
            }

            await sql`
        UPDATE alunos
        SET colegio_id = ${destinoRows[0].id},
            colegio_nome = ${destinoRows[0].nome}
        WHERE colegio_id = ${origemId}
      `;

            await sql`
        DELETE FROM colegios
        WHERE id = ${origemId}
      `;

            const dados = await carregarColegiosAdmin();
            return NextResponse.json({ sucesso: true, ...dados });
        }

        if (acao === 'remover') {
            const id = Number(body?.id || 0);
            if (id) {
                await sql`DELETE FROM colegios WHERE id = ${id}`;
            }
            const dados = await carregarColegiosAdmin();
            return NextResponse.json({ sucesso: true, ...dados });
        }

        return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    } catch (error) {
        console.error('Erro ao gerenciar colégios:', error);
        return NextResponse.json(
            { error: 'Falha ao salvar alteração do colégio.' },
            { status: 500 }
        );
    }
}