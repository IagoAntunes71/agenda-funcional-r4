import { NextRequest, NextResponse } from 'next/server';
import {
    criarValorSessaoAdmin,
    NOME_COOKIE_ADMIN,
    validarSenhaAdmin,
} from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
    try {
        const { senha } = await req.json();

        if (!validarSenhaAdmin(String(senha || ''))) {
            return NextResponse.json(
                { error: 'Senha de administrador incorreta.' },
                { status: 401 }
            );
        }

        const res = NextResponse.json({ ok: true });
        res.cookies.set(NOME_COOKIE_ADMIN, criarValorSessaoAdmin(), {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: 60 * 60 * 12,
        });

        return res;
    } catch {
        return NextResponse.json(
            { error: 'Erro ao processar autenticação.' },
            { status: 500 }
        );
    }
}

export async function DELETE() {
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(NOME_COOKIE_ADMIN);
    return res;
}