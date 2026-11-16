import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verificarAdminAutenticado } from '@/lib/admin-auth';
import { obterModoChaveMestra } from '@/app/api/admin/configuracoes/route';
import { avaliarStatusChaveMestra } from '@/lib/horarios-reforco';
import { CONFIG_SYNC_MODOS } from '@/app/api/admin/sincronizar/route';

export async function GET() {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        const modoChaveMestra = await obterModoChaveMestra();
        const statusChaveMestra = avaliarStatusChaveMestra(modoChaveMestra);

        await sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_ativo BOOLEAN DEFAULT false`;
        await sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_inicio TIME`;
        await sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_fim TIME`;
        await sql`ALTER TABLE alunos ADD COLUMN IF NOT EXISTS responsavel_nome TEXT`;
        await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS lancado_clincare BOOLEAN DEFAULT false`;
        await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS sincronizado_clincare BOOLEAN DEFAULT false`;

        const [
            unidades,
            professores,
            datasLiberadas,
            agendamentos,
            bloqueios,
            syncInfo,
            disparosRaw,
        ] = await Promise.all([
            sql`
        SELECT id, nome, clin_care_id, ativa
        FROM unidades
        ORDER BY id ASC
      `,
            sql`
        SELECT
          p.id,
          p.nome,
          p.clin_care_id,
          p.unidade_id,
          u.nome AS unidade_nome,
          p.materias,
          COALESCE(p.manha_ativo, false) AS manha_ativo,
          COALESCE(to_char(p.manha_inicio, 'HH24:MI'), '08:00') AS manha_inicio,
          COALESCE(to_char(p.manha_fim, 'HH24:MI'), '11:20') AS manha_fim,
          COALESCE(to_char(p.hora_inicio, 'HH24:MI'), '14:10') AS hora_inicio,
          COALESCE(to_char(p.hora_fim, 'HH24:MI'), '20:50') AS hora_fim,
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
        LIMIT 90
      `,
            sql`
        SELECT
          a.id,
          a.unidade_id,
          COALESCE(u.nome, 'Unidade') AS unidade_nome,
          a.professor_id,
          COALESCE(p.nome, 'Professor') AS professor_nome,
          p.clin_care_id AS professor_clin_care_id,
          a.materia,
          to_char(a.data, 'YYYY-MM-DD') AS data,
          COALESCE(
            to_char(a.hora_inicio, 'HH24:MI'),
            to_char(a.horario, 'HH24:MI'),
            ''
          ) AS hora_inicio,
          COALESCE(
            CASE
              WHEN a.hora_inicio IS NOT NULL AND a.hora_fim IS NOT NULL
                THEN to_char(a.hora_inicio, 'HH24:MI') || ' às ' || to_char(a.hora_fim, 'HH24:MI')
              WHEN a.hora_inicio IS NOT NULL
                THEN to_char(a.hora_inicio, 'HH24:MI')
              ELSE NULL
            END,
            to_char(a.horario, 'HH24:MI'),
            ''
          ) AS horario,
          COALESCE(
            NULLIF(trim(a.responsavel_nome), ''),
            NULLIF(trim(a.nome_responsavel), ''),
            NULLIF(trim(al.responsavel_nome), ''),
            ''
          ) AS nome_responsavel,
          COALESCE(
            NULLIF(trim(a.aluno_telefone), ''),
            NULLIF(trim(a.whatsapp_responsavel), ''),
            NULLIF(trim(al.telefone_formatado), ''),
            NULLIF(trim(al.telefone), ''),
            ''
          ) AS whatsapp_responsavel,
          COALESCE(
            NULLIF(trim(a.aluno_nome), ''),
            NULLIF(trim(a.nome_aluno), ''),
            NULLIF(trim(al.nome_aluno), ''),
            'Aluno não informado'
          ) AS nome_aluno,
          COALESCE(
            NULLIF(trim(a.colegio_nome), ''),
            NULLIF(trim(a.colegio_aluno), ''),
            NULLIF(trim(al.colegio_nome), ''),
            ''
          ) AS colegio_aluno,
          COALESCE(
            NULLIF(trim(a.serie), ''),
            NULLIF(trim(a.serie_aluno), ''),
            NULLIF(trim(al.serie), ''),
            ''
          ) AS serie_aluno,
          a.observacoes,
          COALESCE(a.status, 'confirmado') AS status,
          COALESCE(a.lancado_clincare, a.sincronizado_clincare, false) AS sincronizado_clincare,
          to_char(a.criado_em AT TIME ZONE 'America/Bahia', 'DD/MM/YYYY HH24:MI') AS criado_em_formatado
        FROM agendamentos a
        LEFT JOIN unidades u ON u.id = a.unidade_id
        LEFT JOIN professores p ON p.id = a.professor_id
        LEFT JOIN alunos al ON al.id = a.aluno_id
        ORDER BY a.data DESC, COALESCE(a.hora_inicio, a.horario) ASC
        LIMIT 250
      `,
            sql`
        SELECT
          b.id,
          b.professor_id,
          p.clin_care_id AS professor_clin_care_id,
          to_char(b.data, 'YYYY-MM-DD') AS data,
          LEFT(b.hora_inicio::text, 5) AS hora_inicio,
          LEFT(b.hora_fim::text, 5) AS hora_fim,
          COALESCE(NULLIF(trim(b.motivo), ''), 'Bloqueio Clin Care') AS motivo
        FROM bloqueios_clincare b
        LEFT JOIN professores p ON p.id = b.professor_id
        WHERE b.data >= CURRENT_DATE - INTERVAL '15 days'
        ORDER BY b.data ASC, b.hora_inicio ASC
      `,
            sql`
        SELECT to_char(max(atualizado_em) AT TIME ZONE 'America/Bahia', 'DD/MM/YYYY HH24:MI') AS ultima_sincronizacao
        FROM bloqueios_clincare
      `,
            sql`
        SELECT chave, valor
        FROM configuracoes_sistema
        WHERE chave IN ('sync_disparo_hoje', 'sync_disparo_semana', 'sync_disparo_mes')
      `,
        ]);

        const mapaDisparos = new Map<string, string>(
            (disparosRaw as { chave: string; valor: string }[]).map((r) => [
                r.chave,
                r.valor,
            ])
        );

        const agora = Date.now();
        function calcularProximoDisponivel(
            chaveDb: string,
            cooldownSegundos: number
        ): string | null {
            const iso = mapaDisparos.get(chaveDb);
            if (!iso) return null;
            const disparoMs = new Date(iso).getTime();
            if (Number.isNaN(disparoMs)) return null;
            const expiraMs = disparoMs + cooldownSegundos * 1000;
            return expiraMs > agora ? new Date(expiraMs).toISOString() : null;
        }

        return NextResponse.json({
            chaveMestra: {
                modo: modoChaveMestra,
                aberto: statusChaveMestra.aberto,
            },
            cooldownsSync: {
                hoje: calcularProximoDisponivel(
                    CONFIG_SYNC_MODOS.hoje.chaveDb,
                    CONFIG_SYNC_MODOS.hoje.cooldownSegundos
                ),
                semana: calcularProximoDisponivel(
                    CONFIG_SYNC_MODOS.semana.chaveDb,
                    CONFIG_SYNC_MODOS.semana.cooldownSegundos
                ),
                mes: calcularProximoDisponivel(
                    CONFIG_SYNC_MODOS.mes.chaveDb,
                    CONFIG_SYNC_MODOS.mes.cooldownSegundos
                ),
            },
            unidades,
            professores,
            datasLiberadas,
            agendamentos,
            bloqueios,
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