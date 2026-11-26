import { buscarFamiliaPorTelefone, lerSessaoCliente } from '@/lib/cliente-auth';
import { POST as acaoCliente } from '../cliente/route';
import { NextRequest, NextResponse } from 'next/server';
import { garantirHistoricoAgendamento } from '@/lib/agendamento-historico';
import { sql } from '@/lib/db';
import {
    gerarVariantesTelefone,
    normalizarTelefone,
} from '@/lib/cliente-helpers';

export async function GET() {
    const sessao = await lerSessaoCliente();
    if (!sessao) return NextResponse.json({ error: 'Confirme seu WhatsApp e PIN.' }, { status: 401 });
    const whatsapp = sessao.telefone;
    const telefoneNorm = normalizarTelefone(whatsapp);
    const variantes = gerarVariantesTelefone(whatsapp);

    if (telefoneNorm.length < 10 || variantes.length === 0) {
        return NextResponse.json({ agendamentos: [] });
    }

    try {
        await garantirHistoricoAgendamento();
        const { alunos } = await buscarFamiliaPorTelefone(whatsapp);
        const agendamentos = await sql`
      SELECT
        a.id,
        a.protocolo,
        u.nome AS unidade_nome,
        p.nome AS professor_nome,
        a.materia,
        to_char(a.data, 'YYYY-MM-DD') AS data,
        to_char(COALESCE(a.hora_inicio, a.horario), 'HH24:MI') AS horario,
        COALESCE(a.aluno_nome, a.nome_aluno) AS nome_aluno,
        COALESCE(a.colegio_nome, a.colegio_aluno) AS colegio_aluno,
        COALESCE(a.serie, a.serie_aluno) AS serie_aluno,
        a.status
      FROM agendamentos a
      JOIN unidades u ON u.id = a.unidade_id
      JOIN professores p ON p.id = a.professor_id
      WHERE (
        a.aluno_id = ANY(${alunos.map(({ id }) => id)}::int[])
        OR (a.aluno_id IS NULL AND regexp_replace(
            regexp_replace(COALESCE(a.aluno_telefone, a.whatsapp_responsavel, ''), '[^0-9]', '', 'g'),
            '^55(?=[0-9]{10,11}$)', '') = ANY(${variantes}::text[])
          AND lower(trim(coalesce(a.aluno_nome, a.nome_aluno, ''))) = ANY(
            ${alunos.map(({ nome_aluno }) => nome_aluno.trim().toLowerCase())}::text[]))
      )
        AND a.excluido_em IS NULL
        AND a.data >= (now() AT TIME ZONE 'America/Bahia')::date
      ORDER BY a.data ASC, COALESCE(a.hora_inicio, a.horario) ASC
      LIMIT 20
    `;

        return NextResponse.json({ agendamentos });
    } catch (error) {
        console.error('Erro ao listar agendamentos do cliente:', error);
        return NextResponse.json(
            { error: 'Falha ao consultar agendamentos.' },
            { status: 500 }
        );
    }
}

export async function PATCH(req: NextRequest) {
    const sessao = await lerSessaoCliente();
    if (!sessao) return NextResponse.json({ error: 'Confirme seu WhatsApp e PIN.' }, { status: 401 });
    const { id } = await req.json().catch(() => ({}));
    return acaoCliente(new NextRequest(req.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'cancelarAgendamento', agendamentoId: id, telefone: sessao.telefone }),
    }));
}
