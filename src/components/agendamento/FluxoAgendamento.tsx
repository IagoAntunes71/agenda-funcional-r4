'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    BookOpen,
    Calendar,
    CheckCircle2,
    Clock,
    MapPin,
    Search,
    User,
} from 'lucide-react';
import { DataLiberada, Professor, SlotHorario, Unidade } from '@/types/agenda';

interface AlunoAnterior {
    nome_aluno: string;
    serie_aluno: string;
}

function formatarDataBR(dataISO: string): string {
    if (!dataISO) return '';
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
}

function formatarWhatsapp(valor: string): string {
    const nums = valor.replace(/\D/g, '').slice(0, 11);
    if (nums.length <= 2) return nums;
    if (nums.length <= 7) return `(${nums.slice(0, 2)}) ${nums.slice(2)}`;
    return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`;
}

export default function FluxoAgendamento() {
    const [unidades, setUnidades] = useState<Unidade[]>([]);
    const [professores, setProfessores] = useState<Professor[]>([]);
    const [datasLiberadas, setDatasLiberadas] = useState<DataLiberada[]>([]);
    const [carregandoInicial, setCarregandoInicial] = useState(true);

    const [unidadeId, setUnidadeId] = useState<number | null>(null);
    const [materiaSelecionada, setMateriaSelecionada] = useState<string>('');
    const [professorId, setProfessorId] = useState<number | null>(null);
    const [dataSelecionada, setDataSelecionada] = useState<string>('');
    const [horarioSelecionado, setHorarioSelecionado] = useState<string>('');

    const [slots, setSlots] = useState<SlotHorario[]>([]);
    const [carregandoHorarios, setCarregandoHorarios] = useState(false);

    const [whatsapp, setWhatsapp] = useState('');
    const [nomeResponsavel, setNomeResponsavel] = useState('');
    const [nomeAluno, setNomeAluno] = useState('');
    const [serieAluno, setSerieAluno] = useState('');
    const [observacoes, setObservacoes] = useState('');
    const [alunosEncontrados, setAlunosEncontrados] = useState<AlunoAnterior[]>([]);
    const [buscandoResponsavel, setBuscandoResponsavel] = useState(false);

    const [enviando, setEnviando] = useState(false);
    const [erroEnvio, setErroEnvio] = useState<string | null>(null);
    const [protocoloConfirmado, setProtocoloConfirmado] = useState<string | null>(null);

    useEffect(() => {
        async function carregar() {
            try {
                const res = await fetch('/api/dados-iniciais');
                const json = await res.json();
                const listaUnidades: Unidade[] = json.unidades || [];
                const listaProfessores: Professor[] = json.professores || [];
                const listaDatas: DataLiberada[] = json.datasLiberadas || [];

                setUnidades(listaUnidades);
                setProfessores(listaProfessores);
                setDatasLiberadas(listaDatas);

                if (listaUnidades.length > 0) setUnidadeId(listaUnidades[0].id);
                if (listaDatas.length > 0) setDataSelecionada(listaDatas[0].data);
            } finally {
                setCarregandoInicial(false);
            }
        }

        carregar();
    }, []);

    const professoresDaUnidade = useMemo(
        () => professores.filter((p) => p.unidade_id === unidadeId),
        [professores, unidadeId]
    );

    const materiasDisponiveis = useMemo(() => {
        const conjunto = new Set<string>();
        for (const p of professoresDaUnidade) {
            for (const m of p.materias) {
                conjunto.add(m);
            }
        }
        return Array.from(conjunto).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }, [professoresDaUnidade]);

    useEffect(() => {
        if (materiasDisponiveis.length === 0) {
            setMateriaSelecionada('');
            return;
        }
        if (!materiasDisponiveis.includes(materiaSelecionada)) {
            setMateriaSelecionada(materiasDisponiveis[0]);
        }
    }, [materiasDisponiveis, materiaSelecionada]);

    const professoresFiltrados = useMemo(
        () =>
            professoresDaUnidade.filter((p) =>
                materiaSelecionada ? p.materias.includes(materiaSelecionada) : true
            ),
        [professoresDaUnidade, materiaSelecionada]
    );

    useEffect(() => {
        if (professoresFiltrados.length === 0) {
            setProfessorId(null);
            return;
        }
        if (!professoresFiltrados.some((p) => p.id === professorId)) {
            setProfessorId(professoresFiltrados[0].id);
        }
    }, [professoresFiltrados, professorId]);

    useEffect(() => {
        if (!professorId || !dataSelecionada) {
            setSlots([]);
            return;
        }

        let cancelado = false;
        async function buscarHorarios() {
            setCarregandoHorarios(true);
            setHorarioSelecionado('');
            try {
                const res = await fetch(
                    `/api/horarios?professorId=${professorId}&data=${dataSelecionada}`
                );
                const json = await res.json();
                if (!cancelado) {
                    setSlots(json.slots || []);
                }
            } finally {
                if (!cancelado) {
                    setCarregandoHorarios(false);
                }
            }
        }

        buscarHorarios();
        return () => {
            cancelado = true;
        };
    }, [professorId, dataSelecionada]);

    async function buscarDadosResponsavel() {
        const apenasNumeros = whatsapp.replace(/\D/g, '');
        if (apenasNumeros.length < 10) return;

        setBuscandoResponsavel(true);
        try {
            const res = await fetch(`/api/responsavel?whatsapp=${apenasNumeros}`);
            const json = await res.json();
            if (json.encontrado) {
                setNomeResponsavel((atual) => atual || json.nome_responsavel);
                setAlunosEncontrados(json.alunos || []);
                if (json.alunos?.length === 1 && !nomeAluno) {
                    setNomeAluno(json.alunos[0].nome_aluno);
                    setSerieAluno(json.alunos[0].serie_aluno);
                }
            } else {
                setAlunosEncontrados([]);
            }
        } finally {
            setBuscandoResponsavel(false);
        }
    }

    async function handleConfirmarAgendamento(e: React.FormEvent) {
        e.preventDefault();
        if (
            !unidadeId ||
            !professorId ||
            !materiaSelecionada ||
            !dataSelecionada ||
            !horarioSelecionado
        ) {
            setErroEnvio('Selecione unidade, matéria, professor, data e horário antes de confirmar.');
            return;
        }

        setErroEnvio(null);
        setEnviando(true);

        try {
            const res = await fetch('/api/agendar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unidade_id: unidadeId,
                    professor_id: professorId,
                    materia: materiaSelecionada,
                    data: dataSelecionada,
                    horario: horarioSelecionado,
                    nome_responsavel: nomeResponsavel,
                    whatsapp_responsavel: whatsapp,
                    nome_aluno: nomeAluno,
                    serie_aluno: serieAluno,
                    observacoes,
                }),
            });

            const json = await res.json();

            if (!res.ok) {
                setErroEnvio(json.error || 'Erro ao confirmar agendamento.');
                return;
            }

            setProtocoloConfirmado(json.agendamento.protocolo);
        } catch {
            setErroEnvio('Falha de conexão. Verifique sua internet e tente novamente.');
        } finally {
            setEnviando(false);
        }
    }

    function reiniciarFluxo() {
        setProtocoloConfirmado(null);
        setHorarioSelecionado('');
        setObservacoes('');
        setErroEnvio(null);
    }

    if (carregandoInicial) {
        return (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-300">
                Carregando unidades e horários disponíveis...
            </div>
        );
    }

    const unidadeObj = unidades.find((u) => u.id === unidadeId);
    const professorObj = professores.find((p) => p.id === professorId);
    const dataObj = datasLiberadas.find((d) => d.data === dataSelecionada);

    if (protocoloConfirmado) {
        return (
            <div className="max-w-xl mx-auto bg-slate-900 border border-emerald-500/70 rounded-2xl p-6 sm:p-8 space-y-6 text-center shadow-xl">
                <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8" />
                </div>

                <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
                        Agendamento Confirmado
                    </p>
                    <h2 className="text-2xl font-bold text-white">
                        Protocolo {protocoloConfirmado}
                    </h2>
                    <p className="text-sm text-slate-400">
                        Guarde este código. A vaga já está reservada na agenda da unidade.
                    </p>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-left space-y-2 text-sm">
                    <div className="flex justify-between gap-2">
                        <span className="text-slate-400">Aluno(a):</span>
                        <span className="font-semibold text-white text-right">
              {nomeAluno} ({serieAluno})
            </span>
                    </div>
                    <div className="flex justify-between gap-2">
                        <span className="text-slate-400">Unidade:</span>
                        <span className="font-semibold text-white">{unidadeObj?.nome}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                        <span className="text-slate-400">Disciplina:</span>
                        <span className="font-semibold text-white">{materiaSelecionada}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                        <span className="text-slate-400">Professor(a):</span>
                        <span className="font-semibold text-white">{professorObj?.nome}</span>
                    </div>
                    <div className="flex justify-between gap-2 pt-2 border-t border-slate-800">
                        <span className="text-slate-400">Data e Hora:</span>
                        <span className="font-bold text-emerald-400">
              {formatarDataBR(dataSelecionada)} às {horarioSelecionado}
            </span>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={reiniciarFluxo}
                    className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-base transition cursor-pointer"
                >
                    Agendar Outra Aula
                </button>
            </div>
        );
    }

    return (
        <form
            onSubmit={handleConfirmarAgendamento}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pb-8"
        >
            {/* Coluna Principal */}
            <div className="lg:col-span-8 space-y-5">
                {/* 1. Unidade */}
                <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                    <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-emerald-400" />
                        1. Unidade
                    </h2>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {unidades.map((u) => {
                            const selecionada = u.id === unidadeId;
                            return (
                                <button
                                    key={u.id}
                                    type="button"
                                    onClick={() => setUnidadeId(u.id)}
                                    className={`py-3 px-3 rounded-xl font-medium text-sm border transition cursor-pointer ${
                                        selecionada
                                            ? 'bg-emerald-600 text-white border-emerald-500'
                                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                                    }`}
                                >
                                    {u.nome}
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* 2. Matéria */}
                <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                    <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-emerald-400" />
                        2. Matéria
                    </h2>

                    {materiasDisponiveis.length === 0 ? (
                        <p className="text-sm text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded-xl p-3.5">
                            Nenhum professor cadastrado para esta unidade no momento.
                        </p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {materiasDisponiveis.map((materia) => {
                                const ativa = materia === materiaSelecionada;
                                return (
                                    <button
                                        key={materia}
                                        type="button"
                                        onClick={() => setMateriaSelecionada(materia)}
                                        className={`py-2.5 px-4 rounded-xl text-sm font-medium border transition cursor-pointer ${
                                            ativa
                                                ? 'bg-emerald-600 text-white border-emerald-500'
                                                : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                                        }`}
                                    >
                                        {materia}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* 3. Professor */}
                {professoresFiltrados.length > 0 && (
                    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                            <User className="w-4 h-4 text-emerald-400" />
                            3. Professor(a)
                        </h2>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {professoresFiltrados.map((prof) => {
                                const ativo = prof.id === professorId;
                                return (
                                    <button
                                        key={prof.id}
                                        type="button"
                                        onClick={() => setProfessorId(prof.id)}
                                        className={`p-3.5 rounded-xl text-left border transition flex items-center justify-between cursor-pointer ${
                                            ativo
                                                ? 'bg-emerald-950/50 border-emerald-500 text-white'
                                                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                                        }`}
                                    >
                                        <div>
                                            <p className="font-semibold text-sm">{prof.nome}</p>
                                            <p className="text-xs text-slate-400">
                                                Grade: {prof.hora_inicio} às {prof.hora_fim}
                                            </p>
                                        </div>
                                        <span
                                            className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                                ativo ? 'border-emerald-400 bg-emerald-500' : 'border-slate-600'
                                            }`}
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* 4. Data e Horário */}
                <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
                    <div className="space-y-3">
                        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-emerald-400" />
                            4. Data e Horário
                        </h2>

                        {datasLiberadas.length === 0 ? (
                            <p className="text-sm text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded-xl p-3.5">
                                Nenhuma data liberada para agendamento no momento.
                            </p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                {datasLiberadas.map((d) => {
                                    const ativa = d.data === dataSelecionada;
                                    return (
                                        <button
                                            key={d.id}
                                            type="button"
                                            onClick={() => setDataSelecionada(d.data)}
                                            className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                                                ativa
                                                    ? 'bg-emerald-600 text-white border-emerald-500'
                                                    : 'bg-slate-950 text-slate-200 border-slate-800 hover:border-slate-600'
                                            }`}
                                        >
                                            <p className="font-bold text-sm">{formatarDataBR(d.data)}</p>
                                            <p
                                                className={`text-xs ${
                                                    ativa ? 'text-emerald-100' : 'text-slate-400'
                                                }`}
                                            >
                                                {d.descricao}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {professorId && dataSelecionada && (
                        <div className="space-y-2.5 pt-3 border-t border-slate-800">
                            <p className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                                Horários disponíveis:
                            </p>

                            {carregandoHorarios ? (
                                <p className="text-sm text-slate-400">Verificando horários...</p>
                            ) : slots.length === 0 ? (
                                <p className="text-sm text-slate-400">
                                    Sem horários disponíveis para esta data.
                                </p>
                            ) : (
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                                    {slots.map((slot) => {
                                        const escolhido = slot.horario === horarioSelecionado;

                                        if (!slot.disponivel) {
                                            return (
                                                <div
                                                    key={slot.horario}
                                                    title={slot.motivoIndisponivel}
                                                    className="py-2.5 px-2 rounded-xl bg-slate-950/50 border border-slate-800/80 text-slate-600 text-center select-none"
                                                >
                                                    <p className="text-sm font-medium line-through">
                                                        {slot.horario}
                                                    </p>
                                                    <p className="text-[10px] truncate">
                                                        {slot.motivoIndisponivel}
                                                    </p>
                                                </div>
                                            );
                                        }

                                        return (
                                            <button
                                                key={slot.horario}
                                                type="button"
                                                onClick={() => setHorarioSelecionado(slot.horario)}
                                                className={`py-2.5 px-2 rounded-xl font-semibold text-sm border transition cursor-pointer ${
                                                    escolhido
                                                        ? 'bg-emerald-600 text-white border-emerald-400'
                                                        : 'bg-slate-950 text-slate-200 border-slate-800 hover:border-emerald-500'
                                                }`}
                                            >
                                                {slot.horario}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </section>

                {/* 5. Dados do Responsável e Aluno */}
                <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                    <h2 className="text-sm font-semibold text-slate-200">
                        5. Dados do Responsável e do Aluno
                    </h2>

                    <div className="space-y-1.5">
                        <label htmlFor="whatsapp" className="block text-xs text-slate-400">
                            WhatsApp do Responsável *
                        </label>
                        <div className="flex gap-2">
                            <input
                                id="whatsapp"
                                name="whatsapp"
                                type="tel"
                                inputMode="tel"
                                autoComplete="tel"
                                required
                                placeholder="(71) 99999-9999"
                                value={whatsapp}
                                onChange={(e) => setWhatsapp(formatarWhatsapp(e.target.value))}
                                onBlur={buscarDadosResponsavel}
                                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:border-emerald-500"
                            />
                            <button
                                type="button"
                                onClick={buscarDadosResponsavel}
                                disabled={buscandoResponsavel}
                                className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                            >
                                <Search className="w-3.5 h-3.5" />
                                {buscandoResponsavel ? '...' : 'Buscar'}
                            </button>
                        </div>

                        {alunosEncontrados.length > 0 && (
                            <div className="pt-1.5 flex flex-wrap items-center gap-2">
                                <span className="text-xs text-emerald-400">Cadastro encontrado:</span>
                                {alunosEncontrados.map((al) => (
                                    <button
                                        key={al.nome_aluno}
                                        type="button"
                                        onClick={() => {
                                            setNomeAluno(al.nome_aluno);
                                            setSerieAluno(al.serie_aluno);
                                        }}
                                        className="py-1 px-2.5 rounded-lg bg-emerald-950 border border-emerald-700 text-emerald-300 text-xs font-medium cursor-pointer"
                                    >
                                        {al.nome_aluno} ({al.serie_aluno})
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="responsavel" className="block text-xs text-slate-400 mb-1">
                                Nome do Responsável *
                            </label>
                            <input
                                id="responsavel"
                                name="responsavel"
                                type="text"
                                autoComplete="name"
                                required
                                placeholder="Ex: Ana Paula Souza"
                                value={nomeResponsavel}
                                onChange={(e) => setNomeResponsavel(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:border-emerald-500"
                            />
                        </div>

                        <div>
                            <label htmlFor="aluno" className="block text-xs text-slate-400 mb-1">
                                Nome do Aluno(a) *
                            </label>
                            <input
                                id="aluno"
                                name="aluno"
                                type="text"
                                required
                                placeholder="Ex: Lucas Souza"
                                value={nomeAluno}
                                onChange={(e) => setNomeAluno(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:border-emerald-500"
                            />
                        </div>

                        <div>
                            <label htmlFor="serie" className="block text-xs text-slate-400 mb-1">
                                Série / Ano Escolar *
                            </label>
                            <input
                                id="serie"
                                name="serie"
                                type="text"
                                required
                                placeholder="Ex: 8º Ano - Fundamental"
                                value={serieAluno}
                                onChange={(e) => setSerieAluno(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:border-emerald-500"
                            />
                        </div>

                        <div>
                            <label htmlFor="observacoes" className="block text-xs text-slate-400 mb-1">
                                Conteúdo / Assunto (Opcional)
                            </label>
                            <input
                                id="observacoes"
                                name="observacoes"
                                type="text"
                                placeholder="Ex: Revisão para prova"
                                value={observacoes}
                                onChange={(e) => setObservacoes(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:border-emerald-500"
                            />
                        </div>
                    </div>
                </section>
            </div>

            {/* Coluna Lateral (Resumo Fixo no PC e Bloco Final no Android/iPhone) */}
            <aside className="lg:col-span-4 lg:sticky lg:top-6 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-3">
                    Resumo do Agendamento
                </h3>

                <dl className="space-y-2.5 text-sm">
                    <div className="flex justify-between gap-2">
                        <dt className="text-slate-400">Unidade:</dt>
                        <dd className="font-medium text-white">{unidadeObj?.nome || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                        <dt className="text-slate-400">Matéria:</dt>
                        <dd className="font-medium text-white">{materiaSelecionada || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                        <dt className="text-slate-400">Professor:</dt>
                        <dd className="font-medium text-white">{professorObj?.nome || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                        <dt className="text-slate-400">Data:</dt>
                        <dd className="font-medium text-white">
                            {dataSelecionada ? formatarDataBR(dataSelecionada) : '—'}
                        </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                        <dt className="text-slate-400">Horário:</dt>
                        <dd className="font-bold text-emerald-400">
                            {horarioSelecionado || 'Selecione um horário'}
                        </dd>
                    </div>
                </dl>

                {erroEnvio && (
                    <div
                        role="alert"
                        className="bg-red-950/70 border border-red-800 text-red-200 text-xs px-3.5 py-2.5 rounded-xl"
                    >
                        {erroEnvio}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={enviando || !horarioSelecionado}
                    className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold rounded-xl text-base transition cursor-pointer disabled:cursor-not-allowed"
                >
                    {enviando ? 'Confirmando...' : 'Confirmar Agendamento'}
                </button>

                {dataObj && (
                    <p className="text-xs text-slate-500 text-center">
                        {dataObj.descricao}
                    </p>
                )}
            </aside>
        </form>
    );
}