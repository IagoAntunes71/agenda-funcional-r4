import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const [unidades, professores, datasLiberadas] = await Promise.all([
            sql`
        SELECT id, nome, clin_care_id, ativa
        FROM unidades
        WHERE ativa = true
        ORDER BY nome ASC
      `,
            sql`
        SELECT
          id,
          nome,
          clin_care_id,
          unidade_id,
          materias,
          to_char(hora_inicio, 'HH24:MI') AS hora_inicio,
          to_char(hora_fim, 'HH24:MI') AS hora_fim,
          ativo
        FROM professores
        WHERE ativo = true
        ORDER BY nome ASC
      `,
            sql`
        SELECT
          id,
          to_char(data, 'YYYY-MM-DD') AS data,
          descricao,
          ativo
        FROM datas_liberadas
        WHERE ativo = true
          AND data >= (now() AT TIME ZONE 'America/Bahia')::date
        ORDER BY data ASC
      `,
        ]);

        return NextResponse.json({
            unidades,
            professores,
            datasLiberadas,
        });
    } catch (error) {
        console.error('Erro ao carregar dados iniciais:', error);
        return NextResponse.json(
            { error: 'Falha ao carregar dados de agendamento.' },
            { status: 500 }
        );
    }
}