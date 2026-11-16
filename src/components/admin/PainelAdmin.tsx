'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    Building2,
    CalendarPlus,
    CheckCircle2,
    Lock,
    LogOut,
    MessageCircle,
    Plus,
    RefreshCw,
    Save,
    Trash2,
    UserPlus,
    XCircle,
} from 'lucide-react';

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
    protocolo: string;
    unidade_id: number;
    unidade_nome: string;
    professor_id: number;
    professor_nome: string;
    materia: string;
    data: string;
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

function formatarDataBR(dataISO: string): string {
    if (!dataISO) return '';
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
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
        'agendamentos' | 'datas' | 'professores' | 'unidades'
    >('agendamentos');
    const [carregandoDados, setCarregandoDados] = useState(false);
    const [ultimaSincronizacao, setUltimaSincronizacao] = useState<string | null>(
        null
    );

    const [unidades, setUnidades] = useState<UnidadeAdmin[]>([]);
    const [professores, setProfessores] = useState<ProfessorAdmin[]>([]);
    const [datasLiberadas, setDatasLiberadas] = useState<DataAdmin[]>([]);
    const [agendamentos, setAgendamentos] = useState<AgendamentoAdmin[]>([]);

    const [filtroUnidade, setFiltroUnidade] = useState<string>('todas');
    const [filtroStatus, setFiltroStatus] = useState<string>('confirmado');

    const [novaData, setNovaData] = useState('');
    const [novaDescricao, setNovaDescricao] = useState('');

    const [profNome, setProfNome] = useState('');
    const [profClinCareId, setProfClinCareId] = useState('');
    const [profUnidadeId, setProfUnidadeId] = useState<number>(1);
    const [profMaterias, setProfMaterias] = useState('');
    const [profInicio, setProfInicio] = useState('08:00');
    const [profFim, setProfFim] = useState('14:00');

    const [edicaoUnidades, setEdicaoUnidades] = useState<Record<number, string>>({});

    const carregarDados = useCallback(async () => {
        setCarregandoDados(true);
        try {
            const res = await fetch('/api/admin/painel');
            if (res.status === 401) {
                setAutenticado(false);
                return;
            }
            const json = await res.json();
            const listaUnidades: UnidadeAdmin[] = json.unidades || [];
            setUnidades(listaUnidades);
            setProfessores(json.professores || []);
            setDatasLiberadas(json.datasLiberadas || []);
            setAgendamentos(json.agendamentos || []);
            setUltimaSincronizacao(json.ultimaSincronizacao || null);

            const mapaIds: Record<number, string> = {};
            for (const u of listaUnidades) {
                mapaIds[u.id] = u.clin_care_id;
            }
            setEdicaoUnidades(mapaIds);

            if (listaUnidades.length > 0) {
                setProfUnidadeId((atual) => atual || listaUnidades[0].id);
            }
        } finally {
            setCarregandoDados(false);
        }
    }, []);

    useEffect(() => {
        if (autenticado) {
            void Promise.resolve().then(() => carregarDados());
        }
    }, [autenticado, carregarDados]);

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
        carregarDados();
    }

    async function handleAdicionarData(e: React.FormEvent) {
        e.preventDefault();
        if (!novaData || !novaDescricao.trim()) return;
        await fetch('/api/admin/datas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: novaData, descricao: novaDescricao }),
        });
        setNovaData('');
        setNovaDescricao('');
        carregarDados();
    }

    async function alternarData(id: number, ativo: boolean) {
        await fetch('/api/admin/datas', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ativo }),
        });
        carregarDados();
    }

    async function excluirData(id: number) {
        await fetch(`/api/admin/datas?id=${id}`, { method: 'DELETE' });
        carregarDados();
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
                hora_inicio: profInicio,
                hora_fim: profFim,
            }),
        });
        setProfNome('');
        setProfClinCareId('');
        setProfMaterias('');
        carregarDados();
    }

    async function alternarProfessor(id: number, ativo: boolean) {
        await fetch('/api/admin/professores', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ativo }),
        });
        carregarDados();
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
        carregarDados();
    }

    if (!autenticado) {
        return (
            <div className="max-w-md mx-auto mt-10 bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-5">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                    <Lock className="w-6 h-6" />
                </div>

                <div className="space-y-1">
                    <h2 className="text-xl font-bold text-white">Acesso Restrito — Administrador</h2>
                    <p className="text-sm text-slate-400">
                        Informe a senha administrativa para gerenciar agendamentos, datas e integração.
                    </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label htmlFor="senha-admin" className="block text-xs text-slate-400 mb-1">
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

    const agendamentosFiltrados = agendamentos.filter((a) => {
        if (filtroUnidade !== 'todas' && String(a.unidade_id) !== filtroUnidade) return false;
        if (filtroStatus !== 'todos' && a.status !== filtroStatus) return false;
        return true;
    });

    return (
        <div className="space-y-6 pb-10">
            {/* Status da Sincronização clin.care */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/70 border border-slate-800 rounded-2xl px-4 py-3 text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                    <RefreshCw className="w-4 h-4 text-emerald-400" />
                    <span>
            Última leitura do Mapa de Agenda (clin.care):{' '}
                        <strong className="text-white">
              {ultimaSincronizacao || 'Aguardando primeira sincronização'}
            </strong>
          </span>
                </div>
                <button
                    type="button"
                    onClick={carregarDados}
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
                        Agendamentos ({agendamentos.filter((a) => a.status === 'confirmado').length})
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
                        Datas ({datasLiberadas.filter((d) => d.ativo).length})
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
                        onClick={handleLogout}
                        className="px-3.5 py-2 rounded-xl text-xs font-medium bg-slate-950 text-red-300 hover:bg-red-950/40 border border-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                        <LogOut className="w-3.5 h-3.5" /> Sair
                    </button>
                </div>
            </div>

            {carregandoDados && (
                <p className="text-sm text-slate-400">Carregando registros...</p>
            )}

            {/* ABA 1: AGENDAMENTOS */}
            {aba === 'agendamentos' && (
                <section className="space-y-4">
                    <div className="flex flex-wrap gap-3">
                        <select
                            value={filtroUnidade}
                            onChange={(e) => setFiltroUnidade(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white"
                        >
                            <option value="todas">Todas as Unidades</option>
                            {unidades.map((u) => (
                                <option key={u.id} value={String(u.id)}>
                                    {u.nome}
                                </option>
                            ))}
                        </select>

                        <select
                            value={filtroStatus}
                            onChange={(e) => setFiltroStatus(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white"
                        >
                            <option value="confirmado">Confirmados</option>
                            <option value="concluido">Concluídos</option>
                            <option value="cancelado">Cancelados</option>
                            <option value="todos">Todos os Status</option>
                        </select>
                    </div>

                    {agendamentosFiltrados.length === 0 ? (
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-400">
                            Nenhum agendamento encontrado para este filtro.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {agendamentosFiltrados.map((ag) => {
                                const whatsappNumeros = (ag.whatsapp_responsavel || '').replace(/\D/g, '');
                                const linkWhatsapp = `https://wa.me/55${whatsappNumeros}`;

                                return (
                                    <div
                                        key={ag.id}
                                        className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                        <span className="text-xs font-mono text-emerald-400 font-bold">
                          {ag.protocolo}
                        </span>
                                                <h3 className="text-base font-bold text-white">
                                                    {ag.nome_aluno}
                                                </h3>
                                                <p className="text-xs text-slate-400">
                                                    {ag.colegio_aluno ? `${ag.colegio_aluno} • ` : ''}
                                                    {ag.serie_aluno}
                                                </p>
                                            </div>

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
                                                Data: {formatarDataBR(ag.data)} às {ag.horario}
                                            </p>
                                            <p>
                                                <strong>Responsável:</strong> {ag.nome_responsavel} (
                                                {ag.whatsapp_responsavel})
                                            </p>
                                            {ag.observacoes && (
                                                <p className="text-slate-400">
                                                    <strong>Assunto:</strong> {ag.observacoes}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 pt-1">
                                            <a
                                                href={linkWhatsapp}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-3 py-2 rounded-xl bg-emerald-950 border border-emerald-700 text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-emerald-900"
                                            >
                                                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                                            </a>

                                            {ag.status === 'confirmado' && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => alterarStatusAgendamento(ag.id, 'concluido')}
                                                        className="px-3 py-2 rounded-xl bg-sky-950 border border-sky-800 text-sky-300 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-sky-900 cursor-pointer"
                                                    >
                                                        <CheckCircle2 className="w-3.5 h-3.5" /> Concluir
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => alterarStatusAgendamento(ag.id, 'cancelado')}
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

            {/* ABA 2: DATAS LIBERADAS */}
            {aba === 'datas' && (
                <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <form
                        onSubmit={handleAdicionarData}
                        className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4"
                    >
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <CalendarPlus className="w-4 h-4 text-emerald-400" />
                            Liberar Fim de Semana ou Feriado
                        </h3>

                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Data *</label>
                            <input
                                type="date"
                                required
                                value={novaData}
                                onChange={(e) => setNovaData(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white"
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Descrição *</label>
                            <input
                                type="text"
                                required
                                placeholder="Ex: Feriado - Consciência Negra"
                                value={novaDescricao}
                                onChange={(e) => setNovaDescricao(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white"
                            />
                        </div>

                        <button
                            type="submit"
                            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <Plus className="w-4 h-4" /> Liberar Data
                        </button>
                    </form>

                    <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                        <h3 className="text-sm font-bold text-white">Datas Cadastradas</h3>

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
                                            onClick={() => alternarData(d.id, !d.ativo)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                                                d.ativo
                                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-600/40'
                                                    : 'bg-slate-800 text-slate-400'
                                            }`}
                                        >
                                            {d.ativo ? 'Ativa' : 'Pausada'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => excluirData(d.id)}
                                            title="Excluir data"
                                            className="p-2 rounded-lg bg-slate-900 hover:bg-red-950 text-slate-400 hover:text-red-300 border border-slate-800 cursor-pointer"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* ABA 3: PROFESSORES */}
            {aba === 'professores' && (
                <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <form
                        onSubmit={handleAdicionarProfessor}
                        className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4"
                    >
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <UserPlus className="w-4 h-4 text-emerald-400" />
                            Cadastrar Professor
                        </h3>

                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Nome *</label>
                            <input
                                type="text"
                                required
                                placeholder="Ex: Fernanda Lima"
                                value={profNome}
                                onChange={(e) => setProfNome(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white"
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Unidade *</label>
                            <select
                                value={profUnidadeId}
                                onChange={(e) => setProfUnidadeId(Number(e.target.value))}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white"
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
                                Matérias (separadas por vírgula) *
                            </label>
                            <input
                                type="text"
                                required
                                placeholder="Ex: Português, Redação, Literatura"
                                value={profMaterias}
                                onChange={(e) => setProfMaterias(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Início</label>
                                <input
                                    type="time"
                                    value={profInicio}
                                    onChange={(e) => setProfInicio(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Fim</label>
                                <input
                                    type="time"
                                    value={profFim}
                                    onChange={(e) => setProfFim(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs text-slate-400 mb-1">
                                ID no clin.care (Opcional — preenchido automático pelo robô)
                            </label>
                            <input
                                type="text"
                                placeholder="UUID do profissional no clin.care"
                                value={profClinCareId}
                                onChange={(e) => setProfClinCareId(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base text-white"
                            />
                        </div>

                        <button
                            type="submit"
                            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <Plus className="w-4 h-4" /> Salvar Professor
                        </button>
                    </form>

                    <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                        <h3 className="text-sm font-bold text-white">Professores Cadastrados</h3>

                        <div className="space-y-2.5">
                            {professores.map((p) => (
                                <div
                                    key={p.id}
                                    className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 border border-slate-800 rounded-xl p-3.5"
                                >
                                    <div>
                                        <p className="font-bold text-sm text-white">
                                            {p.nome}{' '}
                                            <span className="text-xs font-normal text-emerald-400">
                        • {p.unidade_nome}
                      </span>
                                        </p>
                                        <p className="text-xs text-slate-400">
                                            {p.materias.join(', ')} ({p.hora_inicio} às {p.hora_fim})
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => alternarProfessor(p.id, !p.ativo)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                                            p.ativo
                                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-600/40'
                                                : 'bg-slate-800 text-slate-400'
                                        }`}
                                    >
                                        {p.ativo ? 'Ativo' : 'Inativo'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* ABA 4: UNIDADES / INTEGRAÇÃO CLIN.CARE */}
            {aba === 'unidades' && (
                <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                    <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-emerald-400" />
                            Identificadores das Unidades no clin.care
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                            Informe o UUID exato de cada unidade no clin.care para que o robô leia o Mapa de Agenda corretamente.
                        </p>
                    </div>

                    <div className="space-y-3">
                        {unidades.map((u) => (
                            <div
                                key={u.id}
                                className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-950 border border-slate-800 rounded-xl p-4"
                            >
                                <div className="sm:w-36 font-bold text-sm text-white">{u.nome}</div>
                                <input
                                    type="text"
                                    value={edicaoUnidades[u.id] ?? u.clin_care_id}
                                    onChange={(e) =>
                                        setEdicaoUnidades((prev) => ({
                                            ...prev,
                                            [u.id]: e.target.value,
                                        }))
                                    }
                                    placeholder="UUID da unidade no clin.care"
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-base font-mono text-white"
                                />
                                <button
                                    type="button"
                                    onClick={() => salvarUnidade(u)}
                                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                    <Save className="w-3.5 h-3.5" /> Salvar
                                </button>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}