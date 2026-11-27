import { sendNotification } from 'web-push';
import { sql } from '@/lib/db';

export function configuracaoPush() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    return publicKey && privateKey && subject ? { subject, publicKey, privateKey } : null;
}

export function endpointPushValido(endpoint: unknown): endpoint is string {
    if (typeof endpoint !== 'string' || endpoint.length > 2048) return false;
    try {
        const url = new URL(endpoint);
        return url.protocol === 'https:' && !url.port && !url.username && !url.password &&
            !url.hash && /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|(?:[a-z0-9-]+\.)*push\.apple\.com)$/.test(url.hostname);
    } catch {
        return false;
    }
}

export type DispositivoPush = { endpoint: string; p256dh: string; auth: string; conta_id: number };

export async function enviarPushEquipe(dispositivo: DispositivoPush, body: string, tag: string) {
    const vapidDetails = configuracaoPush();
    if (!vapidDetails || !endpointPushValido(dispositivo.endpoint)) return false;
    try {
        await sendNotification({
            endpoint: dispositivo.endpoint,
            keys: { p256dh: dispositivo.p256dh, auth: dispositivo.auth },
        }, JSON.stringify({ title: 'R4 Equipe', body, tag }), { vapidDetails, TTL: 300, timeout: 5000 });
        return true;
    } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
            await sql`DELETE FROM r4_push_equipe WHERE endpoint = ${dispositivo.endpoint}
                AND conta_id = ${dispositivo.conta_id} AND p256dh = ${dispositivo.p256dh}`;
            return false;
        }
        throw error;
    }
}
