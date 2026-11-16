'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    Building2,
    CalendarDays,
    CalendarPlus,
    CheckCircle2,
    ClipboardCheck,
    Clock,
    Download,
    Edit3,
    Lock,
    LogOut,
    MessageCircle,
    Plus,
    Power,
    RefreshCw,
    Save,
    Sun,
    Trash2,
    UserPlus,
    X,
    XCircle,
} from 'lucide-react';
import {
    ModoChaveMestra,
    gerarTodosSlotsProfessor,
    horaParaMinutos,
} from '@/lib/horarios-reforco';

interface UnidadeAdmin {
    id: number;
    nome: string;
    clin_care_id: string;
    ativa: boolean;
}

interface ProfessorAdmin {
    id: number;
    nome: string;
    clin_care_id: string | null;
    unidade_id: number;
    unidade_nome: string;
    materias: string[];
    manha_ativo: boolean;
    manha_inicio: string;
    manha_fim: string;
    hora_inicio: string;
    hora_fim: string;
    ativo: boolean;
}

interface DataAdmin {
    id: number;
    data: string;
    descricao: string;
    ativo: boolean;
}

interface AgendamentoAdmin {
    id: number;
    unidade_id: number;
    unidade_nome: string;
    professor_id: number;
    professor_nome: string;
    professor_clin_care_id?: string | null;
    materia: string;
    data: string;
    hora_inicio: string;
    horario: string;
    nome_responsavel: string;
    whatsapp_responsavel: string;
    nome_aluno: string;
    colegio_aluno: string;
    serie_aluno: string;
    observacoes: string | null;
    status: 'confirmado' | 'cancelado' | 'concluido';
    sincronizado_clincare: boolean;
    criado_em_formatado: string;
}

interface BloqueioAdmin {
    id: number;
    professor_id: number | null;
    professor_clin_care_id: string | null;
    data: string;
    hora_inicio: string;
    hora_fim: string;
    motivo: string;
}

function formatarDataBR(dataISO: string): string {
    if (!dataISO) return '';
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
}

function escaparCelulaCSV(
    valor: string | number | boolean | null | undefined
): string {
    const texto = String(valor ?? '').replace(/\r?\n|\r/g, ' ').trim();
    return `"${texto.replace(/"/g, '""')}"`;
}

export default function PainelAdmin({
                                        autenticadoInicial,
                                    }: {
    autenticadoInicial: boolean;
}) {
    const [autenticado, setAutenticado] = useState(autenticadoInicial);
    const [senha, setSenha] = useState('');
    const [erroLogin, setErroLogin] = useState<string | null>(null);
    const [entrando, setEntrando] = useState(false);

    const [aba, setAba] = useState<
        'agendamentos' | 'mapa' | 'datas' | 'professores' | 'unidades'
    >('agendamentos');
    const [carregandoDados, setCarregandoDados] = useState(false);
    const [ultimaSincronizacao, setUltimaSincronizacao] = useState<string | null>(
        null
    );

    // Chave Mestra
    const [modoChaveMestra, setModoChaveMestra] =
        useState<ModoChaveMestra>('auto');
    const [sistemaAbertoAgora, setSistemaAbertoAgora] = useState<boolean>(false);
    const [salvandoChaveMestra, setSalvandoChaveMestra] =
        useState<boolean>(false);

    const [unidades, setUnidades] = useState<UnidadeAdmin[]>([]);
    const [professores, setProfessores] = useState<ProfessorAdmin[]>([]);
    const [datasLiberadas, setDatasLiberadas] = useState<DataAdmin[]>([]);
    const [agendamentos, setAgendamentos] = useState<AgendamentoAdmin[]>([]);
    const [bloqueios, setBloqueios] = useState<BloqueioAdmin[]>([]);

    // Filtros Agendamentos e Relatório
    const [filtroMes, setFiltroMes] = useState<string>('');
    const [filtroUnidade, setFiltroUnidade] = useState<string>('todas');
    const [filtroProfessor, setFiltroProfessor] = useState<string>('todos');
    const [filtroColegio, setFiltroColegio] = useState<string>('todos');
    const [filtroStatus, setFiltroStatus] = useState<string>('confirmado');
    const [filtroClinCare, setFiltroClinCare] = useState<string>('todos');

    // Filtros Mapa do Dia
    const [mapaUnidadeId, setMapaUnidadeId] = useState<number>(0);
    const [mapaData, setMapaData] = useState<string>('');
    const [mapaBuscaProf, setMapaBuscaProf] = useState<string>('');

    // Datas (Bloquear ou Liberar)
    const [novaData, setNovaData] = useState('');
    const [novaDescricao, setNovaDescricao] = useState('');
    const [novoTipoData, setNovoTipoData] = useState<'bloquear' | 'liberar'>(
        'bloquear'
    );

    // Novo Professor
    const [profNome, setProfNome] = useState('');
    const [profClinCareId, setProfClinCareId] = useState('');
    const [profUnidadeId, setProfUnidadeId] = useState<number>(1);
    const [profMaterias, setProfMaterias] = useState('');
    const [profManhaAtivo, setProfManhaAtivo] = useState(false);
    const [profManhaInicio, setProfManhaInicio] = useState('08:00');
    const [profManhaFim, setProfManhaFim] = useState('11:20');
    const [profInicio, setProfInicio] = useState('14:10');
    const [profFim, setProfFim] = useState('20:50');

    // Edição Rápida de Professor
    const [editProfId, setEditProfId] = useState<number | null>(null);
    const [editProfNome, setEditProfNome] = useState('');
    const [editProfClinCareId, setEditProfClinCareId] = useState('');
    const [editProfUnidadeId, setEditProfUnidadeId] = useState<number>(1);
    const [editProfMaterias, setEditProfMaterias] = useState('');
    const [editProfManhaAtivo, setEditProfManhaAtivo] = useState(false);
    const [editProfManhaInicio, setEditProfManhaInicio] = useState('08:00');
    const [editProfManhaFim, setEditProfManhaFim] = useState('11:20');
    const [editProfInicio, setEditProfInicio] = useState('14:10');
    const [editProfFim, setEditProfFim] = useState('20:50');
    const [salvandoProf, setSalvandoProf] = useState(false);

    // Unidades
    const [edicaoUnidades, setEdicaoUnidades] = useState<Record<number, string>>(
        {}
    );

    const carregarDados = useCallback(async () => {
        setCarregandoDados(true);
        try {
            const res = await fetch('/api/admin/painel', { cache: 'no-store' });
            if (res.status === 401) {
                setAutenticado(false);
                return;
            }
            const json = await res.json();
            const listaUnidades: UnidadeAdmin[] = json.unidades || [];
            const listaDatas: DataAdmin[] = json.datasLiberadas || [];

            if (json.chaveMestra) {
                setModoChaveMestra(json.chaveMestra.modo || 'auto');
                setSistemaAbertoAgora(Boolean(json.chaveMestra.aberto));
            }

            setUnidades(listaUnidades);
            setProfessores(json.professores || []);
            setDatasLiberadas(listaDatas);
            setAgendamentos(json.agendamentos || []);
            setBloqueios(json.bloqueios || []);
            setUltimaSincronizacao(json.ultimaSincronizacao || null);

            const mapaIds: Record<number, string> = {};
            for (const u of listaUnidades) {
                mapaIds[u.id] = u.clin_care_id;
            }
            setEdicaoUnidades(mapaIds);

            if (listaUnidades.length > 0) {
                setProfUnidadeId((atual) => atual || listaUnidades[0].id);
                setMapaUnidadeId((atual) => atual || listaUnidades[0].id);
            }

            const amanha = new Date();
            amanha.setDate(amanha.getDate() + 1);
            const amanhaISO = `${amanha.getFullYear()}-${String(
                amanha.getMonth() + 1
            ).padStart(2, '0')}-${String(amanha.getDate()).padStart(2, '0')}`;
            setMapaData((atual) => atual || amanhaISO);
        } finally {
            setCarregandoDados(false);
        }
    }, []);

    useEffect(() => {
        if (!autenticado) return;
        const timer = window.setTimeout(() => {
            void carregarDados();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [autenticado, carregarDados]);

    async function alterarChaveMestra(novoModo: ModoChaveMestra) {
        setSalvandoChaveMestra(true);
        try {
            const res = await fetch('/api/admin/configuracoes', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modo: novoModo }),
            });
            if (res.ok) {
                const json = await res.json();
                setModoChaveMestra(json.modo);
                setSistemaAbertoAgora(Boolean(json.aberto));
            }
        } finally {
            setSalvandoChaveMestra(false);
        }
    }

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        setErroLogin(null);
        setEntrando(true);
        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ senha }),
            });
            const json = await res.json();
            if (!res.ok) {
                setErroLogin(json.error || 'Falha no login.');
                return;
            }
            setSenha('');
            setAutenticado(true);
        } finally {
            setEntrando(false);
        }
    }

    async function handleLogout() {
        await fetch('/api/admin/login', { method: 'DELETE' });
        setAutenticado(false);
    }

    async function alterarStatusAgendamento(
        id: number,
        status: 'confirmado' | 'cancelado' | 'concluido'
    ) {
        await fetch('/api/admin/agendamentos', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status }),
        });
        await carregarDados();
    }

    async function alternarLancadoClinCare(id: number, lancadoAtual: boolean) {
        await fetch('/api/admin/agendamentos', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, lancado_clincare: !lancadoAtual }),
        });
        await carregarDados();
    }

    async function handleAdicionarData(e: React.FormEvent) {
        e.preventDefault();
        if (!novaData || !novaDescricao.trim()) return;
        await fetch('/api/admin/datas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: novaData,
                descricao: novaDescricao,
                ativo: novoTipoData === 'liberar',
            }),
        });
        setNovaData('');
        setNovaDescricao('');
        await carregarDados();
    }

    async function alternarData(id: number, ativo: boolean) {
        await fetch('/api/admin/datas', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ativo }),
        });
        await carregarDados();
    }

    async function excluirData(id: number) {
        await fetch(`/api/admin/datas?id=${id}`, { method: 'DELETE' });
        await carregarDados();
    }

    async function handleAdicionarProfessor(e: React.FormEvent) {
        e.preventDefault();
        if (!profNome.trim() || !profMaterias.trim()) return;
        await fetch('/api/admin/professores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nome: profNome,
                clin_care_id: profClinCareId,
                unidade_id: profUnidadeId,
                materias: profMaterias,
                manha_ativo: profManhaAtivo,
                manha_inicio: profManhaInicio,
                manha_fim: profManhaFim,
                hora_inicio: profInicio,
                hora_fim: profFim,
            }),
        });
        setProfNome('');
        setProfClinCareId('');
        setProfMaterias('');
        setProfManhaAtivo(false);
        await carregarDados();
    }

    function iniciarEdicaoProfessor(p: ProfessorAdmin) {
        setEditProfId(p.id);
        setEditProfNome(p.nome);
        setEditProfClinCareId(p.clin_care_id || '');
        setEditProfUnidadeId(p.unidade_id);
        setEditProfMaterias((p.materias || []).join(', '));
        setEditProfManhaAtivo(Boolean(p.manha_ativo));
        setEditProfManhaInicio(p.manha_inicio || '08:00');
        setEditProfManhaFim(p.manha_fim || '11:20');
        setEditProfInicio(p.hora_inicio || '14:10');
        setEditProfFim(p.hora_fim || '20:50');
    }

    async function salvarEdicaoProfessor(e: React.FormEvent) {
        e.preventDefault();
        if (!editProfId || !editProfNome.trim() || !editProfMaterias.trim()) return;
        setSalvandoProf(true);
        try {
            await fetch('/api/admin/professores', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editProfId,
                    nome: editProfNome,
                    clin_care_id: editProfClinCareId,
                    unidade_id: editProfUnidadeId,
                    materias: editProfMaterias,
                    manha_ativo: editProfManhaAtivo,
                    manha_inicio: editProfManhaInicio,
                    manha_fim: editProfManhaFim,
                    hora_inicio: editProfInicio,
                    hora_fim: editProfFim,
                }),
            });
            setEditProfId(null);
            await carregarDados();
        } finally {
            setSalvandoProf(false);
        }
    }

    async function alternarProfessor(id: number, ativo: boolean) {
        await fetch('/api/admin/professores', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ativo }),
        });
        await carregarDados();
    }

    async function salvarUnidade(u: UnidadeAdmin) {
        await fetch('/api/admin/unidades', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: u.id,
                clin_care_id: edicaoUnidades[u.id] ?? u.clin_care_id,
                ativa: u.ativa,
            }),
        });
        await carregarDados();
    }

    if (!autenticado) {
        return (
            <div className="max-w-md mx-auto mt-10 bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-5">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                    <Lock className="w-6 h-6" />
                </div>

                <div className="space-y-1">
                    <h2 className="text-xl font-bold text-white">
                        Acesso Restrito — Administrador
                    </h2>
                    <p className="text-sm text-slate-400">
                        Informe a senha administrativa para gerenciar agendamentos, datas e
                        integração.
                    </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label
                            htmlFor="senha-admin"
                            className="block text-xs text-slate-400 mb-1"
                        >
                            Senha do Administrador
                        </label>
                        <input
                            id="senha-admin"
                            type="password"
                            required
                            value={senha}
                            onChange={(e) => setSenha(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-3 text-base text-white focus:outline-none focus:border-emerald-500"
                        />
                    </div>

                    {erroLogin && (
                        <p className="text-xs text-red-300 bg-red-950/70 border border-red-800 rounded-xl px-3.5 py-2.5">
                            {erroLogin}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={entrando}
                        className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-base transition cursor-pointer"
                    >
                        {entrando ? 'Verificando...' : 'Entrar no Painel'}
                    </button>
                </form>

                <div className="pt-2 border-t border-slate-800 text-center">
                    <Link
                        href="/"
                        className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1.5"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" /> Voltar para o agendamento
                    </Link>
                </div>
            </div>
        );
    }

    const pendentesClinCare = agendamentos.filter(
        (a) => a.status !== 'cancelado' && !a.sincronizado_clincare
    ).length;

    const colegiosUnicos = Array.from(
        new Set(
            agendamentos
                .map((a) => (a.colegio_aluno || '').trim())
                .filter(Boolean)
        )
    ).sort((a, b) => a.localeCompare(b));

    const agendamentosFiltrados = agendamentos.filter((a) => {
        if (filtroMes && !a.data.startsWith(filtroMes)) return false;
        if (filtroUnidade !== 'todas' && String(a.unidade_id) !== filtroUnidade)
            return false;
        if (
            filtroProfessor !== 'todos' &&
            String(a.professor_id) !== filtroProfessor
        )
            return false;
        if (
            filtroColegio !== 'todos' &&
            (a.colegio_aluno || '').trim() !== filtroColegio
        )
            return false;
        if (filtroStatus !== 'todos' && a.status !== filtroStatus) return false;
        if (filtroClinCare === 'pendentes' && a.sincronizado_clincare) return false;
        if (filtroClinCare === 'lancados' && !a.sincronizado_clincare) return false;
        return true;
    });

    const demandaPorMateria = Object.entries(
        agendamentosFiltrados.reduce<Record<string, number>>((acc, ag) => {
            const mat = (ag.materia || 'Outros').trim();
            acc[mat] = (acc[mat] || 0) + 1;
            return acc;
        }, {})
    ).sort((a, b) => b[1] - a[1]);

    function exportarRelatorioCSV() {
        if (agendamentosFiltrados.length === 0) return;

        const cabecalho = [
            'Data',
            'Horário',
            'Unidade',
            'Professor(a)',
            'Matéria',
            'Aluno(a)',
            'Colégio',
            'Série',
            'Responsável',
            'WhatsApp',
            'Status',
            'Lançado clin.care',
            'Assunto / Observações',
        ];

        const linhas = agendamentosFiltrados.map((ag) => [
            formatarDataBR(ag.data),
            ag.horario || ag.hora_inicio,
            ag.unidade_nome,
            ag.professor_nome,
            ag.materia,
            ag.nome_aluno,
            ag.colegio_aluno,
            ag.serie_aluno,
            ag.nome_responsavel,
            ag.whatsapp_responsavel,
            ag.status.toUpperCase(),
            ag.sincronizado_clincare ? 'Sim' : 'Pendente',
            ag.observacoes || '',
        ]);

        const conteudoCsv =
            '\uFEFF' +
            [cabecalho, ...linhas]
                .map((linha) => linha.map((cel) => escaparCelulaCSV(cel)).join(';'))
                .join('\r\n');

        const blob = new Blob([conteudoCsv], {
            type: 'text/csv;charset=utf-8;',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const sufixoMes = filtroMes || 'completo';
        link.href = url;
        link.setAttribute('download', `relatorio-aulas-${sufixoMes}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    // Dados calculados para a aba Mapa do Dia
    const professoresMapa = professores.filter((p) => {
        if (!p.ativo) return false;
        if (mapaUnidadeId && p.unidade_id !== mapaUnidadeId) return false;
        if (
            mapaBuscaProf.trim() &&
            !p.nome.toLowerCase().includes(mapaBuscaProf.trim().toLowerCase()) &&
            !p.materias.some((m) =>
                m.toLowerCase().includes(mapaBuscaProf.trim().toLowerCase())
            )
        ) {
            return false;
        }
        return true;
    });

    const colunasSlotsMapa = Array.from(
        new Map(
            professoresMapa
                .flatMap((p) => gerarTodosSlotsProfessor(p))
                .map((s) => [s.inicio, s])
        ).values()
    ).sort((a, b) => horaParaMinutos(a.inicio) - horaParaMinutos(b.inicio));

    const previewSlotsNovoProf = gerarTodosSlotsProfessor({
        manha_ativo: profManhaAtivo,
        manha_inicio: profManhaInicio,
        manha_fim: profManhaFim,
        hora_inicio: profInicio,
        hora_fim: profFim,
    });

    return (
        <div className="space-y-6 pb-10">
            {/* CHAVE MESTRA DO LINK DE AGENDAMENTO */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                    <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            sistemaAbertoAgora
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-rose-500/20 text-rose-400'
                        }`}
                    >
                        <Power className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-sm font-bold text-white">
                                Chave Mestra — Link dos Pais
                            </h2>
                            <span
                                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                                    sistemaAbertoAgora
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                }`}
                            >
                {sistemaAbertoAgora ? 'LINK ABERTO AGORA' : 'LINK FECHADO AGORA'}
              </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Automático: liga de segunda a sexta, das 18:00 às 22:00 (vagas de
                            amanhã até domingo desta semana).
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        disabled={salvandoChaveMestra}
                        onClick={() => void alterarChaveMestra('auto')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                            modoChaveMestra === 'auto'
                                ? 'bg-sky-600 border-sky-400 text-white'
                                : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-500'
                        }`}
                    >
                        Automático (18h–22h)
                    </button>

                    <button
                        type="button"
                        disabled={salvandoChaveMestra}
                        onClick={() => void alterarChaveMestra('ativo')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                            modoChaveMestra === 'ativo'
                                ? 'bg-emerald-600 border-emerald-400 text-white'
                                : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-500'
                        }`}
                    >
                        Sempre Ativo
                    </button>

                    <button
                        type="button"
                        disabled={salvandoChaveMestra}
                        onClick={() => void alterarChaveMestra('inativo')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                            modoChaveMestra === 'inativo'
                                ? 'bg-rose-600 border-rose-400 text-white'
                                : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-500'
                        }`}
                    >
                        Desativado
                    </button>
                </div>
            </div>

            {/* Status da Sincronização clin.care */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/70 border border-slate-800 rounded-2xl px-4 py-3 text-xs">
                <div className="flex flex-wrap items-center gap-3 text-slate-300">
          <span className="inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-emerald-400" />
            <span>
              Última leitura mensal do clin.care:{' '}
                <strong className="text-white">
                {ultimaSincronizacao || 'Aguardando primeira sincronização'}
              </strong>
            </span>
          </span>

                    {pendentesClinCare > 0 && (
                        <button
                            type="button"
                            onClick={() => {
                                setAba('agendamentos');
                                setFiltroStatus('todos');
                                setFiltroClinCare('pendentes');
                            }}
                            className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 font-semibold hover:bg-amber-500/25 cursor-pointer"
                        >
                            {pendentesClinCare} aula(s) pendente(s) de lançar no clin.care
                        </button>
                    )}
                </div>

                <button
                    type="button"
                    onClick={() => void carregarDados()}
                    className="text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
                >
                    Atualizar tela
                </button>
            </div>

            {/* Navegação de Abas */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setAba('agendamentos')}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
                            aba === 'agendamentos'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
                        }`}
                    >
                        Agendamentos (
                        {agendamentos.filter((a) => a.status === 'confirmado').length})
                    </button>

                    <button
                        type="button"
                        onClick={() => setAba('mapa')}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition inline-flex items-center gap-1.5 cursor-pointer ${
                            aba === 'mapa'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
                        }`}
                    >
                        <CalendarDays className="w-4 h-4" /> Mapa do Dia
                    </button>

                    <button
                        type="button"
                        onClick={() => setAba('datas')}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
                            aba === 'datas'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
                        }`}
                    >
                        Bloquear / Liberar Dias ({datasLiberadas.length})
                    </button>

                    <button
                        type="button"
                        onClick={() => setAba('professores')}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
                            aba === 'professores'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
                        }`}
                    >
                        Professores ({professores.filter((p) => p.ativo).length})
                    </button>

                    <button
                        type="button"
                        onClick={() => setAba('unidades')}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
                            aba === 'unidades'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
                        }`}
                    >
                        Unidades / clin.care
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <Link
                        href="/"
                        className="px-3.5 py-2 rounded-xl text-xs font-medium bg-slate-950 text-slate-300 hover:text-white border border-slate-800"
                    >
                        Link dos Pais
                    </Link>
                    <button
                        type="button"
                        onClick={() => void handleLogout()}
                        className="px-3.5 py-2 rounded-xl text-xs font-medium bg-slate-950 text-red-300 hover:bg-red-950/40 border border-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                        <LogOut className="w-3.5 h-3.5" /> Sair
                    </button>
                </div>
            </div>

            {carregandoDados && (
                <p className="text-sm text-slate-400">Carregando registros...</p>
            )}

            {/* ABA 1: AGENDAMENTOS E EXPORTAÇÃO DE RELATÓRIO */}
            {aba === 'agendamentos' && (
                <section className="space-y-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
                            <div>
                                <label className="block text-[11px] text-slate-400 mb-1">
                                    Período (Mês)
                                </label>
                                <input
                                    type="month"
                                    value={filtroMes}
                                    onChange={(e) => setFiltroMes(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] text-slate-400 mb-1">
                                    Unidade
                                </label>
                                <select
                                    value={filtroUnidade}
                                    onChange={(e) => setFiltroUnidade(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                                >
                                    <option value="todas">Todas as Unidades</option>
                                    {unidades.map((u) => (
                                        <option key={u.id} value={String(u.id)}>
                                            {u.nome}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] text-slate-400 mb-1">
                                    Professor(a)
                                </label>
                                <select
                                    value={filtroProfessor}
                                    onChange={(e) => setFiltroProfessor(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                                >
                                    <option value="todos">Todos os Professores</option>
                                    {professores.map((p) => (
                                        <option key={p.id} value={String(p.id)}>
                                            {p.nome}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] text-slate-400 mb-1">
                                    Colégio
                                </label>
                                <select
                                    value={filtroColegio}
                                    onChange={(e) => setFiltroColegio(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                                >
                                    <option value="todos">Todos os Colégios</option>
                                    {colegiosUnicos.map((col) => (
                                        <option key={col} value={col}>
                                            {col}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] text-slate-400 mb-1">
                                    Status
                                </label>
                                <select
                                    value={filtroStatus}
                                    onChange={(e) => setFiltroStatus(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                                >
                                    <option value="confirmado">Confirmados</option>
                                    <option value="concluido">Concluídos</option>
                                    <option value="cancelado">Cancelados</option>
                                    <option value="todos">Todos os Status</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] text-slate-400 mb-1">
                                    Lançamento clin.care
                                </label>
                                <select
                                    value={filtroClinCare}
                                    onChange={(e) => setFiltroClinCare(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                                >
                                    <option value="todos">Todos</option>
                                    <option value="pendentes">Pendentes de lançar</option>
                                    <option value="lancados">Já lançados</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <span className="font-semibold text-white">
                  {agendamentosFiltrados.length} aula(s) no filtro
                </span>
                                {demandaPorMateria.slice(0, 5).map(([mat, qtd]) => (
                                    <span
                                        key={mat}
                                        className="px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-[11px] text-slate-300"
                                    >
                    {mat}: <strong className="text-emerald-400">{qtd}</strong>
                  </span>
                                ))}
                                {(filtroMes ||
                                    filtroUnidade !== 'todas' ||
                                    filtroProfessor !== 'todos' ||
                                    filtroColegio !== 'todos') && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFiltroMes('');
                                            setFiltroUnidade('todas');
                                            setFiltroProfessor('todos');
                                            setFiltroColegio('todos');
                                        }}
                                        className="text-xs text-sky-400 hover:text-sky-300 underline cursor-pointer"
                                    >
                                        Limpar filtros
                                    </button>
                                )}
                            </div>

                            <button
                                type="button"
                                disabled={agendamentosFiltrados.length === 0}
                                onClick={exportarRelatorioCSV}
                                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer transition"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Exportar Relatório (CSV / Excel)
                            </button>
                        </div>
                    </div>

                    {agendamentosFiltrados.length === 0 ? (
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-400">
                            Nenhum agendamento encontrado para este filtro.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {agendamentosFiltrados.map((ag) => {
                                const whatsappNumeros = (
                                    ag.whatsapp_responsavel || ''
                                ).replace(/\D/g, '');
                                const linkWhatsapp = `https://wa.me/55${whatsappNumeros}`;

                                return (
                                    <div
                                        key={ag.id}
                                        className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <h3 className="text-base font-bold text-white">
                                                    {ag.nome_aluno}
                                                </h3>
                                                <p className="text-xs text-slate-400">
                                                    {[ag.colegio_aluno, ag.serie_aluno]
                                                        .filter(Boolean)
                                                        .join(' • ')}
                                                </p>
                                            </div>

                                            <div className="flex flex-col items-end gap-1.5">
                        <span
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                                ag.status === 'confirmado'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : ag.status === 'concluido'
                                        ? 'bg-sky-500/20 text-sky-300'
                                        : 'bg-red-500/20 text-red-300'
                            }`}
                        >
                          {ag.status.toUpperCase()}
                        </span>

                                                {ag.status !== 'cancelado' && (
                                                    <span
                                                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                                            ag.sincronizado_clincare
                                                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                                                : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                                        }`}
                                                    >
                            {ag.sincronizado_clincare
                                ? 'Lançado no clin.care'
                                : 'Pendente clin.care'}
                          </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 text-xs space-y-1.5 text-slate-300">
                                            <p>
                                                <strong>Unidade:</strong> {ag.unidade_nome} •{' '}
                                                <strong>Matéria:</strong> {ag.materia}
                                            </p>
                                            <p>
                                                <strong>Professor(a):</strong> {ag.professor_nome}
                                            </p>
                                            <p className="text-emerald-400 font-semibold">
                                                Data: {formatarDataBR(ag.data)}
                                                {ag.horario ? ` às ${ag.horario}` : ''}
                                            </p>
                                            <p>
                                                <strong>Responsável:</strong>{' '}
                                                {ag.nome_responsavel || 'Não informado'}
                                                {ag.whatsapp_responsavel
                                                    ? ` (${ag.whatsapp_responsavel})`
                                                    : ''}
                                            </p>
                                            {ag.observacoes && (
                                                <p className="text-slate-400">
                                                    <strong>Assunto:</strong> {ag.observacoes}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 pt-1">
                                            {whatsappNumeros && (
                                                <a
                                                    href={linkWhatsapp}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="px-3 py-2 rounded-xl bg-emerald-950 border border-emerald-700 text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-emerald-900"
                                                >
                                                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                                                </a>
                                            )}

                                            {ag.status !== 'cancelado' && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void alternarLancadoClinCare(
                                                            ag.id,
                                                            ag.sincronizado_clincare
                                                        )
                                                    }
                                                    className={`px-3 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition ${
                                                        ag.sincronizado_clincare
                                                            ? 'bg-indigo-950/70 border-indigo-700 text-indigo-200 hover:bg-indigo-900'
                                                            : 'bg-amber-950/70 border-amber-700 text-amber-200 hover:bg-amber-900'
                                                    }`}
                                                >
                                                    <ClipboardCheck className="w-3.5 h-3.5" />
                                                    {ag.sincronizado_clincare
                                                        ? 'Lançado no clin.care ✓'
                                                        : 'Marcar Lançado clin.care'}
                                                </button>
                                            )}

                                            {ag.status === 'confirmado' && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            void alterarStatusAgendamento(ag.id, 'concluido')
                                                        }
                                                        className="px-3 py-2 rounded-xl bg-sky-950 border border-sky-800 text-sky-300 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-sky-900 cursor-pointer"
                                                    >
                                                        <CheckCircle2 className="w-3.5 h-3.5" /> Concluir
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            void alterarStatusAgendamento(ag.id, 'cancelado')
                                                        }
                                                        className="px-3 py-2 rounded-xl bg-red-950 border border-red-800 text-red-300 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-red-900 cursor-pointer"
                                                    >
                                                        <XCircle className="w-3.5 h-3.5" /> Cancelar Vaga
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}

            {/* ABA 2: MAPA DO DIA (GRADE DINÂMICA PROFESSORES × TURNOS 100 MIN) */}
            {aba === 'mapa' && (
                <section className="space-y-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                        <div className="flex flex-wrap items-end justify-between gap-4">
                            <div className="flex flex-wrap items-end gap-3">
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">
                                        Unidade
                                    </label>
                                    <select
                                        value={mapaUnidadeId}
                                        onChange={(e) => setMapaUnidadeId(Number(e.target.value))}
                                        className="bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
                                    >
                                        {unidades.map((u) => (
                                            <option key={u.id} value={u.id}>
                                                {u.nome}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">
                                        Data da Grade
                                    </label>
                                    <input
                                        type="date"
                                        value={mapaData}
                                        onChange={(e) => setMapaData(e.target.value)}
                                        className="bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">
                                        Filtrar Professor / Matéria
                                    </label>
                                    <input
                                        type="text"
                                        value={mapaBuscaProf}
                                        onChange={(e) => setMapaBuscaProf(e.target.value)}
                                        placeholder="Buscar na grade..."
                                        className="bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5 text-emerald-300">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  Livre
                </span>
                                <span className="inline-flex items-center gap-1.5 text-sky-300">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                  Aula Agendada
                </span>
                                <span className="inline-flex items-center gap-1.5 text-amber-300">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  Bloqueio clin.care
                </span>
                            </div>
                        </div>
                    </div>

                    {professoresMapa.length === 0 ? (
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-400">
                            Nenhum professor ativo encontrado para esta unidade/filtro.
                        </div>
                    ) : (
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[780px]">
                                <thead>
                                <tr className="border-b border-slate-800 bg-slate-950/80 text-xs uppercase tracking-wider text-slate-400">
                                    <th className="py-3.5 px-4 font-semibold w-60">
                                        Professor(a)
                                    </th>
                                    {colunasSlotsMapa.map((slot) => (
                                        <th key={slot.inicio} className="py-3.5 px-3 font-semibold">
                        <span className="inline-flex items-center gap-1.5 text-slate-200">
                          <Clock className="w-3.5 h-3.5 text-emerald-400" />
                            {slot.label}
                        </span>
                                        </th>
                                    ))}
                                </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/80 text-xs">
                                {professoresMapa.map((prof) => {
                                    const slotsProf = gerarTodosSlotsProfessor(prof);

                                    return (
                                        <tr
                                            key={prof.id}
                                            className="hover:bg-slate-950/40 transition"
                                        >
                                            <td className="py-3.5 px-4 align-top">
                                                <p className="font-bold text-sm text-white">
                                                    {prof.nome}
                                                </p>
                                                <p className="text-slate-400 mt-0.5">
                                                    {prof.materias.join(' • ')}
                                                </p>
                                            </td>

                                            {colunasSlotsMapa.map((slot) => {
                                                const atendeNesteSlot = slotsProf.some(
                                                    (s) => s.inicio === slot.inicio
                                                );

                                                if (!atendeNesteSlot) {
                                                    return (
                                                        <td
                                                            key={slot.inicio}
                                                            className="py-2.5 px-3 align-top"
                                                        >
                                                            <div className="bg-slate-950/40 border border-slate-800/40 rounded-xl p-2.5 text-center text-slate-600">
                                                                —
                                                            </div>
                                                        </td>
                                                    );
                                                }

                                                const slotInicioMin = horaParaMinutos(slot.inicio);
                                                const slotFimMin = horaParaMinutos(slot.fim);

                                                const aulaNoSlot = agendamentos.find(
                                                    (ag) =>
                                                        ag.data === mapaData &&
                                                        ag.status !== 'cancelado' &&
                                                        (ag.professor_id === prof.id ||
                                                            (prof.clin_care_id &&
                                                                ag.professor_clin_care_id ===
                                                                prof.clin_care_id)) &&
                                                        (ag.hora_inicio === slot.inicio ||
                                                            ag.horario.startsWith(slot.inicio))
                                                );

                                                const bloqueioNoSlot = bloqueios.find((b) => {
                                                    if (b.data !== mapaData) return false;
                                                    const mesmoProf =
                                                        b.professor_id === prof.id ||
                                                        (prof.clin_care_id &&
                                                            b.professor_clin_care_id === prof.clin_care_id);
                                                    if (!mesmoProf) return false;
                                                    const bIni = horaParaMinutos(b.hora_inicio);
                                                    const bFim = horaParaMinutos(b.hora_fim);
                                                    return slotInicioMin < bFim && bIni < slotFimMin;
                                                });

                                                if (aulaNoSlot) {
                                                    return (
                                                        <td
                                                            key={slot.inicio}
                                                            className="py-2.5 px-3 align-top"
                                                        >
                                                            <div className="bg-sky-950/70 border border-sky-700/60 rounded-xl p-2.5 space-y-1">
                                                                <div className="flex items-center justify-between gap-1">
                                    <span className="font-bold text-white truncate">
                                      {aulaNoSlot.nome_aluno}
                                    </span>
                                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">
                                      {aulaNoSlot.materia}
                                    </span>
                                                                </div>
                                                                {(aulaNoSlot.colegio_aluno ||
                                                                    aulaNoSlot.serie_aluno) && (
                                                                    <p className="text-[11px] text-slate-300 truncate">
                                                                        {[
                                                                            aulaNoSlot.colegio_aluno,
                                                                            aulaNoSlot.serie_aluno,
                                                                        ]
                                                                            .filter(Boolean)
                                                                            .join(' • ')}
                                                                    </p>
                                                                )}
                                                                <p className="text-[10px] text-slate-400">
                                                                    Resp.:{' '}
                                                                    {aulaNoSlot.nome_responsavel || 'Não inf.'}
                                                                </p>
                                                            </div>
                                                        </td>
                                                    );
                                                }

                                                if (bloqueioNoSlot) {
                                                    return (
                                                        <td
                                                            key={slot.inicio}
                                                            className="py-2.5 px-3 align-top"
                                                        >
                                                            <div className="bg-amber-950/50 border border-amber-700/50 rounded-xl p-2.5 text-amber-200">
                                                                <p className="font-semibold">
                                                                    Bloqueio clin.care
                                                                </p>
                                                                <p className="text-[11px] text-amber-300/80 truncate mt-0.5">
                                                                    {bloqueioNoSlot.motivo}
                                                                </p>
                                                            </div>
                                                        </td>
                                                    );
                                                }

                                                return (
                                                    <td
                                                        key={slot.inicio}
                                                        className="py-2.5 px-3 align-top"
                                                    >
                                                        <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-2.5 text-center text-emerald-400 font-semibold">
                                                            Livre
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}

            {/* ABA 3: BLOQUEAR / LIBERAR DIAS ESPECÍFICOS */}
            {aba === 'datas' && (
                <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <form
                        onSubmit={(e) => void handleAdicionarData(e)}
                        className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4"
                    >
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <CalendarPlus className="w-4 h-4 text-emerald-400" />
                            Exceção de Calendário (Bloquear ou Liberar Dia)
                        </h3>
                        <p className="text-xs text-slate-400">
                            Por padrão, o sistema já libera automaticamente de amanhã até
                            domingo da semana corrente. Use esta tela para bloquear feriados
                            ou liberar datas extras.
                        </p>

                        <div>
                            <label className="block text-xs text-slate-400 mb-1">
                                Ação para a Data *
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setNovoTipoData('bloquear')}
                                    className={`py-2.5 px-3 rounded-xl text-xs font-semibold border cursor-pointer ${
                                        novoTipoData === 'bloquear'
                                            ? 'bg-rose-600/20 border-rose-500 text-rose-200'
                                            : 'bg-slate-950 border-slate-800 text-slate-400'
                                    }`}
                                >
                                    Bloquear Dia (Feriado)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setNovoTipoData('liberar')}
                                    className={`py-2.5 px-3 rounded-xl text-xs font-semibold border cursor-pointer ${
                                        novoTipoData === 'liberar'
                                            ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200'
                                            : 'bg-slate-950 border-slate-800 text-slate-400'
                                    }`}
                                >
                                    Liberar Dia Extra
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs text-slate-400 mb-1">
                                Data *
                            </label>
                            <input
                                type="date"
                                required
                                value={novaData}
                                onChange={(e) => setNovaData(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white"
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-slate-400 mb-1">
                                Motivo / Descrição *
                            </label>
                            <input
                                type="text"
                                required
                                placeholder={
                                    novoTipoData === 'bloquear'
                                        ? 'Ex: Feriado Nacional - Sem atendimento'
                                        : 'Ex: Plantão Especial Semana de Provas'
                                }
                                value={novaDescricao}
                                onChange={(e) => setNovaDescricao(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white"
                            />
                        </div>

                        <button
                            type="submit"
                            className={`w-full py-3 px-4 font-semibold rounded-xl text-sm inline-flex items-center justify-center gap-2 cursor-pointer text-white ${
                                novoTipoData === 'bloquear'
                                    ? 'bg-rose-600 hover:bg-rose-500'
                                    : 'bg-emerald-600 hover:bg-emerald-500'
                            }`}
                        >
                            <Plus className="w-4 h-4" />
                            {novoTipoData === 'bloquear'
                                ? 'Salvar Bloqueio de Data'
                                : 'Salvar Liberação Extra'}
                        </button>
                    </form>

                    <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                        <h3 className="text-sm font-bold text-white">
                            Regras de Datas Configuradas
                        </h3>

                        {datasLiberadas.length === 0 ? (
                            <p className="text-xs text-slate-400">
                                Nenhuma exceção cadastrada. A grade semanal automática está
                                funcionando normalmente.
                            </p>
                        ) : (
                            <div className="space-y-2.5">
                                {datasLiberadas.map((d) => (
                                    <div
                                        key={d.id}
                                        className="flex items-center justify-between gap-3 bg-slate-950 border border-slate-800 rounded-xl p-3.5"
                                    >
                                        <div>
                                            <p className="font-bold text-sm text-white">
                                                {formatarDataBR(d.data)}
                                            </p>
                                            <p className="text-xs text-slate-400">{d.descricao}</p>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => void alternarData(d.id, !d.ativo)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                                                    d.ativo
                                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-600/40'
                                                        : 'bg-rose-500/20 text-rose-300 border border-rose-600/40'
                                                }`}
                                            >
                                                {d.ativo ? 'Liberado' : 'Bloqueado'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void excluirData(d.id)}
                                                title="Remover regra (volta ao padrão semanal)"
                                                className="p-2 rounded-lg bg-slate-900 hover:bg-red-950 text-slate-400 hover:text-red-300 border border-slate-800 cursor-pointer"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* ABA 4: PROFESSORES (MANHÃ FLEXÍVEL 100 MIN + TARDE + EDIÇÃO RÁPIDA) */}
            {aba === 'professores' && (
                <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <form
                        onSubmit={(e) => void handleAdicionarProfessor(e)}
                        className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4"
                    >
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <UserPlus className="w-4 h-4 text-emerald-400" />
                            Cadastrar Professor
                        </h3>

                        <div>
                            <label className="block text-xs text-slate-400 mb-1">
                                Nome *
                            </label>
                            <input
                                type="text"
                                required
                                placeholder="Ex: Fernanda Lima"
                                value={profNome}
                                onChange={(e) => setProfNome(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">
                                    Unidade *
                                </label>
                                <select
                                    value={profUnidadeId}
                                    onChange={(e) => setProfUnidadeId(Number(e.target.value))}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
                                >
                                    {unidades.map((u) => (
                                        <option key={u.id} value={u.id}>
                                            {u.nome}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs text-slate-400 mb-1">
                                    ID clin.care (opcional)
                                </label>
                                <input
                                    type="text"
                                    placeholder="Ex: 142"
                                    value={profClinCareId}
                                    onChange={(e) => setProfClinCareId(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs text-slate-400 mb-1">
                                Matérias (separadas por vírgula) *
                            </label>
                            <input
                                type="text"
                                required
                                placeholder="Ex: Português, Redação, Literatura"
                                value={profMaterias}
                                onChange={(e) => setProfMaterias(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
                            />
                        </div>

                        {/* Disponibilidade Manhã (100 min flexível) */}
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
                            <label className="flex items-center gap-2.5 text-xs font-semibold text-amber-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={profManhaAtivo}
                                    onChange={(e) => setProfManhaAtivo(e.target.checked)}
                                    className="rounded border-slate-600"
                                />
                                <Sun className="w-4 h-4" />
                                Liberar aulas pela manhã (turnos de 100 min)
                            </label>

                            {profManhaAtivo && (
                                <div className="grid grid-cols-2 gap-3 pt-1">
                                    <div>
                                        <label className="block text-[11px] text-slate-400 mb-1">
                                            Início Manhã
                                        </label>
                                        <input
                                            type="time"
                                            value={profManhaInicio}
                                            onChange={(e) => setProfManhaInicio(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] text-slate-400 mb-1">
                                            Fim Manhã
                                        </label>
                                        <input
                                            type="time"
                                            value={profManhaFim}
                                            onChange={(e) => setProfManhaFim(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Disponibilidade Tarde / Noite */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">
                                    Início Tarde/Noite
                                </label>
                                <input
                                    type="time"
                                    value={profInicio}
                                    onChange={(e) => setProfInicio(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">
                                    Fim Tarde/Noite
                                </label>
                                <input
                                    type="time"
                                    value={profFim}
                                    onChange={(e) => setProfFim(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
                                />
                            </div>
                        </div>

                        {previewSlotsNovoProf.length > 0 && (
                            <div className="text-[11px] text-slate-400 bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                                <strong className="text-emerald-400">
                                    Turnos de 100 min gerados ({previewSlotsNovoProf.length}):
                                </strong>{' '}
                                {previewSlotsNovoProf.map((s) => s.label).join(' • ')}
                            </div>
                        )}

                        <button
                            type="submit"
                            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <Plus className="w-4 h-4" /> Cadastrar Professor
                        </button>
                    </form>

                    <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                        <h3 className="text-sm font-bold text-white">
                            Professores Cadastrados ({professores.length})
                        </h3>

                        <div className="space-y-2.5 max-h-[680px] overflow-y-auto pr-1">
                            {professores.map((p) => {
                                const editandoEste = editProfId === p.id;
                                const slotsProf = gerarTodosSlotsProfessor(p);

                                if (editandoEste) {
                                    const previewEdit = gerarTodosSlotsProfessor({
                                        manha_ativo: editProfManhaAtivo,
                                        manha_inicio: editProfManhaInicio,
                                        manha_fim: editProfManhaFim,
                                        hora_inicio: editProfInicio,
                                        hora_fim: editProfFim,
                                    });

                                    return (
                                        <form
                                            key={p.id}
                                            onSubmit={(e) => void salvarEdicaoProfessor(e)}
                                            className="bg-slate-950 border border-emerald-500/50 rounded-xl p-4 space-y-3"
                                        >
                                            <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                          Editando Professor(a)
                        </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditProfId(null)}
                                                    className="text-slate-400 hover:text-white cursor-pointer"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[11px] text-slate-400 mb-1">
                                                        Nome *
                                                    </label>
                                                    <input
                                                        type="text"
                                                        required
                                                        value={editProfNome}
                                                        onChange={(e) => setEditProfNome(e.target.value)}
                                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-[11px] text-slate-400 mb-1">
                                                        Unidade *
                                                    </label>
                                                    <select
                                                        value={editProfUnidadeId}
                                                        onChange={(e) =>
                                                            setEditProfUnidadeId(Number(e.target.value))
                                                        }
                                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                                                    >
                                                        {unidades.map((u) => (
                                                            <option key={u.id} value={u.id}>
                                                                {u.nome}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-[11px] text-slate-400 mb-1">
                                                    Matérias (separadas por vírgula) *
                                                </label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={editProfMaterias}
                                                    onChange={(e) => setEditProfMaterias(e.target.value)}
                                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                                                />
                                            </div>

                                            <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-2.5 space-y-2">
                                                <label className="flex items-center gap-2 text-xs font-semibold text-amber-300 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={editProfManhaAtivo}
                                                        onChange={(e) =>
                                                            setEditProfManhaAtivo(e.target.checked)
                                                        }
                                                    />
                                                    <Sun className="w-3.5 h-3.5" />
                                                    Liberar aulas pela manhã (100 min)
                                                </label>

                                                {editProfManhaAtivo && (
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <label className="block text-[10px] text-slate-400 mb-0.5">
                                                                Início Manhã
                                                            </label>
                                                            <input
                                                                type="time"
                                                                value={editProfManhaInicio}
                                                                onChange={(e) =>
                                                                    setEditProfManhaInicio(e.target.value)
                                                                }
                                                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[10px] text-slate-400 mb-0.5">
                                                                Fim Manhã
                                                            </label>
                                                            <input
                                                                type="time"
                                                                value={editProfManhaFim}
                                                                onChange={(e) =>
                                                                    setEditProfManhaFim(e.target.value)
                                                                }
                                                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-3 gap-2">
                                                <div>
                                                    <label className="block text-[11px] text-slate-400 mb-1">
                                                        ID clin.care
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={editProfClinCareId}
                                                        onChange={(e) =>
                                                            setEditProfClinCareId(e.target.value)
                                                        }
                                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] text-slate-400 mb-1">
                                                        Início Tarde
                                                    </label>
                                                    <input
                                                        type="time"
                                                        value={editProfInicio}
                                                        onChange={(e) => setEditProfInicio(e.target.value)}
                                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] text-slate-400 mb-1">
                                                        Fim Tarde
                                                    </label>
                                                    <input
                                                        type="time"
                                                        value={editProfFim}
                                                        onChange={(e) => setEditProfFim(e.target.value)}
                                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                                                    />
                                                </div>
                                            </div>

                                            {previewEdit.length > 0 && (
                                                <p className="text-[11px] text-emerald-300">
                                                    Turnos ({previewEdit.length}):{' '}
                                                    {previewEdit.map((s) => s.label).join(' • ')}
                                                </p>
                                            )}

                                            <div className="flex justify-end gap-2 pt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setEditProfId(null)}
                                                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300 cursor-pointer"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    type="submit"
                                                    disabled={salvandoProf}
                                                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
                                                >
                                                    <Save className="w-3.5 h-3.5" />
                                                    {salvandoProf ? 'Salvando...' : 'Salvar'}
                                                </button>
                                            </div>
                                        </form>
                                    );
                                }

                                return (
                                    <div
                                        key={p.id}
                                        className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 border border-slate-800 rounded-xl p-3.5"
                                    >
                                        <div className="space-y-0.5">
                                            <p className="font-bold text-sm text-white">
                                                {p.nome}{' '}
                                                <span className="text-xs font-normal text-emerald-400">
                          • {p.unidade_nome}
                        </span>
                                            </p>
                                            <p className="text-xs text-slate-400">
                                                {(p.materias || []).join(', ')}
                                            </p>
                                            <p className="text-[11px] text-slate-400">
                                                {p.manha_ativo && (
                                                    <span className="text-amber-300 font-medium">
                            Manhã: {p.manha_inicio} às {p.manha_fim} •{' '}
                          </span>
                                                )}
                                                Tarde/Noite: {p.hora_inicio} às {p.hora_fim} (
                                                {slotsProf.length} turnos de 100 min)
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => iniciarEdicaoProfessor(p)}
                                                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                                            >
                                                <Edit3 className="w-3.5 h-3.5" /> Editar
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => void alternarProfessor(p.id, !p.ativo)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                                                    p.ativo
                                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-600/40'
                                                        : 'bg-slate-800 text-slate-400'
                                                }`}
                                            >
                                                {p.ativo ? 'Ativo' : 'Pausado'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>
            )}

            {/* ABA 5: UNIDADES / CLIN.CARE */}
            {aba === 'unidades' && (
                <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 max-w-2xl">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-emerald-400" />
                        Vínculo de Unidades com o clin.care
                    </h3>
                    <p className="text-xs text-slate-400">
                        Para a unidade <strong>Online</strong>, mantenha{' '}
                        <code className="text-slate-300">id-online</code> (ou informe o
                        UUID caso ela também exista no clin.care).
                    </p>

                    <div className="space-y-3">
                        {unidades.map((u) => (
                            <div
                                key={u.id}
                                className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 border border-slate-800 rounded-xl p-4"
                            >
                                <div>
                                    <p className="font-bold text-sm text-white">{u.nome}</p>
                                    <p className="text-xs text-slate-400">
                                        ID de Unidade no clin.care
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={edicaoUnidades[u.id] ?? u.clin_care_id}
                                        onChange={(e) =>
                                            setEdicaoUnidades((prev) => ({
                                                ...prev,
                                                [u.id]: e.target.value,
                                            }))
                                        }
                                        className="w-40 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => void salvarUnidade(u)}
                                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <Save className="w-3.5 h-3.5" /> Salvar
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}