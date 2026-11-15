import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const whatsapp = searchParams.get('whatsapp') || '';
    const apenasNumeros = whatsapp.replace(/\D/g, '');

    if (apenasNumeros.length < 10) {
        return NextResponse.json({ encontrado: false });
    }

    try {
        const registros = await sql`
      SELECT nome_responsavel, nome_aluno, colegio_aluno, serie_aluno
      FROM agendamentos
      WHERE regexp_replace(whatsapp_responsavel, '\D', '', 'g') = ${apenasNumeros}
      ORDER BY criado_em DESC
      LIMIT 20
    `;

        if (registros.length === 0) {
            return NextResponse.json({ encontrado: false });
        }

        const alunosMap = new Map<
            string,
            { nome_aluno: string; colegio_aluno: string; serie_aluno: string }
        >();

        for (const r of registros) {
            const chave = r.nome_aluno.trim().toLowerCase();
            if (!alunosMap.has(chave)) {
                alunosMap.set(chave, {
                    nome_aluno: r.nome_aluno,
                    colegio_aluno: r.colegio_aluno || '',
                    serie_aluno: r.serie_aluno,
                });
            }
        }

        return NextResponse.json({
            encontrado: true,
            nome_responsavel: registros[0].nome_responsavel,
            alunos: Array.from(alunosMap.values()),
        });
    } catch (error) {
        console.error('Erro ao consultar responsável:', error);
        return NextResponse.json({ encontrado: false });
    }
}