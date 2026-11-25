import { NextRequest, NextResponse } from 'next/server';
import { lerSessaoAdmin } from '@/lib/admin-auth';
import {
    TEXTOS_PORTAL_PADRAO,
    obterTextosPortal,
    salvarTextosPortal,
} from '@/lib/portal-textos';

export async function GET() {
    const textos = await obterTextosPortal();
    return NextResponse.json({
        textos,
        padrao: TEXTOS_PORTAL_PADRAO,
    });
}

export async function PUT(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    if (sessao?.role !== 'admin') {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: sessao ? 403 : 401 });
    }

    try {
        const body = await req.json();
        const textosAtualizados = await salvarTextosPortal(body?.textos || body);
        return NextResponse.json({
            sucesso: true,
            textos: textosAtualizados,
            mensagem:
                'Textos publicados com sucesso! O portal dos pais já está atualizado.',
        });
    } catch (error) {
        console.error('Erro ao salvar textos do portal:', error);
        return NextResponse.json(
            { error: 'Falha ao salvar textos do portal.' },
            { status: 500 }
        );
    }
}