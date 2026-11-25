'use client';
import { useLayoutR4 } from './EditorLayoutR4';
import { useTextoR4 } from '@/components/TextosInterfaceR4';


import { useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { obterMetaStatusR4 } from '@/lib/agenda-status-r4';
import css from './AbaProfessores.module.css';
import {
    ArrowLeft,
    ArrowRight,
    Check,
    Plus,
    Search,
    Sun,
    X,
} from 'lucide-react';
import {
    MapaMateriasSeries,
    SERIES_ENSINO_MEDIO,
    SERIES_ESCOLARES,
    SERIES_FUNDAMENTAL_1,
    SERIES_FUNDAMENTAL_2,
    SERIES_FUNDAMENTAL_COMPLETO,
    resumirSeriesCurto,
} from '@/lib/cliente-helpers';
import { gerarTodosSlotsProfessor } from '@/lib/horarios-reforco';
import { formatarDataBR, obterIniciais, type AgendamentoAdmin, type ProfessorAdmin, type TemaClasses, type UnidadeAdmin } from './types';

function extrairListaMaterias(texto: string): string[] {
    return Array.from(
        new Set(
            texto
                .split(',')
                .map((m) => m.trim())
                .filter(Boolean)
        )
    );
}

interface ProfessorAgrupadoLista extends ProfessorAdmin {
    unidades_ids: number[];
    unidades_nomes: string[];
}

function SeletorSeriesPorMateria({
                                     materiasTexto,
                                     mapaAtual,
                                     onChangeMapa,
                                     escuro,
                                 }: {
    materiasTexto: string;
    mapaAtual: MapaMateriasSeries;
    onChangeMapa: (novo: MapaMateriasSeries) => void;
    escuro: boolean;
}) {
    const textoR4 = useTextoR4();
    const listaMaterias = extrairListaMaterias(materiasTexto);
    if (listaMaterias.length === 0) return null;

    function obterSeriesMateria(materia: string): string[] {
        const chave = Object.keys(mapaAtual).find(
            (k) => k.trim().toLowerCase() === materia.toLowerCase()
        );
        return chave && Array.isArray(mapaAtual[chave]) ? mapaAtual[chave] : [];
    }

    function definirSeriesMateria(materia: string, novasSeries: string[]) {
        const proximo: MapaMateriasSeries = {};
        for (const [k, v] of Object.entries(mapaAtual)) {
            if (k.trim().toLowerCase() !== materia.toLowerCase() && v.length > 0) {
                proximo[k] = v;
            }
        }
        if (novasSeries.length > 0) {
            proximo[materia] = novasSeries;
        }
        onChangeMapa(proximo);
    }

    function alternarSerie(materia: string, serie: string) {
        const atuais = obterSeriesMateria(materia);
        const existe = atuais.includes(serie);
        const atualizadas = existe
            ? atuais.filter((s) => s !== serie)
            : SERIES_ESCOLARES.filter((s) => atuais.includes(s) || s === serie);
        definirSeriesMateria(materia, atualizadas);
    }

    return (
        <div
            className={`border rounded-xl p-3.5 space-y-3 ${
                escuro
                    ? 'bg-[#0E1217] border-[#232B35]'
                    : 'bg-stone-50 border-stone-200/80'
            }`}
        >
            <div>
                <p className="text-xs font-bold text-[#1496A1]">{textoR4("Séries permitidas por matéria")}</p>
                <p
                    className={`text-[11px] ${
                        escuro ? 'text-stone-400' : 'text-stone-500'
                    }`}
                >{textoR4("Deixe em") + ' '}<strong>{textoR4("Todas as séries")}</strong>{' ' + textoR4("ou clique nas séries específicas para restringir o agendamento dos pais.")}</p>
            </div>

            <div className="space-y-3">
                {listaMaterias.map((mat) => {
                    const selecionadas = obterSeriesMateria(mat);
                    const todasAtivas = selecionadas.length === 0;

                    return (
                        <div
                            key={mat}
                            className={`border rounded-xl p-3 space-y-2.5 ${
                                escuro
                                    ? 'bg-[#151A21] border-[#232B35]'
                                    : 'bg-white border-stone-200'
                            }`}
                        >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span
                                    className={`text-xs font-bold ${
                                        escuro ? 'text-stone-100' : 'text-stone-900'
                                    }`}
                                >
                                    {mat}
                                </span>
                                <span className="text-[11px] font-semibold text-[#1496A1]">
                                    {resumirSeriesCurto(selecionadas)}
                                </span>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => definirSeriesMateria(mat, [])}
                                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold border cursor-pointer ${
                                        todasAtivas
                                            ? 'bg-[#0E7C86] border-[#1496A1] text-white'
                                            : escuro
                                                ? 'bg-[#0E1217] border-[#232B35] text-stone-400'
                                                : 'bg-stone-100 border-stone-200 text-stone-600'
                                    }`}
                                >{textoR4("Todas as séries")}</button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        definirSeriesMateria(mat, SERIES_FUNDAMENTAL_1)
                                    }
                                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold border cursor-pointer ${
                                        escuro
                                            ? 'bg-[#0E1217] border-[#232B35] text-stone-300 hover:border-[#0E7C86]'
                                            : 'bg-stone-100 border-stone-200 text-stone-700 hover:border-[#0E7C86]'
                                    }`}
                                >{textoR4("Fund. I (1º-5º)")}</button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        definirSeriesMateria(mat, SERIES_FUNDAMENTAL_2)
                                    }
                                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold border cursor-pointer ${
                                        escuro
                                            ? 'bg-[#0E1217] border-[#232B35] text-stone-300 hover:border-[#0E7C86]'
                                            : 'bg-stone-100 border-stone-200 text-stone-700 hover:border-[#0E7C86]'
                                    }`}
                                >{textoR4("Fund. II (6º-9º)")}</button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        definirSeriesMateria(mat, SERIES_FUNDAMENTAL_COMPLETO)
                                    }
                                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold border cursor-pointer ${
                                        escuro
                                            ? 'bg-[#0E1217] border-[#232B35] text-stone-300 hover:border-[#0E7C86]'
                                            : 'bg-stone-100 border-stone-200 text-stone-700 hover:border-[#0E7C86]'
                                    }`}
                                >{textoR4("Fundamental (1º-9º)")}</button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        definirSeriesMateria(mat, SERIES_ENSINO_MEDIO)
                                    }
                                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold border cursor-pointer ${
                                        escuro
                                            ? 'bg-[#0E1217] border-[#232B35] text-stone-300 hover:border-[#0E7C86]'
                                            : 'bg-stone-100 border-stone-200 text-stone-700 hover:border-[#0E7C86]'
                                    }`}
                                >{textoR4("Médio + ENEM")}</button>
                            </div>

                            <div className="flex flex-wrap gap-1">
                                {SERIES_ESCOLARES.map((serie) => {
                                    const marcada = selecionadas.includes(serie);
                                    const rotuloCurto = serie
                                        .replace(' - Ensino Fundamental', ' Fund.')
                                        .replace(' - Ensino Médio', ' Médio')
                                        .replace('Pré-Vestibular / ENEM', 'ENEM')
                                        .replace('Outra Série / Curso', 'Outros');

                                    return (
                                        <button
                                            key={serie}
                                            type="button"
                                            onClick={() => alternarSerie(mat, serie)}
                                            className={`px-2 py-0.5 rounded-md text-[10px] font-medium border transition cursor-pointer ${
                                                marcada
                                                    ? 'bg-[#0E7C86]/25 border-[#1496A1] text-[#39B8C4]'
                                                    : escuro
                                                        ? 'bg-[#0E1217] border-[#232B35] text-stone-400 hover:text-stone-200'
                                                        : 'bg-stone-50 border-stone-200 text-stone-500 hover:text-stone-800'
                                            }`}
                                        >
                                            {rotuloCurto}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

type Rascunho = {
    nome: string;
    unidades_ids: number[];
    materias: string;
    materias_series: MapaMateriasSeries;
    manha_ativo: boolean;
    manha_inicio: string;
    manha_fim: string;
    hora_inicio: string;
    hora_fim: string;
};

const rota = '/admin/professores';
const chaveProfessor = (p: ProfessorAdmin) => p.grupo_professor ? 'grupo:' + p.grupo_professor : 'nm:' + p.nome.trim().toLowerCase();

async function gravarProfessor(metodo: 'POST' | 'PATCH', payload: object) {
    const resposta = await fetch('/api/admin/professores', {
        method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (!resposta.ok) {
        const dados = await resposta.json().catch(() => null);
        throw new Error(dados?.error || 'Não foi possível salvar o professor.');
    }
}

function FormularioProfessor({ professor, unidades, escuro, classes, aoSalvar, formId, pendente, setPendente }: {
    professor?: ProfessorAgrupadoLista; unidades: UnidadeAdmin[]; escuro: boolean; classes: TemaClasses;
    aoSalvar: (dados: Rascunho) => Promise<void>; formId: string; pendente: boolean; setPendente: (valor: boolean) => void;
}) {
    const t = useTextoR4();
    const { clsInput, clsSubCard } = classes;
    const [erro, setErro] = useState('');
    const [dados, setDados] = useState<Rascunho>(() => ({
        nome: professor?.nome ?? '',
        unidades_ids: professor?.unidades_ids ?? (unidades[0] ? [unidades[0].id] : []),
        materias: professor?.materias?.join(', ') ?? '', materias_series: professor?.materias_series ?? {},
        manha_ativo: Boolean(professor?.manha_ativo), manha_inicio: professor?.manha_inicio || '08:00',
        manha_fim: professor?.manha_fim || '11:20', hora_inicio: professor?.hora_inicio || '14:10',
        hora_fim: professor?.hora_fim || '20:50',
    }));
    function mudar<K extends keyof Rascunho>(campo: K, valor: Rascunho[K]) {
        setDados((atual) => ({ ...atual, [campo]: valor }));
    }
    const slots = gerarTodosSlotsProfessor(dados);
    async function salvar(e: FormEvent) {
        e.preventDefault();
        if (pendente) return;
        if (!dados.nome.trim() || !dados.materias.trim() || !dados.unidades_ids.length) {
            setErro('Preencha nome e matérias e selecione pelo menos uma unidade.');
            return;
        }
        setErro('');
        setPendente(true);
        try {
            await gravarProfessor(professor ? 'PATCH' : 'POST', {
                ...dados, id: professor?.id, unidade_id: dados.unidades_ids[0],
            });
            await aoSalvar(dados);
        } catch (falha) {
            setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar o professor.');
        } finally {
            setPendente(false);
        }
    }
    const input = 'w-full rounded-lg border px-3 py-2 ' + clsInput;
    const campo = 'grid gap-1 text-sm';
    return <form id={formId} onSubmit={salvar}>
        <fieldset disabled={pendente} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
                <label className={campo}>{t('Nome *')}<input className={input} required value={dados.nome} onChange={(e) => mudar('nome', e.target.value)} /></label>
            </div>
            <div className={'grid gap-2 rounded-xl border p-3 ' + clsSubCard}>
                <strong className="text-sm">{t('Unidades de Atendimento *')}</strong>
                <div className="flex flex-wrap gap-2">{unidades.map((unidade) => {
                    const marcada = dados.unidades_ids.includes(unidade.id);
                    return <button type="button" key={unidade.id} aria-pressed={marcada}
                        className={css.botao + (marcada ? ' r4-acao' : '')}
                        onClick={() => mudar('unidades_ids', marcada
                            ? dados.unidades_ids.length === 1 ? dados.unidades_ids : dados.unidades_ids.filter((id) => id !== unidade.id)
                            : [...dados.unidades_ids, unidade.id])}>
                        {marcada && <Check size={14} />}{unidade.nome}
                    </button>;
                })}</div>
            </div>
            <label className={campo}>{t('Matérias (separadas por vírgula) *')}
                <input className={input} required value={dados.materias} onChange={(e) => mudar('materias', e.target.value)} />
            </label>
            <SeletorSeriesPorMateria materiasTexto={dados.materias} mapaAtual={dados.materias_series}
                onChangeMapa={(mapa) => mudar('materias_series', mapa)} escuro={escuro} />
            <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={dados.manha_ativo} onChange={(e) => mudar('manha_ativo', e.target.checked)} />
                <Sun size={16} />{t('Liberar manhã (turnos de 100 min)')}
            </label>
            <div className="grid grid-cols-2 gap-3">
                {([
                    ['manha_inicio', 'Início Manhã'], ['manha_fim', 'Fim Manhã'],
                    ['hora_inicio', 'Início Tarde'], ['hora_fim', 'Fim Tarde'],
                ] as const).filter(([id]) => !id.startsWith('manha') || dados.manha_ativo).map(([id, rotulo]) =>
                    <label key={id} className={campo}>{t(rotulo)}
                        <input type="time" className={input} value={dados[id]} onChange={(e) => mudar(id, e.target.value)} />
                    </label>)}
            </div>
            {slots.length > 0 && <p className={'rounded-xl border p-3 text-sm ' + clsSubCard} aria-live="polite">
                <strong>Turnos ({slots.length})</strong> · {slots.map((slot) => slot.label).join(' • ')}
            </p>}
        </fieldset>
        {erro && <p role="alert" className={css.erro}>{erro}</p>}
    </form>;
}

function CartaoProfessor({ professor: p }: { professor: ProfessorAgrupadoLista }) {
    const materias = p.materias ?? [];
    const turno = `Tarde/Noite: ${p.hora_inicio} às ${p.hora_fim} (${gerarTodosSlotsProfessor(p).length} turnos)`;
    return <Link href={rota + '?professor=' + p.id} className={css.card}>
        <div className={css.identidade}>
            <span className={css.avatar} aria-hidden="true">{obterIniciais(p.nome)}</span>
            <div className="min-w-0"><strong className={css.linha} title={p.nome}>{p.nome}</strong>
                <small className={css.linha} title={p.unidades_nomes.join(' · ')}>{p.unidades_nomes.join(' · ')}</small>
            </div>
            <span className={css.status} data-ativo={p.ativo}>{p.ativo ? 'Ativo' : 'Pausado'}</span>
        </div>
        <div className={css.tags}>
            {materias.slice(0, 3).map((materia) => {
                const chave = Object.keys(p.materias_series ?? {}).find((nome) => nome.trim().toLowerCase() === materia.toLowerCase());
                const serie = resumirSeriesCurto(chave ? p.materias_series?.[chave] ?? [] : []);
                return <span key={materia} title={materia + ' · ' + serie}>{materia} · {serie}</span>;
            })}
            {materias.length > 3 && <span>+{materias.length - 3} mais</span>}
            {!materias.length && <small>Sem matérias cadastradas</small>}
        </div>
        <footer className={css.rodape}>
            <small className={css.linha} title={turno}>{turno}</small>
            <span>Abrir perfil <ArrowRight size={14} aria-hidden="true" /></span>
        </footer>
    </Link>;
}

function VinculosProfessor({ registros, agendamentos, unidades }: {
    registros: ProfessorAdmin[]; agendamentos: AgendamentoAdmin[]; unidades: UnidadeAdmin[];
}) {
    const ids = new Set(registros.map((p) => p.id));
    const aulas = agendamentos.filter((aula) => ids.has(aula.professor_id) && !aula.excluido_em);
    return <div className="grid gap-5">
        <section className={css.painel}>
            <h3 className="font-bold">Exibição por unidade</h3>
            <ul className={css.registros}>{registros.map((p) => {
                const unidadeAtiva = unidades.some((u) => u.id === p.unidade_id && u.ativa !== false);
                return <li key={p.id}><strong>{p.unidade_nome}</strong>
                    <span>Portal do Aluno · {p.ativo && unidadeAtiva ? 'Habilitado' : 'Indisponível'}</span>
                    <span>Mapa do Dia · {!p.ativo ? 'Pausado' : unidadeAtiva ? 'Elegível na grade' : 'Unidade inativa'}</span>
                </li>;
            })}</ul>
        </section>
        <section className={css.painel}>
            <h3 className="font-bold">Agendamentos carregados ({aulas.length})</h3>
            <p className="text-sm opacity-80">Resumo dos até 250 agendamentos carregados no painel administrativo.</p>
            {aulas.length ? <ul className={css.registros}>{aulas.map((aula) => <li key={aula.id}>
                <strong>{aula.nome_aluno}</strong><span>{aula.materia} · {aula.unidade_nome}</span>
                <span>{formatarDataBR(aula.data)} · {aula.hora_inicio || aula.horario} · {obterMetaStatusR4(aula.status).rotulo}</span>
            </li>)}</ul> : <p className="mt-3 text-sm">Nenhum agendamento vinculado nos dados carregados.</p>}
        </section>
    </div>;
}

export default function AbaProfessores({ unidades, professores, agendamentos, escuro, classes, onRecarregarDadosAction }: {
    unidades: UnidadeAdmin[]; professores: ProfessorAdmin[]; agendamentos: AgendamentoAdmin[];
    escuro: boolean; classes: TemaClasses; onRecarregarDadosAction: () => Promise<void>;
}) {
    const t = useTextoR4();
    const layout = useLayoutR4();
    const params = useSearchParams();
    const router = useRouter();
    const id = Number(params.get('professor'));
    const vinculos = params.get('secao') === 'vinculos';
    const modal = useRef<HTMLDialogElement>(null);
    const [novo, setNovo] = useState(false);
    const [pendente, setPendente] = useState(false);
    const [busca, setBusca] = useState('');
    const [unidade, setUnidade] = useState('todas');
    const [status, setStatus] = useState('ativos');
    const [mensagem, setMensagem] = useState<{ erro: boolean; texto: string }>();
    const unidadesAtivas = unidades.filter((u) => u.ativa !== false);
    const grupos = useMemo(() => {
        const mapa = new Map<string, ProfessorAgrupadoLista>();
        for (const p of professores) {
            const chave = chaveProfessor(p);
            const atual = mapa.get(chave);
            if (!atual) {
                mapa.set(chave, { ...p, unidades_ids: [p.unidade_id], unidades_nomes: [p.unidade_nome] });
            } else {
                if (!atual.unidades_ids.includes(p.unidade_id)) {
                    atual.unidades_ids.push(p.unidade_id);
                    atual.unidades_nomes.push(p.unidade_nome);
                }
                atual.ativo ||= p.ativo;
            }
        }
        return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }, [professores]);
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    const filtrados = grupos.filter((p) => (unidade === 'todas' || p.unidades_ids.includes(Number(unidade))) &&
        (status === 'todos' || p.ativo === (status === 'ativos')) &&
        [p.nome, ...(p.materias ?? [])].some((nome) => nome.toLocaleLowerCase('pt-BR').includes(termo)));
    const registro = professores.find((p) => p.id === id);
    const professor = registro && grupos.find((p) => chaveProfessor(p) === chaveProfessor(registro));
    const registros = professor ? professores.filter((p) => chaveProfessor(p) === chaveProfessor(professor)) : [];
    const perfil = rota + '?professor=' + id;
    const [versaoForm, setVersaoForm] = useState(0);
    function fecharModal() {
        modal.current?.close();
        setNovo(false);
    }
    async function alternar(p: ProfessorAgrupadoLista) {
        setPendente(true);
        setMensagem(undefined);
        try {
            await gravarProfessor('PATCH', { id: p.id, ativo: !p.ativo });
            await onRecarregarDadosAction();
        } catch (falha) {
            setMensagem({ erro: true, texto: falha instanceof Error ? falha.message : 'Não foi possível atualizar o status.' });
        } finally { setPendente(false); }
    }

    if (id) return <div className="grid gap-4">
        <Link href={rota} className={css.voltar} onClick={() => setMensagem(undefined)}><ArrowLeft size={16} /> Equipe de Professores</Link>
        {!professor ? <p role="status">Professor indisponível.</p> : <>
            <header className={css.painel + ' ' + css.perfil} {...layout?.item('professor_perfil', 'perfil', 'Cabeçalho do professor')}>
                <span className={css.avatar} aria-hidden="true">{obterIniciais(professor.nome)}</span>
                <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-bold">{professor.nome}</h2>
                    <p className="text-sm">{professor.unidades_nomes.join(' · ')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" className={css.botao} aria-pressed={professor.ativo} disabled={pendente}
                        onClick={() => void alternar(professor)}>{professor.ativo ? 'Ativo · Pausar' : 'Pausado · Ativar'}</button>
                    {!vinculos && <button type="submit" form="editar-professor" className={css.botao + ' r4-acao'} disabled={pendente}>Salvar Alterações</button>}
                </div>
            </header>
            <nav className="flex flex-wrap gap-2" aria-label="Seções do professor">
                <Link className={css.botao} href={perfil} aria-current={!vinculos ? 'page' : undefined}
                    {...layout?.item('professor_dados', 'abas_professor', 'Dados e grade de horários')}>Dados e grade de horários</Link>
                <Link className={css.botao} href={perfil + '&secao=vinculos'} aria-current={vinculos ? 'page' : undefined}
                    {...layout?.item('professor_vinculos', 'abas_professor', 'Vínculos e agendamentos')}>Vínculos e agendamentos</Link>
            </nav>
            {mensagem && <p role={mensagem.erro ? 'alert' : 'status'}>{mensagem.texto}</p>}
            <div hidden={vinculos} className={css.painel} {...layout?.item("professor_formulario", "dados_professor", "Dados e grade de horários")}>
                <FormularioProfessor key={professor.id + ':' + versaoForm} professor={professor} unidades={unidadesAtivas}
                    escuro={escuro} classes={classes} formId="editar-professor" pendente={pendente} setPendente={setPendente}
                    aoSalvar={async (dados) => {
                        // A edição pode remover a unidade do ID atual. A API mantém o menor ID elegível.
                        const ordenados = [...registros].sort((a, b) => a.id - b.id);
                        const mantidos = new Map<number, number>();
                        for (const p of ordenados) {
                            if (dados.unidades_ids.includes(p.unidade_id) && !mantidos.has(p.unidade_id)) {
                                mantidos.set(p.unidade_id, p.id);
                            }
                        }
                        const proximoId = [...mantidos.values()].includes(id)
                            ? id : mantidos.values().next().value ?? ordenados[0]?.id ?? id;
                        await onRecarregarDadosAction();
                        if (proximoId !== id) router.replace(rota + '?professor=' + proximoId);
                        setVersaoForm((valor) => valor + 1);
                        setMensagem({ erro: false, texto: 'Alterações salvas.' });
                    }} />
            </div>
            {vinculos && <VinculosProfessor registros={registros}
                agendamentos={agendamentos} unidades={unidades} />}
        </>}
    </div>;

    return <section className="grid gap-4" {...layout?.item('lista', 'colunas', 'Lista de professores')}>
        <header className={css.painel + ' ' + css.toolbar} {...layout?.item("professores_filtros", "listagem_professores", "Filtros e ações")}>
            <h2 className="font-bold">{t('Professores Cadastrados (')}{filtrados.length})</h2>
            <div className={css.filtros}>
                <label className={css.busca}><Search size={16} aria-hidden="true" />
                    <input aria-label="Buscar professor ou matéria" type="search" placeholder={t('Buscar professor ou matéria...')}
                        value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
                <select aria-label="Unidade" value={unidade} onChange={(e) => setUnidade(e.target.value)}>
                    <option value="todas">{t('Todas unidades')}</option>
                    {unidadesAtivas.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
                <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="todos">Todos</option><option value="ativos">Ativos</option><option value="pausados">Pausados</option>
                </select>
                <button type="button" className={css.botao + ' r4-acao'} onClick={() => {
                    setNovo(true);
                    modal.current?.showModal();
                }}><Plus size={16} /> Novo Professor</button>
            </div>
        </header>
        {filtrados.length ? <div className={css.grade} {...layout?.item("professores_grade", "listagem_professores", "Cards de professores")}>{filtrados.map((p) => <CartaoProfessor key={p.id} professor={p} />)}</div> :
            <p className={css.painel} role="status">Nenhum professor encontrado com esses filtros.</p>}
        <dialog ref={modal} className={css.modal} aria-labelledby="novo-professor-titulo"
            onCancel={(e) => { if (pendente) e.preventDefault(); }} onClose={() => setNovo(false)}>
            <div className={css.topoModal}>
                <h2 id="novo-professor-titulo" className="font-bold">Novo Professor</h2>
                <button type="button" className={css.botao} aria-label="Fechar" onClick={fecharModal} disabled={pendente}><X size={17} /></button>
            </div>
            <div className={css.corpoModal}>{novo && <FormularioProfessor unidades={unidadesAtivas} escuro={escuro} classes={classes}
                formId="novo-professor" pendente={pendente} setPendente={setPendente}
                aoSalvar={async () => { await onRecarregarDadosAction(); fecharModal(); }} />}</div>
            <footer className={css.acoesModal}>
                <button type="button" className={css.botao} onClick={fecharModal} disabled={pendente}>Cancelar</button>
                <button type="submit" form="novo-professor" className={css.botao + ' r4-acao'} disabled={pendente}>
                    {pendente ? 'Cadastrando…' : 'Cadastrar Professor'}
                </button>
            </footer>
        </dialog>
    </section>;
}
