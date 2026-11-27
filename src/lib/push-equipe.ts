import { createECDH } from 'node:crypto';
import { sendNotification } from 'web-push';
import { sql } from '@/lib/db';

export function configuracaoPush() {
    const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    const subject = process.env.VAPID_SUBJECT?.trim();
    return publicKey && privateKey && subject ? { subject, publicKey, privateKey } : null;
}

export function erroConfiguracaoPush() {
    const config = configuracaoPush();
    if (!config) return 'Confira se as três variáveis VAPID estão preenchidas na Vercel.';
    if (!/^mailto:[^\s@]+@[^\s@]+$/.test(config.subject)) {
        return 'Na Vercel, use mailto:email@dominio.com em VAPID_SUBJECT.';
    }
    try {
        const par = createECDH('prime256v1');
        const privada = Buffer.from(config.privateKey, 'base64url');
        if (privada.length !== 32 || privada.toString('base64url') !== config.privateKey) {
            return 'VAPID_PRIVATE_KEY está em formato inválido.';
        }
        par.setPrivateKey(privada);
        if (par.getPublicKey().toString('base64url') !== config.publicKey) {
            return 'VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY precisam ser do mesmo par.';
        }
    } catch {
        return 'VAPID_PRIVATE_KEY está em formato inválido.';
    }
    return null;
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
