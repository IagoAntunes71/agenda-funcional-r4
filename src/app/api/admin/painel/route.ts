import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verificarAdminAutenticado } from '@/lib/admin-auth';

export async function GET() {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        const [unidades, professores, datasLiberadas, agendamentos, syncInfo] =
            await Promise.all([
                sql`
          SELECT id, nome, clin_care_id, ativa
          FROM unidades
          ORDER BY nome ASC
        `,
                sql`
          SELECT
            p.id,
            p.nome,
            p.clin_care_id,
            p.unidade_id,
            u.nome AS unidade_nome,
            p.materias,
            to_char(p.hora_inicio, 'HH24:MI') AS hora_inicio,
            to_char(p.hora_fim, 'HH24:MI') AS hora_fim,
            p.ativo
          FROM professores p
          JOIN unidades u ON u.id = p.unidade_id
          ORDER BY u.nome ASC, p.nome ASC
        `,
                sql`
          SELECT
            id,
            to_char(data, 'YYYY-MM-DD') AS data,
            descricao,
            ativo
          FROM datas_liberadas
          ORDER BY data DESC
          LIMIT 60
        `,
                sql`
          SELECT
            a.id,
            a.protocolo,
            a.unidade_id,
            u.nome AS unidade_nome,
            a.professor_id,
            p.nome AS professor_nome,
            a.materia,
            to_char(a.data, 'YYYY-MM-DD') AS data,
            to_char(a.horario, 'HH24:MI') AS horario,
            a.nome_responsavel,
            a.whatsapp_responsavel,
            a.nome_aluno,
            a.colegio_aluno,
            a.serie_aluno,
            a.observacoes,
            a.status,
            a.sincronizado_clincare,
            to_char(a.criado_em AT TIME ZONE 'America/Bahia', 'DD/MM/YYYY HH24:MI') AS criado_em_formatado
          FROM agendamentos a
          JOIN unidades u ON u.id = a.unidade_id
          JOIN professores p ON p.id = a.professor_id
          ORDER BY a.data DESC, a.horario ASC
          LIMIT 250
        `,
                sql`
          SELECT to_char(max(atualizado_em) AT TIME ZONE 'America/Bahia', 'DD/MM/YYYY HH24:MI') AS ultima_sincronizacao
          FROM bloqueios_clincare
        `,
            ]);

        return NextResponse.json({
            unidades,
            professores,
            datasLiberadas,
            agendamentos,
            ultimaSincronizacao: syncInfo[0]?.ultima_sincronizacao || null,
        });
    } catch (error) {
        console.error('Erro ao carregar painel admin:', error);
        return NextResponse.json(
            { error: 'Falha ao carregar dados administrativos.' },
            { status: 500 }
        );
    }
}