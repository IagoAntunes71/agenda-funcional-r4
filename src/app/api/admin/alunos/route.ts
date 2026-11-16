import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verificarAdminAutenticado } from '@/lib/admin-auth';
import {
    garantirColunasSegurancaAlunos,
    normalizarTelefone,
} from '@/lib/cliente-auth';
import { formatarTelefone } from '@/lib/cliente-helpers';

export async function PATCH(req: NextRequest) {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirColunasSegurancaAlunos();

        const body = await req.json();
        const id = Number(body?.id || 0);
        const nomeAluno = String(body?.nome_aluno || '').trim();
        const responsavelNome = String(body?.responsavel_nome || '').trim();
        const telefoneNorm = normalizarTelefone(String(body?.telefone || ''));
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
      SELECT id, telefone
      FROM alunos
      WHERE id = ${id}
      LIMIT 1
    `) as { id: number; telefone: string | null }[];

        if (existentes.length === 0) {
            return NextResponse.json(
                { error: 'Aluno não encontrado.' },
                { status: 404 }
            );
        }

        const telefoneAntigoNorm = normalizarTelefone(
            String(existentes[0].telefone || '')
        );
        const telefoneFormatado = formatarTelefone(telefoneNorm);

        await sql`
      UPDATE alunos
      SET
        nome_aluno = ${nomeAluno},
        responsavel_nome = ${responsavelNome || null},
        telefone = ${telefoneNorm},
        telefone_formatado = ${telefoneFormatado},
        colegio_nome = ${colegioNome},
        serie = ${serie}
      WHERE id = ${id}
    `;

        // Se o número de WhatsApp mudou e a opção estiver marcada, atualiza também os irmãos vinculados
        if (
            atualizarIrmaos &&
            telefoneAntigoNorm &&
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
          ) = ${telefoneAntigoNorm}
      `;
        }

        return NextResponse.json({
            sucesso: true,
            mensagem: 'Dados do aluno atualizados com sucesso.',
        });
    } catch (error) {
        console.error('Erro ao editar aluno no admin:', error);
        return NextResponse.json(
            { error: 'Falha ao salvar alterações do aluno.' },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest) {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const id = Number(searchParams.get('id') || 0);

        if (!id) {
            return NextResponse.json(
                { error: 'ID do aluno inválido.' },
                { status: 400 }
            );
        }

        // Preserva o histórico de agendamentos antigos desvinculando a FK antes de excluir
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
        console.error('Erro ao excluir aluno:', error);
        return NextResponse.json(
            { error: 'Falha ao excluir cadastro do aluno.' },
            { status: 500 }
        );
    }
}