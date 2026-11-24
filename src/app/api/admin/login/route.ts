/**
 * ARQUIVO: src/app/api/admin/login/route.ts
 * FUNÇÃO: Endpoint de autenticação do painel (/admin). Valida login via Chave Mestra
 * ou via Perfil Individual (e-mail + senha) e grava cargo (role) e professor_id na sessão.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    NOME_COOKIE_ADMIN,
    criarTokenSessaoAdmin,
    garantirTabelaAdmins,
    normalizarRoleSistema,
    verificarSenhaAdmin,
} from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const modo = String(body?.modo || 'perfil');
        const email = String(body?.email || '').trim().toLowerCase();
        const senha = String(body?.senha || '').normalize('NFC');

        if (!senha) {
            return NextResponse.json(
                { error: 'Informe a senha de acesso.' },
                { status: 400 }
            );
        }

        const senhaMaster = (process.env.ADMIN_PASSWORD || '').trim().normalize('NFC');

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

            const perfilMaster = {
                id: 0,
                nome: 'Administrador Master',
                email: 'master@r4ensina.com.br',
                role: 'admin' as const,
                professor_id: null,
            };

            const res = NextResponse.json({ sucesso: true, perfil: perfilMaster });
            res.cookies.set(NOME_COOKIE_ADMIN, criarTokenSessaoAdmin(perfilMaster), {
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                path: '/',
                maxAge: 60 * 60 * 24 * 30,
            });
            return res;
        }

        if (!email) {
            return NextResponse.json(
                { error: 'Informe o e-mail do perfil ou use a aba "Chave Mestra".' },
                { status: 400 }
            );
        }

        await garantirTabelaAdmins();

        const usuarios = (await sql`
      SELECT id, nome, email, senha_hash, role, professor_id, ativo
      FROM admins_sistema
      WHERE lower(trim(email)) = ${email}
      LIMIT 1
    `) as {
            id: number;
            nome: string;
            email: string;
            senha_hash: string;
            role: string;
            professor_id: number | null;
            ativo: boolean;
        }[];

        if (usuarios.length === 0) {
            return NextResponse.json(
                { error: 'Nenhum perfil cadastrado com este e-mail.' },
                { status: 401 }
            );
        }

        const user = usuarios[0];
        if (!user.ativo) {
            return NextResponse.json(
                { error: 'Este perfil está desativado.' },
                { status: 403 }
            );
        }

        if (!verificarSenhaAdmin(senha, user.senha_hash)) {
            return NextResponse.json(
                { error: 'Senha incorreta para este perfil.' },
                { status: 401 }
            );
        }

        const perfilSessao = {
            id: user.id,
            nome: user.nome,
            email: user.email,
            role: normalizarRoleSistema(user.role),
            professor_id: user.professor_id ?? null,
        };

        const res = NextResponse.json({ sucesso: true, perfil: perfilSessao });
        res.cookies.set(NOME_COOKIE_ADMIN, criarTokenSessaoAdmin(perfilSessao), {
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
            { error: 'Falha ao autenticar no sistema.' },
            { status: 500 }
        );
    }
}

export async function DELETE() {
    const res = NextResponse.json({ sucesso: true });
    res.cookies.delete(NOME_COOKIE_ADMIN);
    return res;
}