import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    BLOQUEIO_PIN_MINUTOS,
    COOKIE_SESSAO_CLIENTE,
    DURACAO_SESSAO_CLIENTE_SEGUNDOS,
    LIMITE_AGENDAMENTOS_SIMULTANEOS,
    MAX_TENTATIVAS_PIN,
    buscarFamiliaPorTelefone,
    criarTokenSessaoCliente,
    gerarHashPin,
    normalizarTelefone,
    validarFormatoPin,
    verificarHashPin,
} from '@/lib/cliente-auth';

function aplicarCookieSessao(res: NextResponse, telefoneNorm: string) {
    const token = criarTokenSessaoCliente(telefoneNorm);
    res.cookies.set(COOKIE_SESSAO_CLIENTE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: DURACAO_SESSAO_CLIENTE_SEGUNDOS,
    });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const acao = String(body?.acao || 'verificar_telefone');
        const telefoneNorm = normalizarTelefone(String(body?.telefone || ''));

        if (telefoneNorm.length < 10 || telefoneNorm.length > 11) {
            return NextResponse.json(
                { error: 'Informe um número de WhatsApp válido com DDD.' },
                { status: 400 }
            );
        }

        const familia = await buscarFamiliaPorTelefone(telefoneNorm);

        // Verifica se o telefone está bloqueado por excesso de tentativas
        if (familia.bloqueadoAte) {
            const restanteMs = new Date(familia.bloqueadoAte).getTime() - Date.now();
            if (restanteMs > 0) {
                const minutosRestantes = Math.max(1, Math.ceil(restanteMs / 60000));
                return NextResponse.json(
                    {
                        error: `Muitas tentativas incorretas. Por segurança, aguarde ${minutosRestantes} minuto(s) para tentar novamente.`,
                        bloqueado: true,
                        minutosRestantes,
                    },
                    { status: 429 }
                );
            }
        }

        // PASSO 1: Consulta se o número já tem PIN, precisa criar PIN ou é primeiro cadastro
        if (acao === 'verificar_telefone') {
            if (familia.alunos.length === 0) {
                return NextResponse.json({
                    status: 'novo_cadastro',
                    telefone: telefoneNorm,
                });
            }

            return NextResponse.json({
                status: familia.temPin ? 'exige_pin' : 'criar_pin',
                telefone: telefoneNorm,
                alunosCount: familia.alunos.length,
            });
        }

        // PASSO 2: Primeiro acesso — cria e grava o PIN de 4 dígitos
        if (acao === 'criar_pin') {
            if (familia.alunos.length === 0) {
                return NextResponse.json(
                    { error: 'Finalize o cadastro do aluno antes de definir o PIN.' },
                    { status: 400 }
                );
            }

            if (familia.temPin) {
                return NextResponse.json(
                    {
                        error:
                            'Este número já possui um PIN cadastrado. Informe seu PIN para entrar.',
                    },
                    { status: 409 }
                );
            }

            const pin = String(body?.pin || '').trim();
            const confirmarPin = String(body?.confirmarPin || '').trim();

            if (!validarFormatoPin(pin)) {
                return NextResponse.json(
                    { error: 'O PIN deve conter exatamente 4 números.' },
                    { status: 400 }
                );
            }

            if (pin !== confirmarPin) {
                return NextResponse.json(
                    { error: 'Os dois PINs digitados não conferem.' },
                    { status: 400 }
                );
            }

            const pinHash = gerarHashPin(pin);

            await sql`
        UPDATE alunos
        SET pin_hash = ${pinHash},
            pin_tentativas = 0,
            pin_bloqueado_ate = NULL
        WHERE regexp_replace(
          regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
          '^55(?=\d{10,11}$)',
          ''
        ) = ${telefoneNorm}
      `;

            const resposta = NextResponse.json({
                autenticado: true,
                telefone: telefoneNorm,
                responsavelNome: familia.alunos[0].responsavel_nome,
                alunos: familia.alunos,
                limiteSimultaneo: LIMITE_AGENDAMENTOS_SIMULTANEOS,
            });

            aplicarCookieSessao(resposta, telefoneNorm);
            return resposta;
        }

        // PASSO 3: Login recorrente — valida o PIN existente
        if (acao === 'entrar_pin') {
            if (!familia.temPin || !familia.pinHash) {
                return NextResponse.json(
                    {
                        error: 'Este número ainda não possui PIN. Crie seu PIN agora.',
                        status: 'criar_pin',
                    },
                    { status: 400 }
                );
            }

            const pin = String(body?.pin || '').trim();
            if (!validarFormatoPin(pin)) {
                return NextResponse.json(
                    { error: 'Digite seu PIN de 4 números.' },
                    { status: 400 }
                );
            }

            const pinValido = verificarHashPin(pin, familia.pinHash);

            if (!pinValido) {
                const novasTentativas = familia.tentativas + 1;

                if (novasTentativas >= MAX_TENTATIVAS_PIN) {
                    await sql`
            UPDATE alunos
            SET pin_tentativas = 0,
                pin_bloqueado_ate = now() + (${BLOQUEIO_PIN_MINUTOS} || ' minutes')::interval
            WHERE regexp_replace(
              regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
              '^55(?=\d{10,11}$)',
              ''
            ) = ${telefoneNorm}
          `;

                    return NextResponse.json(
                        {
                            error: `PIN incorreto ${MAX_TENTATIVAS_PIN} vezes. Acesso bloqueado por ${BLOQUEIO_PIN_MINUTOS} minutos por segurança.`,
                            bloqueado: true,
                        },
                        { status: 429 }
                    );
                }

                await sql`
          UPDATE alunos
          SET pin_tentativas = ${novasTentativas}
          WHERE regexp_replace(
            regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
            '^55(?=\d{10,11}$)',
            ''
          ) = ${telefoneNorm}
        `;

                const restantes = MAX_TENTATIVAS_PIN - novasTentativas;
                return NextResponse.json(
                    {
                        error: `PIN incorreto. Você ainda tem ${restantes} tentativa(s) antes do bloqueio temporário.`,
                    },
                    { status: 401 }
                );
            }

            await sql`
        UPDATE alunos
        SET pin_tentativas = 0,
            pin_bloqueado_ate = NULL
        WHERE regexp_replace(
          regexp_replace(COALESCE(telefone, ''), '\D', '', 'g'),
          '^55(?=\d{10,11}$)',
          ''
        ) = ${telefoneNorm}
      `;

            const resposta = NextResponse.json({
                autenticado: true,
                telefone: telefoneNorm,
                responsavelNome: familia.alunos[0].responsavel_nome,
                alunos: familia.alunos,
                limiteSimultaneo: LIMITE_AGENDAMENTOS_SIMULTANEOS,
            });

            aplicarCookieSessao(resposta, telefoneNorm);
            return resposta;
        }

        return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    } catch (error) {
        console.error('Erro na autenticação do cliente:', error);
        return NextResponse.json(
            { error: 'Falha interna ao validar acesso.' },
            { status: 500 }
        );
    }
}