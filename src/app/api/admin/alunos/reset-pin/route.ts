import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verificarAdminAutenticado } from '@/lib/admin-auth';
import {
    garantirEstruturaContasResponsaveis,
    gerarVariantesTelefone,
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
        const telefoneRaw = String(body?.telefone || '');
        const telefoneNorm = normalizarTelefone(telefoneRaw);
        const variantes = gerarVariantesTelefone(telefoneRaw);

        if (!responsavelId && (telefoneNorm.length < 10 || variantes.length === 0)) {
            return NextResponse.json(
                { error: 'Informe uma conta ou número de WhatsApp válido.' },
                { status: 400 }
            );
        }

        if (responsavelId > 0) {
            await sql`
        UPDATE responsaveis
        SET pin_hash = NULL,
            pin_tentativas = 0,
            pin_bloqueado_ate = NULL,
            atualizado_em = now()
        WHERE id = ${responsavelId}
      `;

            await sql`
        UPDATE alunos
        SET pin_hash = NULL,
            pin_tentativas = 0,
            pin_bloqueado_ate = NULL
        WHERE responsavel_id = ${responsavelId}
      `;
        }

        if (variantes.length > 0) {
            await sql`
        UPDATE responsaveis
        SET pin_hash = NULL,
            pin_tentativas = 0,
            pin_bloqueado_ate = NULL,
            atualizado_em = now()
        WHERE regexp_replace(
          regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
          '^55(?=\d{10,11}$)',
          ''
        ) = ANY(${variantes}::text[])
      `;

            await sql`
        UPDATE alunos
        SET pin_hash = NULL,
            pin_tentativas = 0,
            pin_bloqueado_ate = NULL
        WHERE regexp_replace(
          regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
          '^55(?=\d{10,11}$)',
          ''
        ) = ANY(${variantes}::text[])
      `;
        }

        return NextResponse.json({
            sucesso: true,
            mensagem:
                'PIN resetado com sucesso. No próximo acesso o responsável criará um novo PIN.',
        });
    } catch (error) {
        console.error('Erro ao resetar PIN:', error);
        return NextResponse.json(
            { error: 'Falha ao resetar PIN.' },
            { status: 500 }
        );
    }
}