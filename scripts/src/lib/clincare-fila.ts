import { sql } from '@/lib/db';

declare global {
    // eslint-disable-next-line no-var
    var __r4ColunasFilaPromise: Promise<void> | undefined;
}

export function garantirColunasFilaReserva(): Promise<void> {
    if (!globalThis.__r4ColunasFilaPromise) {
        globalThis.__r4ColunasFilaPromise = Promise.all([
            sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS clincare_reserva_status TEXT DEFAULT 'pendente'`,
            sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS clincare_reserva_erro TEXT`,
            sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS clincare_reservado_em TIMESTAMPTZ`,
        ])
            .then(() => undefined)
            .catch((err) => {
                globalThis.__r4ColunasFilaPromise = undefined;
                throw err;
            });
    }
    return globalThis.__r4ColunasFilaPromise;
}

export async function dispararRoboReservaClinCare(
    agendamentoId?: number
): Promise<{ ok: boolean; erro?: string }> {
    const token = (process.env.GITHUB_TOKEN || '').trim();
    const owner = (process.env.GITHUB_OWNER || 'IagoAntunes71').trim();
    const repo = (process.env.GITHUB_REPO || 'agenda-funcional-r4').trim();
    const branch = (process.env.GITHUB_BRANCH || 'main').trim();

    if (!token) {
        const msg = 'Variável GITHUB_TOKEN não configurada na Vercel.';
        if (agendamentoId) {
            await sql`
        UPDATE agendamentos
        SET clincare_reserva_erro = ${msg}
        WHERE id = ${agendamentoId}
      `;
        }
        return { ok: false, erro: msg };
    }

    try {
        const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/reservar-clincare.yml/dispatches`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${token}`,
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ref: branch }),
        });

        if (!res.ok) {
            const detalhe = await res.text().catch(() => '');
            const msg = `GitHub Actions HTTP ${res.status}: ${
                detalhe.slice(0, 140) ||
                'Verifique se o arquivo reservar-clincare.yml já foi enviado para a branch main.'
            }`;
            if (agendamentoId) {
                await sql`
          UPDATE agendamentos
          SET clincare_reserva_erro = ${msg}
          WHERE id = ${agendamentoId}
        `;
            }
            return { ok: false, erro: msg };
        }

        return { ok: true };
    } catch (err) {
        const msg =
            err instanceof Error ? err.message : 'Falha de rede ao acionar GitHub.';
        if (agendamentoId) {
            await sql`
        UPDATE agendamentos
        SET clincare_reserva_erro = ${msg}
        WHERE id = ${agendamentoId}
      `;
        }
        return { ok: false, erro: msg };
    }
}
