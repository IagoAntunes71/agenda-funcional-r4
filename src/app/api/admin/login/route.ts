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
        const modo = String(body?.modo || 'perfil');
        const email = String(body?.email || '')
            .trim()
            .toLowerCase();
        const senha = String(body?.senha || '').normalize('NFC');

        if (!senha) {
            return NextResponse.json(
                { error: 'Informe a senha de acesso.' },
                { status: 400 }
            );
        }

        const senhaMaster = (process.env.ADMIN_PASSWORD || '')
            .trim()
            .normalize('NFC');

        // 1. Modo Chave Mestra (Recuperação / Acesso Geral)
        if (modo === 'master') {
            if (!senhaMaster) {
                return NextResponse.json(
                    { error: 'Chave Mestra (ADMIN_PASSWORD) não configurada no servidor.' },
                    { status: 500 }
                );
            }

            if (senha !== senhaMaster) {
                return NextResponse.json(
                    { error: 'Chave Mestra incorreta.' },
                    { status: 401 }
                );
            }

            const token = criarTokenSessaoAdmin({
                id: 0,
                nome: 'Administrador Master',
                email: 'master@r4ensina.com.br',
            });

            const res = NextResponse.json({
                sucesso: true,
                perfil: {
                    id: 0,
                    nome: 'Administrador Master',
                    email: 'master@r4ensina.com.br',
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

        // 2. Modo Perfil Individual (E-mail + Senha)
        if (!email) {
            return NextResponse.json(
                {
                    error:
                        'Informe o e-mail do perfil ou clique na aba "Chave Mestra" acima.',
                },
                { status: 400 }
            );
        }

        await garantirTabelaAdmins();

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

        if (usuarios.length === 0) {
            return NextResponse.json(
                {
                    error:
                        'Nenhum perfil cadastrado com este e-mail. Use a aba "Chave Mestra" para entrar e verificar os perfis.',
                },
                { status: 401 }
            );
        }

        const user = usuarios[0];

        if (!user.ativo) {
            return NextResponse.json(
                { error: 'Este perfil administrativo está desativado.' },
                { status: 403 }
            );
        }

        if (!verificarSenhaAdmin(senha, user.senha_hash)) {
            return NextResponse.json(
                {
                    error:
                        'Senha incorreta para este perfil. Caso tenha esquecido, entre pela aba "Chave Mestra" e redefina sua senha.',
                },
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