import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verificarAdminAutenticado } from '@/lib/admin-auth';
import {
    garantirEstruturaContasResponsaveis,
    normalizarTelefone,
} from '@/lib/cliente-auth';
import { formatarTelefone } from '@/lib/cliente-helpers';

export async function PATCH(req: NextRequest) {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirEstruturaContasResponsaveis();

        const body = await req.json();
        const acao = String(body?.acao || 'editar_aluno');

        // Edição direta da conta do responsável (nome, WhatsApp único e resolução de conflito de migração)
        if (acao === 'editar_responsavel') {
            const responsavelId = Number(body?.responsavel_id || 0);
            const nomeResp = String(body?.nome || '').trim();
            const telefoneNorm = normalizarTelefone(String(body?.telefone || ''));
            const resolverConflito = body?.resolver_conflito === true;

            if (!responsavelId) {
                return NextResponse.json(
                    { error: 'ID da conta do responsável inválido.' },
                    { status: 400 }
                );
            }

            if (nomeResp.length < 2) {
                return NextResponse.json(
                    { error: 'Informe o nome completo do responsável.' },
                    { status: 400 }
                );
            }

            if (telefoneNorm.length < 10 || telefoneNorm.length > 11) {
                return NextResponse.json(
                    { error: 'Informe um número de WhatsApp válido com DDD.' },
                    { status: 400 }
                );
            }

            const atuais = (await sql`
        SELECT id, telefone
        FROM responsaveis
        WHERE id = ${responsavelId}
        LIMIT 1
      `) as { id: number; telefone: string }[];

            if (atuais.length === 0) {
                return NextResponse.json(
                    { error: 'Conta do responsável não encontrada.' },
                    { status: 404 }
                );
            }

            const telefoneMudou = atuais[0].telefone !== telefoneNorm;

            if (telefoneMudou) {
                const conflitoTel = (await sql`
          SELECT id, nome
          FROM responsaveis
          WHERE telefone = ${telefoneNorm}
            AND id <> ${responsavelId}
          LIMIT 1
        `) as { id: number; nome: string }[];

                if (conflitoTel.length > 0) {
                    return NextResponse.json(
                        {
                            error: `O WhatsApp ${formatarTelefone(
                                telefoneNorm
                            )} já pertence à conta de "${
                                conflitoTel[0].nome
                            }". Não é permitido duplicar o número entre contas diferentes.`,
                        },
                        { status: 409 }
                    );
                }
            }

            const telFormatado = formatarTelefone(telefoneNorm);

            await sql`
        UPDATE responsaveis
        SET
          nome = ${nomeResp},
          telefone = ${telefoneNorm},
          telefone_formatado = ${telFormatado},
          sessao_versao = CASE
            WHEN ${telefoneMudou} THEN COALESCE(sessao_versao, 1) + 1
            ELSE COALESCE(sessao_versao, 1)
          END,
          conflito_migracao = CASE
            WHEN ${resolverConflito} THEN false
            ELSE conflito_migracao
          END,
          conflito_detalhes = CASE
            WHEN ${resolverConflito} THEN NULL
            ELSE conflito_detalhes
          END,
          atualizado_em = now()
        WHERE id = ${responsavelId}
      `;

            await sql`
        UPDATE alunos
        SET
          responsavel_nome = ${nomeResp},
          telefone = ${telefoneNorm},
          telefone_formatado = ${telFormatado}
        WHERE responsavel_id = ${responsavelId}
      `;

            return NextResponse.json({
                sucesso: true,
                mensagem: 'Dados da conta do responsável atualizados com sucesso.',
            });
        }

        // Edição de um filho (e opcionalmente dados do responsável, bloqueando duplicidade de WhatsApp)
        const id = Number(body?.id || 0);
        const nomeAluno = String(body?.nome_aluno || '').trim();
        const responsavelNome = String(body?.responsavel_nome || '').trim();
        const telefoneNorm = normalizarTelefone(String(body?.telefone || ''));
        const colegioNome = String(body?.colegio_nome || '').trim();
        const serie = String(body?.serie || '').trim();

        if (!id) {
            return NextResponse.json(
                { error: 'ID do aluno inválido.' },
                { status: 400 }
            );
        }

        if (nomeAluno.length < 2) {
            return NextResponse.json(
                { error: 'Informe o nome completo do aluno(a).' },
                { status: 400 }
            );
        }

        if (telefoneNorm.length < 10 || telefoneNorm.length > 11) {
            return NextResponse.json(
                { error: 'Informe um número de WhatsApp válido com DDD.' },
                { status: 400 }
            );
        }

        const existentes = (await sql`
      SELECT id, responsavel_id, telefone
      FROM alunos
      WHERE id = ${id}
      LIMIT 1
    `) as { id: number; responsavel_id: number | null; telefone: string | null }[];

        if (existentes.length === 0) {
            return NextResponse.json(
                { error: 'Aluno não encontrado.' },
                { status: 404 }
            );
        }

        const responsavelId = existentes[0].responsavel_id;
        const telefoneFormatado = formatarTelefone(telefoneNorm);

        if (responsavelId) {
            const contaAtual = (await sql`
        SELECT id, telefone, nome
        FROM responsaveis
        WHERE id = ${responsavelId}
        LIMIT 1
      `) as { id: number; telefone: string; nome: string }[];

            const telAntigo = contaAtual[0]?.telefone || '';
            const telefoneMudou = telAntigo !== telefoneNorm;

            if (telefoneMudou) {
                const outraConta = (await sql`
          SELECT id, nome
          FROM responsaveis
          WHERE telefone = ${telefoneNorm}
            AND id <> ${responsavelId}
          LIMIT 1
        `) as { id: number; nome: string }[];

                if (outraConta.length > 0) {
                    return NextResponse.json(
                        {
                            error: `O número ${telefoneFormatado} já está vinculado à conta de "${outraConta[0].nome}". Para evitar misturar famílias acidentalmente, não é permitido usar um WhatsApp já cadastrado.`,
                        },
                        { status: 409 }
                    );
                }
            }

            const nomeRespFinal =
                responsavelNome || contaAtual[0]?.nome || 'Responsável';

            await sql`
        UPDATE responsaveis
        SET
          nome = ${nomeRespFinal},
          telefone = ${telefoneNorm},
          telefone_formatado = ${telefoneFormatado},
          sessao_versao = CASE
            WHEN ${telefoneMudou} THEN COALESCE(sessao_versao, 1) + 1
            ELSE COALESCE(sessao_versao, 1)
          END,
          atualizado_em = now()
        WHERE id = ${responsavelId}
      `;

            await sql`
        UPDATE alunos
        SET
          responsavel_nome = ${nomeRespFinal},
          telefone = ${telefoneNorm},
          telefone_formatado = ${telefoneFormatado}
        WHERE responsavel_id = ${responsavelId}
      `;
        }

        await sql`
      UPDATE alunos
      SET
        nome_aluno = ${nomeAluno},
        responsavel_nome = COALESCE(NULLIF(${responsavelNome}, ''), responsavel_nome),
        telefone = ${telefoneNorm},
        telefone_formatado = ${telefoneFormatado},
        colegio_nome = ${colegioNome},
        serie = ${serie}
      WHERE id = ${id}
    `;

        return NextResponse.json({
            sucesso: true,
            mensagem: 'Dados atualizados com sucesso.',
        });
    } catch (error) {
        console.error('Erro ao editar aluno/responsável no admin:', error);
        return NextResponse.json(
            { error: 'Falha ao salvar alterações.' },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest) {
    const autenticado = await verificarAdminAutenticado();
    if (!autenticado) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    try {
        await garantirEstruturaContasResponsaveis();

        const { searchParams } = new URL(req.url);
        const id = Number(searchParams.get('id') || 0);
        const responsavelIdParam = Number(searchParams.get('responsavelId') || 0);

        // Excluir uma conta inteira (apenas se desejar remover responsável e filhos sem perder histórico de aulas)
        if (responsavelIdParam > 0) {
            await sql`
        UPDATE agendamentos
        SET aluno_id = NULL
        WHERE aluno_id IN (
          SELECT id FROM alunos WHERE responsavel_id = ${responsavelIdParam}
        )
      `;

            await sql`
        DELETE FROM alunos
        WHERE responsavel_id = ${responsavelIdParam}
      `;

            await sql`
        DELETE FROM responsaveis
        WHERE id = ${responsavelIdParam}
      `;

            return NextResponse.json({
                sucesso: true,
                mensagem: 'Conta do responsável excluída (histórico de aulas preservado).',
            });
        }

        if (!id) {
            return NextResponse.json(
                { error: 'ID do aluno inválido.' },
                { status: 400 }
            );
        }

        // Preserva o histórico de agendamentos antigos desvinculando a FK antes de excluir o filho
        await sql`
      UPDATE agendamentos
      SET aluno_id = NULL
      WHERE aluno_id = ${id}
    `;

        await sql`
      DELETE FROM alunos
      WHERE id = ${id}
    `;

        return NextResponse.json({
            sucesso: true,
            mensagem: 'Cadastro do aluno excluído com sucesso.',
        });
    } catch (error) {
        console.error('Erro ao excluir aluno:', error);
        return NextResponse.json(
            { error: 'Falha ao excluir cadastro.' },
            { status: 500 }
        );
    }
}