import { NextRequest, NextResponse, connection } from 'next/server';
import { sql } from '@/lib/db';
import { verificarAdminAutenticado } from '@/lib/admin-auth';

export async function GET() {
    await connection();

    if (!(await verificarAdminAutenticado())) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        const itens = await sql`
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
      ORDER BY atualizado_em DESC, id DESC
    `;

        return NextResponse.json(
            { itens },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (error) {
        console.error('Erro ao listar importações de professores:', error);
        return NextResponse.json(
            { error: 'Falha ao carregar lista de IDs.' },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    if (!(await verificarAdminAutenticado())) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const textoIds = String(body?.ids || '');

        // Extrai todos os UUIDs válidos colados (separados por linha, vírgula ou espaço)
        const matches =
            textoIds.match(
                /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
            ) || [];

        const idsUnicos = Array.from(new Set(matches.map((id) => id.toLowerCase())));

        if (idsUnicos.length === 0) {
            return NextResponse.json(
                { error: 'Nenhum ID (UUID) válido do clin.care foi encontrado no texto.' },
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

        return NextResponse.json({
            sucesso: true,
            total: idsUnicos.length,
        });
    } catch (error) {
        console.error('Erro ao enfileirar IDs de professores:', error);
        return NextResponse.json(
            { error: 'Erro ao salvar IDs para importação.' },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest) {
    if (!(await verificarAdminAutenticado())) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const id = Number(searchParams.get('id'));

        if (!id) {
            return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
        }

        await sql`DELETE FROM importacao_profissionais_clincare WHERE id = ${id}`;
        return NextResponse.json({ sucesso: true });
    } catch (error) {
        console.error('Erro ao remover item de importação:', error);
        return NextResponse.json({ error: 'Falha ao remover ID.' }, { status: 500 });
    }
}