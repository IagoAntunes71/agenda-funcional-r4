import { unidadeOnline } from '@/lib/unidade-online';
import { lerOperacaoR4 } from '@/lib/operacao-r4-db';
import { podeOperacao } from '@/lib/operacao-r4';
import { NextRequest, NextResponse } from 'next/server';
import { garantirHistoricoAgendamento } from '@/lib/agendamento-historico';
import { sql } from '@/lib/db';
import { garantirTabelaAdmins, lerSessaoAdmin } from '@/lib/admin-auth';
import { obterModoChaveMestra } from '@/app/api/admin/configuracoes/route';
import { avaliarStatusChaveMestra } from '@/lib/horarios-reforco';
import { garantirEstruturaContasResponsaveis } from '@/lib/cliente-auth';

export async function GET(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    if (!sessao) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const mesProfessor = sessao.role === 'professor' ? req.nextUrl.searchParams.get('mesProfessor') : null;
    if (mesProfessor !== null && !/^20\d{2}-(0[1-9]|1[0-2])$/.test(mesProfessor)) {
        return NextResponse.json({ error: 'Mês inválido.' }, { status: 400 });
    }
    const datasMapa = [...new Set((req.nextUrl.searchParams.get('datasMapa') || '').split(',').filter(Boolean))];
    if (datasMapa.length > 366 || datasMapa.some((data) => {
        const dia = new Date(data + 'T12:00:00Z');
        return !/^\d{4}-\d{2}-\d{2}$/.test(data) || !Number.isFinite(dia.getTime()) || dia.toISOString().slice(0,10) !== data;
    })) return NextResponse.json({ error: 'Datas inválidas para o mapa.' }, { status: 400 });
    const inicioMes = mesProfessor ? mesProfessor + '-01' : null;

    try {
        await garantirHistoricoAgendamento();
        const cfg = await lerOperacaoR4();
        const outrasAgendas = podeOperacao(cfg, sessao.role, 'outrasAgendas');
        const todosAlunos = podeOperacao(cfg, sessao.role, 'todosAlunos');
        const modoChaveMestra = await obterModoChaveMestra();
        const statusChaveMestra = avaliarStatusChaveMestra(modoChaveMestra);

        await garantirEstruturaContasResponsaveis();
        await garantirTabelaAdmins();
        await Promise.all([
            sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_ativo BOOLEAN DEFAULT false`,
            sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_inicio TIME`,
            sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS manha_fim TIME`,
            sql`ALTER TABLE professores ADD COLUMN IF NOT EXISTS materias_series JSONB DEFAULT '{}'::jsonb`,
        ]);

        const [
            unidades,
            professores,
            responsaveisRaw,
            alunosRaw,
            datasLiberadas,
            agendamentos,
            bloqueios,
            resumoSemanaRaw,
        ] = await Promise.all([
            sql`
        SELECT id, nome, ativa, unidade_presencial_id
        FROM unidades
        ORDER BY id ASC
      `,
            sql`
        SELECT
          p.id,
          p.nome,
          p.grupo_professor,
          foto_perfil.foto_url,
          p.unidade_id,
          u.nome AS unidade_nome,
          p.materias,
          COALESCE(p.materias_series, '{}'::jsonb) AS materias_series,
          COALESCE(p.manha_ativo, false) AS manha_ativo,
          COALESCE(to_char(p.manha_inicio, 'HH24:MI'), '08:00') AS manha_inicio,
          COALESCE(to_char(p.manha_fim, 'HH24:MI'), '11:20') AS manha_fim,
          COALESCE(to_char(p.hora_inicio, 'HH24:MI'), '14:10') AS hora_inicio,
          COALESCE(to_char(p.hora_fim, 'HH24:MI'), '20:50') AS hora_fim,
          p.ativo
        FROM professores p
        JOIN unidades u ON u.id = p.unidade_id
        LEFT JOIN LATERAL (
            SELECT a.foto_url FROM admins_sistema a
            JOIN professores vinculado ON vinculado.id = a.professor_id
            WHERE ${datasMapa.length > 0} AND a.role = 'professor' AND a.ativo AND nullif(trim(a.foto_url), '') IS NOT NULL
                AND (vinculado.id = p.id OR nullif(vinculado.grupo_professor, '') = nullif(p.grupo_professor, ''))
            ORDER BY (vinculado.id = p.id) DESC, a.id LIMIT 1
        ) foto_perfil ON true
        ORDER BY u.nome ASC, p.nome ASC
      `,
            sql`
        SELECT
          r.id,
          COALESCE(NULLIF(trim(r.nome), ''), 'Responsável') AS nome,
          COALESCE(NULLIF(trim(r.telefone), ''), '') AS telefone,
          COALESCE(NULLIF(trim(r.telefone_formatado), ''), NULLIF(trim(r.telefone), ''), '') AS telefone_formatado,
          (r.pin_hash IS NOT NULL AND trim(r.pin_hash) <> '') AS tem_pin,
          (r.pin_bloqueado_ate IS NOT NULL AND r.pin_bloqueado_ate > now()) AS pin_bloqueado,
          COALESCE(r.conflito_migracao, false) AS conflito_migracao,
          r.conflito_detalhes
        FROM responsaveis r
        WHERE ${todosAlunos} OR EXISTS (
            SELECT 1 FROM alunos alvo JOIN agendamentos a ON a.aluno_id = alvo.id
            JOIN professores p ON p.id = a.professor_id JOIN professores v ON v.id = ${sessao.professor_id}
            WHERE alvo.responsavel_id = r.id AND a.excluido_em IS NULL AND a.status IN ('realizado','concluido')
              AND (v.id = p.id OR nullif(v.grupo_professor,'') = nullif(p.grupo_professor,''))
        )
        ORDER BY r.nome ASC, r.id ASC
      `,
            sql`
        SELECT
          al.id,
          al.responsavel_id,
          COALESCE(NULLIF(trim(al.nome_aluno), ''), 'Aluno sem nome') AS nome_aluno,
          COALESCE(NULLIF(trim(r.nome), ''), NULLIF(trim(al.responsavel_nome), ''), '') AS responsavel_nome,
          COALESCE(NULLIF(trim(al.telefone), ''), '') AS telefone,
          COALESCE(NULLIF(trim(al.telefone_formatado), ''), NULLIF(trim(al.telefone), ''), '') AS telefone_formatado,
          COALESCE(NULLIF(trim(al.colegio_nome), ''), '') AS colegio_nome,
          COALESCE(NULLIF(trim(al.serie), ''), '') AS serie,
          (
            (r.pin_hash IS NOT NULL AND trim(r.pin_hash) <> '')
            OR (al.pin_hash IS NOT NULL AND trim(al.pin_hash) <> '')
          ) AS tem_pin,
          (
            (r.pin_bloqueado_ate IS NOT NULL AND r.pin_bloqueado_ate > now())
            OR (al.pin_bloqueado_ate IS NOT NULL AND al.pin_bloqueado_ate > now())
          ) AS pin_bloqueado,
          (
            SELECT COUNT(*)::int
            FROM agendamentos ag
            WHERE ag.aluno_id = al.id
              AND COALESCE(ag.status, 'confirmado') <> 'cancelado'
          ) AS total_aulas
        FROM alunos al
        LEFT JOIN responsaveis r ON r.id = al.responsavel_id
        WHERE COALESCE(al.ativo, true) = true AND (${todosAlunos} OR EXISTS (
            SELECT 1 FROM agendamentos a JOIN professores p ON p.id = a.professor_id
            JOIN professores v ON v.id = ${sessao.professor_id}
            WHERE a.aluno_id = al.id AND a.excluido_em IS NULL AND a.status IN ('realizado','concluido')
              AND (v.id = p.id OR nullif(v.grupo_professor,'') = nullif(p.grupo_professor,''))
        ))
        ORDER BY COALESCE(NULLIF(trim(r.nome), ''), NULLIF(trim(al.responsavel_nome), ''), al.nome_aluno) ASC, al.nome_aluno ASC
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
          a.aluno_id,
          to_char(a.hora_fim, 'HH24:MI') AS hora_fim,
          COALESCE(u.nome, 'Unidade') AS unidade_nome,
          a.professor_id,
          COALESCE(p.nome, 'Professor') AS professor_nome,
          p.grupo_professor AS professor_grupo_professor,
          a.whatsapp_link_aula,
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
            NULLIF(trim(r.nome), ''),
            NULLIF(trim(al.responsavel_nome), ''),
            ''
          ) AS nome_responsavel,
          COALESCE(
            NULLIF(trim(a.aluno_telefone), ''),
            NULLIF(trim(a.whatsapp_responsavel), ''),
            NULLIF(trim(r.telefone_formatado), ''),
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
          nullif(trim(a.feedback_professor), '') IS NOT NULL AS feedback_feito,
          COALESCE(a.status, 'confirmado') AS status,
          to_char(a.criado_em AT TIME ZONE 'America/Bahia', 'DD/MM/YYYY HH24:MI') AS criado_em_formatado
        FROM agendamentos a
        LEFT JOIN unidades u ON u.id = a.unidade_id
        LEFT JOIN professores p ON p.id = a.professor_id
        LEFT JOIN alunos al ON al.id = a.aluno_id
        LEFT JOIN responsaveis r ON r.id = al.responsavel_id
        WHERE a.excluido_em IS NULL
          AND (cardinality(${datasMapa}::date[]) = 0 OR a.data = ANY(${datasMapa}::date[]))
          AND (${datasMapa.length > 0} OR ${inicioMes}::date IS NULL OR (
            a.data >= ${inicioMes}::date AND a.data < ${inicioMes}::date + interval '1 month'
          ))
          AND (${outrasAgendas && (!mesProfessor || datasMapa.length > 0)} OR EXISTS (
            SELECT 1 FROM professores vinculado WHERE vinculado.id = ${sessao.professor_id}
              AND (vinculado.id = p.id OR nullif(vinculado.grupo_professor, '') = nullif(p.grupo_professor, ''))
          ))
        ORDER BY a.data DESC, COALESCE(a.hora_inicio, a.horario) ASC
        LIMIT ${mesProfessor || datasMapa.length ? null : 250}
      `,
            sql`
                SELECT
                    b.id,
                    b.professor_id,
                    p.grupo_professor AS professor_grupo_professor,
                    to_char(b.data, 'YYYY-MM-DD') AS data,
                    LEFT(b.hora_inicio::text, 5) AS hora_inicio,
                    LEFT(b.hora_fim::text, 5) AS hora_fim,
                    coalesce(to_jsonb(b)->>'origem', 'manual') AS origem,
                    b.motivo AS motivo,
                    CASE WHEN to_jsonb(b)->>'origem' = 'manual' THEN b.descricao END AS descricao
                FROM r4_bloqueios_agenda b
                    LEFT JOIN professores p ON p.id = b.professor_id
                WHERE b.data >= CURRENT_DATE - INTERVAL '15 days'
                ORDER BY b.data ASC, b.hora_inicio ASC
      `,
            sql`
                WITH semana AS (
                    SELECT date_trunc('week', now() AT TIME ZONE 'America/Bahia')::date AS inicio
                ), dias AS (
                    SELECT s.inicio, s.inicio + d.numero AS data,
                        count(a.id)::int AS total,
                        count(*) FILTER (WHERE a.id IS NOT NULL AND coalesce(a.status, 'confirmado') IN ('agendado', 'confirmado'))::int AS marcadas,
                        count(*) FILTER (WHERE a.status IN ('realizado', 'concluido'))::int AS realizadas,
                        count(*) FILTER (WHERE a.status IN ('cancelado', 'desmarcado_com_cobranca', 'desmarcado_sem_cobranca'))::int AS desmarcadas
                    FROM semana s CROSS JOIN generate_series(0, 6) AS d(numero)
                    LEFT JOIN agendamentos a ON a.data = s.inicio + d.numero AND a.excluido_em IS NULL
                        AND (${sessao.role !== 'professor'} OR EXISTS (
                            SELECT 1 FROM professores vinculado
                            JOIN professores destino ON destino.id = a.professor_id
                            WHERE vinculado.id = ${sessao.professor_id}
                                AND (vinculado.id = destino.id OR vinculado.grupo_professor = destino.grupo_professor)
                        ))
                    GROUP BY s.inicio, d.numero
                )
                SELECT to_char(inicio, 'YYYY-MM-DD') AS inicio, to_char(inicio + 6, 'YYYY-MM-DD') AS fim,
                    sum(total)::int AS total, sum(marcadas)::int AS marcadas, sum(realizadas)::int AS realizadas,
                    sum(desmarcadas)::int AS desmarcadas,
                    jsonb_agg(jsonb_build_object('data', to_char(data, 'YYYY-MM-DD'), 'total', total, 'marcadas', marcadas,
                        'realizadas', realizadas, 'desmarcadas', desmarcadas) ORDER BY data) AS dias
                FROM dias GROUP BY inicio
            `,
        ]);

        const listaAlunos = alunosRaw as {
            id: number;
            responsavel_id: number | null;
            nome_aluno: string;
            responsavel_nome: string;
            telefone: string;
            telefone_formatado: string;
            colegio_nome: string;
            serie: string;
            tem_pin: boolean;
            pin_bloqueado: boolean;
            total_aulas: number;
        }[];

        const listaResponsaveis = (
            responsaveisRaw as {
                id: number;
                nome: string;
                telefone: string;
                telefone_formatado: string;
                tem_pin: boolean;
                pin_bloqueado: boolean;
                conflito_migracao: boolean;
                conflito_detalhes: string | null;
            }[]
        ).map((resp) => {
            const filhos = listaAlunos.filter((al) => al.responsavel_id === resp.id);
            const totalAulas = filhos.reduce(
                (acc, f) => acc + Number(f.total_aulas || 0),
                0
            );
            return {
                ...resp,
                total_aulas: totalAulas,
                filhos,
            };
        });

        return NextResponse.json({
            sessao,
            resumoSemana: resumoSemanaRaw[0] ?? null,
            chaveMestra: sessao.role === 'admin' ? {
                modo: modoChaveMestra,
                aberto: statusChaveMestra.aberto,
            } : undefined,
            unidades,
            professores,
            responsaveis: listaResponsaveis,
            alunos: listaAlunos,
            datasLiberadas,
            agendamentos: sessao.role === 'professor' ? agendamentos.map((aula) => {
                return unidadeOnline(aula.unidade_nome) ? aula :
                    { ...aula, nome_responsavel: '', whatsapp_responsavel: '', whatsapp_link_aula: null };
            }) : agendamentos,
            bloqueios,
        });
    } catch (error) {
        console.error('Erro ao carregar painel admin:', error);
        return NextResponse.json(
            { error: 'Falha ao carregar dados administrativos.' },
            { status: 500 }
        );
    }
}