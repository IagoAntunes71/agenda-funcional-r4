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
    garantirEstruturaContasResponsaveis,
    gerarHashPin,
    normalizarTelefone,
    validarFormatoPin,
    verificarHashPin,
} from '@/lib/cliente-auth';
import { formatarTelefone } from '@/lib/cliente-helpers';
import { garantirTabelasClientesEColegios } from '@/app/api/cliente/route';

function aplicarCookieSessao(
    res: NextResponse,
    telefoneNorm: string,
    responsavelId: number,
    sessaoVersao: number
) {
    const token = criarTokenSessaoCliente(
        telefoneNorm,
        responsavelId,
        sessaoVersao
    );
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
        await garantirTabelasClientesEColegios();
        await garantirEstruturaContasResponsaveis();

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

        // Verifica bloqueio temporário por excesso de tentativas incorretas de PIN
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

        // PASSO 1: Verifica se o WhatsApp já pertence a uma conta
        if (acao === 'verificar_telefone') {
            if (!familia.responsavelId) {
                return NextResponse.json({
                    status: 'novo_cadastro',
                    telefone: telefoneNorm,
                });
            }

            return NextResponse.json({
                status: familia.temPin ? 'exige_pin' : 'criar_pin',
                telefone: telefoneNorm,
                responsavelNome: familia.responsavelNome,
                alunosCount: familia.alunos.length,
            });
        }

        // PASSO 2: Cadastro inicial atômico (cria conta única + 1º filho + PIN)
        if (acao === 'cadastrar_conta') {
            if (familia.responsavelId) {
                return NextResponse.json(
                    {
                        error: familia.temPin
                            ? 'Este WhatsApp já possui cadastro. Informe seu PIN para entrar e gerenciar ou adicionar outro filho.'
                            : 'Este WhatsApp já possui cadastro sem PIN. Crie seu PIN para acessar a conta.',
                        status: familia.temPin ? 'exige_pin' : 'criar_pin',
                        telefone: telefoneNorm,
                    },
                    { status: 409 }
                );
            }

            const responsavelNome = String(body?.responsavelNome || '').trim();
            const nomeAluno = String(body?.nomeAluno || '').trim();
            const colegioOpcao = String(body?.colegioOpcao || '').trim();
            const colegioOutroNome = String(body?.colegioOutroNome || '').trim();
            const serie = String(body?.serie || '').trim();
            const pin = String(body?.pin || '').trim();
            const confirmarPin = String(body?.confirmarPin || '').trim();

            if (responsavelNome.length < 2) {
                return NextResponse.json(
                    { error: 'Informe o nome completo do responsável.' },
                    { status: 400 }
                );
            }
            if (nomeAluno.length < 2 || !serie) {
                return NextResponse.json(
                    { error: 'Preencha o nome completo do aluno e a série.' },
                    { status: 400 }
                );
            }
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

            let colegioIdFinal: number | null = null;
            let colegioNomeFinal = '';

            if (colegioOpcao === 'outros') {
                if (colegioOutroNome.length < 2) {
                    return NextResponse.json(
                        { error: 'Digite o nome do colégio na opção "Outros".' },
                        { status: 400 }
                    );
                }
                colegioNomeFinal = colegioOutroNome.replace(/\s+/g, ' ').trim();
                const existente = (await sql`
          SELECT id, nome FROM colegios
          WHERE lower(trim(nome)) = lower(trim(${colegioNomeFinal}))
          LIMIT 1
        `) as { id: number; nome: string }[];

                if (existente.length > 0) {
                    colegioIdFinal = existente[0].id;
                    colegioNomeFinal = existente[0].nome;
                } else {
                    const novoCol = (await sql`
            INSERT INTO colegios (nome, aprovado)
            VALUES (${colegioNomeFinal}, false)
            RETURNING id, nome
          `) as { id: number; nome: string }[];
                    colegioIdFinal = novoCol[0].id;
                    colegioNomeFinal = novoCol[0].nome;
                }
            } else {
                const idNum = Number(colegioOpcao);
                if (!idNum) {
                    return NextResponse.json(
                        { error: 'Selecione um colégio ou escolha "Outros".' },
                        { status: 400 }
                    );
                }
                const colRows = (await sql`
          SELECT id, nome FROM colegios WHERE id = ${idNum} LIMIT 1
        `) as { id: number; nome: string }[];

                if (colRows.length === 0) {
                    return NextResponse.json(
                        { error: 'Colégio selecionado não encontrado.' },
                        { status: 404 }
                    );
                }
                colegioIdFinal = colRows[0].id;
                colegioNomeFinal = colRows[0].nome;
            }

            const telFormatado = formatarTelefone(telefoneNorm);
            const pinHash = gerarHashPin(pin);

            const contaCriada = (await sql`
        INSERT INTO responsaveis (
          telefone,
          telefone_formatado,
          nome,
          pin_hash,
          pin_tentativas,
          pin_bloqueado_ate,
          sessao_versao
        )
        VALUES (
          ${telefoneNorm},
          ${telFormatado},
          ${responsavelNome},
          ${pinHash},
          0,
          NULL,
          1
        )
        ON CONFLICT (telefone) DO NOTHING
        RETURNING id, sessao_versao
      `) as { id: number; sessao_versao: number }[];

            if (contaCriada.length === 0) {
                return NextResponse.json(
                    {
                        error:
                            'Este WhatsApp já foi cadastrado. Faça login com seu PIN para acessar sua conta.',
                        status: 'exige_pin',
                        telefone: telefoneNorm,
                    },
                    { status: 409 }
                );
            }

            const responsavelId = contaCriada[0].id;

            await sql`
        INSERT INTO alunos (
          responsavel_id,
          telefone,
          telefone_formatado,
          responsavel_nome,
          nome_aluno,
          colegio_id,
          colegio_nome,
          serie,
          ativo
        )
        VALUES (
          ${responsavelId},
          ${telefoneNorm},
          ${telFormatado},
          ${responsavelNome},
          ${nomeAluno},
          ${colegioIdFinal},
          ${colegioNomeFinal},
          ${serie},
          true
        )
      `;

            const familiaAtualizada = await buscarFamiliaPorTelefone(telefoneNorm);

            const resposta = NextResponse.json(
                {
                    autenticado: true,
                    telefone: telefoneNorm,
                    responsavelNome: familiaAtualizada.responsavelNome,
                    alunos: familiaAtualizada.alunos,
                    limiteSimultaneo: LIMITE_AGENDAMENTOS_SIMULTANEOS,
                },
                { status: 201 }
            );

            aplicarCookieSessao(
                resposta,
                telefoneNorm,
                responsavelId,
                contaCriada[0].sessao_versao
            );
            return resposta;
        }

        // PASSO 3: Criação de PIN para conta existente sem PIN (ou após reset pelo admin)
        if (acao === 'criar_pin') {
            if (!familia.responsavelId) {
                return NextResponse.json(
                    { error: 'Nenhuma conta encontrada para este número.' },
                    { status: 404 }
                );
            }

            if (familia.temPin) {
                return NextResponse.json(
                    {
                        error:
                            'Este número já possui um PIN cadastrado. Informe seu PIN para entrar.',
                        status: 'exige_pin',
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

            const atualizados = (await sql`
        UPDATE responsaveis
        SET pin_hash = ${pinHash},
            pin_tentativas = 0,
            pin_bloqueado_ate = NULL,
            sessao_versao = COALESCE(sessao_versao, 1) + 1,
            atualizado_em = now()
        WHERE id = ${familia.responsavelId}
        RETURNING sessao_versao
      `) as { sessao_versao: number }[];

            const novaVersao = atualizados[0]?.sessao_versao || 1;

            const resposta = NextResponse.json({
                autenticado: true,
                telefone: telefoneNorm,
                responsavelNome: familia.responsavelNome,
                alunos: familia.alunos,
                limiteSimultaneo: LIMITE_AGENDAMENTOS_SIMULTANEOS,
            });

            aplicarCookieSessao(
                resposta,
                telefoneNorm,
                familia.responsavelId,
                novaVersao
            );
            return resposta;
        }

        // PASSO 4: Login recorrente com PIN na conta do responsável
        if (acao === 'entrar_pin') {
            if (!familia.responsavelId) {
                return NextResponse.json(
                    { error: 'WhatsApp não cadastrado.', status: 'novo_cadastro' },
                    { status: 404 }
                );
            }

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
            UPDATE responsaveis
            SET pin_tentativas = 0,
                pin_bloqueado_ate = now() + (${BLOQUEIO_PIN_MINUTOS} || ' minutes')::interval,
                atualizado_em = now()
            WHERE id = ${familia.responsavelId}
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
          UPDATE responsaveis
          SET pin_tentativas = ${novasTentativas},
              atualizado_em = now()
          WHERE id = ${familia.responsavelId}
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
        UPDATE responsaveis
        SET pin_tentativas = 0,
            pin_bloqueado_ate = NULL,
            atualizado_em = now()
        WHERE id = ${familia.responsavelId}
      `;

            const resposta = NextResponse.json({
                autenticado: true,
                telefone: telefoneNorm,
                responsavelNome: familia.responsavelNome,
                alunos: familia.alunos,
                limiteSimultaneo: LIMITE_AGENDAMENTOS_SIMULTANEOS,
            });

            aplicarCookieSessao(
                resposta,
                telefoneNorm,
                familia.responsavelId,
                familia.sessaoVersao
            );
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