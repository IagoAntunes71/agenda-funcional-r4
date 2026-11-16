import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    NOME_COOKIE_ADMIN,
    criarTokenSessaoAdmin,
    garantirTabelaAdmins,
    verificarSenhaAdmin,
} from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const email = String(body?.email || '')
            .trim()
            .toLowerCase();
        const senha = String(body?.senha || '');

        if (!senha) {
            return NextResponse.json(
                { error: 'Informe sua senha de acesso.' },
                { status: 400 }
            );
        }

        await garantirTabelaAdmins();

        // 1. Login por perfil cadastrado (E-mail + Senha)
        if (email) {
            const usuarios = (await sql`
        SELECT id, nome, email, senha_hash, ativo
        FROM admins_sistema
        WHERE lower(trim(email)) = ${email}
        LIMIT 1
      `) as {
                id: number;
                nome: string;
                email: string;
                senha_hash: string;
                ativo: boolean;
            }[];

            if (usuarios.length > 0) {
                const user = usuarios[0];
                if (!user.ativo) {
                    return NextResponse.json(
                        { error: 'Este perfil administrativo está desativado.' },
                        { status: 403 }
                    );
                }

                if (!verificarSenhaAdmin(senha, user.senha_hash)) {
                    return NextResponse.json(
                        { error: 'E-mail ou senha incorretos.' },
                        { status: 401 }
                    );
                }

                const token = criarTokenSessaoAdmin({
                    id: user.id,
                    nome: user.nome,
                    email: user.email,
                });

                const res = NextResponse.json({
                    sucesso: true,
                    perfil: { id: user.id, nome: user.nome, email: user.email },
                });
                res.cookies.set(NOME_COOKIE_ADMIN, token, {
                    httpOnly: true,
                    sameSite: 'lax',
                    secure: process.env.NODE_ENV === 'production',
                    path: '/',
                    maxAge: 60 * 60 * 24 * 30,
                });
                return res;
            }
        }

        // 2. Fallback: Senha Master do ambiente (ADMIN_PASSWORD)
        const senhaMaster = process.env.ADMIN_PASSWORD;
        if (senhaMaster && senha === senhaMaster) {
            const token = criarTokenSessaoAdmin({
                id: 0,
                nome: 'Administrador Master',
                email: email || 'master@r4ensina.com.br',
            });

            const res = NextResponse.json({
                sucesso: true,
                perfil: {
                    id: 0,
                    nome: 'Administrador Master',
                    email: email || 'master@r4ensina.com.br',
                },
            });
            res.cookies.set(NOME_COOKIE_ADMIN, token, {
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                path: '/',
                maxAge: 60 * 60 * 24 * 30,
            });
            return res;
        }

        return NextResponse.json(
            { error: 'E-mail ou senha incorretos.' },
            { status: 401 }
        );
    } catch (error) {
        console.error('Erro no login admin:', error);
        return NextResponse.json(
            { error: 'Falha ao autenticar administrador.' },
            { status: 500 }
        );
    }
}

export async function DELETE() {
    const res = NextResponse.json({ sucesso: true });
    res.cookies.delete(NOME_COOKIE_ADMIN);
    return res;
}