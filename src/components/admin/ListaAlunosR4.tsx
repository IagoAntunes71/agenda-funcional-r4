'use client';

import { useLayoutR4 } from './EditorLayoutR4';
import { TextoLayoutR4 } from './ConteudoLayoutR4';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Building2, CalendarDays, Download, GraduationCap, KeyRound, Phone, Plus, Search, Upload, UserRound } from 'lucide-react';
import { formatarTelefone } from '@/lib/cliente-helpers';
import { obterIniciais } from './types';
import css from './ListaAlunosR4.module.css';

export type Aluno = {
    id: number; nome_aluno: string; colegio_nome: string; serie: string; ativo: boolean; clin_care_aluno_id: string | null;
    responsavel_id: number | null; responsavel_nome: string; telefone: string; tem_pin: boolean; nascimento: string | null;
    unidade_nome?: string | null; tem_foto?: boolean;
};

const porPagina = 24;
const quantidade = new Intl.NumberFormat('pt-BR');
const caminho = (id: number) => '/admin/alunos?aluno=' + id;
const nomeLimpo = (nome: string) => nome.replace(/^\s*#\s*/, '').trim() || 'Aluno sem nome';
const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
function portal(a: Aluno) {
    return !a.ativo ? 'Inativo' : a.responsavel_id && a.tem_pin ? 'Portal ativo' : 'Sem acesso ao portal';
}

function exportar(alunos: Aluno[]) {
    const colunas = ['Nome', 'Telefone', 'Responsável', 'Série', 'Colégio', 'Unidade da última aula', 'Portal'];
    const linhas = alunos.map((a) => [nomeLimpo(a.nome_aluno), formatarTelefone(a.telefone), a.responsavel_nome, a.serie,
        a.colegio_nome, a.unidade_nome ?? '', portal(a)]);
    const csv = [colunas, ...linhas].map((linha) => linha.map((valor) => {
        const texto = String(valor ?? '');
        const seguro = /^[\s]*[=+@-]|^[\t\r\n]/.test(texto) ? "'" + texto : texto;
        return '"' + seguro.replaceAll('"', '""') + '"';
    }).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'alunos-r4.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Dado({ icone, texto, ausente, badge }: { icone: ReactNode; texto: string; ausente?: boolean; badge?: boolean }) {
    return <li data-ausente={ausente}>{icone}<span title={texto} className={badge ? css.badge : undefined}>{texto}</span></li>;
}

function CartaoAluno({ aluno, foto }: { aluno: Aluno; foto?: string }) {
    const [fotoFalhou, setFotoFalhou] = useState('');
    const nome = nomeLimpo(aluno.nome_aluno);
    const escola = [aluno.serie, aluno.colegio_nome].filter(Boolean).join(' · ');
    const titulo = [nome, escola].filter(Boolean).join(' — ');
    const cor = (normalizar(nome).codePointAt(0) ?? 0) % 4;
    return <article className={css.card} data-cor={cor}>
        <div className={css.topoCard}>
            <span className={css.avatar} aria-hidden="true">
                {foto && fotoFalhou !== foto ?
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={foto} alt="" onError={() => setFotoFalhou(foto)} /> : obterIniciais(nome)}
            </span>
            <Link className={css.agenda} href={caminho(aluno.id) + '&secao=calendario'} title="Ver agenda do aluno"
                aria-label={'Ver agenda do aluno: ' + nome}><CalendarDays size={17} /></Link>
        </div>
        <Link className={css.titulo} href={caminho(aluno.id)} title={titulo}>{titulo}</Link>
        <ul className={css.dados}>
            <Dado icone={<Phone />} texto={formatarTelefone(aluno.telefone) || 'Telefone não cadastrado'} ausente={!aluno.telefone} />
            <Dado icone={<UserRound />} texto={aluno.responsavel_nome || 'Responsável não cadastrado'} ausente={!aluno.responsavel_nome} />
            <Dado icone={<GraduationCap />} texto={escola || 'Dados escolares pendentes'} ausente={!escola} />
            <Dado icone={<KeyRound />} texto={portal(aluno)} badge ausente={portal(aluno) !== 'Portal ativo'} />
            <Dado icone={<Building2 />} texto={aluno.unidade_nome || 'Unidade não identificada'} ausente={!aluno.unidade_nome} />
        </ul>
    </article>;
}

export default function ListaAlunosR4({ alunos, modo, setModo, podeCriar, podeImportar, carregando, revisao }: {
    alunos: Aluno[]; modo: string; setModo: (modo: string) => void; podeCriar: boolean; podeImportar: boolean;
    carregando: boolean; revisao: number;
}) {
    const layout = useLayoutR4();
    const [busca, setBusca] = useState('');
    const [colegio, setColegio] = useState('');
    const [serie, setSerie] = useState('');
    const [unidade, setUnidade] = useState('');
    const [inativos, setInativos] = useState(false);
    const [pagina, setPagina] = useState(0);
    const [fotos, setFotos] = useState<{ chave: string; dados: Record<number,string> }>();
    const opcoes = (campo: 'colegio_nome' | 'serie' | 'unidade_nome') => [...new Set(alunos.flatMap((a) => {
        const valor = a[campo];
        return valor ? [valor] : [];
    }))].sort((a,b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    const termo = normalizar(busca);
    const digitos = busca.replace(/\D/g, '');
    const resultado = alunos.filter((a) => (inativos || a.ativo) && (!colegio || a.colegio_nome === colegio) &&
        (!serie || a.serie === serie) && (!unidade || a.unidade_nome === unidade) &&
        (normalizar([a.nome_aluno,a.responsavel_nome,a.telefone,a.colegio_nome,a.serie,a.unidade_nome].join(' ')).includes(termo) ||
            (digitos.length >= 4 && a.telefone.replace(/\D/g,'').includes(digitos))));
    const paginaAtual = Math.min(pagina, Math.max(0, Math.ceil(resultado.length / porPagina) - 1));
    const visiveis = resultado.slice(paginaAtual * porPagina, (paginaAtual + 1) * porPagina);
    const idsFotos = modo === 'alunos' ? visiveis.filter((a) => a.tem_foto).map((a) => a.id).join(',') : '';
    const chaveFotos = idsFotos + ':' + revisao;

    useEffect(() => {
        if (!idsFotos) return;
        const pedido = new AbortController();
        fetch('/api/admin/ficha-aluno?fotos=' + idsFotos, { cache: 'no-store', signal: pedido.signal })
            .then(async (res) => {
                if (!res.ok) return;
                const json = await res.json();
                if (!pedido.signal.aborted) setFotos({ chave: chaveFotos, dados: json.fotos });
            }).catch(() => undefined);
        return () => pedido.abort();
    }, [idsFotos, chaveFotos]);

    return <>
        <div className={css.toolbar} {...layout?.item("lista_ferramentas", "listagem", "Barra de ferramentas")} role="group" aria-label="Ferramentas de alunos">
            <nav className={css.segmentado} aria-label="Cadastros">
                <button type="button" {...layout?.item("aba_alunos", "abas_cadastro", "Alunos")} aria-pressed={modo !== 'portal'} onClick={() => setModo('alunos')}>
                    <TextoLayoutR4 id="aba_alunos" campo="titulo" texto="Alunos" />
                </button>
                <button type="button" {...layout?.item("aba_contas", "abas_cadastro", "Contas do Portal")} aria-pressed={modo === 'portal'} onClick={() => setModo('portal')}>
                    <TextoLayoutR4 id="aba_contas" campo="titulo" texto="Contas do Portal" />
                </button>
            </nav>
            {modo === 'alunos' && <div className={css.filtros}>
                <label className={css.busca}><Search size={16} aria-hidden="true" />
                    <input type="search" aria-label="Buscar alunos" placeholder="Aluno, responsável ou WhatsApp" value={busca}
                        onChange={(e) => { setBusca(e.target.value); setPagina(0); }} />
                </label>
                {([
                    ['Unidade', 'unidade_nome', unidade, setUnidade],
                    ['Colégio', 'colegio_nome', colegio, setColegio],
                    ['Série', 'serie', serie, setSerie],
                ] as const).map(([rotulo, campo, valor, alterar]) => <select key={campo} value={valor} aria-label={'Filtrar por ' + rotulo.toLowerCase()}
                    onChange={(e) => { alterar(e.target.value); setPagina(0); }}>
                    <option value="">{rotulo}</option>{opcoes(campo).map((v) => <option key={v}>{v}</option>)}
                </select>)}
            </div>}
            <div className={css.acoes}>
                {modo === 'alunos' && <>
                    <label className={css.inativos}><input type="checkbox" checked={inativos}
                        onChange={(e) => { setInativos(e.target.checked); setPagina(0); }} /> Exibir inativos</label>
                    <button type="button" className={css.icone} aria-label="Exportar alunos filtrados" title="Exportar alunos filtrados"
                        disabled={!resultado.length} onClick={() => exportar(resultado)}><Download size={16} /></button>
                </>}
                {podeImportar && <button type="button" className={css.icone} aria-label="Importar Clin Care" title="Importar Clin Care"
                    onClick={() => setModo('importar')}><Upload size={16} /></button>}
                {podeCriar && <button type="button" className={'r4-acao ' + css.novo} onClick={() => setModo('novo')}>
                    <Plus size={16} /> Novo aluno
                </button>}
            </div>
        </div>
        {modo === 'alunos' && (carregando ? <p role="status">Carregando alunos…</p> : <>
            <p className={css.contagem} aria-live="polite">{quantidade.format(resultado.length)} {resultado.length === 1 ? 'aluno' : 'alunos'}</p>
            {!resultado.length && <p className={css.vazio}>Nenhum aluno encontrado.</p>}
            <div className={css.grade} {...layout?.item("lista_grade", "listagem", "Grade de alunos")}>{visiveis.map((a) => <CartaoAluno key={a.id} aluno={a}
                foto={fotos?.chave === chaveFotos ? fotos.dados[a.id] : undefined} />)}</div>
            {resultado.length > porPagina && <nav className={css.paginacao} aria-label="Paginação de alunos">
                <button type="button" disabled={!paginaAtual} onClick={() => setPagina(paginaAtual - 1)}>Anterior</button>
                <span>Página {paginaAtual + 1} de {Math.ceil(resultado.length / porPagina)}</span>
                <button type="button" disabled={(paginaAtual + 1) * porPagina >= resultado.length}
                    onClick={() => setPagina(paginaAtual + 1)}>Próxima</button>
            </nav>}
        </>)}
    </>;
}
