import { lerOperacaoR4 } from '@/lib/operacao-r4-db';
import { podeOperacao } from '@/lib/operacao-r4';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { lerSessaoAdmin } from '@/lib/admin-auth';
import {
    garantirEstruturaContasResponsaveis,
    gerarVariantesTelefone,
    normalizarTelefone,
} from '@/lib/cliente-auth';
import { formatarTelefone } from '@/lib/cliente-helpers';

export async function PATCH(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    if (!sessao) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirEstruturaContasResponsaveis();

        const body = await req.json();
        const acao = String(body?.acao || '');
        const cfg = await lerOperacaoR4();
        if (!podeOperacao(cfg, sessao.role, 'editarAlunos')) return NextResponse.json({ error: 'Seu perfil não pode editar alunos.' }, { status: 403 });
        if (sessao.role !== 'admin' && !podeOperacao(cfg, sessao.role, 'todosAlunos')) {
            const [aluno] = await sql`
                SELECT al.id FROM alunos al JOIN agendamentos a ON a.aluno_id = al.id
                JOIN professores p ON p.id = a.professor_id JOIN professores v ON v.id = ${sessao.professor_id}
                WHERE al.id = ${Number(body?.id) || 0} AND a.status IN ('realizado','concluido')
                    AND a.excluido_em IS NULL AND (v.id = p.id OR nullif(v.clin_care_id,'') = nullif(p.clin_care_id,''))
                LIMIT 1
            `;
            if (!aluno || acao === 'editar_responsavel') return NextResponse.json({ error: 'Aluno fora do seu acesso.' }, { status: 403 });
            body.atualizar_irmaos = false;
        }

        // AÇÃO 1: Editar conta única do responsável (e unificar caso o novo telefone já exista)
        if (acao === 'editar_responsavel') {
            const responsavelId = Number(body?.responsavel_id || 0);
            const nome = String(body?.nome || '').trim();
            const telefoneRaw = String(body?.telefone || '');
            const telefoneNorm = normalizarTelefone(telefoneRaw);
            const variantes = gerarVariantesTelefone(telefoneRaw);
            const resolverConflito = Boolean(body?.resolver_conflito);

            if (!responsavelId) {
                return NextResponse.json(
                    { error: 'ID do responsável inválido.' },
                    { status: 400 }
                );
            }

            if (nome.length < 2) {
                return NextResponse.json(
                    { error: 'Informe o nome completo do responsável.' },
                    { status: 400 }
                );
            }

            if (
                telefoneNorm.length < 10 ||
                telefoneNorm.length > 11 ||
                variantes.length === 0
            ) {
                return NextResponse.json(
                    { error: 'Informe um número de WhatsApp válido com DDD.' },
                    { status: 400 }
                );
            }

            const atualRows = (await sql`
        SELECT id, pin_hash
        FROM responsaveis
        WHERE id = ${responsavelId}
        LIMIT 1
      `) as { id: number; pin_hash: string | null }[];

            if (atualRows.length === 0) {
                return NextResponse.json(
                    { error: 'Conta de responsável não encontrada.' },
                    { status: 404 }
                );
            }

            const telFmt = formatarTelefone(telefoneNorm);

            // Verifica se já existe OUTRA conta usando este mesmo número (com 9 ou sem 9)
            const destinoRows = (await sql`
        SELECT id, pin_hash
        FROM responsaveis
        WHERE id <> ${responsavelId}
          AND regexp_replace(
            regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
            '^55(?=\d{10,11}$)',
            ''
          ) = ANY(${variantes}::text[])
        ORDER BY id ASC
        LIMIT 1
      `) as { id: number; pin_hash: string | null }[];

            if (destinoRows.length > 0) {
                const destinoId = destinoRows[0].id;
                const pinFinal =
                    destinoRows[0].pin_hash || atualRows[0].pin_hash || null;

                await sql`
          UPDATE responsaveis
          SET
            nome = ${nome},
            telefone = ${telefoneNorm},
            telefone_formatado = ${telFmt},
            pin_hash = ${pinFinal},
            conflito_migracao = false,
            conflito_detalhes = NULL,
            atualizado_em = now()
          WHERE id = ${destinoId}
        `;

                await sql`
          UPDATE alunos
          SET
            responsavel_id = ${destinoId},
            responsavel_nome = ${nome},
            telefone = ${telefoneNorm},
            telefone_formatado = ${telFmt},
            pin_hash = COALESCE(${pinFinal}, pin_hash)
          WHERE responsavel_id IN (${responsavelId}, ${destinoId})
        `;

                await sql`
          DELETE FROM responsaveis
          WHERE id = ${responsavelId}
        `;

                return NextResponse.json({
                    sucesso: true,
                    mensagem:
                        'Contas unificadas com sucesso no WhatsApp informado.',
                });
            }

            await sql`
        UPDATE responsaveis
        SET
          nome = ${nome},
          telefone = ${telefoneNorm},
          telefone_formatado = ${telFmt},
          conflito_migracao = CASE WHEN ${resolverConflito} THEN false ELSE conflito_migracao END,
          conflito_detalhes = CASE WHEN ${resolverConflito} THEN NULL ELSE conflito_detalhes END,
          atualizado_em = now()
        WHERE id = ${responsavelId}
      `;

            await sql`
        UPDATE alunos
        SET
          responsavel_nome = ${nome},
          telefone = ${telefoneNorm},
          telefone_formatado = ${telFmt}
        WHERE responsavel_id = ${responsavelId}
      `;

            return NextResponse.json({
                sucesso: true,
                mensagem: 'Conta do responsável atualizada com sucesso.',
            });
        }

        // AÇÃO 2: Editar dados individuais de um filho/aluno
        const id = Number(body?.id || 0);
        const nomeAluno = String(body?.nome_aluno || '').trim();
        const responsavelNome = String(body?.responsavel_nome || '').trim();
        const telefoneRaw = String(body?.telefone || '');
        const telefoneNorm = normalizarTelefone(telefoneRaw);
        const colegioNome = String(body?.colegio_nome || '').trim();
        const serie = String(body?.serie || '').trim();
        const atualizarIrmaos = body?.atualizar_irmaos !== false;

        if (!id) {
            return NextResponse.json(
                { error: 'ID do aluno inválido.' },
                { status: 400 }
            );
        }

        if (nomeAluno.length < 2) {
            return NextResponse.json(
                { error: 'Informe o nome completo do aluno(a).' },
                { status: 400 }
            );
        }

        if (telefoneNorm.length < 10 || telefoneNorm.length > 11) {
            return NextResponse.json(
                { error: 'Informe um número de WhatsApp válido com DDD.' },
                { status: 400 }
            );
        }

        const existentes = (await sql`
      SELECT id, responsavel_id, telefone
      FROM alunos
      WHERE id = ${id}
      LIMIT 1
    `) as { id: number; responsavel_id: number | null; telefone: string | null }[];

        if (existentes.length === 0) {
            return NextResponse.json(
                { error: 'Aluno não encontrado.' },
                { status: 404 }
            );
        }

        const telefoneAntigoBruto = String(existentes[0].telefone || '');
        const telefoneAntigoNorm = normalizarTelefone(telefoneAntigoBruto);
        const variantesAntigas = gerarVariantesTelefone(telefoneAntigoBruto);
        const telefoneFormatado = formatarTelefone(telefoneNorm);

        await sql`
      UPDATE alunos
      SET
        nome_aluno = ${nomeAluno},
        responsavel_nome = COALESCE(NULLIF(${responsavelNome}, ''), responsavel_nome),
        telefone = ${telefoneNorm},
        telefone_formatado = ${telefoneFormatado},
        colegio_nome = ${colegioNome},
        serie = ${serie}
      WHERE id = ${id}
    `;

        if (
            atualizarIrmaos &&
            variantesAntigas.length > 0 &&
            telefoneAntigoNorm !== telefoneNorm
        ) {
            await sql`
        UPDATE alunos
        SET
          telefone = ${telefoneNorm},
          telefone_formatado = ${telefoneFormatado},
          responsavel_nome = COALESCE(NULLIF(${responsavelNome}, ''), responsavel_nome)
        WHERE id <> ${id}
          AND regexp_replace(
            regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
            '^55(?=\d{10,11}$)',
            ''
          ) = ANY(${variantesAntigas}::text[])
      `;

            if (existentes[0].responsavel_id) {
                await sql`
          UPDATE responsaveis
          SET
            telefone = ${telefoneNorm},
            telefone_formatado = ${telefoneFormatado},
            nome = COALESCE(NULLIF(${responsavelNome}, ''), nome),
            atualizado_em = now()
          WHERE id = ${existentes[0].responsavel_id}
        `;
            }
        }

        return NextResponse.json({
            sucesso: true,
            mensagem: 'Dados do aluno atualizados com sucesso.',
        });
    } catch (error) {
        console.error('Erro ao editar aluno/responsável no admin:', error);
        return NextResponse.json(
            { error: 'Falha ao salvar alterações.' },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    if (!sessao) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    if (sessao.role !== 'admin') return NextResponse.json({ error: 'Apenas administradores podem excluir cadastros.' }, { status: 403 });

    try {
        const { searchParams } = new URL(req.url);
        const responsavelId = Number(searchParams.get('responsavelId') || 0);
        const id = Number(searchParams.get('id') || 0);

        // Excluir conta inteira do responsável (preservando histórico de agendamentos)
        if (responsavelId > 0) {
            await sql`
        UPDATE agendamentos
        SET aluno_id = NULL
        WHERE aluno_id IN (
          SELECT id FROM alunos WHERE responsavel_id = ${responsavelId}
        )
      `;

            await sql`
        DELETE FROM alunos
        WHERE responsavel_id = ${responsavelId}
      `;

            await sql`
        DELETE FROM responsaveis
        WHERE id = ${responsavelId}
      `;

            return NextResponse.json({
                sucesso: true,
                mensagem: 'Conta do responsável excluída com sucesso.',
            });
        }

        if (!id) {
            return NextResponse.json(
                { error: 'ID inválido para exclusão.' },
                { status: 400 }
            );
        }

        await sql`
      UPDATE agendamentos
      SET aluno_id = NULL
      WHERE aluno_id = ${id}
    `;

        await sql`
      DELETE FROM alunos
      WHERE id = ${id}
    `;

        return NextResponse.json({
            sucesso: true,
            mensagem: 'Cadastro do aluno excluído com sucesso.',
        });
    } catch (error) {
        console.error('Erro ao excluir aluno/conta:', error);
        return NextResponse.json(
            { error: 'Falha ao excluir cadastro.' },
            { status: 500 }
        );
    }
}