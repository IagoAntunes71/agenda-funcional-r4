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
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

    await sql`
    INSERT INTO configuracoes_sistema (chave, valor)
    VALUES ('chave_mestra', 'auto')
    ON CONFLICT (chave) DO NOTHING
  `;

    // Garante que a unidade "Online" exista para o admin vincular professores
    const onlineExiste = await sql`
    SELECT id FROM unidades
    WHERE lower(trim(nome)) = 'online'
    LIMIT 1
  `;

    if (onlineExiste.length === 0) {
        await sql`
      INSERT INTO unidades (nome, clin_care_id, ativa)
      VALUES ('Online', 'id-online', true)
    `;
    }
}

export async function obterModoChaveMestra(): Promise<ModoChaveMestra> {
    await garantirConfiguracoesEUnidadeOnline();
    const rows = (await sql`
    SELECT valor FROM configuracoes_sistema
    WHERE chave = 'chave_mestra'
    LIMIT 1
  `) as { valor: string }[];

    const val = rows[0]?.valor;
    if (val === 'ativo' || val === 'inativo' || val === 'auto') {
        return val;
    }
    return 'auto';
}

export async function PATCH(req: NextRequest) {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirConfiguracoesEUnidadeOnline();
        const body = await req.json();
        const modo = String(body?.modo || '') as ModoChaveMestra;

        if (!['auto', 'ativo', 'inativo'].includes(modo)) {
            return NextResponse.json(
                { error: 'Modo inválido. Use auto, ativo ou inativo.' },
                { status: 400 }
            );
        }

        await sql`
      INSERT INTO configuracoes_sistema (chave, valor, atualizado_em)
      VALUES ('chave_mestra', ${modo}, now())
      ON CONFLICT (chave)
      DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()
    `;

        const statusAtual = avaliarStatusChaveMestra(modo);

        return NextResponse.json({
            sucesso: true,
            modo,
            ...statusAtual,
        });
    } catch (error) {
        console.error('Erro ao salvar chave mestra:', error);
        return NextResponse.json(
            { error: 'Falha ao atualizar chave mestra.' },
            { status: 500 }
        );
    }
}