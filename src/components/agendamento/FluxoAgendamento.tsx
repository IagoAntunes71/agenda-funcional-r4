'use client';
import { useTextoR4 } from '@/components/TextosInterfaceR4';


import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    BookOpen,
    Calendar,
    CheckCircle2,
    Clock,
    MapPin,
    Plus,
    Search,
    User,
    XCircle,
} from 'lucide-react';
import { DataLiberada, Professor, SlotHorario, Unidade } from '@/types/agenda';

interface AlunoAnterior {
    nome_aluno: string;
    colegio_aluno: string;
    serie_aluno: string;
}

interface MeuAgendamento {
    id: number;
    protocolo: string;
    unidade_nome: string;
    professor_nome: string;
    materia: string;
    data: string;
    horario: string;
    nome_aluno: string;
    colegio_aluno: string;
    serie_aluno: string;
    status: 'confirmado' | 'cancelado' | 'concluido';
}

const STORAGE_KEY_CLIENTE = 'agenda_r4_cliente_v1';

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
    const textoR4 = useTextoR4();
    const [abaCliente, setAbaCliente] = useState<'agendar' | 'meus'>('agendar');

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

    // Dados do responsável e aluno
    const [whatsapp, setWhatsapp] = useState('');
    const [nomeResponsavel, setNomeResponsavel] = useState('');
    const [nomeAluno, setNomeAluno] = useState('');
    const [colegioAluno, setColegioAluno] = useState('');
    const [serieAluno, setSerieAluno] = useState('');
    const [observacoes, setObservacoes] = useState('');
    const [alunosEncontrados, setAlunosEncontrados] = useState<AlunoAnterior[]>([]);
    const [buscandoResponsavel, setBuscandoResponsavel] = useState(false);

    // Consulta de agendamentos do próprio cliente
    const [meusAgendamentos, setMeusAgendamentos] = useState<MeuAgendamento[]>([]);
    const [carregandoMeus, setCarregandoMeus] = useState(false);

    // Envio e confirmação
    const [enviando, setEnviando] = useState(false);
    const [erroEnvio, setErroEnvio] = useState<string | null>(null);
    const [protocoloConfirmado, setProtocoloConfirmado] = useState<string | null>(null);

    const buscarDadosResponsavel = useCallback(async (telefone: string) => {
        const apenasNumeros = telefone.replace(/\D/g, '');
        if (apenasNumeros.length < 10) return;

        setBuscandoResponsavel(true);
        try {
            const res = await fetch(`/api/responsavel?whatsapp=${apenasNumeros}`);
            const json = await res.json();
            if (json.encontrado) {
                setNomeResponsavel((atual) => atual || json.nome_responsavel);
                const lista: AlunoAnterior[] = json.alunos || [];
                setAlunosEncontrados(lista);
                if (lista.length === 1) {
                    setNomeAluno((atual) => atual || lista[0].nome_aluno);
                    setColegioAluno((atual) => atual || lista[0].colegio_aluno);
                    setSerieAluno((atual) => atual || lista[0].serie_aluno);
                }
            } else {
                setAlunosEncontrados([]);
            }
        } finally {
            setBuscandoResponsavel(false);
        }
    }, []);

    const carregarMeusAgendamentos = useCallback(async (telefone: string) => {
        const apenasNumeros = telefone.replace(/\D/g, '');
        if (apenasNumeros.length < 10) {
            setMeusAgendamentos([]);
            return;
        }

        setCarregandoMeus(true);
        try {
            const res = await fetch(`/api/meus-agendamentos?whatsapp=${apenasNumeros}`);
            const json = await res.json();
            setMeusAgendamentos(json.agendamentos || []);
        } finally {
            setCarregandoMeus(false);
        }
    }, []);

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

                // Recupera telefone salvo no dispositivo (Android, iPhone ou PC)
                const salvo = localStorage.getItem(STORAGE_KEY_CLIENTE);
                if (salvo) {
                    const parsed = JSON.parse(salvo);
                    if (parsed.whatsapp) {
                        setWhatsapp(parsed.whatsapp);
                        if (parsed.nomeResponsavel) setNomeResponsavel(parsed.nomeResponsavel);
                        buscarDadosResponsavel(parsed.whatsapp);
                    }
                }
            } finally {
                setCarregandoInicial(false);
            }
        }

        carregar();
    }, [buscarDadosResponsavel]);

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
                    colegio_aluno: colegioAluno,
                    serie_aluno: serieAluno,
                    observacoes,
                }),
            });

            const json = await res.json();

            if (!res.ok) {
                setErroEnvio(json.error || 'Erro ao confirmar agendamento.');
                return;
            }

            // Salva o telefone no dispositivo para os próximos acessos
            localStorage.setItem(
                STORAGE_KEY_CLIENTE,
                JSON.stringify({ whatsapp, nomeResponsavel })
            );

            setProtocoloConfirmado(json.agendamento.protocolo);
            buscarDadosResponsavel(whatsapp);
        } catch {
            setErroEnvio('Falha de conexão. Verifique sua internet e tente novamente.');
        } finally {
            setEnviando(false);
        }
    }

    async function handleCancelarMeuAgendamento(id: number) {
        const res = await fetch('/api/meus-agendamentos', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, whatsapp }),
        });
        if (res.ok) {
            carregarMeusAgendamentos(whatsapp);
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
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-300">{textoR4("Carregando unidades e horários disponíveis...")}</div>
        );
    }

    const unidadeObj = unidades.find((u) => u.id === unidadeId);
    const professorObj = professores.find((p) => p.id === professorId);
    const dataObj = datasLiberadas.find((d) => d.data === dataSelecionada);

    return (
        <div className="space-y-6">
            {/* Navegação Rápida do Cliente (Agendar x Consultar/Cancelar) */}
            <div className="flex gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl w-fit">
                <button
                    type="button"
                    onClick={() => setAbaCliente('agendar')}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
                        abaCliente === 'agendar'
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-300 hover:text-white'
                    }`}
                >{textoR4("Agendar Aula")}</button>
                <button
                    type="button"
                    onClick={() => {
                        setAbaCliente('meus');
                        if (whatsapp) carregarMeusAgendamentos(whatsapp);
                    }}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
                        abaCliente === 'meus'
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-300 hover:text-white'
                    }`}
                >{textoR4("Meus Agendamentos")}</button>
            </div>

            {/* ABA: MEUS AGENDAMENTOS (Autoatendimento para consulta e cancelamento) */}
            {abaCliente === 'meus' ? (
                <section className="max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
                    <div>
                        <h2 className="text-base font-bold text-white">{textoR4("Consultar ou Cancelar Agendamentos")}</h2>
                        <p className="text-xs text-slate-400 mt-0.5">{textoR4("Digite o WhatsApp usado na marcação para visualizar suas aulas agendadas.")}</p>
                    </div>

                    <div className="flex gap-2">
                        <input
                            type="tel"
                            inputMode="tel"
                            placeholder="(71) 99999-9999"
                            value={whatsapp}
                            onChange={(e) => setWhatsapp(formatarWhatsapp(e.target.value))}
                            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:border-emerald-500"
                        />
                        <button
                            type="button"
                            onClick={() => carregarMeusAgendamentos(whatsapp)}
                            className="px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold cursor-pointer"
                        >{textoR4("Consultar")}</button>
                    </div>

                    {carregandoMeus ? (
                        <p className="text-sm text-slate-400">{textoR4("Buscando reservas...")}</p>
                    ) : meusAgendamentos.length === 0 ? (
                        <p className="text-sm text-slate-400 bg-slate-950 border border-slate-800 rounded-xl p-4">{textoR4("Nenhum agendamento futuro encontrado para este número.")}</p>
                    ) : (
                        <div className="space-y-3">
                            {meusAgendamentos.map((ag) => (
                                <div
                                    key={ag.id}
                                    className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2"
                                >
                                    <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {ag.protocolo}
                    </span>
                                        <span
                                            className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                                                ag.status === 'confirmado'
                                                    ? 'bg-emerald-500/20 text-emerald-300'
                                                    : 'bg-red-500/20 text-red-300'
                                            }`}
                                        >
                      {ag.status === 'confirmado' ? textoR4("Confirmado") : textoR4("Cancelado")}
                    </span>
                                    </div>

                                    <p className="text-sm font-bold text-white">
                                        {ag.nome_aluno} • {ag.colegio_aluno} ({ag.serie_aluno})
                                    </p>
                                    <p className="text-xs text-slate-300">
                                        {ag.unidade_nome} — {ag.materia}{' ' + textoR4("(Prof.") + ' '}{ag.professor_nome})
                                    </p>
                                    <p className="text-xs font-semibold text-emerald-400">
                                        {formatarDataBR(ag.data)}{' ' + textoR4("às") + ' '}{ag.horario}
                                    </p>

                                    {ag.status === 'confirmado' && (
                                        <div className="pt-2">
                                            <button
                                                type="button"
                                                onClick={() => handleCancelarMeuAgendamento(ag.id)}
                                                className="px-3 py-1.5 rounded-lg bg-red-950/70 border border-red-800 text-red-300 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-red-900 cursor-pointer"
                                            >
                                                <XCircle className="w-3.5 h-3.5" />{' ' + textoR4("Cancelar este horário")}</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            ) : protocoloConfirmado ? (
                /* TELA DE COMPROVANTE */
                <div className="max-w-xl mx-auto bg-slate-900 border border-emerald-500/70 rounded-2xl p-6 sm:p-8 space-y-6 text-center shadow-xl">
                    <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                        <CheckCircle2 className="w-8 h-8" />
                    </div>

                    <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">{textoR4("Agendamento Confirmado")}</p>
                        <h2 className="text-2xl font-bold text-white">{textoR4("Protocolo") + ' '}{protocoloConfirmado}
                        </h2>
                        <p className="text-sm text-slate-400">{textoR4("A vaga já está reservada automaticamente na agenda da unidade.")}</p>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-left space-y-2 text-sm">
                        <div className="flex justify-between gap-2">
                            <span className="text-slate-400">{textoR4("Aluno(a):")}</span>
                            <span className="font-semibold text-white text-right">{nomeAluno}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span className="text-slate-400">{textoR4("Colégio / Série:")}</span>
                            <span className="font-semibold text-white text-right">
                {colegioAluno} ({serieAluno})
              </span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span className="text-slate-400">{textoR4("Unidade:")}</span>
                            <span className="font-semibold text-white">{unidadeObj?.nome}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span className="text-slate-400">{textoR4("Matéria / Prof.:")}</span>
                            <span className="font-semibold text-white text-right">
                {materiaSelecionada} — {professorObj?.nome}
              </span>
                        </div>
                        <div className="flex justify-between gap-2 pt-2 border-t border-slate-800">
                            <span className="text-slate-400">{textoR4("Data e Hora:")}</span>
                            <span className="font-bold text-emerald-400">
                {formatarDataBR(dataSelecionada)}{' ' + textoR4("às") + ' '}{horarioSelecionado}
              </span>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={reiniciarFluxo}
                        className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-base transition cursor-pointer"
                    >{textoR4("Agendar Outra Aula")}</button>
                </div>
            ) : (
                /* FLUXO PRINCIPAL DE MARCAÇÃO */
                <form
                    onSubmit={handleConfirmarAgendamento}
                    className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pb-8"
                >
                    <div className="lg:col-span-8 space-y-5">
                        {/* 1. Identificação Rápida pelo Número + Dados do Aluno */}
                        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                            <div>
                                <h2 className="text-sm font-semibold text-slate-200">{textoR4("1. Identificação do Responsável e Aluno")}</h2>
                                <p className="text-xs text-slate-400 mt-0.5">{textoR4("Informe seu WhatsApp para puxar os dados dos alunos já cadastrados.")}</p>
                            </div>

                            <div className="space-y-1.5">
                                <label htmlFor="whatsapp" className="block text-xs text-slate-400">{textoR4("WhatsApp do Responsável *")}</label>
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
                                        onBlur={() => buscarDadosResponsavel(whatsapp)}
                                        className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:border-emerald-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => buscarDadosResponsavel(whatsapp)}
                                        disabled={buscandoResponsavel}
                                        className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                                    >
                                        <Search className="w-3.5 h-3.5" />
                                        {buscandoResponsavel ? '...' : textoR4("Puxar Dados")}
                                    </button>
                                </div>

                                {alunosEncontrados.length > 0 && (
                                    <div className="pt-2 space-y-1.5">
                                        <p className="text-xs text-emerald-400">{textoR4("Alunos vinculados a este número (toque para preencher):")}</p>
                                        <div className="flex flex-wrap gap-2">
                                            {alunosEncontrados.map((al) => {
                                                const selecionado =
                                                    nomeAluno.trim().toLowerCase() ===
                                                    al.nome_aluno.trim().toLowerCase();
                                                return (
                                                    <button
                                                        key={al.nome_aluno}
                                                        type="button"
                                                        onClick={() => {
                                                            setNomeAluno(al.nome_aluno);
                                                            setColegioAluno(al.colegio_aluno);
                                                            setSerieAluno(al.serie_aluno);
                                                        }}
                                                        className={`py-1.5 px-3 rounded-xl text-xs font-medium border transition cursor-pointer ${
                                                            selecionado
                                                                ? 'bg-emerald-600 text-white border-emerald-400'
                                                                : 'bg-emerald-950/60 border-emerald-700/70 text-emerald-200 hover:border-emerald-500'
                                                        }`}
                                                    >
                                                        {al.nome_aluno} • {al.colegio_aluno || 'Colégio'} ({al.serie_aluno})
                                                    </button>
                                                );
                                            })}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setNomeAluno('');
                                                    setColegioAluno('');
                                                    setSerieAluno('');
                                                }}
                                                className="py-1.5 px-3 rounded-xl text-xs font-medium bg-slate-950 border border-slate-700 text-slate-300 hover:text-white inline-flex items-center gap-1 cursor-pointer"
                                            >
                                                <Plus className="w-3.5 h-3.5" />{' ' + textoR4("Outro aluno")}</button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="responsavel" className="block text-xs text-slate-400 mb-1">{textoR4("Nome do Responsável *")}</label>
                                    <input
                                        id="responsavel"
                                        name="responsavel"
                                        type="text"
                                        autoComplete="name"
                                        required
                                        placeholder={textoR4("Ex: Ana Paula Souza")}
                                        value={nomeResponsavel}
                                        onChange={(e) => setNomeResponsavel(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:border-emerald-500"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="aluno" className="block text-xs text-slate-400 mb-1">{textoR4("Nome do Aluno(a) *")}</label>
                                    <input
                                        id="aluno"
                                        name="aluno"
                                        type="text"
                                        required
                                        placeholder={textoR4("Ex: Lucas Souza")}
                                        value={nomeAluno}
                                        onChange={(e) => setNomeAluno(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:border-emerald-500"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="colegio" className="block text-xs text-slate-400 mb-1">{textoR4("Colégio *")}</label>
                                    <input
                                        id="colegio"
                                        name="colegio"
                                        type="text"
                                        required
                                        placeholder={textoR4("Ex: Colégio Antônio Vieira")}
                                        value={colegioAluno}
                                        onChange={(e) => setColegioAluno(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:border-emerald-500"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="serie" className="block text-xs text-slate-400 mb-1">{textoR4("Série / Ano Escolar *")}</label>
                                    <input
                                        id="serie"
                                        name="serie"
                                        type="text"
                                        required
                                        placeholder={textoR4("Ex: 8º Ano - Fundamental")}
                                        value={serieAluno}
                                        onChange={(e) => setSerieAluno(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:border-emerald-500"
                                    />
                                </div>
                            </div>
                        </section>

                        {/* 2. Unidade */}
                        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-emerald-400" />{textoR4("2. Unidade")}</h2>

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

                        {/* 3. Matéria */}
                        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                                <BookOpen className="w-4 h-4 text-emerald-400" />{textoR4("3. Matéria")}</h2>

                            {materiasDisponiveis.length === 0 ? (
                                <p className="text-sm text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded-xl p-3.5">{textoR4("Nenhum professor cadastrado para esta unidade no momento.")}</p>
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

                        {/* 4. Professor */}
                        {professoresFiltrados.length > 0 && (
                            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                                <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                                    <User className="w-4 h-4 text-emerald-400" />{textoR4("4. Professor(a)")}</h2>

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
                                                    <p className="text-xs text-slate-400">{textoR4("Grade:") + ' '}{prof.hora_inicio}{' ' + textoR4("às") + ' '}{prof.hora_fim}
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

                        {/* 5. Data, Horário e Assunto */}
                        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
                            <div className="space-y-3">
                                <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-emerald-400" />{textoR4("5. Data e Horário")}</h2>

                                {datasLiberadas.length === 0 ? (
                                    <p className="text-sm text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded-xl p-3.5">{textoR4("Nenhuma data liberada para agendamento no momento.")}</p>
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
                                        <Clock className="w-3.5 h-3.5 text-emerald-400" />{textoR4("Horários disponíveis:")}</p>

                                    {carregandoHorarios ? (
                                        <p className="text-sm text-slate-400">{textoR4("Verificando horários...")}</p>
                                    ) : slots.length === 0 ? (
                                        <p className="text-sm text-slate-400">{textoR4("Sem horários disponíveis para esta data.")}</p>
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

                            <div className="pt-2">
                                <label htmlFor="observacoes" className="block text-xs text-slate-400 mb-1">{textoR4("Conteúdo / Assunto da Aula (Opcional)")}</label>
                                <input
                                    id="observacoes"
                                    name="observacoes"
                                    type="text"
                                    placeholder={textoR4("Ex: Revisão para prova de equações do 2º grau")}
                                    value={observacoes}
                                    onChange={(e) => setObservacoes(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white focus:outline-none focus:border-emerald-500"
                                />
                            </div>
                        </section>
                    </div>

                    {/* Resumo Fixo no PC e Bloco de Confirmação no Android/iPhone */}
                    <aside className="lg:col-span-4 lg:sticky lg:top-6 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                        <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-3">{textoR4("Resumo da Marcação")}</h3>

                        <dl className="space-y-2.5 text-sm">
                            <div className="flex justify-between gap-2">
                                <dt className="text-slate-400">{textoR4("Aluno:")}</dt>
                                <dd className="font-medium text-white text-right">
                                    {nomeAluno || '—'}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt className="text-slate-400">{textoR4("Colégio / Série:")}</dt>
                                <dd className="font-medium text-white text-right">
                                    {colegioAluno || serieAluno
                                        ? `${colegioAluno}${serieAluno ? ` (${serieAluno})` : ''}`
                                        : '—'}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt className="text-slate-400">{textoR4("Unidade:")}</dt>
                                <dd className="font-medium text-white">{unidadeObj?.nome || '—'}</dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt className="text-slate-400">{textoR4("Matéria:")}</dt>
                                <dd className="font-medium text-white">{materiaSelecionada || '—'}</dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt className="text-slate-400">{textoR4("Professor:")}</dt>
                                <dd className="font-medium text-white">{professorObj?.nome || '—'}</dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt className="text-slate-400">{textoR4("Data:")}</dt>
                                <dd className="font-medium text-white">
                                    {dataSelecionada ? formatarDataBR(dataSelecionada) : '—'}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt className="text-slate-400">{textoR4("Horário:")}</dt>
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
                            {enviando ? textoR4("Confirmando...") : textoR4("Confirmar Agendamento")}
                        </button>

                        {dataObj && (
                            <p className="text-xs text-slate-500 text-center">
                                {dataObj.descricao}
                            </p>
                        )}
                    </aside>
                </form>
            )}
        </div>
    );
}