import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verificarAdminAutenticado } from '@/lib/admin-auth';
import {
    dispararRoboReservaClinCare,
    garantirColunasFilaReserva,
} from '@/lib/clincare-fila';

export async function PATCH(req: NextRequest) {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirColunasFilaReserva();
        await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS lancado_clincare BOOLEAN DEFAULT false`;
        await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS sincronizado_clincare BOOLEAN DEFAULT false`;

        const body = await req.json();
        const id = Number(body?.id || 0);

        if (!id) {
            return NextResponse.json(
                { error: 'ID do agendamento inválido.' },
                { status: 400 }
            );
        }

        if (typeof body?.lancado_clincare === 'boolean') {
            const lancado = body.lancado_clincare;
            await sql`
        UPDATE agendamentos
        SET
          lancado_clincare = ${lancado},
          sincronizado_clincare = ${lancado}
        WHERE id = ${id}
      `;
        }

        if (typeof body?.status === 'string' && body.status) {
            const status = body.status;
            if (!['confirmado', 'cancelado', 'concluido'].includes(status)) {
                return NextResponse.json(
                    { error: 'Status inválido.' },
                    { status: 400 }
                );
            }

            if (status === 'cancelado') {
                const cancelados = (await sql`
          UPDATE agendamentos
          SET
            status = 'cancelado',
            clincare_reserva_status = CASE
              WHEN COALESCE(clincare_reserva_status, '') IN ('reservado', 'reservando') THEN 'cancelar_pendente'
              ELSE 'cancelado_clincare'
            END
          WHERE id = ${id}
          RETURNING clincare_reserva_status
        `) as { clincare_reserva_status: string }[];

                if (cancelados[0]?.clincare_reserva_status === 'cancelar_pendente') {
                    await dispararRoboReservaClinCare();
                }
            } else {
                await sql`
          UPDATE agendamentos
          SET status = ${status}
          WHERE id = ${id}
        `;
            }
        }

        return NextResponse.json({ sucesso: true });
    } catch (error) {
        console.error('Erro ao atualizar agendamento:', error);
        return NextResponse.json(
            { error: 'Não foi possível atualizar o agendamento.' },
            { status: 500 }
        );
    }
}