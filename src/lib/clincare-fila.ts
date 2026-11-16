import { sql } from '@/lib/db';

export async function garantirColunasFilaReserva(): Promise<void> {
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS clincare_reserva_status TEXT DEFAULT 'pendente'`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS clincare_reserva_erro TEXT`;
    await sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS clincare_reservado_em TIMESTAMPTZ`;
}

export async function dispararRoboReservaClinCare(): Promise<boolean> {
    const token = (process.env.GITHUB_TOKEN || '').trim();
    const owner = (process.env.GITHUB_OWNER || '').trim();
    const repo = (process.env.GITHUB_REPO || '').trim();
    const branch = (process.env.GITHUB_BRANCH || 'main').trim();

    if (!token || !owner || !repo) {
        console.warn(
            'Variáveis GITHUB_TOKEN, GITHUB_OWNER ou GITHUB_REPO ausentes para disparo automático de reserva.'
        );
        return false;
    }

    try {
        const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/reservar-clincare.yml/dispatches`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ref: branch }),
        });
        return res.ok;
    } catch (err) {
        console.error('Erro ao disparar workflow reservar-clincare.yml:', err);
        return false;
    }
}