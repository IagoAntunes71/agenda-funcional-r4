import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { GET as consultarDisponibilidade } from '../disponibilidade/route';

export async function GET(req: NextRequest) {
    const professorId = Number(req.nextUrl.searchParams.get('professorId'));
    const data = req.nextUrl.searchParams.get('data');
    if (!Number.isSafeInteger(professorId) || professorId < 1 || !data) {
        return NextResponse.json({ error: 'Informe professor e data.' }, { status: 400 });
    }
    try {
        const [professor] = await sql`SELECT p.unidade_id FROM professores p
            JOIN unidades u ON u.id = p.unidade_id WHERE p.id = ${professorId} AND p.ativo AND u.ativa`;
        if (!professor) return NextResponse.json({ slots: [] });
        const url = req.nextUrl.clone();
        url.searchParams.set('unidadeId', String(professor.unidade_id));
        const resposta = await consultarDisponibilidade(new NextRequest(url));
        if (!resposta.ok) return resposta;
        const agenda = await resposta.json();
        const grade = agenda.dataSelecionada === data
            ? agenda.professores.find((p: { id: number }) => p.id === professorId) : null;
        const livres = new Set<string>(grade?.slotsDisponiveis.map((s: { inicio: string }) => s.inicio));
        return NextResponse.json({
            slots: (grade?.todosSlots ?? []).map((s: { inicio: string }) => ({
                horario: s.inicio, disponivel: livres.has(s.inicio),
                motivoIndisponivel: livres.has(s.inicio) ? undefined : 'Indisponível',
            })),
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
        return NextResponse.json({ error: 'Não foi possível carregar os horários.' }, { status: 500 });
    }
}
