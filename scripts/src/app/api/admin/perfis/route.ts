/**
 * ARQUIVO: src/app/api/admin/perfis/route.ts
 * FUNÇÃO: CRUD de perfis de acesso do sistema (Administrador, Atendimento e Professor).
 * Apenas usuários com role === 'admin' podem criar, editar ou excluir perfis da equipe.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    NOME_COOKIE_ADMIN,
    criarTokenSessaoAdmin,
    garantirTabelaAdmins,
    hashSenhaAdmin,
    lerSessaoAdmin,
    normalizarRoleSistema,
} from '@/lib/admin-auth';

interface AdminRow {
    id: number;
    nome: string;
    email: string;
    foto_url: string | null;
    role: string;
    professor_id: number | null;
    professor_nome?: string | null;
    ativo: boolean;
    criado_em: string;
}

export async function GET() {
    const sessao = await lerSessaoAdmin();
    if (!sessao) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirTabelaAdmins();

        const perfis = (await sql`
      SELECT
        a.id,
        a.nome,
        a.email,
        a.foto_url,
        COALESCE(a.role, 'admin') AS role,
        a.professor_id,
        p.nome AS professor_nome,
        a.ativo,
        to_char(a.criado_em AT TIME ZONE 'America/Bahia', 'DD/MM/YYYY') AS criado_em
      FROM admins_sistema a
      LEFT JOIN professores p ON p.id = a.professor_id
      ORDER BY a.id ASC
    `) as AdminRow[];

        const encontrado = sessao.id > 0 ? perfis.find((p) => p.id === sessao.id) : null;

        const perfilAtual = encontrado
            ? {
                id: encontrado.id,
                nome: encontrado.nome,
                email: encontrado.email,
                foto_url: encontrado.foto_url || null,
                role: normalizarRoleSistema(encontrado.role),
                professor_id: encontrado.professor_id ?? null,
                professor_nome: encontrado.professor_nome || null,
            }
            : {
                id: sessao.id,
                nome: sessao.nome,
                email: sessao.email,
                foto_url: null,
                role: sessao.role,
                professor_id: sessao.professor_id ?? null,
                professor_nome: null,
            };

        return NextResponse.json({
            perfilAtual,
            perfis: sessao.role === 'admin' ? perfis : [],
        });
    } catch (error) {
        console.error('Erro ao listar perfis:', error);
        return NextResponse.json(
            { error: 'Falha ao carregar perfis.' },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    if (!sessao || sessao.role !== 'admin') {
        return NextResponse.json(
            { error: 'Apenas administradores podem criar novos perfis.' },
            { status: 403 }
        );
    }

    try {
        await garantirTabelaAdmins();

        const body = await req.json();
        const nome = String(body?.nome || '').trim();
        const email = String(body?.email || '').trim().toLowerCase();
        const senha = String(body?.senha || '');
        const role = normalizarRoleSistema(body?.role);
        const professorId =
            role === 'professor' ? Number(body?.professor_id || 0) || null : null;
        const fotoUrl = body?.foto_url ? String(body.foto_url) : null;

        if (nome.length < 2) {
            return NextResponse.json({ error: 'Informe o nome completo.' }, { status: 400 });
        }
        if (!email.includes('@') || email.length < 5) {
            return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 });
        }
        if (senha.length < 6) {
            return NextResponse.json(
                { error: 'A senha deve ter pelo menos 6 caracteres.' },
                { status: 400 }
            );
        }
        if (role === 'professor' && !professorId) {
            return NextResponse.json(
                { error: 'Selecione o professor vinculado a este login.' },
                { status: 400 }
            );
        }

        const existentes = (await sql`
      SELECT id FROM admins_sistema WHERE lower(trim(email)) = ${email} LIMIT 1
    `) as { id: number }[];

        if (existentes.length > 0) {
            return NextResponse.json(
                { error: 'Já existe um perfil cadastrado com este e-mail.' },
                { status: 409 }
            );
        }

        const senhaHash = hashSenhaAdmin(senha);
        const inseridos = (await sql`
      INSERT INTO admins_sistema (nome, email, senha_hash, foto_url, role, professor_id, ativo)
      VALUES (${nome}, ${email}, ${senhaHash}, ${fotoUrl}, ${role}, ${professorId}, true)
      RETURNING id, nome, email, foto_url, role, professor_id, ativo
    `) as AdminRow[];

        return NextResponse.json({
            sucesso: true,
            perfil: inseridos[0],
            mensagem: 'Novo perfil criado com sucesso!',
        });
    } catch (error) {
        console.error('Erro ao criar perfil:', error);
        return NextResponse.json(
            { error: 'Falha ao cadastrar novo perfil.' },
            { status: 500 }
        );
    }
}

export async function PATCH(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    if (!sessao) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirTabelaAdmins();

        const body = await req.json();
        const id = Number(body?.id ?? sessao.id);

        if (id !== sessao.id && sessao.role !== 'admin') {
            return NextResponse.json(
                { error: 'Sem permissão para alterar outro perfil.' },
                { status: 403 }
            );
        }

        const nome = body?.nome !== undefined ? String(body.nome).trim() : undefined;
        const email =
            body?.email !== undefined ? String(body.email).trim().toLowerCase() : undefined;
        const novaSenha =
            body?.nova_senha !== undefined ? String(body.nova_senha) : undefined;
        const fotoUrl =
            body?.foto_url !== undefined
                ? body.foto_url
                    ? String(body.foto_url)
                    : null
                : undefined;
        const ativo = typeof body?.ativo === 'boolean' ? Boolean(body.ativo) : undefined;

        if (id === 0) {
            if (!nome || nome.length < 2 || !email || !email.includes('@')) {
                return NextResponse.json(
                    { error: 'Preencha Nome, E-mail e Senha para ativar seu perfil pessoal.' },
                    { status: 400 }
                );
            }
            if (!novaSenha || novaSenha.length < 6) {
                return NextResponse.json(
                    { error: 'Defina uma senha (mínimo 6 caracteres).' },
                    { status: 400 }
                );
            }

            const senhaHash = hashSenhaAdmin(novaSenha);
            const criados = (await sql`
        INSERT INTO admins_sistema (nome, email, senha_hash, foto_url, role, professor_id, ativo)
        VALUES (${nome}, ${email}, ${senhaHash}, ${fotoUrl ?? null}, 'admin', NULL, true)
        ON CONFLICT (email) DO UPDATE
        SET nome = EXCLUDED.nome,
            senha_hash = EXCLUDED.senha_hash,
            foto_url = COALESCE(EXCLUDED.foto_url, admins_sistema.foto_url)
        RETURNING id, nome, email, foto_url, role, professor_id
      `) as AdminRow[];

            const novoPerfil = criados[0];
            const token = criarTokenSessaoAdmin({
                id: novoPerfil.id,
                nome: novoPerfil.nome,
                email: novoPerfil.email,
                role: 'admin',
                professor_id: null,
            });

            const res = NextResponse.json({
                sucesso: true,
                perfilAtual: novoPerfil,
                mensagem: 'Perfil individual ativado com sucesso!',
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

        const atuais = (await sql`
      SELECT id, nome, email, foto_url, role, professor_id, ativo
      FROM admins_sistema
      WHERE id = ${id}
      LIMIT 1
    `) as AdminRow[];

        if (atuais.length === 0) {
            return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
        }

        const atual = atuais[0];
        const nomeFinal = nome !== undefined && nome.length >= 2 ? nome : atual.nome;
        const emailFinal = email !== undefined && email.includes('@') ? email : atual.email;
        const fotoFinal = fotoUrl !== undefined ? fotoUrl : atual.foto_url;
        const ativoFinal =
            ativo !== undefined && id !== sessao.id ? ativo : atual.ativo;

        if (novaSenha && novaSenha.trim().length > 0) {
            if (novaSenha.trim().length < 6) {
                return NextResponse.json(
                    { error: 'A nova senha deve ter no mínimo 6 caracteres.' },
                    { status: 400 }
                );
            }
            const novoHash = hashSenhaAdmin(novaSenha.trim());
            await sql`
        UPDATE admins_sistema
        SET nome = ${nomeFinal},
            email = ${emailFinal},
            foto_url = ${fotoFinal},
            ativo = ${ativoFinal},
            senha_hash = ${novoHash}
        WHERE id = ${id}
      `;
        } else {
            await sql`
        UPDATE admins_sistema
        SET nome = ${nomeFinal},
            email = ${emailFinal},
            foto_url = ${fotoFinal},
            ativo = ${ativoFinal}
        WHERE id = ${id}
      `;
        }

        const roleFinal = normalizarRoleSistema(atual.role);
        const res = NextResponse.json({
            sucesso: true,
            perfilAtual:
                id === sessao.id
                    ? {
                        id,
                        nome: nomeFinal,
                        email: emailFinal,
                        foto_url: fotoFinal,
                        role: roleFinal,
                        professor_id: atual.professor_id ?? null,
                    }
                    : undefined,
            mensagem: 'Perfil atualizado com sucesso!',
        });

        if (id === sessao.id) {
            const novoToken = criarTokenSessaoAdmin({
                id,
                nome: nomeFinal,
                email: emailFinal,
                role: roleFinal,
                professor_id: atual.professor_id ?? null,
            });
            res.cookies.set(NOME_COOKIE_ADMIN, novoToken, {
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                path: '/',
                maxAge: 60 * 60 * 24 * 30,
            });
        }

        return res;
    } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        return NextResponse.json(
            { error: 'Falha ao salvar alterações do perfil.' },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    if (!sessao || sessao.role !== 'admin') {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const id = Number(searchParams.get('id') || 0);

        if (!id || id === sessao.id) {
            return NextResponse.json(
                { error: 'Não é possível excluir o próprio perfil logado.' },
                { status: 400 }
            );
        }

        await sql`DELETE FROM admins_sistema WHERE id = ${id}`;
        return NextResponse.json({ sucesso: true, mensagem: 'Perfil excluído.' });
    } catch (error) {
        console.error('Erro ao excluir perfil:', error);
        return NextResponse.json({ error: 'Falha ao excluir perfil.' }, { status: 500 });
    }
}