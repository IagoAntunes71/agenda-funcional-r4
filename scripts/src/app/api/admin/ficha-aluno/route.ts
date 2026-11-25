import { NextRequest, NextResponse } from 'next/server';
import { lerSessaoAdmin } from '@/lib/admin-auth';
import { garantirEstruturaContasResponsaveis } from '@/lib/cliente-auth';
import { formatarTelefone, gerarVariantesTelefone, normalizarTelefone } from '@/lib/cliente-helpers';
import { prepararCadastroAlunoR4 } from '@/lib/cadastro-aluno-r4';
import { chavesColegioClinCare, inferirSerieClinCare, padronizarColegioClinCare, validarAlunoClinCare } from '@/lib/importacao-alunos-clincare';
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
        const id = Number(req.nextUrl.searchParams.get('id') || 0);
        if (!id) {
            const alunos = await sql`SELECT a.id, a.nome_aluno, a.colegio_nome, a.serie, coalesce(a.ativo,true) AS ativo,
                a.clin_care_aluno_id, a.responsavel_id, coalesce(r.nome,a.responsavel_nome,'') AS responsavel_nome,
                coalesce(nullif(r.telefone,''),nullif(a.telefone,''),a.contato_importado) AS telefone,
                coalesce(nullif(trim(r.pin_hash),''),nullif(trim(a.pin_hash),'')) IS NOT NULL AS tem_pin,
                to_char(a.nascimento,'YYYY-MM-DD') AS nascimento
                FROM alunos a LEFT JOIN responsaveis r ON r.id = a.responsavel_id ORDER BY a.nome_aluno, a.id`;
            return NextResponse.json({ alunos, podeEditar: podeOperacao(cfg, sessao.role, 'editarAlunos'),
                podeCriar: podeOperacao(cfg, sessao.role, 'editarAlunos') && (sessao.role === 'admin' || cfg.recepcaoCadastra),
                podeImportar: sessao.role === 'admin' });
        }
        if (!idValido(id)) return erro('Aluno inválido.', 400);
        const [aluno] = await sql`SELECT a.id, a.nome_aluno, a.colegio_nome, a.serie, coalesce(a.ativo,true) AS ativo,
            a.responsavel_id, a.clin_care_aluno_id, to_char(a.nascimento,'YYYY-MM-DD') AS nascimento,
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
            SELECT id, nome, parentesco, telefone, email, cpf, observacoes, principal_clincare FROM r4_contatos_aluno
            WHERE aluno_id = ${id} ORDER BY id` : [];
        return NextResponse.json({ aluno, aulas, contatos, podeEditarControle: podeOperacao(cfg, sessao.role, 'condutas') });
    } catch (e) {
        console.error('Ficha do aluno:', e);
        return erro('Não foi possível carregar os alunos.', 500);
    }
}

function cadastroColegio(nome: string) {
    const chaves = chavesColegioClinCare(nome);
    return sql`
        WITH candidato AS (
            SELECT id,nome FROM colegios WHERE translate(lower(regexp_replace(trim(nome), '[[:space:]]+', ' ', 'g')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') = ANY(${chaves}::text[])
            ORDER BY (lower(regexp_replace(trim(nome), '[[:space:]]+', ' ', 'g')) = lower(${nome})) DESC, aprovado DESC,id LIMIT 1
        ), renomeado AS (
            UPDATE colegios SET nome = ${nome}
            WHERE id = (SELECT id FROM candidato)
                AND ${chaves.length > 1} AND nome <> ${nome}
            RETURNING id
        ), alunos_ajustados AS (
            UPDATE alunos SET colegio_nome = ${nome}
            WHERE colegio_id IN (SELECT id FROM renomeado)
        )
        INSERT INTO colegios(nome, aprovado)
        SELECT ${nome}, true WHERE NOT EXISTS (SELECT 1 FROM candidato)`;
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
        const importacao = acao === 'importar' || acao === 'importar_ficha';
        const colegioInformado = texto(dados.colegio_nome).replace(/\s+/g, ' ');
        const colegio = importacao ? padronizarColegioClinCare(colegioInformado) : colegioInformado;
        const serie = importacao ? inferirSerieClinCare(texto(dados.serie)) : texto(dados.serie);
        const telefone = normalizarTelefone(texto(dados.telefone, 30));
        const variantes = [10,11].includes(telefone.length) ? gerarVariantesTelefone(telefone) : [];
        const responsavel = texto(dados.responsavel_nome);

        if (acao === 'importar_ficha') {
            if (sessao.role !== 'admin') return erro('Apenas administradores podem importar.', 403);
            const criar = dados.novo === true && id === 0;
            if (!validarAlunoClinCare(dados) || (!idValido(id) && !criar)) return erro('Ficha ou destino inválido.',400);
            const externo = dados.clin_care_aluno_id;
            const contatos = dados.responsaveis.map((item) => ({
                ...item, principal: item.principal || dados.responsaveis.length === 1, telefone: normalizarTelefone(item.telefone),
                chave: item.nome.trim().normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/\s+/g,' ') +
                    '|' + normalizarTelefone(item.telefone),
            }));
            if (new Set(contatos.map((item) => item.chave)).size !== contatos.length) {
                return erro('Há responsáveis com o mesmo nome e telefone nesta ficha. Revise o arquivo.',409);
            }
            const principal = contatos.find((item) => item.principal) ?? (contatos.length === 1 ? contatos[0] : undefined);
            const gravarFicha = sql`
                WITH escola AS (SELECT id,nome FROM colegios WHERE ${colegio.length >= 2}
                    AND translate(lower(regexp_replace(trim(nome), '[[:space:]]+', ' ', 'g')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') = ANY(${chavesColegioClinCare(colegio)}::text[]) ORDER BY (nome = ${colegio}) DESC, aprovado DESC,id LIMIT 1), existente AS (
                    UPDATE alunos SET clin_care_aluno_id = ${externo},
                        colegio_id = coalesce((SELECT id FROM escola),colegio_id),
                        colegio_nome = coalesce((SELECT nome FROM escola),colegio_nome),
                        serie = coalesce(nullif(${serie},''),serie),
                        nascimento = coalesce(nascimento, nullif(${dados.nascimento},'')::date),
                        endereco = coalesce(nullif(endereco,''),${dados.endereco}),
                        contato_importado = coalesce(nullif(${principal?.telefone || ''},''),contato_importado),
                        responsavel_nome = coalesce(nullif(trim(responsavel_nome),''),${principal?.nome || ''})
                    WHERE id = ${id} AND (clin_care_aluno_id IS NULL OR clin_care_aluno_id = ${externo})
                    RETURNING id
                ), novo AS (
                    INSERT INTO alunos(nome_aluno,colegio_id,colegio_nome,serie,telefone,responsavel_nome,clin_care_aluno_id,contato_importado,
                        ativo,nascimento,endereco)
                    SELECT ${dados.nome_aluno.trim()},(SELECT id FROM escola),coalesce((SELECT nome FROM escola),''),${serie},'',${principal?.nome || ''},${externo},
                        ${principal?.telefone || ''},true,nullif(${dados.nascimento},'')::date,${dados.endereco}
                    WHERE ${criar}
                    ON CONFLICT (clin_care_aluno_id) DO NOTHING RETURNING id
                ), alvo AS (
                    SELECT id FROM existente UNION ALL SELECT id FROM novo
                ), gravados AS (
                    INSERT INTO r4_contatos_aluno(aluno_id,nome,telefone,email,cpf,chave_importacao,principal_clincare)
                    SELECT alvo.id, item.nome, item.telefone, item.email, item.cpf, item.chave, item.principal
                    FROM alvo CROSS JOIN jsonb_to_recordset(${JSON.stringify(contatos)}::jsonb)
                        AS item(nome text, telefone text, email text, cpf text, chave text, principal boolean)
                    ON CONFLICT (aluno_id,chave_importacao) DO UPDATE SET
                        email = coalesce(nullif(excluded.email,''),r4_contatos_aluno.email),
                        cpf = coalesce(nullif(excluded.cpf,''),r4_contatos_aluno.cpf),
                        principal_clincare = excluded.principal_clincare
                    RETURNING id
                )
                SELECT id, (SELECT count(*)::int FROM gravados) AS contatos FROM alvo`;
            const [resultado] = colegio.length >= 2
                ? (await sql.transaction([sql`LOCK TABLE colegios IN SHARE ROW EXCLUSIVE MODE`, cadastroColegio(colegio), gravarFicha]))[2]
                : await gravarFicha;
            if (!resultado) return erro('Já existe um vínculo para este ID. Reabra a importação e confira o cadastro.',409);
            return NextResponse.json(resultado);
        }
        if (acao === 'importar' || acao === 'criar') {
            if (acao === 'importar' && sessao.role !== 'admin') return erro('Apenas administradores podem importar.',403);
            if (acao === 'criar' && sessao.role === 'atendimento' && !cfg.recepcaoCadastra) return erro('Cadastro indisponível para a recepção.',403);
            const externo = acao === 'importar' ? texto(dados.clin_care_aluno_id) : null;
            if (nome.length < 2 || (acao === 'importar' && !externo) || (dados.telefone && !variantes.length)) return erro('Confira nome, ID do Clin Care e WhatsApp.',400);
            if (externo && !dados.novo && !idValido(id)) return erro('Escolha o cadastro existente ou confirme um novo aluno.',400);
            if (externo) {
                const gravarAluno = sql`
                    WITH escola AS (
                        SELECT id,nome FROM colegios WHERE ${colegio.length >= 2}
                        AND translate(lower(regexp_replace(trim(nome), '[[:space:]]+', ' ', 'g')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') = ANY(${chavesColegioClinCare(colegio)}::text[])
                        ORDER BY (nome = ${colegio}) DESC, aprovado DESC,id LIMIT 1
                    ), vinculado AS (
                        UPDATE alunos SET clin_care_aluno_id = ${externo},
                            contato_importado = coalesce(nullif(${telefone},''),contato_importado),
                            colegio_id = coalesce((SELECT id FROM escola),colegio_id),
                            colegio_nome = coalesce((SELECT nome FROM escola),colegio_nome),
                            serie = coalesce(nullif(${serie},''),serie)
                        WHERE id = ${id} AND (clin_care_aluno_id IS NULL OR clin_care_aluno_id = ${externo}) RETURNING id
                    ), novo AS (
                        INSERT INTO alunos(nome_aluno,colegio_id,colegio_nome,serie,telefone,responsavel_nome,clin_care_aluno_id,contato_importado,ativo)
                        SELECT ${nome},(SELECT id FROM escola),coalesce((SELECT nome FROM escola),''),${serie},'',${responsavel},${externo},${telefone},true
                        WHERE ${id === 0 && dados.novo === true}
                        ON CONFLICT (clin_care_aluno_id) DO NOTHING RETURNING id
                    ) SELECT id FROM vinculado UNION ALL SELECT id FROM novo`;
                const [registro] = colegio.length >= 2
                    ? (await sql.transaction([sql`LOCK TABLE colegios IN SHARE ROW EXCLUSIVE MODE`, cadastroColegio(colegio), gravarAluno]))[2]
                    : await gravarAluno;
                return registro ? NextResponse.json(registro) : erro('Aluno já vinculado ou cadastro inexistente.',409);
            }
            const [aluno] = await sql`INSERT INTO alunos (nome_aluno, colegio_nome, serie, telefone, responsavel_nome,
                    clin_care_aluno_id, contato_importado, ativo)
                VALUES (${nome}, ${colegio}, ${serie}, '', ${responsavel}, ${externo}, ${telefone}, true)
                ON CONFLICT (clin_care_aluno_id) DO NOTHING RETURNING id`;
            if (!aluno && externo) return NextResponse.json({ existente: true });
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
