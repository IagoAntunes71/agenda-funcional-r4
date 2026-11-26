'use client';
import { useOperacaoR4 } from './OperacaoPainelR4';
import { SERIES_ESCOLARES } from '@/lib/cliente-helpers';
import { podeOperacao } from '@/lib/operacao-r4';
import { useTextoR4 } from '@/components/TextosInterfaceR4';


import { useEffect, useId, useState } from 'react';
import { Ban, CalendarPlus, Check, Plus, Search, UserPlus, X } from 'lucide-react';
import { RoleSistema } from '@/lib/admin-auth';
import { materiasBase } from '@/lib/materia-aula';
import { formatarDuracaoLabel } from '@/lib/agenda-status-r4';
import {
    formatarDataBR,
    AlunoAdmin,
    ProfessorAdmin,
    TemaClasses,
    UnidadeAdmin,
} from './types';

const HORAS_INICIO = Array.from({ length: 15 }, (_, i) =>
    String(8 + i).padStart(2, '0')
);
const MINUTOS_PASSO = ['00', '10', '20', '30', '40', '50'];

export default function ModalNovoAgendamentoR4({
                                                   aberto,
                                                   onFecharAction,
                                                   modoInicial = 'aula',
                                                   roleUsuario,
                                                   professorTravadoId,
                                                   unidadeInicialId,
                                                   professorInicialId,
                                                   dataInicial,
                                                   horaInicial = '08:00',
                                                   unidades,
                                                   professores,
                                                   alunos,
                                                   onSucessoAction,
                                                   classes,
                                               }: {
    aberto: boolean;
    onFecharAction: () => void;
    modoInicial?: 'aula' | 'bloqueio';
    roleUsuario: RoleSistema;
    professorTravadoId?: number | null;
    unidadeInicialId: number;
    professorInicialId: number;
    dataInicial: string;
    horaInicial?: string;
    unidades: UnidadeAdmin[];
    professores: ProfessorAdmin[];
    alunos: AlunoAdmin[];
    onSucessoAction: () => Promise<void>;
    classes: TemaClasses;
}) {
    const textoR4 = useTextoR4();
    const { clsCard, clsSubCard, clsInput, clsTitulo, clsSubtexto } = classes;
    const ehProfessor = roleUsuario === 'professor';
    const { cfg } = useOperacaoR4();
    const podeAgendar = podeOperacao(cfg, roleUsuario, 'agenda');
    const [acompanhamento, setAcompanhamento] = useState(false);

    const [modo, setModo] = useState<'aula' | 'bloqueio'>(
        podeAgendar ? modoInicial : 'bloqueio'
    );
    const [unidadeId, setUnidadeId] = useState<number>(unidadeInicialId);
    const [professorId, setProfessorId] = useState<number>(
        ehProfessor && professorTravadoId ? professorTravadoId : professorInicialId
    );
    const [materia, setMateria] = useState<string>('');
    const [data, setData] = useState<string>(dataInicial);
    const [hora, setHora] = useState<string>('08');
    const [minuto, setMinuto] = useState<string>('00');

    const [duracaoHoras, setDuracaoHoras] = useState<number>(1);
    const [duracaoMinutos, setDuracaoMinutos] = useState<number>(40);
    const [recorrencia, setRecorrencia] = useState<number>(1);
    const [buscaAluno, setBuscaAluno] = useState<string>('');
    const [alunoId, setAlunoId] = useState<number>(0);
    const [alunosAdicionais, setAlunosAdicionais] = useState<number[]>([]);
    const [historico, setHistorico] = useState<{
        alunoId: number; aulas?: { id: number; data: string; materia: string; professor: string | null }[]; erro?: boolean;
    }>();
    useEffect(() => {
        if (!aberto || !alunoId) return;
        const pedido = new AbortController();
        fetch('/api/admin/agendamentos?historicoAluno=' + alunoId, { signal: pedido.signal, cache: 'no-store' })
            .then(async (resposta) => {
                if (!resposta.ok) throw new Error('Histórico indisponível');
                const { aulas } = await resposta.json();
                if (!pedido.signal.aborted) setHistorico({ alunoId, aulas });
            })
            .catch(() => {
                if (!pedido.signal.aborted) setHistorico({ alunoId, erro: true });
            });
        return () => pedido.abort();
    }, [aberto, alunoId]);

    const [cadastroRapido, setCadastroRapido] = useState<boolean>(false);
    const [novoAlunoNome, setNovoAlunoNome] = useState<string>('');
    const [novoRespNome, setNovoRespNome] = useState<string>('');
    const [novoTelefone, setNovoTelefone] = useState<string>('');
    const [novoColegio, setNovoColegio] = useState<string>('');
    const [novoSerie, setNovoSerie] = useState<string>('');
    const [listaAberta, setListaAberta] = useState(false);
    const [opcaoAtiva, setOpcaoAtiva] = useState(0);
    const listaId = useId();
    const [colegios, setColegios] = useState<{ id: number; nome: string }[]>([]);
    const [colegioId, setColegioId] = useState('');
    const [criarColegio, setCriarColegio] = useState(false);
    const [erroColegios, setErroColegios] = useState(false);

    useEffect(() => {
        if (!aberto || !cadastroRapido) return;
        const pedido = new AbortController();
        fetch('/api/admin/colegios?lista=agendamento', { signal: pedido.signal, cache: 'no-store' })
            .then(async (resposta) => {
                if (!resposta.ok) throw new Error('Colégios indisponíveis');
                const dados = await resposta.json();
                if (!pedido.signal.aborted) {
                    setColegios(dados.colegios);
                    setErroColegios(false);
                }
            }).catch(() => { if (!pedido.signal.aborted) setErroColegios(true); });
        return () => pedido.abort();
    }, [aberto, cadastroRapido]);


    const [tituloBloqueio, setTituloBloqueio] = useState<string>('Indisponível');
    const [descricaoBloqueio, setDescricaoBloqueio] = useState<string>('');

    const [salvando, setSalvando] = useState<boolean>(false);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        if (!aberto) return;
        const modoAlvo = podeAgendar ? modoInicial : 'bloqueio';
        setModo(modoAlvo);
        setUnidadeId(unidadeInicialId || unidades[0]?.id || 0);
        const profAlvo =
            ehProfessor && professorTravadoId
                ? professorTravadoId
                : professorInicialId || professores[0]?.id || 0;
        setProfessorId(profAlvo);

        const profObj = professores.find((p) => p.id === profAlvo);
        setMateria(materiasBase(profObj?.materias)[0] || '');

        setData(dataInicial);
        const [h, m] = (horaInicial || '08:00').split(':');
        setHora(HORAS_INICIO.includes(h) ? h : '08');
        setMinuto(MINUTOS_PASSO.includes(m) ? m : '00');

        if (modoAlvo === 'bloqueio') {
            setDuracaoHoras(1);
            setDuracaoMinutos(0);
        } else {
            setDuracaoHoras(1);
            setDuracaoMinutos(40);
        }
        setRecorrencia(1);
        setListaAberta(false);
        setAcompanhamento(false);
        setErro(null);
    }, [
        aberto,
        ehProfessor,
        podeAgendar,
        modoInicial,
        professorTravadoId,
        unidadeInicialId,
        professorInicialId,
        dataInicial,
        horaInicial,
        unidades,
        professores,
    ]);

    if (!aberto) return null;

    const totalMinutos = duracaoHoras * 60 + duracaoMinutos;
    const profSelecionado = professores.find((p) => p.id === professorId);
    const profsDaUnidade = professores.filter(
        (p) => p.ativo && (!unidadeId || (p.unidade_id === unidadeId || p.unidade_id === unidades.find((u) => u.id === unidadeId)?.unidade_presencial_id))
    );

    const alunoPrincipal = alunos.find((aluno) => aluno.id === alunoId);
    const normalizarDadoEscolar = (valor?: string | null) => valor?.trim().toLocaleLowerCase('pt-BR');
    const colegas = alunoPrincipal?.colegio_nome?.trim() && alunoPrincipal?.serie?.trim()
        ? alunos.filter((aluno) => aluno.id !== alunoId &&
            normalizarDadoEscolar(aluno.colegio_nome) === normalizarDadoEscolar(alunoPrincipal.colegio_nome) &&
            normalizarDadoEscolar(aluno.serie) === normalizarDadoEscolar(alunoPrincipal.serie))
        : [];
    const termo = buscaAluno.trim().toLocaleLowerCase('pt-BR');
    const telefoneBusca = termo.replace(/\D/g, '');
    const alunosFiltrados = alunos.filter((aluno) => !termo ||
        [aluno.nome_aluno, aluno.serie, aluno.colegio_nome, aluno.responsavel_nome]
            .some((valor) => valor?.toLocaleLowerCase('pt-BR').includes(termo)) ||
        (/^[+()\d\s-]+$/.test(termo) && telefoneBusca && aluno.telefone?.replace(/\D/g, '').includes(telefoneBusca)));

    function selecionarAluno(id: number) {
        setAlunoId(id);
        setAlunosAdicionais([]);
        setBuscaAluno('');
        setOpcaoAtiva(0);
        setListaAberta(!id);
    }

    async function handleSalvar(e: React.FormEvent) {
        e.preventDefault();
        setErro(null);

        if (modo === 'aula' && (totalMinutos < 50 || totalMinutos > 300)) {
            setErro('A duração da aula deve ficar entre 50 e 300 minutos.');
            return;
        }
        if (modo === 'bloqueio' && totalMinutos < 10) {
            setErro('Escolha uma duração válida para o bloqueio.');
            return;
        }

        if (modo === 'aula' && !cadastroRapido && !alunoId) {
            setErro('Selecione um aluno da lista.');
            return;
        }
        setSalvando(true);
        try {
            const horaFormatada = `${hora}:${minuto}`;

            if (modo === 'bloqueio') {
                const res = await fetch('/api/admin/bloqueios', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        professor_id: professorId,
                        motivo: tituloBloqueio,
                        descricao: descricaoBloqueio,
                        data,
                        hora_inicio: horaFormatada,
                        duracao_minutos: totalMinutos,
                        recorrencia_semanas: recorrencia,
                    }),
                });
                const json = await res.json();
                if (!res.ok) {
                    setErro(json.error || 'Erro ao salvar bloqueio.');
                    return;
                }
            } else {
                const res = await fetch('/api/admin/agendamentos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        unidade_id: unidadeId,
                        professor_id: professorId,
                        aluno_id: cadastroRapido ? null : alunoId,
                        alunos_adicionais: cadastroRapido ? [] : alunosAdicionais,
                        novo_aluno: cadastroRapido
                            ? {
                                nome_aluno: novoAlunoNome,
                                responsavel_nome: novoRespNome,
                                telefone: novoTelefone,
                                colegio_id: criarColegio ? null : Number(colegioId),
                                novo_colegio: criarColegio ? novoColegio.trim() : null,
                                serie: novoSerie,
                            }
                            : null,
                        materia,
                        data,
                        hora_inicio: horaFormatada,
                        duracao_minutos: totalMinutos,
                        status: 'agendado',
                        acompanhamento,
                        recorrencia_semanas: recorrencia,
                    }),
                });
                const json = await res.json();
                if (!res.ok) {
                    setErro(json.error || 'Erro ao agendar aula.');
                    return;
                }
            }

            await onSucessoAction();
            onFecharAction();
        } finally {
            setSalvando(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
            <div
                className={`border rounded-2xl max-w-xl w-full p-4 sm:p-5 space-y-3 shadow-2xl max-h-[92vh] overflow-y-auto ${clsCard}`}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <span
                            className={`w-9 h-9 rounded-xl flex items-center justify-center text-white ${
                                modo === 'bloqueio' ? 'bg-[#C24124]' : 'bg-[#0E7C86]'
                            }`}
                        >
                            {modo === 'bloqueio' ? (
                                <Ban className="w-4 h-4" />
                            ) : (
                                <CalendarPlus className="w-4 h-4" />
                            )}
                        </span>
                        <div>
                            <h2 className={`text-base font-bold ${clsTitulo}`}>
                                {modo === 'bloqueio' ? textoR4("Bloqueio de Agenda") : textoR4("Nova Marcação R4")}
                            </h2>

                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onFecharAction}
                        className={`p-1.5 rounded-lg cursor-pointer ${clsSubtexto}`}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {podeAgendar && (
                    <div className={`grid grid-cols-2 gap-1.5 p-1 rounded-xl border ${clsSubCard}`}>
                        <button
                            type="button"
                            onClick={() => {
                                setModo('aula');
                                setDuracaoHoras(1);
                                setDuracaoMinutos(40);
                                setErro(null);
                            }}
                            className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                                modo === 'aula'
                                    ? 'r4-acao'
                                    : `${clsSubtexto} hover:text-[#1496A1]`
                            }`}
                        >{textoR4("Agendar Aula")}</button>
                        <button
                            type="button"
                            onClick={() => {
                                setModo('bloqueio');
                                setDuracaoHoras(1);
                                setDuracaoMinutos(0);
                                setErro(null);
                            }}
                            className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                                modo === 'bloqueio'
                                    ? 'bg-[#C24124] text-white'
                                    : `${clsSubtexto} hover:text-[#E07A5F]`
                            }`}
                        >{textoR4("Bloqueio de Agenda")}</button>
                    </div>
                )}

                <form onSubmit={(e) => void handleSalvar(e)} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {!ehProfessor && (
                            <div>
                                <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>{textoR4("Unidade *")}</label>
                                <select
                                    value={unidadeId}
                                    onChange={(e) => {
                                        const uid = Number(e.target.value);
                                        setUnidadeId(uid);
                                        const primeiroProf = professores.find(
                                            (p) => p.ativo && (p.unidade_id === uid || p.unidade_id === unidades.find((u) => u.id === uid)?.unidade_presencial_id)
                                        );
                                        if (primeiroProf) {
                                            setProfessorId(primeiroProf.id);
                                            setMateria(materiasBase(primeiroProf.materias)[0] || '');
                                        }
                                    }}
                                    className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                >
                                    {unidades.map((u) => (
                                        <option key={u.id} value={u.id}>
                                            {u.nome}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className={ehProfessor ? 'sm:col-span-2' : ''}>
                            <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>{textoR4("Professor(a) *")}</label>
                            <select
                                disabled={ehProfessor}
                                value={professorId}
                                onChange={(e) => {
                                    const pid = Number(e.target.value);
                                    setProfessorId(pid);
                                    const prof = professores.find((p) => p.id === pid);
                                    setMateria(materiasBase(prof?.materias)[0] || '');
                                }}
                                className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                            >
                                {(ehProfessor ? professores.filter((p) => p.id === professorTravadoId) : profsDaUnidade).map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.nome}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {modo === 'aula' ? (
                        <>
                            <div className={`border rounded-xl p-3 space-y-2.5 ${clsSubCard}`}>
                                <div className="flex items-center justify-between">
                                    <span className={`text-xs font-bold ${clsTitulo}`}>{textoR4("Aluno(a) *")}</span>
                                    <button
                                        type="button"
                                        onClick={() => setCadastroRapido((v) => !v)}
                                        className="text-[11px] font-bold text-[#1496A1] hover:underline inline-flex items-center gap-1 cursor-pointer"
                                    >
                                        <UserPlus className="w-3.5 h-3.5" />
                                        {cadastroRapido
                                            ? textoR4("Selecionar aluno já cadastrado")
                                            : textoR4("+ Cadastrar novo aluno")}
                                    </button>
                                </div>

                                {!cadastroRapido ? (
                                    <div className="space-y-2">
                                        <div className="relative" onBlur={(e) => {
                                            if (!e.currentTarget.contains(e.relatedTarget)) setListaAberta(false);
                                        }}>
                                            <Search aria-hidden className={`pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 ${clsSubtexto}`} />
                                            <input role="combobox" aria-label="Pesquisar ou selecionar aluno"
                                                aria-expanded={listaAberta} aria-controls={listaId} aria-autocomplete="list"
                                                aria-activedescendant={listaAberta && alunosFiltrados[opcaoAtiva] ? listaId + '-' + opcaoAtiva : undefined}
                                                autoComplete="off" placeholder="Pesquisar ou selecionar aluno..."
                                                value={alunoPrincipal?.nome_aluno ?? buscaAluno}
                                                onFocus={() => { if (!alunoId) setListaAberta(true); }}
                                                onClick={() => { if (!alunoId) setListaAberta(true); }}
                                                onChange={(e) => { selecionarAluno(0); setBuscaAluno(e.target.value); }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Escape') setListaAberta(false);
                                                    if (!alunoId && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                                                        e.preventDefault();
                                                        setListaAberta(true);
                                                        const indice = Math.max(0, Math.min(alunosFiltrados.length - 1,
                                                            opcaoAtiva + (e.key === 'ArrowDown' ? 1 : -1)));
                                                        setOpcaoAtiva(indice);
                                                        document.getElementById(listaId + '-' + indice)?.scrollIntoView({ block: 'nearest' });
                                                    }
                                                    if (e.key === 'Enter' && listaAberta) {
                                                        e.preventDefault();
                                                        const aluno = alunosFiltrados[opcaoAtiva];
                                                        if (aluno) selecionarAluno(aluno.id);
                                                    }
                                                }}
                                                className={`w-full rounded-xl border py-2 pl-8 pr-9 text-xs ${clsInput}`} />
                                            {alunoPrincipal && <button type="button" aria-label="Trocar aluno"
                                                className="absolute right-1 top-0.5 rounded-lg p-2" onClick={(e) => {
                                                    selecionarAluno(0);
                                                    e.currentTarget.parentElement?.querySelector('input')?.focus();
                                                }}><X className="h-3.5 w-3.5" /></button>}
                                            {listaAberta && <ul id={listaId} role="listbox"
                                                className={`absolute inset-x-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-xl border p-1 shadow-lg ${clsInput}`}>
                                                {alunosFiltrados.length === 0 && <li className="px-3 py-2 text-xs">Nenhum aluno encontrado.</li>}
                                                {alunosFiltrados.map((aluno, indice) => <li key={aluno.id} id={listaId + '-' + indice}
                                                    role="option" aria-selected={indice === opcaoAtiva}
                                                    className={`cursor-pointer rounded-lg px-3 py-2 text-xs hover:bg-sky-500/15 ${indice === opcaoAtiva ? 'bg-sky-500/15' : ''}`}
                                                    onMouseDown={(e) => e.preventDefault()} onClick={() => selecionarAluno(aluno.id)}>
                                                    {[aluno.nome_aluno, aluno.serie?.trim(), aluno.colegio_nome?.trim()].filter(Boolean).join(' — ')}
                                                </li>)}
                                            </ul>}
                                        </div>
                                        {colegas.length > 0 && <details className={`rounded-xl border p-3 text-xs ${clsInput}`}>
                                            <summary className="cursor-pointer font-semibold">Adicionar alunos ao grupo ({alunosAdicionais.length + 1}/4)</summary>
                                            <div className="mt-2 max-h-40 space-y-2 overflow-auto">
                                                {colegas.map((aluno) => <label key={aluno.id} className="flex items-center gap-2">
                                                    <input type="checkbox" checked={alunosAdicionais.includes(aluno.id)}
                                                        disabled={alunosAdicionais.length >= 3 && !alunosAdicionais.includes(aluno.id)}
                                                        onChange={(e) => setAlunosAdicionais(e.target.checked
                                                            ? [...alunosAdicionais, aluno.id] : alunosAdicionais.filter((id) => id !== aluno.id))} />
                                                    {aluno.nome_aluno}
                                                </label>)}
                                            </div>
                                        </details>}
                                        {alunoId > 0 && <section aria-live="polite" className={`rounded-xl border p-3 text-xs ${clsInput}`}>
                                            <h3 className="mb-1 font-semibold">Últimas aulas do aluno</h3>
                                            {historico?.alunoId !== alunoId ? 'Buscando histórico…' : historico.erro ? 'Histórico indisponível.' :
                                                historico.aulas?.length ? <ul className="space-y-1">{historico.aulas.map((aula) =>
                                                    <li key={aula.id}>{formatarDataBR(aula.data)} · {aula.materia} · {aula.professor || 'Professor indisponível'}</li>
                                                )}</ul> : 'Nenhuma aula anterior encontrada.'}
                                        </section>}

                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <input
                                            type="text"
                                            required
                                            value={novoAlunoNome}
                                            onChange={(e) => setNovoAlunoNome(e.target.value)}
                                            placeholder={textoR4("Nome do aluno *")}
                                            className={`border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                        />
                                        <input
                                            type="text"
                                            required
                                            value={novoTelefone}
                                            onChange={(e) => setNovoTelefone(e.target.value)}
                                            placeholder={textoR4("WhatsApp c/ DDD *")}
                                            className={`border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                        />
                                        <input
                                            type="text"
                                            value={novoRespNome}
                                            onChange={(e) => setNovoRespNome(e.target.value)}
                                            placeholder={textoR4("Nome do responsável")}
                                            className={`border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                        />
                                        <select required aria-label="Série" value={novoSerie}
                                            onChange={(e) => setNovoSerie(e.target.value)}
                                            className={`rounded-xl border px-3 py-2 text-xs ${clsInput}`}>
                                            <option value="">Selecione a série</option>
                                            {SERIES_ESCOLARES.map((serie) => <option key={serie}>{serie}</option>)}
                                        </select>
                                        <div className="flex flex-wrap gap-2 sm:col-span-2">
                                            {criarColegio ? <input required minLength={2} maxLength={180} aria-label="Nome do novo colégio"
                                                value={novoColegio} onChange={(e) => setNovoColegio(e.target.value)} placeholder="Nome do novo colégio"
                                                className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-xs ${clsInput}`} /> :
                                                <select required aria-label="Colégio" value={colegioId} onChange={(e) => setColegioId(e.target.value)}
                                                    className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-xs ${clsInput}`}>
                                                    <option value="">Selecione o colégio</option>
                                                    {colegios.map((colegio) => <option key={colegio.id} value={colegio.id}>{colegio.nome}</option>)}
                                                </select>}
                                            <button type="button" className="px-2 text-xs font-semibold text-[#1496A1]"
                                                onClick={() => setCriarColegio(!criarColegio)}>
                                                {criarColegio ? 'Usar colégio cadastrado' : '+ Novo colégio'}
                                            </button>
                                            {erroColegios && <p role="alert" className="w-full text-xs text-rose-500">Não foi possível carregar os colégios.</p>}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>{textoR4("Matéria")}</label>
                                    <select
                                        required
                                        value={materia}
                                        onChange={(e) => setMateria(e.target.value)}
                                        className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                    >
                                        <option value="" disabled>Selecione a matéria</option>
                                        {materiasBase(profSelecionado?.materias).map((m) => (
                                            <option key={m} value={m}>
                                                {m}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                {cfg.acompanhamento && <label className="flex items-center gap-2 text-xs">
                                    <input type="checkbox" checked={acompanhamento} onChange={(e) => setAcompanhamento(e.target.checked)} /> Acompanhamento sem cobrança
                                </label>}
                            </div>
                        </>
                    ) : (
                        <>
                            <div>
                                <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>{textoR4("Título do Bloqueio *")}</label>
                                <input
                                    type="text"
                                    required
                                    value={tituloBloqueio}
                                    onChange={(e) => setTituloBloqueio(e.target.value)}
                                    placeholder={textoR4("Ex: Indisponível, Reunião pedagógica, Almoço...")}
                                    className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                />
                            </div>
                            <div>
                                <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>{textoR4("Descrição do Bloqueio (opcional)")}</label>
                                <textarea
                                    rows={2}
                                    value={descricaoBloqueio}
                                    onChange={(e) => setDescricaoBloqueio(e.target.value)}
                                    placeholder={textoR4("Detalhes adicionais sobre o bloqueio...")}
                                    className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                />
                            </div>
                        </>
                    )}

                    <div className={`border rounded-xl p-3.5 space-y-3 ${clsSubCard}`}>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-xs font-bold w-16 ${clsTitulo}`}>{textoR4("Início *")}</span>
                            <input
                                type="date"
                                required
                                value={data}
                                onChange={(e) => setData(e.target.value)}
                                className={`border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                            />
                            <select
                                value={hora}
                                onChange={(e) => setHora(e.target.value)}
                                className={`border rounded-xl px-2.5 py-2 text-xs font-semibold ${clsInput}`}
                            >
                                {HORAS_INICIO.map((h) => (
                                    <option key={h} value={h}>
                                        {h}
                                    </option>
                                ))}
                            </select>
                            <span className={`font-bold ${clsSubtexto}`}>:</span>
                            <select
                                value={minuto}
                                onChange={(e) => setMinuto(e.target.value)}
                                className={`border rounded-xl px-2.5 py-2 text-xs font-semibold ${clsInput}`}
                            >
                                {MINUTOS_PASSO.map((m) => (
                                    <option key={m} value={m}>
                                        {m}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-xs font-bold w-16 ${clsTitulo}`}>{textoR4("Duração *")}</span>
                            <select
                                value={duracaoHoras}
                                onChange={(e) => setDuracaoHoras(Number(e.target.value))}
                                className={`border rounded-xl px-2.5 py-2 text-xs font-semibold ${clsInput}`}
                            >
                                {(modo === 'bloqueio'
                                        ? [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 14]
                                        : [0, 1, 2, 3, 4, 5]
                                ).map((hr) => (
                                    <option key={hr} value={hr}>
                                        {hr}
                                    </option>
                                ))}
                            </select>
                            <span className={`text-xs ${clsSubtexto}`}>{textoR4("hr")}</span>

                            <select
                                value={duracaoMinutos}
                                onChange={(e) => setDuracaoMinutos(Number(e.target.value))}
                                className={`border rounded-xl px-2.5 py-2 text-xs font-semibold ${clsInput}`}
                            >
                                {MINUTOS_PASSO.map((m) => (
                                    <option key={m} value={Number(m)}>
                                        {Number(m)}
                                    </option>
                                ))}
                            </select>
                            <span className={`text-xs ${clsSubtexto}`}>{textoR4("min")}</span>

                            <span className="ml-auto px-3 py-1.5 rounded-lg bg-[#0E7C86]/20 border border-[#0E7C86]/40 text-xs font-bold text-[#25A4AF]">
                                {formatarDuracaoLabel(totalMinutos)}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                        <span className={`text-xs font-semibold ${clsSubtexto}`}>{textoR4("Recorrência")}</span>
                        <select
                            value={recorrencia}
                            onChange={(e) => setRecorrencia(Number(e.target.value))}
                            className={`border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                        >
                            <option value={1}>{textoR4("Não se repete")}</option>
                            <option value={2}>{textoR4("Repetir semanalmente (2 semanas)")}</option>
                            <option value={4}>{textoR4("Repetir semanalmente (4 semanas)")}</option>
                            <option value={8}>{textoR4("Repetir semanalmente (8 semanas)")}</option>
                            {modo !== 'bloqueio' && [12, 26, 52].map((semanas) =>
                                <option key={semanas} value={semanas}>Repetir semanalmente ({semanas} semanas)</option>)}
                        </select>
                    </div>

                    {erro && (
                        <p className="text-xs text-rose-400 bg-[#BE1E23]/15 border border-[#BE1E23]/40 rounded-xl px-3.5 py-2.5">
                            {erro}
                        </p>
                    )}

                    <div className="grid grid-cols-2 gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onFecharAction}
                            className={`px-4 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${clsSubCard}`}
                        >{textoR4("Cancelar")}</button>
                        <button
                            type="submit"
                            disabled={salvando}
                            className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-md ${
                                modo === 'bloqueio'
                                    ? 'bg-[#C24124] hover:bg-[#D14D30]'
                                    : 'bg-[#0E7C86] hover:bg-[#118E99]'
                            }`}
                        >
                            {modo === 'bloqueio' ? (
                                <Plus className="w-4 h-4" />
                            ) : (
                                <Check className="w-4 h-4" />
                            )}
                            {salvando
                                ? textoR4("Salvando...")
                                : modo === 'bloqueio'
                                    ? textoR4("Salvar Bloqueio")
                                    : textoR4("Criar Atendimento")}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}