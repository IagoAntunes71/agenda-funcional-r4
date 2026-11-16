import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verificarAdminAutenticado } from '@/lib/admin-auth';
import {
    garantirColunasSegurancaAlunos,
    normalizarTelefone,
} from '@/lib/cliente-auth';

export async function POST(req: NextRequest) {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirColunasSegurancaAlunos();

        const body = await req.json();
        const telefoneNorm = normalizarTelefone(String(body?.telefone || ''));

        if (telefoneNorm.length < 10) {
            return NextResponse.json(
                { error: 'Informe um número de WhatsApp válido.' },
                { status: 400 }
            );
        }

        const atualizados = (await sql`
      UPDATE alunos
      SET pin_hash = NULL,
          pin_tentativas = 0,
          pin_bloqueado_ate = NULL
      WHERE regexp_replace(
        regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
        '^55(?=\d{10,11}$)',
        ''
      ) = ${telefoneNorm}
      RETURNING id, nome_aluno, responsavel_nome
    `) as { id: number; nome_aluno: string; responsavel_nome: string | null }[];

        if (atualizados.length === 0) {
            return NextResponse.json(
                { error: 'Nenhum aluno encontrado com este WhatsApp.' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            sucesso: true,
            mensagem: `PIN resetado com sucesso (${atualizados.length} cadastro(s)). No próximo acesso o responsável criará um novo PIN.`,
        });
    } catch (error) {
        console.error('Erro ao resetar PIN:', error);
        return NextResponse.json(
            { error: 'Falha ao resetar PIN.' },
            { status: 500 }
        );
    }
}