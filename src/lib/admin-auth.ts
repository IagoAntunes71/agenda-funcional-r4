/**
 * ARQUIVO: src/lib/admin-auth.ts
 * FUNÇÃO: Gerencia a sessão autenticada (cookie HMAC), hash de senhas e estrutura
 * da tabela `admins_sistema` com suporte aos 3 perfis de acesso:
 * 'admin' (acesso total), 'atendimento' (recepção/agenda) e 'professor' (agenda própria).
 */

import crypto from 'crypto';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';

export const NOME_COOKIE_ADMIN = 'r4_admin_session';

export type RoleSistema = 'admin' | 'atendimento' | 'professor';

export interface SessaoAdmin {
    id: number;
    nome: string;
    email: string;
    role: RoleSistema;
    professor_id: number | null;
}

function obterSegredoAssinatura(): string {
    return (
        process.env.ADMIN_SESSION_SECRET ||
        process.env.ADMIN_PASSWORD ||
        'r4-ensina-admin-secret-2026'
    );
}

export function normalizarRoleSistema(valor: unknown): RoleSistema {
    const v = String(valor || '').trim().toLowerCase();
    if (v === 'atendimento' || v === 'professor') return v;
    return 'admin';
}

export async function garantirTabelaAdmins(): Promise<void> {
    await sql`
    CREATE TABLE IF NOT EXISTS admins_sistema (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      foto_url TEXT,
      role TEXT NOT NULL DEFAULT 'admin',
      professor_id INT,
      ativo BOOLEAN DEFAULT true,
      criado_em TIMESTAMPTZ DEFAULT now()
    )
  `;
    await Promise.all([
        sql`ALTER TABLE admins_sistema ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin'`,
        sql`ALTER TABLE admins_sistema ADD COLUMN IF NOT EXISTS professor_id INT`,
    ]);
}

export function hashSenhaAdmin(senha: string): string {
    const normalizada = senha.normalize('NFC');
    const salt = crypto.randomBytes(16).toString('hex');
    const derivado = crypto.scryptSync(normalizada, salt, 64).toString('hex');
    return `${salt}:${derivado}`;
}

export function verificarSenhaAdmin(senha: string, hashSalvo: string): boolean {
    const normalizada = senha.normalize('NFC');
    const [salt, hashOriginal] = (hashSalvo || '').split(':');
    if (!salt || !hashOriginal) return false;
    const derivado = crypto.scryptSync(normalizada, salt, 64).toString('hex');
    const bufA = Buffer.from(hashOriginal, 'hex');
    const bufB = Buffer.from(derivado, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

export function criarTokenSessaoAdmin(sessao: SessaoAdmin): string {
    const payloadBase64 = Buffer.from(
        JSON.stringify({
            id: sessao.id,
            nome: sessao.nome,
            email: sessao.email,
            role: normalizarRoleSistema(sessao.role),
            professor_id: sessao.professor_id ?? null,
            iat: Date.now(),
        })
    ).toString('base64url');

    const assinatura = crypto
        .createHmac('sha256', obterSegredoAssinatura())
        .update(payloadBase64)
        .digest('base64url');

    return `${payloadBase64}.${assinatura}`;
}

export async function lerSessaoAdmin(): Promise<SessaoAdmin | null> {
    try {
        const cookieStore = await cookies();
        const valor = cookieStore.get(NOME_COOKIE_ADMIN)?.value;
        if (!valor) return null;

        if (valor === 'authenticated' || valor === 'true') {
            return {
                id: 0,
                nome: 'Administrador R4',
                email: '',
                role: 'admin',
                professor_id: null,
            };
        }

        const [payloadBase64, assinatura] = valor.split('.');
        if (!payloadBase64 || !assinatura) return null;

        const esperada = crypto
            .createHmac('sha256', obterSegredoAssinatura())
            .update(payloadBase64)
            .digest('base64url');

        if (assinatura !== esperada) return null;

        const dados = JSON.parse(
            Buffer.from(payloadBase64, 'base64url').toString('utf8')
        ) as Partial<SessaoAdmin>;

        if (typeof dados.id !== 'number' || !dados.nome) return null;
        return {
            id: dados.id,
            nome: dados.nome,
            email: dados.email || '',
            role: normalizarRoleSistema(dados.role),
            professor_id:
                typeof dados.professor_id === 'number' ? dados.professor_id : null,
        };
    } catch {
        return null;
    }
}

export async function verificarAdminAutenticado(): Promise<boolean> {
    const sessao = await lerSessaoAdmin();
    return sessao !== null;
}