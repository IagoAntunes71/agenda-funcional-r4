import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verificarAdminAutenticado } from '@/lib/admin-auth';
import {
    ModoChaveMestra,
    avaliarStatusChaveMestra,
} from '@/lib/horarios-reforco';

export async function garantirConfiguracoesEUnidadeOnline() {
    await sql`
    CREATE TABLE IF NOT EXISTS configuracoes_sistema (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      atualizado_em TIMESTAMPTZ DEFAULT now()
    )
  `;

    await sql`
    INSERT INTO configuracoes_sistema (chave, valor)
    VALUES ('chave_mestra_modo', 'auto')
    ON CONFLICT (chave) DO NOTHING
  `;

    const unidadesExistentes = (await sql`
    SELECT id, lower(trim(nome)) AS nome_norm
    FROM unidades
  `) as { id: number; nome_norm: string }[];

    const jaTemOnline = unidadesExistentes.some((u) => u.nome_norm === 'online');
    if (!jaTemOnline) {
        await sql`
      INSERT INTO unidades (nome, clin_care_id, ativa)
      VALUES ('Online', 'id-online', true)
    `;
    }

    const jaTemImbui = unidadesExistentes.some(
        (u) => u.nome_norm === 'imbuí' || u.nome_norm === 'imbui'
    );
    if (!jaTemImbui) {
        await sql`
      INSERT INTO unidades (nome, clin_care_id, ativa)
      VALUES ('Imbuí', 'id-imbui', true)
    `;
    }
}

export async function obterModoChaveMestra(): Promise<ModoChaveMestra> {
    await garantirConfiguracoesEUnidadeOnline();

    const rows = (await sql`
    SELECT valor
    FROM configuracoes_sistema
    WHERE chave = 'chave_mestra_modo'
    LIMIT 1
  `) as { valor: string }[];

    const bruto = (rows[0]?.valor || 'auto').trim().toLowerCase();
    if (bruto === 'ativo' || bruto === 'inativo' || bruto === 'auto') {
        return bruto;
    }
    return 'auto';
}

export async function GET() {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const modo = await obterModoChaveMestra();
    const status = avaliarStatusChaveMestra(modo);

    return NextResponse.json({
        modo,
        aberto: status.aberto,
    });
}

export async function PATCH(req: NextRequest) {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirConfiguracoesEUnidadeOnline();

        const body = await req.json();
        const modo = String(body?.modo || '').trim().toLowerCase();

        if (modo !== 'auto' && modo !== 'ativo' && modo !== 'inativo') {
            return NextResponse.json(
                { error: 'Modo inválido. Use auto, ativo ou inativo.' },
                { status: 400 }
            );
        }

        await sql`
      INSERT INTO configuracoes_sistema (chave, valor, atualizado_em)
      VALUES ('chave_mestra_modo', ${modo}, now())
      ON CONFLICT (chave)
      DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()
    `;

        const status = avaliarStatusChaveMestra(modo);

        return NextResponse.json({
            sucesso: true,
            modo,
            aberto: status.aberto,
        });
    } catch (error) {
        console.error('Erro ao atualizar chave mestra:', error);
        return NextResponse.json(
            { error: 'Falha ao salvar configuração.' },
            { status: 500 }
        );
    }
}