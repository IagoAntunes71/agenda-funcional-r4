import { alunoJaCadastradoNoTelefone, temFichasPendentes } from '@/lib/cadastro-aluno-r4';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    AlunoClienteDTO,
    BLOQUEIO_PIN_MINUTOS,
    COOKIE_SESSAO_CLIENTE,
    DURACAO_SESSAO_CLIENTE_SEGUNDOS,
    LIMITE_AGENDAMENTOS_SIMULTANEOS,
    MAX_TENTATIVAS_PIN,
    buscarFamiliaPorTelefone,
    criarTokenSessaoCliente,
    gerarHashPin,
    gerarVariantesTelefone,
    normalizarTelefone,
    solicitarCodigoVerificacaoWhatsApp,
    validarCodigoVerificacaoWhatsApp,
    validarFormatoPin,
    verificarHashPin,
} from '@/lib/cliente-auth';
import { formatarTelefone } from '@/lib/cliente-helpers';
import { obterConfigWhatsApp } from '@/lib/whatsapp-notificacao';

function responderAutenticado(
    telefoneNorm: string,
    responsavelNome: string,
    alunos: AlunoClienteDTO[]
) {
    const resposta = NextResponse.json({
        autenticado: true,
        telefone: telefoneNorm,
        responsavelNome,
        alunos,
        limiteSimultaneo: LIMITE_AGENDAMENTOS_SIMULTANEOS,
    });

    const token = criarTokenSessaoCliente(telefoneNorm);
    resposta.cookies.set(COOKIE_SESSAO_CLIENTE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: DURACAO_SESSAO_CLIENTE_SEGUNDOS,
    });

    return resposta;
}

function validarNovoPinEConfirmacao(
    pin: string,
    confirmarPin: string
): NextResponse | null {
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

    return null;
}

async function atualizarStatusPin(
    variantes: string[],
    dados: {
        pinHash?: string;
        tentativas?: number;
        bloquearMinutos?: number;
    }
) {
    if (dados.pinHash !== undefined) {
        await Promise.all([
            sql`UPDATE responsaveis SET pin_hash = ${dados.pinHash}, pin_tentativas = 0, pin_bloqueado_ate = NULL, atualizado_em = now() WHERE regexp_replace(regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g'), '^55(?=[0-9]{10,11}$)', '') = ANY(${variantes}::text[])`,
            sql`UPDATE alunos SET pin_hash = ${dados.pinHash}, pin_tentativas = 0, pin_bloqueado_ate = NULL WHERE responsavel_id IS NOT NULL AND regexp_replace(regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g'), '^55(?=[0-9]{10,11}$)', '') = ANY(${variantes}::text[])`,
        ]);
        return;
    }

    if (dados.bloquearMinutos !== undefined) {
        await Promise.all([
            sql`UPDATE responsaveis SET pin_tentativas = 0, pin_bloqueado_ate = now() + (${dados.bloquearMinutos} || ' minutes')::interval, atualizado_em = now() WHERE regexp_replace(regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g'), '^55(?=[0-9]{10,11}$)', '') = ANY(${variantes}::text[])`,
            sql`UPDATE alunos SET pin_tentativas = 0, pin_bloqueado_ate = now() + (${dados.bloquearMinutos} || ' minutes')::interval WHERE responsavel_id IS NOT NULL AND regexp_replace(regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g'), '^55(?=[0-9]{10,11}$)', '') = ANY(${variantes}::text[])`,
        ]);
        return;
    }

    const tentativas = dados.tentativas ?? 0;
    await Promise.all([
        sql`UPDATE responsaveis SET pin_tentativas = ${tentativas}, pin_bloqueado_ate = NULL, atualizado_em = now() WHERE regexp_replace(regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g'), '^55(?=[0-9]{10,11}$)', '') = ANY(${variantes}::text[])`,
        sql`UPDATE alunos SET pin_tentativas = ${tentativas}, pin_bloqueado_ate = NULL WHERE responsavel_id IS NOT NULL AND regexp_replace(regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g'), '^55(?=[0-9]{10,11}$)', '') = ANY(${variantes}::text[])`,
    ]);
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const acao = String(body?.acao || 'verificar_telefone');
        const telefoneRaw = String(body?.telefone || '');
        const telefoneNorm = normalizarTelefone(telefoneRaw);
        const variantes = gerarVariantesTelefone(telefoneRaw);

        if (
            telefoneNorm.length < 10 ||
            telefoneNorm.length > 11 ||
            variantes.length === 0
        ) {
            return NextResponse.json(
                { error: 'Informe um número de WhatsApp válido com DDD.' },
                { status: 400 }
            );
        }

        const familia = await buscarFamiliaPorTelefone(telefoneRaw);

        const acoesRecuperacao = new Set([
            'solicitar_recuperacao_pin',
            'redefinir_pin_codigo',
        ]);

        if (familia.bloqueadoAte && !acoesRecuperacao.has(acao)) {
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

        const fichasPendentes = ['verificar_telefone', 'enviar_codigo_primeiro_acesso', 'criar_pin',
            'enviar_codigo_cadastro', 'cadastrar_conta'].includes(acao) && await temFichasPendentes(telefoneNorm);

        if (acao === 'enviar_codigo_primeiro_acesso') {
            if (familia.temPin || (!fichasPendentes && !familia.responsavelId && !familia.alunos.length)) {
                return NextResponse.json({ error: 'Confira o número e use o acesso correspondente.' }, { status: 409 });
            }
            const envio = await solicitarCodigoVerificacaoWhatsApp(telefoneNorm, 'cadastro');
            return NextResponse.json(envio, { status: envio.ok ? 200 : envio.status || 503 });
        }

        if (acao === 'verificar_telefone') {
            if (!fichasPendentes && !familia.responsavelId && familia.alunos.length === 0) {
                const cfgWhatsApp = await obterConfigWhatsApp();
                const exigeVerificacaoCadastro = Boolean(
                    cfgWhatsApp.ativo && cfgWhatsApp.verificar_cadastro_whatsapp
                );

                return NextResponse.json({
                    status: 'novo_cadastro',
                    telefone: telefoneNorm,
                    exigeVerificacaoCadastro,
                });
            }

            return NextResponse.json({
                status: familia.temPin ? 'exige_pin' : 'criar_pin',
                exigeCodigoPrimeiroAcesso: !familia.temPin,
                telefone: telefoneNorm,
                alunosCount: familia.alunos.length,
            });
        }

        if (acao === 'enviar_codigo_cadastro') {
            if (fichasPendentes || familia.responsavelId || familia.alunos.length > 0) {
                return NextResponse.json(
                    {
                        error:
                            'Este número de WhatsApp já possui cadastro. Informe seu PIN para entrar.',
                        status: familia.temPin ? 'exige_pin' : 'criar_pin',
                    },
                    { status: 409 }
                );
            }

            const cfgWhatsApp = await obterConfigWhatsApp();
            if (!cfgWhatsApp.ativo || !cfgWhatsApp.verificar_cadastro_whatsapp) {
                return NextResponse.json({
                    ok: true,
                    verificacaoDispensada: true,
                });
            }

            const nomeResponsavel = String(body?.responsavelNome || '').trim();
            const envio = await solicitarCodigoVerificacaoWhatsApp(
                telefoneRaw,
                'cadastro',
                nomeResponsavel
            );

            if (!envio.ok) {
                return NextResponse.json(
                    {
                        error: envio.erro,
                        aguardarSegundos: envio.aguardarSegundos,
                    },
                    { status: envio.status || 400 }
                );
            }

            return NextResponse.json({
                ok: true,
                expiraMinutos: envio.expiraMinutos,
                cooldownSegundos: envio.cooldownSegundos,
            });
        }

        if (acao === 'cadastrar_conta') {
            if (fichasPendentes || familia.responsavelId || familia.alunos.length > 0) {
                return NextResponse.json(
                    {
                        error:
                            'Este número de WhatsApp já possui cadastro. Informe seu PIN para continuar.',
                        status: familia.temPin ? 'exige_pin' : 'criar_pin',
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
            const codigoVerificacao = String(body?.codigoVerificacao || '').trim();

            if (responsavelNome.length < 2) {
                return NextResponse.json(
                    { error: 'Informe o nome completo do responsável.' },
                    { status: 400 }
                );
            }

            if (nomeAluno.length < 2) {
                return NextResponse.json(
                    { error: 'Informe o nome completo do(a) aluno(a).' },
                    { status: 400 }
                );
            }

            if (!serie) {
                return NextResponse.json(
                    { error: 'Selecione a série / ano do aluno.' },
                    { status: 400 }
                );
            }

            let colegioId: number | null = null;
            let colegioNome = '';

            if (colegioOpcao === 'outros') {
                if (colegioOutroNome.length < 2) {
                    return NextResponse.json(
                        { error: 'Informe o nome do colégio do aluno.' },
                        { status: 400 }
                    );
                }
                colegioNome = colegioOutroNome;
            } else {
                const idNumerico = Number(colegioOpcao);
                if (!Number.isFinite(idNumerico) || idNumerico <= 0) {
                    return NextResponse.json(
                        { error: 'Selecione um colégio válido.' },
                        { status: 400 }
                    );
                }

                const colRows = (await sql`
          SELECT id, nome
          FROM colegios
          WHERE id = ${idNumerico}
          LIMIT 1
        `) as { id: number; nome: string }[];

                if (colRows.length === 0) {
                    return NextResponse.json(
                        { error: 'Colégio selecionado não encontrado.' },
                        { status: 400 }
                    );
                }

                colegioId = colRows[0].id;
                colegioNome = colRows[0].nome;
            }

            const erroPin = validarNovoPinEConfirmacao(pin, confirmarPin);
            if (erroPin) return erroPin;

            const cfgWhatsApp = await obterConfigWhatsApp();
            if (cfgWhatsApp.ativo && cfgWhatsApp.verificar_cadastro_whatsapp) {
                const validacaoOtp = await validarCodigoVerificacaoWhatsApp(
                    telefoneRaw,
                    'cadastro',
                    codigoVerificacao,
                    true
                );
                if (!validacaoOtp.ok) {
                    return NextResponse.json(
                        {
                            error: validacaoOtp.erro,
                            exigeCodigoVerificacao: true,
                        },
                        { status: validacaoOtp.status || 400 }
                    );
                }
            }

            if (await alunoJaCadastradoNoTelefone(nomeAluno, telefoneNorm)) {
                return NextResponse.json({ error: 'Já existe uma ficha com esse nome neste WhatsApp. Confira a lista de alunos ou fale com a recepção.' }, { status: 409 });
            }

            const pinHash = gerarHashPin(pin);
            const telefoneFormatado = formatarTelefone(telefoneNorm);

            const novoResp = (await sql`
        INSERT INTO responsaveis (
          telefone,
          telefone_formatado,
          nome,
          pin_hash,
          pin_tentativas,
          pin_bloqueado_ate,
          criado_em,
          atualizado_em
        )
        VALUES (
          ${telefoneNorm},
          ${telefoneFormatado},
          ${responsavelNome},
          ${pinHash},
          0,
          NULL,
          now(),
          now()
        )
        RETURNING id
      `) as { id: number }[];

            const responsavelId = novoResp[0].id;

            await sql`
        INSERT INTO alunos (
          responsavel_id,
          nome_aluno,
          responsavel_nome,
          telefone,
          telefone_formatado,
          colegio_id,
          colegio_nome,
          serie,
          ativo,
          pin_hash,
          pin_tentativas,
          pin_bloqueado_ate
        )
        VALUES (
          ${responsavelId},
          ${nomeAluno},
          ${responsavelNome},
          ${telefoneNorm},
          ${telefoneFormatado},
          ${colegioId},
          ${colegioNome},
          ${serie},
          true,
          ${pinHash},
          0,
          NULL
        )
      `;

            const familiaAtualizada = await buscarFamiliaPorTelefone(telefoneNorm);

            return responderAutenticado(
                telefoneNorm,
                responsavelNome,
                familiaAtualizada.alunos
            );
        }

        if (acao === 'criar_pin') {
            if (!fichasPendentes && !familia.responsavelId && familia.alunos.length === 0) {
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

            const erroPin = validarNovoPinEConfirmacao(pin, confirmarPin);
            if (erroPin) return erroPin;

            const nome = String(body?.responsavelNome || '').trim();
            if (nome.length < 2 || nome.length > 120) return NextResponse.json({ error: 'Informe o nome do responsável.' }, { status: 400 });

            const otp = await validarCodigoVerificacaoWhatsApp(telefoneNorm, 'cadastro',
                String(body.codigoVerificacao || ''), true);
            if (!otp.ok) return NextResponse.json({ error: otp.erro }, { status: otp.status || 400 });
            const pinHash = gerarHashPin(pin);
            const contas = familia.responsavelId
                ? await sql`UPDATE responsaveis SET nome = ${nome}, pin_hash = ${pinHash}, pin_tentativas = 0, pin_bloqueado_ate = NULL
                    WHERE id = ${familia.responsavelId} AND nullif(trim(pin_hash), '') IS NULL RETURNING id`
                : (await sql.transaction([
                    sql`SELECT pg_advisory_xact_lock(840427, hashtext(${telefoneNorm}))`,
                    sql`INSERT INTO responsaveis (telefone, telefone_formatado, nome, pin_hash)
                        SELECT ${telefoneNorm}, ${formatarTelefone(telefoneNorm)}, ${nome}, ${pinHash}
                        WHERE NOT EXISTS (SELECT 1 FROM responsaveis
                            WHERE regexp_replace(regexp_replace(telefone, '[^0-9]', '', 'g'), '^55(?=[0-9]{10,11}$)', '')
                                = ANY(${variantes}::text[]))
                        RETURNING id`,
                ]))[1];
            if (!contas.length) return NextResponse.json({ error: 'Este número já tem PIN. Volte e entre na conta.' }, { status: 409 });

            return responderAutenticado(telefoneNorm, nome, familia.alunos);
        }

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

            if (!verificarHashPin(pin, familia.pinHash)) {
                const novasTentativas = familia.tentativas + 1;

                if (novasTentativas >= MAX_TENTATIVAS_PIN) {
                    await atualizarStatusPin(variantes, {
                        bloquearMinutos: BLOQUEIO_PIN_MINUTOS,
                    });

                    return NextResponse.json(
                        {
                            error: `PIN incorreto ${MAX_TENTATIVAS_PIN} vezes. Acesso bloqueado por ${BLOQUEIO_PIN_MINUTOS} minutos por segurança.`,
                            bloqueado: true,
                        },
                        { status: 429 }
                    );
                }

                await atualizarStatusPin(variantes, { tentativas: novasTentativas });

                const restantes = MAX_TENTATIVAS_PIN - novasTentativas;
                return NextResponse.json(
                    {
                        error: `PIN incorreto. Você ainda tem ${restantes} tentativa(s) antes do bloqueio temporário.`,
                    },
                    { status: 401 }
                );
            }

            await atualizarStatusPin(variantes, { tentativas: 0 });

            return responderAutenticado(telefoneNorm, familia.responsavelNome || 'Responsável', familia.alunos);
        }

        if (acao === 'solicitar_recuperacao_pin') {
            if (!familia.responsavelId && familia.alunos.length === 0) {
                return NextResponse.json(
                    {
                        error:
                            'Nenhuma conta encontrada com este número de WhatsApp.',
                    },
                    { status: 404 }
                );
            }

            const envio = await solicitarCodigoVerificacaoWhatsApp(
                telefoneRaw,
                'recuperacao_pin',
                familia.responsavelNome
            );

            if (!envio.ok) {
                return NextResponse.json(
                    {
                        error: envio.erro,
                        aguardarSegundos: envio.aguardarSegundos,
                    },
                    { status: envio.status || 400 }
                );
            }

            return NextResponse.json({
                ok: true,
                expiraMinutos: envio.expiraMinutos,
                cooldownSegundos: envio.cooldownSegundos,
            });
        }

        if (acao === 'redefinir_pin_codigo') {
            if (!familia.responsavelId && familia.alunos.length === 0) {
                return NextResponse.json(
                    { error: 'Conta não encontrada para este número.' },
                    { status: 404 }
                );
            }

            const codigo = String(body?.codigo || '').trim();
            const pin = String(body?.pin || '').trim();
            const confirmarPin = String(body?.confirmarPin || '').trim();

            const erroPin = validarNovoPinEConfirmacao(pin, confirmarPin);
            if (erroPin) return erroPin;

            const validacaoOtp = await validarCodigoVerificacaoWhatsApp(
                telefoneRaw,
                'recuperacao_pin',
                codigo,
                true
            );

            if (!validacaoOtp.ok) {
                return NextResponse.json(
                    { error: validacaoOtp.erro },
                    { status: validacaoOtp.status || 400 }
                );
            }

            await atualizarStatusPin(variantes, { pinHash: gerarHashPin(pin) });

            return responderAutenticado(telefoneNorm, familia.responsavelNome || 'Responsável', familia.alunos);
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
