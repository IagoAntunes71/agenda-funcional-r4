import { NextRequest, NextResponse } from 'next/server';
import { lerSessaoAdmin } from '@/lib/admin-auth';
import { garantirHistoricoAgendamento } from "@/lib/agendamento-historico";
import { garantirEstruturaContasResponsaveis } from '@/lib/cliente-auth';
import { formatarTelefone, gerarVariantesTelefone, normalizarTelefone } from '@/lib/cliente-helpers';
import { prepararCadastroAlunoR4 } from '@/lib/cadastro-aluno-r4';
import { sql } from '@/lib/db';
import { lerOperacaoR4 } from '@/lib/operacao-r4-db';
import { podeOperacao } from '@/lib/operacao-r4';

const erro = (error: string, status: number) => NextResponse.json({ error }, { status });
const texto = (v: unknown, max = 180) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const idValido = (id: number) => Number.isSafeInteger(id) && id > 0;

export async function GET(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    if (!sessao) return erro('Não autorizado.', 401);
    try {
        const cfg = await lerOperacaoR4();
        if (sessao.role === 'professor' || !podeOperacao(cfg, sessao.role, 'todosAlunos')) return erro('Sem acesso à ficha de alunos.', 403);
        await garantirEstruturaContasResponsaveis();
        await prepararCadastroAlunoR4();
        const fotos = req.nextUrl.searchParams.get('fotos');
        if (fotos !== null) {
            const ids = [...new Set(fotos.split(',').map(Number))];
            if (ids.length > 24 || !ids.every(idValido)) return erro('Lista de fotos inválida.', 400);
            const linhas = await sql`SELECT id, foto_ficha FROM alunos
                WHERE id = ANY(${ids}::int[]) AND nullif(foto_ficha,'') IS NOT NULL`;
            return NextResponse.json({ fotos: Object.fromEntries(linhas.map((linha) => [linha.id, linha.foto_ficha])) },
                { headers: { 'Cache-Control': 'private, no-store' } });
        }
        const id = Number(req.nextUrl.searchParams.get('id') || 0);
        if (!id) {
            await garantirHistoricoAgendamento();
            const alunos = await sql`WITH ultima_unidade AS (
                SELECT DISTINCT ON (ag.aluno_id) ag.aluno_id, u.nome
                FROM agendamentos ag JOIN unidades u ON u.id = ag.unidade_id
                WHERE ag.aluno_id IS NOT NULL AND ag.excluido_em IS NULL
                    AND coalesce(ag.status,'confirmado') NOT IN ('cancelado','desmarcado_com_cobranca','desmarcado_sem_cobranca')
                ORDER BY ag.aluno_id, ag.data DESC, ag.id DESC
            ) SELECT a.id, nullif(a.foto_ficha,'') IS NOT NULL AS tem_foto, unidade.nome AS unidade_nome, a.nome_aluno, a.colegio_nome, a.serie, coalesce(a.ativo,true) AS ativo,
                a.responsavel_id, coalesce(r.nome,a.responsavel_nome,'') AS responsavel_nome,
                coalesce(nullif(r.telefone,''),nullif(a.telefone,''),a.contato_importado) AS telefone,
                coalesce(nullif(trim(r.pin_hash),''),nullif(trim(a.pin_hash),'')) IS NOT NULL AS tem_pin,
                to_char(a.nascimento,'YYYY-MM-DD') AS nascimento
                FROM alunos a LEFT JOIN responsaveis r ON r.id = a.responsavel_id
                LEFT JOIN ultima_unidade unidade ON unidade.aluno_id = a.id ORDER BY a.nome_aluno, a.id`;
            return NextResponse.json({ alunos, podeEditar: podeOperacao(cfg, sessao.role, 'editarAlunos'),
                podeCriar: podeOperacao(cfg, sessao.role, 'editarAlunos') && (sessao.role === 'admin' || cfg.recepcaoCadastra),
                podeAdministrar: sessao.role === 'admin' });
        }
        if (!idValido(id)) return erro('Aluno inválido.', 400);
        const [aluno] = await sql`SELECT a.id, a.nome_aluno, a.colegio_nome, a.serie, coalesce(a.ativo,true) AS ativo,
            a.responsavel_id, to_char(a.nascimento,'YYYY-MM-DD') AS nascimento,
            a.sexo, a.cpf, a.email, a.endereco, a.foto_ficha, coalesce(r.nome,a.responsavel_nome,'') AS responsavel_nome,
            coalesce(nullif(r.telefone,''),nullif(a.telefone,''),a.contato_importado) AS telefone,
            coalesce(nullif(trim(r.pin_hash),''),nullif(trim(a.pin_hash),'')) IS NOT NULL AS tem_pin,
            coalesce(p.plano,'') AS plano, coalesce(p.orientacoes,'') AS orientacoes
            FROM alunos a LEFT JOIN responsaveis r ON r.id = a.responsavel_id
            LEFT JOIN r4_planos_alunos p ON p.aluno_id = a.id WHERE a.id = ${id}`;
        if (!aluno) return erro('Aluno não encontrado.', 404);
        const inicio = req.nextUrl.searchParams.get('inicio');
        const fim = req.nextUrl.searchParams.get('fim');
        const dia = (v: string | null) => v && /^20\d{2}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
        if ((inicio || fim) && (!dia(inicio) || !dia(fim) || Date.parse(fim!) < Date.parse(inicio!) ||
            (Date.parse(fim!) - Date.parse(inicio!)) / 86400000 > 366)) return erro('Informe um período válido de até um ano.', 400);
        const aulas = inicio && fim ? await sql`
            SELECT a.id, to_char(a.data,'YYYY-MM-DD') AS data, to_char(coalesce(a.hora_inicio,a.horario),'HH24:MI') AS inicio,
                to_char(a.hora_fim,'HH24:MI') AS fim, a.materia, a.status, a.feedback_professor AS feedback,
                p.nome AS professor, u.nome AS unidade
            FROM agendamentos a LEFT JOIN professores p ON p.id = a.professor_id LEFT JOIN unidades u ON u.id = a.unidade_id
            WHERE a.aluno_id = ${id} AND a.excluido_em IS NULL AND a.data BETWEEN ${inicio}::date AND ${fim}::date
            ORDER BY a.data, coalesce(a.hora_inicio,a.horario), a.id` : [];
        const contatos = req.nextUrl.searchParams.get('contatos') === '1' ? await sql`
            SELECT id, nome, parentesco, telefone, email, cpf, observacoes FROM r4_contatos_aluno
            WHERE aluno_id = ${id} ORDER BY id` : [];
        return NextResponse.json({ aluno, aulas, contatos, podeEditarControle: podeOperacao(cfg, sessao.role, 'condutas') });
    } catch (e) {
        console.error('Ficha do aluno:', e);
        return erro('Não foi possível carregar os alunos.', 500);
    }
}


export async function POST(req: NextRequest) {
    const sessao = await lerSessaoAdmin();
    if (!sessao) return erro('Não autorizado.', 401);
    try {
        const cfg = await lerOperacaoR4();
        if (sessao.role === 'professor' || !podeOperacao(cfg,sessao.role,'todosAlunos') || !podeOperacao(cfg,sessao.role,'editarAlunos')) return erro('Sem permissão para alterar alunos.',403);
        await garantirEstruturaContasResponsaveis();
        await prepararCadastroAlunoR4();
        const dados = await req.json();
        const id = Number(dados.id || 0);
        const acao = dados.acao;
        const nome = texto(dados.nome_aluno);
        const colegio = texto(dados.colegio_nome).replace(/\s+/g, ' ');
        const serie = texto(dados.serie);
        const telefone = normalizarTelefone(texto(dados.telefone, 30));
        const variantes = [10,11].includes(telefone.length) ? gerarVariantesTelefone(telefone) : [];
        const responsavel = texto(dados.responsavel_nome);

        if (acao === 'criar') {
            if (sessao.role === 'atendimento' && !cfg.recepcaoCadastra) return erro('Cadastro indisponível para a recepção.',403);
            if (nome.length < 2 || (dados.telefone && !variantes.length)) return erro('Confira nome e WhatsApp.',400);
            const [aluno] = await sql`INSERT INTO alunos (nome_aluno, colegio_nome, serie, telefone, responsavel_nome, contato_importado, ativo)
                VALUES (${nome}, ${colegio}, ${serie}, '', ${responsavel}, ${telefone}, true) RETURNING id`;
            return NextResponse.json({ id: aluno.id });
        }
        if (!idValido(id)) return erro('Aluno inválido.',400);
        if (acao === 'perfil') {
            const nascimento = texto(dados.nascimento, 10);
            if (nome.length < 2 || (nascimento && (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento) || !Number.isFinite(Date.parse(nascimento)) ||
                new Date(nascimento).toISOString().slice(0,10) !== nascimento))) return erro('Confira nome e nascimento.',400);
            const foto = typeof dados.foto_ficha === 'string' ? dados.foto_ficha : null;
            if (foto && (foto.length > 350000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(foto))) return erro('Foto inválida ou muito grande.',400);
            const linhas = await sql`UPDATE alunos SET nome_aluno = ${nome}, colegio_nome = ${colegio}, serie = ${serie},
                colegio_id = CASE WHEN colegio_nome = ${colegio} THEN colegio_id ELSE
                    (SELECT id FROM colegios WHERE lower(nome) = lower(${colegio}) ORDER BY id LIMIT 1) END,
                foto_ficha = coalesce(${foto},foto_ficha), nascimento = nullif(${nascimento},'')::date, sexo = ${texto(dados.sexo, 30)}, cpf = ${texto(dados.cpf, 20)}
                WHERE id = ${id} RETURNING id`;
            return linhas.length ? NextResponse.json({ id }) : erro('Aluno não encontrado.',404);
        }
        if (acao === 'contatos') {
            if (dados.telefone && !variantes.length) return erro('Informe um WhatsApp válido com DDD.',400);
            const linhas = await sql`UPDATE alunos SET email = ${texto(dados.email,254)}, endereco = ${texto(dados.endereco,1000)},
                contato_importado = CASE WHEN responsavel_id IS NULL THEN ${telefone} ELSE contato_importado END,
                responsavel_nome = CASE WHEN responsavel_id IS NULL THEN ${responsavel} ELSE responsavel_nome END
                WHERE id = ${id} RETURNING id`;
            return linhas.length ? NextResponse.json({ id }) : erro('Aluno não encontrado.',404);
        }
        if (acao === 'contato_extra') {
            const contato = Number(dados.contato_id || 0);
            const nomeContato = texto(dados.nome);
            if (nomeContato.length < 2 || (dados.telefone && !variantes.length)) return erro('Confira nome e telefone do contato.',400);
            const parentesco = texto(dados.parentesco,80);
            const email = texto(dados.email,254);
            const cpf = texto(dados.cpf,20);
            const observacoes = texto(dados.observacoes,1000);
            const linhas = idValido(contato) ? await sql`UPDATE r4_contatos_aluno SET nome = ${nomeContato},
                telefone = ${telefone}, parentesco = ${parentesco}, email = ${email}, cpf = ${cpf}, observacoes = ${observacoes}
                WHERE id = ${contato} AND aluno_id = ${id} RETURNING id` : await sql`
                INSERT INTO r4_contatos_aluno (aluno_id,nome,telefone,parentesco,email,cpf,observacoes)
                SELECT id,${nomeContato},${telefone},${parentesco},${email},${cpf},${observacoes} FROM alunos WHERE id = ${id}
                RETURNING id`;
            return linhas.length ? NextResponse.json({ id }) : erro('Contato ou aluno não encontrado.',404);
        }
        if (acao === 'remover_contato') {
            if (dados.confirmado !== 'on' || !idValido(Number(dados.contato_id))) return erro('Confirme a remoção.',400);
            const linhas = await sql`DELETE FROM r4_contatos_aluno WHERE id = ${Number(dados.contato_id)} AND aluno_id = ${id} RETURNING id`;
            return linhas.length ? NextResponse.json({ id }) : erro('Contato não encontrado.',404);
        }
        if (acao === 'vincular') {
            if (sessao.role !== 'admin' || dados.confirmado !== 'on' || !variantes.length) return erro('Confirme o responsável e o WhatsApp.',400);
            const [, linhas] = await sql.transaction([
                sql`SELECT pg_advisory_xact_lock(840421)`,
                sql`WITH alvo AS (
                    SELECT id, responsavel_nome FROM alunos WHERE id = ${id} AND responsavel_id IS NULL FOR UPDATE
                ), existentes AS (
                    SELECT id, nome, telefone, telefone_formatado, conflito_migracao
                    FROM responsaveis WHERE telefone = ANY(${variantes}::text[])
                ), nova AS (
                    INSERT INTO responsaveis (nome, telefone, telefone_formatado)
                    SELECT responsavel_nome, ${telefone}, ${formatarTelefone(telefone)} FROM alvo
                    WHERE NOT EXISTS (SELECT 1 FROM existentes) AND nullif(trim(responsavel_nome),'') IS NOT NULL
                    RETURNING id, nome, telefone, telefone_formatado
                ), conta AS (
                    SELECT id, nome, telefone, telefone_formatado FROM existentes
                    WHERE NOT coalesce(conflito_migracao,false) AND (SELECT count(*) FROM existentes) = 1
                    UNION ALL SELECT id, nome, telefone, telefone_formatado FROM nova
                )
                UPDATE alunos a SET responsavel_id = conta.id, responsavel_nome = conta.nome,
                    telefone = conta.telefone, telefone_formatado = coalesce(conta.telefone_formatado,${formatarTelefone(telefone)})
                FROM alvo CROSS JOIN conta WHERE a.id = alvo.id
                    AND NOT EXISTS (SELECT 1 FROM alunos outro WHERE outro.responsavel_id = conta.id
                        AND outro.id <> a.id AND lower(trim(outro.nome_aluno)) = lower(trim(a.nome_aluno)))
                RETURNING a.id`,
            ]);
            return linhas.length ? NextResponse.json({ id }) : erro('Confira se o aluno já está nessa família, se a conta tem conflito ou se falta o nome do responsável.',409);
        }
        if (acao === 'situacao' && ['true','false'].includes(dados.ativo)) {
            if (sessao.role !== 'admin' || dados.confirmado !== 'on') return erro('Apenas administradores podem confirmar a alteração de situação.',403);
            const linhas = await sql`UPDATE alunos SET ativo = ${dados.ativo === 'true'} WHERE id = ${id} RETURNING id`;
            return linhas.length ? NextResponse.json({ id }) : erro('Aluno não encontrado.',404);
        }
        return erro('Ação inválida.',400);
    } catch (e) {
        if (e && typeof e === 'object' && 'code' in e && e.code === '23505') return erro('Este ID já pertence a outro aluno.',409);
        console.error('Salvar ficha do aluno:', e);
        return erro('Não foi possível salvar a ficha.',500);
    }
}
