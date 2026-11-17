import { NextResponse } from 'next/server';
import {
    COOKIE_SESSAO_CLIENTE,
    LIMITE_AGENDAMENTOS_SIMULTANEOS,
    buscarFamiliaPorTelefone,
    lerSessaoCliente,
} from '@/lib/cliente-auth';

export async function GET() {
    const sessao = await lerSessaoCliente();
    if (!sessao) {
        return NextResponse.json({ autenticado: false });
    }

    const familia = await buscarFamiliaPorTelefone(sessao.telefone);
    if (!familia.responsavelId) {
        const res = NextResponse.json({ autenticado: false });
        res.cookies.delete(COOKIE_SESSAO_CLIENTE);
        return res;
    }

    return NextResponse.json({
        autenticado: true,
        responsavelId: familia.responsavelId,
        telefone: sessao.telefone,
        responsavelNome: familia.responsavelNome,
        alunos: familia.alunos,
        limiteSimultaneo: LIMITE_AGENDAMENTOS_SIMULTANEOS,
    });
}

export async function DELETE() {
    const res = NextResponse.json({ sucesso: true });
    res.cookies.delete(COOKIE_SESSAO_CLIENTE);
    return res;
}