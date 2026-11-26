import { lerOperacaoR4 } from '@/lib/operacao-r4-db';
import { podeOperacao } from '@/lib/operacao-r4';
import { sugerirColegiosDuplicados, type CadastroColegioR4 } from '@/lib/colegios-r4';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { lerSessaoAdmin } from '@/lib/admin-auth';
import { garantirTabelasClientesEColegios } from '@/app/api/cliente/route';

async function carregarColegiosAdmin() {
    const rows = (await sql`
    SELECT
      c.id,
      c.nome,
      c.aprovado,
      COUNT(a.id)::int AS total_alunos
    FROM colegios c
    LEFT JOIN alunos a ON a.colegio_id = c.id
    GROUP BY c.id, c.nome, c.aprovado
    ORDER BY c.aprovado ASC, c.nome ASC
  `) as {
        id: number;
        nome: string;
        aprovado: boolean;
        total_alunos: number;
    }[];

    const nomesLivres = await sql`
        SELECT NULL AS id, min(trim(colegio_nome)) AS nome, count(*)::int AS total_alunos
        FROM alunos
        WHERE colegio_id IS NULL AND trim(colegio_nome) <> ''
        GROUP BY lower(trim(colegio_nome))
        ORDER BY 2
    ` as CadastroColegioR4[];
    const cadastros = [...rows, ...nomesLivres];

    return {
        cadastros,
        sugestoes: sugerirColegiosDuplicados(cadastros),
        pendentes: rows.filter((r) => !r.aprovado),
        oficiais: rows.filter((r) => r.aprovado),
    };
}

export async function GET(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    const paraAgendamento = req.nextUrl.searchParams.get('lista') === 'agendamento';
    if (!sessao || (!paraAgendamento && sessao.role !== 'admin')) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirTabelasClientesEColegios();
        if (paraAgendamento) {
            const cfg = await lerOperacaoR4();
            if (!podeOperacao(cfg, sessao.role, 'agenda') || !podeOperacao(cfg, sessao.role, 'editarAlunos') ||
                (sessao.role === 'atendimento' && !cfg.recepcaoCadastra)) {
                return NextResponse.json({ error: 'Sem acesso ao cadastro rápido.' }, { status: 403 });
            }
            const colegios = await sql`SELECT id, nome FROM colegios WHERE aprovado ORDER BY nome, id`;
            return NextResponse.json({ colegios }, { headers: { 'Cache-Control': 'private, no-store' } });
        }
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
    if ((await lerSessaoAdmin())?.role !== 'admin') {
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

        if (acao === 'unificar' || acao === 'mesclar') {
            const entradas: unknown = acao === 'mesclar'
                ? [{ id: Number(body.origemId) }, { id: Number(body.destinoId) }]
                : body.cadastros;
            const nomeSolicitado = typeof body.nome === 'string' ? body.nome.replace(/\s+/g, ' ').trim() : '';
            if (!Array.isArray(entradas) || entradas.length < 2 || entradas.length > 50 ||
                (acao === 'unificar' && (nomeSolicitado.length < 2 || nomeSolicitado.length > 180))) {
                return NextResponse.json({ error: 'Selecione os cadastros e informe o nome final do colégio.' }, { status: 400 });
            }
            const ids: number[] = [];
            const nomes: string[] = [];
            for (const entrada of entradas) {
                if (Number.isSafeInteger(entrada?.id) && entrada.id > 0 && entrada.id <= 2147483647) ids.push(entrada.id);
                else if (entrada?.id === null && typeof entrada.nome === 'string' && entrada.nome.trim()) nomes.push(entrada.nome.trim());
                else return NextResponse.json({ error: 'Cadastro de colégio inválido.' }, { status: 400 });
            }
            if (new Set(ids).size !== ids.length || new Set(nomes.map((nome) => nome.toLowerCase())).size !== nomes.length) {
                return NextResponse.json({ error: 'Selecione cadastros diferentes.' }, { status: 400 });
            }

            const [, resultado] = await sql.transaction([
                sql`LOCK TABLE colegios, alunos IN SHARE ROW EXCLUSIVE MODE`,
                sql`
                    WITH nomes_selecionados AS (
                        SELECT lower(trim(valor)) AS nome FROM unnest(${nomes}::text[]) AS n(valor)
                    ), selecao AS (
                        SELECT id, nome FROM colegios WHERE id = ANY(${ids}::int[])
                    ), destino AS (
                        SELECT coalesce(nullif(${nomeSolicitado}, ''), (
                            SELECT nome FROM colegios WHERE id = ${acao === 'mesclar' ? ids[1] : null} AND aprovado
                        )) AS nome
                        WHERE (SELECT count(*) FROM selecao) = ${ids.length}
                          AND NOT EXISTS (
                            SELECT 1 FROM nomes_selecionados n WHERE NOT EXISTS (
                                SELECT 1 FROM alunos a WHERE a.colegio_id IS NULL AND lower(trim(a.colegio_nome)) = n.nome
                            )
                          )
                    ), valido AS (
                        SELECT nome FROM destino d WHERE nome IS NOT NULL AND NOT EXISTS (
                            SELECT 1 FROM colegios c WHERE lower(trim(c.nome)) = lower(d.nome)
                              AND NOT (c.id = ANY(${ids}::int[]))
                        )
                    ), manter AS (
                        SELECT s.id FROM selecao s CROSS JOIN valido v
                        ORDER BY (lower(trim(s.nome)) = lower(v.nome)) DESC, (s.id = ${ids[1] ?? null}) DESC NULLS LAST, s.id
                        LIMIT 1
                    ), criado AS (
                        INSERT INTO colegios (nome, aprovado)
                        SELECT nome, true FROM valido WHERE NOT EXISTS (SELECT 1 FROM manter)
                        RETURNING id, nome
                    ), renomeado AS (
                        UPDATE colegios c SET nome = v.nome, aprovado = true FROM valido v, manter m
                        WHERE c.id = m.id RETURNING c.id, c.nome
                    ), oficial AS (
                        SELECT * FROM criado UNION ALL SELECT * FROM renomeado
                    ), movidos AS (
                        UPDATE alunos a SET colegio_id = o.id, colegio_nome = o.nome FROM oficial o
                        WHERE a.colegio_id = ANY(${ids}::int[]) OR (
                            a.colegio_id IS NULL AND lower(trim(a.colegio_nome)) IN (SELECT nome FROM nomes_selecionados)
                        )
                        RETURNING a.id
                    ), removidos AS (
                        DELETE FROM colegios c USING oficial o
                        WHERE c.id = ANY(${ids}::int[]) AND c.id <> o.id AND (SELECT count(*) FROM movidos) >= 0
                        RETURNING c.id
                    )
                    SELECT id FROM oficial
                `,
            ]);
            if (!resultado.length) return NextResponse.json({
                error: 'Os cadastros mudaram ou o nome final já pertence a outro colégio. Atualize a lista ou inclua esse cadastro na seleção.',
            }, { status: 409 });
            return NextResponse.json({ sucesso: true, ...await carregarColegiosAdmin() });
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