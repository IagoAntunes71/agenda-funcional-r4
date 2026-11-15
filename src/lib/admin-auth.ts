import crypto from 'crypto';
import { cookies } from 'next/headers';

export const NOME_COOKIE_ADMIN = 'agenda_r4_admin_session';

function gerarTokenAssinado(senha: string): string {
    return crypto
        .createHmac('sha256', senha)
        .update('agenda-funcional-r4-admin')
        .digest('hex');
}

export function validarSenhaAdmin(senhaInformada: string): boolean {
    const senhaCorreta = process.env.ADMIN_PASSWORD;
    if (!senhaCorreta || !senhaInformada) return false;

    const a = Buffer.from(senhaInformada);
    const b = Buffer.from(senhaCorreta);
    if (a.length !== b.length) return false;

    return crypto.timingSafeEqual(a, b);
}

export function criarValorSessaoAdmin(): string {
    const senhaCorreta = process.env.ADMIN_PASSWORD;
    if (!senhaCorreta) {
        throw new Error('ADMIN_PASSWORD não configurada.');
    }
    return gerarTokenAssinado(senhaCorreta);
}

export async function verificarAdminAutenticado(): Promise<boolean> {
    const senhaCorreta = process.env.ADMIN_PASSWORD;
    if (!senhaCorreta) return false;

    const cookieStore = await cookies();
    const cookie = cookieStore.get(NOME_COOKIE_ADMIN)?.value;
    if (!cookie) return false;

    const esperado = gerarTokenAssinado(senhaCorreta);
    const a = Buffer.from(cookie);
    const b = Buffer.from(esperado);
    if (a.length !== b.length) return false;

    return crypto.timingSafeEqual(a, b);
}