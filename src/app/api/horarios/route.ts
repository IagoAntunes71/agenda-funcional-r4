import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { SlotHorario } from '@/types/agenda';

export const dynamic = 'force-dynamic';

function horaParaMinutos(hora: string): number {
    const [h, m] = hora.split(':').map(Number);
    return h * 60 + (m || 0);
}

function minutosParaHora(minutos: number): string {
    const h = String(Math.floor(minutos / 60)).padStart(2, '0');
    const m = String(minutos % 60).padStart(2, '0');
    return `${h}:${m}`;
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const professorId = Number(searchParams.get('professorId'));
    const data = searchParams.get('data');

    if (!professorId || !data) {
        return NextResponse.json(
            { error: 'Parâmetros professorId e data são obrigatórios.' },
            { status: 400 }
        );
    }

    try {
        const [profRows, bloqueios, agendamentos, agoraBahia] = await Promise.all([
            sql`
        SELECT
          to_char(hora_inicio, 'HH24:MI') AS hora_inicio,
          to_char(hora_fim, 'HH24:MI') AS hora_fim
        FROM professores
        WHERE id = ${professorId} AND ativo = true
        LIMIT 1
      `,
            sql`
        SELECT
          to_char(hora_inicio, 'HH24:MI') AS hora_inicio,
          to_char(hora_fim, 'HH24:MI') AS hora_fim,
          motivo
        FROM bloqueios_clincare
        WHERE professor_id = ${professorId}
          AND data = ${data}::date
      `,
            sql`
        SELECT to_char(horario, 'HH24:MI') AS horario
        FROM agendamentos
        WHERE professor_id = ${professorId}
          AND data = ${data}::date
          AND status <> 'cancelado'
      `,
            sql`
        SELECT
          to_char(now() AT TIME ZONE 'America/Bahia', 'YYYY-MM-DD') AS hoje,
          to_char(now() AT TIME ZONE 'America/Bahia', 'HH24:MI') AS hora_atual
      `,
        ]);

        if (profRows.length === 0) {
            return NextResponse.json({ slots: [] });
        }

        const inicioMin = horaParaMinutos(profRows[0].hora_inicio);
        const fimMin = horaParaMinutos(profRows[0].hora_fim);
        const horariosReservados = new Set(agendamentos.map((a) => a.horario));

        const hoje = agoraBahia[0]?.hoje;
        const minutosAgora =
            hoje === data ? horaParaMinutos(agoraBahia[0].hora_atual) : -1;

        const slots: SlotHorario[] = [];

        for (let min = inicioMin; min + 60 <= fimMin; min += 60) {
            const horarioStr = minutosParaHora(min);
            const slotFim = min + 60;

            if (minutosAgora >= 0 && min <= minutosAgora) {
                slots.push({
                    horario: horarioStr,
                    disponivel: false,
                    motivoIndisponivel: 'Encerrado',
                });
                continue;
            }

            if (horariosReservados.has(horarioStr)) {
                slots.push({
                    horario: horarioStr,
                    disponivel: false,
                    motivoIndisponivel: 'Reservado',
                });
                continue;
            }

            const bloqueioEncontrado = bloqueios.find((b) => {
                const bInicio = horaParaMinutos(b.hora_inicio);
                const bFim = horaParaMinutos(b.hora_fim);
                return min < bFim && slotFim > bInicio;
            });

            if (bloqueioEncontrado) {
                slots.push({
                    horario: horarioStr,
                    disponivel: false,
                    motivoIndisponivel: bloqueioEncontrado.motivo || 'Ocupado',
                });
                continue;
            }

            slots.push({
                horario: horarioStr,
                disponivel: true,
            });
        }

        return NextResponse.json({ slots });
    } catch (error) {
        console.error('Erro ao buscar horários:', error);
        return NextResponse.json(
            { error: 'Não foi possível carregar os horários.' },
            { status: 500 }
        );
    }
}