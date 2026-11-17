import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verificarAdminAutenticado } from '@/lib/admin-auth';
import {
    garantirEstruturaContasResponsaveis,
    normalizarTelefone,
} from '@/lib/cliente-auth';

export async function POST(req: NextRequest) {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirEstruturaContasResponsaveis();

        const body = await req.json();
        const responsavelId = Number(body?.responsavelId || 0);
        const telefoneNorm = normalizarTelefone(String(body?.telefone || ''));

        if (!responsavelId && telefoneNorm.length < 10) {
            return NextResponse.json(
                { error: 'Informe a conta ou um número de WhatsApp válido.' },
                { status: 400 }
            );
        }

        const atualizados = (
            responsavelId > 0
                ? await sql`
            UPDATE responsaveis
            SET pin_hash = NULL,
                pin_tentativas = 0,
                pin_bloqueado_ate = NULL,
                sessao_versao = COALESCE(sessao_versao, 1) + 1,
                atualizado_em = now()
            WHERE id = ${responsavelId}
            RETURNING id, nome, telefone
          `
                : await sql`
            UPDATE responsaveis
            SET pin_hash = NULL,
                pin_tentativas = 0,
                pin_bloqueado_ate = NULL,
                sessao_versao = COALESCE(sessao_versao, 1) + 1,
                atualizado_em = now()
            WHERE telefone = ${telefoneNorm}
            RETURNING id, nome, telefone
          `
        ) as { id: number; nome: string; telefone: string }[];

        if (atualizados.length === 0) {
            return NextResponse.json(
                { error: 'Nenhuma conta de responsável encontrada.' },
                { status: 404 }
            );
        }

        // Limpa também colunas legadas para manter consistência
        await sql`
      UPDATE alunos
      SET pin_hash = NULL,
          pin_tentativas = 0,
          pin_bloqueado_ate = NULL
      WHERE responsavel_id = ${atualizados[0].id}
    `;

        return NextResponse.json({
            sucesso: true,
            mensagem: `PIN da conta de ${atualizados[0].nome} resetado e sessões anteriores encerradas. No próximo acesso o responsável criará um novo PIN.`,
        });
    } catch (error) {
        console.error('Erro ao resetar PIN:', error);
        return NextResponse.json(
            { error: 'Falha ao resetar PIN.' },
            { status: 500 }
        );
    }
}