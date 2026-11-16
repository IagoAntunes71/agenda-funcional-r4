'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    Building2,
    CalendarCheck2,
    CalendarDays,
    CalendarPlus,
    CheckCircle2,
    ClipboardCheck,
    Clock,
    Download,
    Edit3,
    ExternalLink,
    GraduationCap,
    Lock,
    LogOut,
    Menu,
    MessageCircle,
    Moon,
    Play,
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
import LogoR4 from '@/components/LogoR4';
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

interface CooldownsSync {
    hoje: string | null;
    semana: string | null;
    mes: string | null;
}

type AbaAdmin =
    | 'agendamentos'
    | 'mapa'
    | 'datas'
    | 'professores'
    | 'unidades';

function formatarDataBR(dataISO: string): string {
    if (!dataISO) return '';
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
}

function formatarCronometro(segundos: number): string {
    const min = Math.floor(segundos / 60);
    const seg = segundos % 60;
    return `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
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

    // Tema Claro / Escuro
    const [tema, setTema] = useState<'escuro' | 'claro'>('escuro');
    const [menuMobileAberto, setMenuMobileAberto] = useState(false);

    const [aba, setAba] = useState<AbaAdmin>('agendamentos');
    const [carregandoDados, setCarregandoDados] = useState(false);
    const [ultimaSincronizacao, setUltimaSincronizacao] = useState<string | null>(
        null
    );

    // Botões de Sincronização clin.care + Cronômetros
    const [cooldownsSync, setCooldownsSync] = useState<CooldownsSync>({
        hoje: null,
        semana: null,
        mes: null,
    });
    const [agoraMs, setAgoraMs] = useState<number>(() => Date.now());
    const [disparandoSync, setDisparandoSync] = useState<
        'hoje' | 'semana' | 'mes' | null
    >(null);
    const [feedbackSync, setFeedbackSync] = useState<{
        tipo: 'sucesso' | 'erro';
        texto: string;
    } | null>(null);

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

    useEffect(() => {
        const salvo = window.localStorage.getItem('r4_admin_tema');
        if (salvo === 'claro' || salvo === 'escuro') {
            setTema(salvo);
        }
    }, []);

    function alternarTema() {
        setTema((prev) => {
            const proximo = prev === 'escuro' ? 'claro' : 'escuro';
            window.localStorage.setItem('r4_admin_tema', proximo);
            return proximo;
        });
    }

    useEffect(() => {
        const temCooldownAtivo = Boolean(
            cooldownsSync.hoje || cooldownsSync.semana || cooldownsSync.mes
        );
        if (!temCooldownAtivo) return;

        const timer = window.setInterval(() => {
            setAgoraMs(Date.now());
        }, 1000);

        return () => window.clearInterval(timer);
    }, [cooldownsSync]);

    function calcularRestanteSegundos(expiraISO: string | null): number {
        if (!expiraISO) return 0;
        const diff = Math.ceil((new Date(expiraISO).getTime() - agoraMs) / 1000);
        return diff > 0 ? diff : 0;
    }

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

            if (json.cooldownsSync) {
                setCooldownsSync({
                    hoje: json.cooldownsSync.hoje || null,
                    semana: json.cooldownsSync.semana || null,
                    mes: json.cooldownsSync.mes || null,
                });
                setAgoraMs(Date.now());
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

    async function dispararSincronizacao(modo: 'hoje' | 'semana' | 'mes') {
        setDisparandoSync(modo);
        setFeedbackSync(null);
        try {
            const res = await fetch('/api/admin/sincronizar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modo }),
            });
            const json = await res.json();

            if (json.proximoDisponivelEm) {
                setCooldownsSync((prev) => ({
                    ...prev,
                    [modo]: json.proximoDisponivelEm,
                }));
                setAgoraMs(Date.now());
            }

            if (!res.ok) {
                setFeedbackSync({
                    tipo: 'erro',
                    texto: json.error || 'Não foi possível iniciar a sincronização.',
                });
                return;
            }

            const tempoEstimado =
                modo === 'hoje'
                    ? 'cerca de 40 segundos'
                    : modo === 'semana'
                        ? 'cerca de 2 minutos'
                        : 'alguns minutos';

            setFeedbackSync({
                tipo: 'sucesso',
                texto: `Sincronização "${json.rotulo}" iniciada! Os bloqueios do clin.care serão atualizados em ${tempoEstimado}.`,
            });
        } catch {
            setFeedbackSync({
                tipo: 'erro',
                texto: 'Erro de conexão ao solicitar sincronização.',
            });
        } finally {
            setDisparandoSync(null);
        }
    }

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

    const escuro = tema === 'escuro';

    // Paleta executiva derivada da logo R4:
    // Primária: Azul-Petróleo (#0E7C86 / #1496A1)
    // Base escura: Carvão Café (#0B0E11 / #151A21)
    // Acentos pontuais: Carmesim (#BE1E23) e Terracota (#C24124)
    const clsBgApp = escuro
        ? 'bg-[#0B0E11] text-stone-100'
        : 'bg-[#F4F6F8] text-stone-900';
    const clsSidebar = escuro
        ? 'bg-[#11151A] border-[#1F262E]'
        : 'bg-white border-stone-200 shadow-xs';
    const clsCard = escuro
        ? 'bg-[#151A21] border-[#232B35] shadow-lg shadow-black/25'
        : 'bg-white border-stone-200/90 shadow-xs';
    const clsSubCard = escuro
        ? 'bg-[#0E1217] border-[#232B35]'
        : 'bg-stone-50 border-stone-200/80';
    const clsInput = escuro
        ? 'bg-[#0E1217] border-[#2B3440] text-stone-100 placeholder:text-stone-500 focus:border-[#1496A1]'
        : 'bg-white border-stone-300 text-stone-900 placeholder:text-stone-400 focus:border-[#0E7C86]';
    const clsTitulo = escuro ? 'text-stone-100' : 'text-stone-900';
    const clsSubtexto = escuro ? 'text-stone-400' : 'text-stone-500';

    if (!autenticado) {
        return (
            <div
                className={`min-h-screen flex items-center justify-center p-4 transition-colors ${clsBgApp}`}
            >
                <div
                    className={`max-w-md w-full border rounded-2xl p-7 sm:p-8 space-y-6 ${clsCard}`}
                >
                    <div className="flex items-center justify-between">
                        <LogoR4 temaEscuro={escuro} subtitulo="Painel Administrativo" />
                        <button
                            type="button"
                            onClick={alternarTema}
                            title="Alternar tema claro/escuro"
                            className={`p-2.5 rounded-xl border transition cursor-pointer ${
                                escuro
                                    ? 'bg-[#0E1217] border-[#2B3440] text-amber-300 hover:border-stone-500'
                                    : 'bg-stone-100 border-stone-200 text-stone-700 hover:bg-stone-200'
                            }`}
                        >
                            {escuro ? (
                                <Sun className="w-4 h-4" />
                            ) : (
                                <Moon className="w-4 h-4" />
                            )}
                        </button>
                    </div>

                    <div className="space-y-1">
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1496A1]">
                            <Lock className="w-3.5 h-3.5" /> Acesso Administrativo
                        </div>
                        <h2 className={`text-xl font-bold ${clsTitulo}`}>
                            Entrar no Sistema
                        </h2>
                        <p className={`text-sm ${clsSubtexto}`}>
                            Informe a senha administrativa para gerenciar agendamentos, grades
                            e sincronização.
                        </p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label
                                htmlFor="senha-admin"
                                className={`block text-xs font-medium mb-1.5 ${clsSubtexto}`}
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
                                className={`w-full border rounded-xl px-4 py-3 text-base focus:outline-none ${clsInput}`}
                            />
                        </div>

                        {erroLogin && (
                            <p className="text-xs text-[#F87171] bg-[#BE1E23]/15 border border-[#BE1E23]/40 rounded-xl px-3.5 py-2.5">
                                {erroLogin}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={entrando}
                            className="w-full py-3 px-4 bg-[#0E7C86] hover:bg-[#118E99] text-white font-semibold rounded-xl text-base shadow-md shadow-[#0E7C86]/25 transition cursor-pointer"
                        >
                            {entrando ? 'Verificando...' : 'Acessar Painel'}
                        </button>
                    </form>

                    <div
                        className={`pt-3 border-t text-center ${
                            escuro ? 'border-[#232B35]' : 'border-stone-200'
                        }`}
                    >
                        <Link
                            href="/"
                            className={`text-xs inline-flex items-center gap-1.5 hover:text-[#1496A1] ${clsSubtexto}`}
                        >
                            <ArrowLeft className="w-3.5 h-3.5" /> Voltar para o agendamento
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const restanteHoje = calcularRestanteSegundos(cooldownsSync.hoje);
    const restanteSemana = calcularRestanteSegundos(cooldownsSync.semana);
    const restanteMes = calcularRestanteSegundos(cooldownsSync.mes);

    const confirmadosCount = agendamentos.filter(
        (a) => a.status === 'confirmado'
    ).length;
    const pendentesClinCare = agendamentos.filter(
        (a) => a.status !== 'cancelado' && !a.sincronizado_clincare
    ).length;

    const itensMenuLateral: {
        id: AbaAdmin;
        rotulo: string;
        subtitulo: string;
        badge?: number;
        icone: React.ReactNode;
    }[] = [
        {
            id: 'agendamentos',
            rotulo: 'Agendamentos',
            subtitulo: 'Aulas, sync e relatórios',
            badge: confirmadosCount,
            icone: <CalendarCheck2 className="w-4 h-4" />,
        },
        {
            id: 'mapa',
            rotulo: 'Mapa do Dia',
            subtitulo: 'Grade de horários',
            icone: <CalendarDays className="w-4 h-4" />,
        },
        {
            id: 'datas',
            rotulo: 'Bloquear / Liberar',
            subtitulo: 'Exceções de datas',
            badge: datasLiberadas.length,
            icone: <CalendarPlus className="w-4 h-4" />,
        },
        {
            id: 'professores',
            rotulo: 'Professores',
            subtitulo: 'Turnos e matérias',
            badge: professores.filter((p) => p.ativo).length,
            icone: <GraduationCap className="w-4 h-4" />,
        },
        {
            id: 'unidades',
            rotulo: 'Unidades',
            subtitulo: 'IDs e clin.care',
            icone: <Building2 className="w-4 h-4" />,
        },
    ];

    const metaAbaAtual: Record<
        AbaAdmin,
        { titulo: string; descricao: string }
    > = {
        agendamentos: {
            titulo: 'Agendamentos & Operação',
            descricao:
                'Acompanhe as aulas marcadas, sincronize bloqueios do clin.care e exporte relatórios.',
        },
        mapa: {
            titulo: 'Mapa do Dia',
            descricao:
                'Visualize horários livres, aulas agendadas e bloqueios do clin.care por unidade.',
        },
        datas: {
            titulo: 'Bloquear ou Liberar Datas',
            descricao:
                'Gerencie feriados bloqueados ou libere datas extras fora do calendário padrão.',
        },
        professores: {
            titulo: 'Equipe de Professores',
            descricao:
                'Configure matérias, unidades e turnos de 100 minutos (manhã e tarde/noite).',
        },
        unidades: {
            titulo: 'Unidades & Integração',
            descricao:
                'Gerencie as unidades presenciais, Online, Imbuí e os vínculos com o clin.care.',
        },
    };

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

    function renderConteudoSidebar() {
        return (
            <div className="flex flex-col justify-between h-full p-5">
                <div className="space-y-7">
                    {/* Logo da Empresa sem fundo */}
                    <div className="flex items-center justify-between">
                        <LogoR4 temaEscuro={escuro} subtitulo="Painel Administrativo" />
                        <button
                            type="button"
                            onClick={() => setMenuMobileAberto(false)}
                            className="lg:hidden p-1.5 rounded-lg text-stone-400 hover:text-white"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Blocos Principais de Navegação */}
                    <nav className="space-y-1.5">
                        <p
                            className={`px-2 text-[10px] font-bold uppercase tracking-widest mb-3 ${clsSubtexto}`}
                        >
                            Módulos
                        </p>

                        {itensMenuLateral.map((item) => {
                            const ativo = aba === item.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                        setAba(item.id);
                                        setMenuMobileAberto(false);
                                    }}
                                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl transition cursor-pointer group ${
                                        ativo
                                            ? escuro
                                                ? 'bg-[#0E7C86]/20 text-white border border-[#0E7C86]/50'
                                                : 'bg-[#0E7C86]/10 text-[#0B5C63] border border-[#0E7C86]/30'
                                            : escuro
                                                ? 'text-stone-400 hover:bg-[#181E26] hover:text-stone-100 border border-transparent'
                                                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-transparent'
                                    }`}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                    <span
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition ${
                            ativo
                                ? 'bg-[#0E7C86] text-white shadow-sm shadow-[#0E7C86]/40'
                                : escuro
                                    ? 'bg-[#0E1217] text-stone-400 group-hover:text-white border border-[#232B35]'
                                    : 'bg-stone-100 text-stone-500 group-hover:text-[#0E7C86] border border-stone-200'
                        }`}
                    >
                      {item.icone}
                    </span>
                                        <div className="text-left truncate">
                                            <p className="text-sm font-semibold leading-tight truncate">
                                                {item.rotulo}
                                            </p>
                                            <p
                                                className={`text-[11px] truncate ${
                                                    ativo
                                                        ? escuro
                                                            ? 'text-[#39B8C4]'
                                                            : 'text-[#0E7C86]'
                                                        : clsSubtexto
                                                }`}
                                            >
                                                {item.subtitulo}
                                            </p>
                                        </div>
                                    </div>

                                    {typeof item.badge === 'number' && (
                                        <span
                                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                                ativo
                                                    ? 'bg-[#0E7C86] text-white'
                                                    : escuro
                                                        ? 'bg-[#0E1217] text-stone-300 border border-[#232B35]'
                                                        : 'bg-stone-100 text-stone-700'
                                            }`}
                                        >
                      {item.badge}
                    </span>
                                    )}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* Rodapé da Sidebar */}
                <div
                    className={`pt-4 border-t space-y-1.5 ${
                        escuro ? 'border-[#1F262E]' : 'border-stone-200'
                    }`}
                >
                    <Link
                        href="/"
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                            escuro
                                ? 'text-stone-300 hover:bg-[#181E26]'
                                : 'text-stone-700 hover:bg-stone-100'
                        }`}
                    >
            <span
                className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    escuro
                        ? 'bg-[#0E1217] text-[#25A4AF] border border-[#232B35]'
                        : 'bg-stone-100 text-[#0E7C86]'
                }`}
            >
              <ExternalLink className="w-4 h-4" />
            </span>
                        <span>Link dos Pais</span>
                    </Link>

                    <button
                        type="button"
                        onClick={() => void handleLogout()}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer ${
                            escuro
                                ? 'text-rose-300 hover:bg-[#BE1E23]/15'
                                : 'text-[#BE1E23] hover:bg-rose-50'
                        }`}
                    >
            <span
                className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    escuro
                        ? 'bg-[#0E1217] text-[#F87171] border border-[#232B35]'
                        : 'bg-rose-50 text-[#BE1E23]'
                }`}
            >
              <LogOut className="w-4 h-4" />
            </span>
                        <span>Sair do Painel</span>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen flex transition-colors ${clsBgApp}`}>
            {/* SIDEBAR DESKTOP FIXA À ESQUERDA */}
            <aside
                className={`hidden lg:block w-72 shrink-0 border-r sticky top-0 h-screen ${clsSidebar}`}
            >
                {renderConteudoSidebar()}
            </aside>

            {/* SIDEBAR MOBILE (DRAWER) */}
            {menuMobileAberto && (
                <div className="fixed inset-0 z-50 lg:hidden flex">
                    <div
                        onClick={() => setMenuMobileAberto(false)}
                        className="fixed inset-0 bg-black/60 backdrop-blur-xs"
                    />
                    <aside
                        className={`relative w-72 max-w-[85vw] h-full border-r ${clsSidebar}`}
                    >
                        {renderConteudoSidebar()}
                    </aside>
                </div>
            )}

            {/* ÁREA PRINCIPAL */}
            <div className="flex-1 min-w-0 flex flex-col">
                {/* TOPBAR */}
                <header
                    className={`sticky top-0 z-30 border-b px-4 sm:px-8 py-4 backdrop-blur-md ${
                        escuro
                            ? 'bg-[#0B0E11]/90 border-[#1F262E]'
                            : 'bg-white/90 border-stone-200'
                    }`}
                >
                    <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setMenuMobileAberto(true)}
                                className={`lg:hidden p-2.5 rounded-xl border ${
                                    escuro
                                        ? 'bg-[#151A21] border-[#232B35] text-stone-200'
                                        : 'bg-stone-100 border-stone-200 text-stone-700'
                                }`}
                            >
                                <Menu className="w-5 h-5" />
                            </button>

                            <div>
                                <div
                                    className={`flex items-center gap-2 text-xs ${clsSubtexto}`}
                                >
                                    <span>Painel R4</span>
                                    <span>/</span>
                                    <span className="text-[#1496A1] font-semibold">
                    {metaAbaAtual[aba].titulo}
                  </span>
                                </div>
                                <h1
                                    className={`text-xl sm:text-2xl font-bold tracking-tight ${clsTitulo}`}
                                >
                                    {metaAbaAtual[aba].titulo}
                                </h1>
                            </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                            {/* Indicador Status Link */}
                            <span
                                className={`hidden sm:inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-full border ${
                                    sistemaAbertoAgora
                                        ? escuro
                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                        : escuro
                                            ? 'bg-[#BE1E23]/15 border-[#BE1E23]/40 text-rose-300'
                                            : 'bg-rose-50 border-rose-200 text-[#BE1E23]'
                                }`}
                            >
                <span
                    className={`w-2 h-2 rounded-full ${
                        sistemaAbertoAgora ? 'bg-emerald-400' : 'bg-[#BE1E23]'
                    }`}
                />
                                {sistemaAbertoAgora ? 'Link Aberto' : 'Link Fechado'}
              </span>

                            {/* Atualizar Dados */}
                            <button
                                type="button"
                                onClick={() => void carregarDados()}
                                title="Atualizar dados"
                                className={`p-2.5 rounded-xl border transition cursor-pointer ${
                                    escuro
                                        ? 'bg-[#151A21] border-[#232B35] text-stone-300 hover:text-white hover:border-stone-600'
                                        : 'bg-stone-100 border-stone-200 text-stone-700 hover:bg-stone-200'
                                }`}
                            >
                                <RefreshCw
                                    className={`w-4 h-4 ${carregandoDados ? 'animate-spin' : ''}`}
                                />
                            </button>

                            {/* Botão Tema Claro / Escuro */}
                            <button
                                type="button"
                                onClick={alternarTema}
                                className={`px-3.5 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-2 transition cursor-pointer ${
                                    escuro
                                        ? 'bg-[#151A21] border-[#232B35] text-amber-300 hover:border-stone-600'
                                        : 'bg-[#231917] border-[#231917] text-white hover:bg-stone-800'
                                }`}
                            >
                                {escuro ? (
                                    <>
                                        <Sun className="w-4 h-4" />
                                        <span>Tema Claro</span>
                                    </>
                                ) : (
                                    <>
                                        <Moon className="w-4 h-4" />
                                        <span>Tema Escuro</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </header>

                {/* CORPO PRINCIPAL */}
                <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 py-6">
                    {carregandoDados && (
                        <p className={`text-xs mb-4 ${clsSubtexto}`}>
                            Atualizando registros do sistema...
                        </p>
                    )}

                    {/* ABA 1: AGENDAMENTOS (COM COLUNA DE CONTROLE À DIREITA) */}
                    {aba === 'agendamentos' && (
                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                            {/* LISTA E FILTROS (8 COLUNAS) */}
                            <section className="xl:col-span-8 space-y-4">
                                <div className={`border rounded-2xl p-5 space-y-4 ${clsCard}`}>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        <div>
                                            <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                                Período (Mês)
                                            </label>
                                            <input
                                                type="month"
                                                value={filtroMes}
                                                onChange={(e) => setFiltroMes(e.target.value)}
                                                className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${clsInput}`}
                                            />
                                        </div>

                                        <div>
                                            <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                                Unidade
                                            </label>
                                            <select
                                                value={filtroUnidade}
                                                onChange={(e) => setFiltroUnidade(e.target.value)}
                                                className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${clsInput}`}
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
                                            <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                                Professor(a)
                                            </label>
                                            <select
                                                value={filtroProfessor}
                                                onChange={(e) => setFiltroProfessor(e.target.value)}
                                                className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${clsInput}`}
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
                                            <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                                Colégio
                                            </label>
                                            <select
                                                value={filtroColegio}
                                                onChange={(e) => setFiltroColegio(e.target.value)}
                                                className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${clsInput}`}
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
                                            <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                                Status
                                            </label>
                                            <select
                                                value={filtroStatus}
                                                onChange={(e) => setFiltroStatus(e.target.value)}
                                                className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${clsInput}`}
                                            >
                                                <option value="confirmado">Confirmados</option>
                                                <option value="concluido">Concluídos</option>
                                                <option value="cancelado">Cancelados</option>
                                                <option value="todos">Todos os Status</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                                Lançamento clin.care
                                            </label>
                                            <select
                                                value={filtroClinCare}
                                                onChange={(e) => setFiltroClinCare(e.target.value)}
                                                className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${clsInput}`}
                                            >
                                                <option value="todos">Todos</option>
                                                <option value="pendentes">Pendentes de lançar</option>
                                                <option value="lancados">Já lançados</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div
                                        className={`flex flex-wrap items-center justify-between gap-3 pt-3 border-t ${
                                            escuro ? 'border-[#232B35]' : 'border-stone-200'
                                        }`}
                                    >
                                        <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`font-bold ${clsTitulo}`}>
                        {agendamentosFiltrados.length} aula(s)
                      </span>
                                            {demandaPorMateria.slice(0, 4).map(([mat, qtd]) => (
                                                <span
                                                    key={mat}
                                                    className={`px-2.5 py-0.5 rounded-full border text-[11px] ${clsSubCard}`}
                                                >
                          {mat}:{' '}
                                                    <strong className="text-[#1496A1]">{qtd}</strong>
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
                                                    className="text-xs text-[#1496A1] hover:underline cursor-pointer"
                                                >
                                                    Limpar filtros
                                                </button>
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            disabled={agendamentosFiltrados.length === 0}
                                            onClick={exportarRelatorioCSV}
                                            className="px-4 py-2 rounded-xl bg-[#0E7C86] hover:bg-[#118E99] disabled:opacity-40 text-xs font-semibold text-white inline-flex items-center gap-1.5 shadow-sm cursor-pointer transition"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            Exportar CSV
                                        </button>
                                    </div>
                                </div>

                                {agendamentosFiltrados.length === 0 ? (
                                    <div
                                        className={`border rounded-2xl p-10 text-center text-sm ${clsCard} ${clsSubtexto}`}
                                    >
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
                                                    className={`border rounded-2xl p-5 space-y-3 transition ${clsCard}`}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div>
                                                            <h3 className={`text-base font-bold ${clsTitulo}`}>
                                                                {ag.nome_aluno}
                                                            </h3>
                                                            <p className={`text-xs ${clsSubtexto}`}>
                                                                {[ag.colegio_aluno, ag.serie_aluno]
                                                                    .filter(Boolean)
                                                                    .join(' • ')}
                                                            </p>
                                                        </div>

                                                        <div className="flex flex-col items-end gap-1.5">
                              <span
                                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                                      ag.status === 'confirmado'
                                          ? 'bg-emerald-500/15 text-emerald-400'
                                          : ag.status === 'concluido'
                                              ? 'bg-[#0E7C86]/20 text-[#25A4AF]'
                                              : 'bg-[#BE1E23]/20 text-rose-400'
                                  }`}
                              >
                                {ag.status.toUpperCase()}
                              </span>

                                                            {ag.status !== 'cancelado' && (
                                                                <span
                                                                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                                                        ag.sincronizado_clincare
                                                                            ? 'bg-[#0E7C86]/15 text-[#25A4AF] border-[#0E7C86]/35'
                                                                            : 'bg-[#C24124]/15 text-amber-400 border-[#C24124]/35'
                                                                    }`}
                                                                >
                                  {ag.sincronizado_clincare
                                      ? 'Lançado clin.care'
                                      : 'Pendente clin.care'}
                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div
                                                        className={`border rounded-xl p-3.5 text-xs space-y-1.5 ${clsSubCard}`}
                                                    >
                                                        <p>
                                                            <strong>Unidade:</strong> {ag.unidade_nome} •{' '}
                                                            <strong>Matéria:</strong> {ag.materia}
                                                        </p>
                                                        <p>
                                                            <strong>Professor(a):</strong> {ag.professor_nome}
                                                        </p>
                                                        <p className="text-[#1496A1] font-bold">
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
                                                            <p className={clsSubtexto}>
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
                                                                className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-500 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-emerald-500/25"
                                                            >
                                                                <MessageCircle className="w-3.5 h-3.5" />{' '}
                                                                WhatsApp
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
                                                                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition ${
                                                                    ag.sincronizado_clincare
                                                                        ? 'bg-[#0E7C86]/15 border-[#0E7C86]/40 text-[#25A4AF]'
                                                                        : 'bg-[#C24124]/15 border-[#C24124]/40 text-amber-500'
                                                                }`}
                                                            >
                                                                <ClipboardCheck className="w-3.5 h-3.5" />
                                                                {ag.sincronizado_clincare
                                                                    ? 'Lançado ✓'
                                                                    : 'Marcar Lançado'}
                                                            </button>
                                                        )}

                                                        {ag.status === 'confirmado' && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        void alterarStatusAgendamento(
                                                                            ag.id,
                                                                            'concluido'
                                                                        )
                                                                    }
                                                                    className="px-3 py-1.5 rounded-xl bg-[#0E7C86]/15 border border-[#0E7C86]/40 text-[#25A4AF] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                                                                >
                                                                    <CheckCircle2 className="w-3.5 h-3.5" />{' '}
                                                                    Concluir
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        void alterarStatusAgendamento(
                                                                            ag.id,
                                                                            'cancelado'
                                                                        )
                                                                    }
                                                                    className="px-3 py-1.5 rounded-xl bg-[#BE1E23]/15 border border-[#BE1E23]/40 text-rose-400 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                                                                >
                                                                    <XCircle className="w-3.5 h-3.5" /> Cancelar
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

                            {/* COLUNA DIREITA DE WIDGETS — EXIBIDA SOMENTE EM AGENDAMENTOS */}
                            <aside className="xl:col-span-4 space-y-5">
                                {/* Widget 1: Chave Mestra */}
                                <div className={`border rounded-2xl p-5 space-y-4 ${clsCard}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-9 h-9 rounded-xl bg-[#0E7C86] text-white flex items-center justify-center shadow-xs">
                                                <Power className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h2 className={`text-sm font-bold ${clsTitulo}`}>
                                                    Chave Mestra
                                                </h2>
                                                <p className={`text-[11px] ${clsSubtexto}`}>
                                                    Controle do Link dos Pais
                                                </p>
                                            </div>
                                        </div>

                                        <span
                                            className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                                                sistemaAbertoAgora
                                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/35'
                                                    : 'bg-[#BE1E23]/20 text-rose-400 border border-[#BE1E23]/40'
                                            }`}
                                        >
                      {sistemaAbertoAgora ? 'ABERTO' : 'FECHADO'}
                    </span>
                                    </div>

                                    <p className={`text-xs leading-relaxed ${clsSubtexto}`}>
                                        No modo <strong>Automático</strong>, abre de segunda a
                                        sexta, das 18:00 às 22:00.
                                    </p>

                                    <div className="grid grid-cols-3 gap-2">
                                        <button
                                            type="button"
                                            disabled={salvandoChaveMestra}
                                            onClick={() => void alterarChaveMestra('auto')}
                                            className={`py-2 px-2 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                                                modoChaveMestra === 'auto'
                                                    ? 'bg-[#0E7C86] border-[#1496A1] text-white'
                                                    : `${clsSubCard} ${clsSubtexto}`
                                            }`}
                                        >
                                            Automático
                                        </button>

                                        <button
                                            type="button"
                                            disabled={salvandoChaveMestra}
                                            onClick={() => void alterarChaveMestra('ativo')}
                                            className={`py-2 px-2 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                                                modoChaveMestra === 'ativo'
                                                    ? 'bg-emerald-700 border-emerald-500 text-white'
                                                    : `${clsSubCard} ${clsSubtexto}`
                                            }`}
                                        >
                                            Sempre Ativo
                                        </button>

                                        <button
                                            type="button"
                                            disabled={salvandoChaveMestra}
                                            onClick={() => void alterarChaveMestra('inativo')}
                                            className={`py-2 px-2 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                                                modoChaveMestra === 'inativo'
                                                    ? 'bg-[#BE1E23] border-rose-500 text-white'
                                                    : `${clsSubCard} ${clsSubtexto}`
                                            }`}
                                        >
                                            Desativado
                                        </button>
                                    </div>
                                </div>

                                {/* Widget 2: Sincronização clin.care */}
                                <div className={`border rounded-2xl p-5 space-y-4 ${clsCard}`}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className={`text-sm font-bold ${clsTitulo}`}>
                                                Sincronizar clin.care
                                            </h2>
                                            <p className={`text-[11px] ${clsSubtexto}`}>
                                                Última leitura:{' '}
                                                <strong>{ultimaSincronizacao || 'Aguardando'}</strong>
                                            </p>
                                        </div>
                                        <RefreshCw className="w-4 h-4 text-[#1496A1]" />
                                    </div>

                                    <div className="space-y-2">
                                        <button
                                            type="button"
                                            disabled={restanteHoje > 0 || disparandoSync !== null}
                                            onClick={() => void dispararSincronizacao('hoje')}
                                            className={`w-full px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between border transition ${
                                                restanteHoje > 0
                                                    ? `${clsSubCard} ${clsSubtexto} cursor-not-allowed`
                                                    : 'bg-[#0E7C86]/15 hover:bg-[#0E7C86] border-[#0E7C86]/45 text-[#25A4AF] hover:text-white cursor-pointer'
                                            }`}
                                        >
                      <span className="inline-flex items-center gap-2">
                        <Play className="w-3.5 h-3.5" />
                          {disparandoSync === 'hoje'
                              ? 'Iniciando...'
                              : 'Sincronizar Hoje (Rápido)'}
                      </span>
                                            <span className="text-[11px] font-mono">
                        {restanteHoje > 0
                            ? formatarCronometro(restanteHoje)
                            : '5 min trava'}
                      </span>
                                        </button>

                                        <button
                                            type="button"
                                            disabled={restanteSemana > 0 || disparandoSync !== null}
                                            onClick={() => void dispararSincronizacao('semana')}
                                            className={`w-full px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between border transition ${
                                                restanteSemana > 0
                                                    ? `${clsSubCard} ${clsSubtexto} cursor-not-allowed`
                                                    : 'bg-[#0E7C86]/10 hover:bg-[#0E7C86] border-[#0E7C86]/35 text-[#25A4AF] hover:text-white cursor-pointer'
                                            }`}
                                        >
                      <span className="inline-flex items-center gap-2">
                        <Play className="w-3.5 h-3.5" />
                          {disparandoSync === 'semana'
                              ? 'Iniciando...'
                              : 'Sincronizar Semana (7d)'}
                      </span>
                                            <span className="text-[11px] font-mono">
                        {restanteSemana > 0
                            ? formatarCronometro(restanteSemana)
                            : '30 min trava'}
                      </span>
                                        </button>

                                        <button
                                            type="button"
                                            disabled={restanteMes > 0 || disparandoSync !== null}
                                            onClick={() => void dispararSincronizacao('mes')}
                                            className={`w-full px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between border transition ${
                                                restanteMes > 0
                                                    ? `${clsSubCard} ${clsSubtexto} cursor-not-allowed`
                                                    : 'bg-[#0E7C86]/10 hover:bg-[#0E7C86] border-[#0E7C86]/35 text-[#25A4AF] hover:text-white cursor-pointer'
                                            }`}
                                        >
                      <span className="inline-flex items-center gap-2">
                        <Play className="w-3.5 h-3.5" />
                          {disparandoSync === 'mes'
                              ? 'Iniciando...'
                              : 'Sincronizar Mês (30d)'}
                      </span>
                                            <span className="text-[11px] font-mono">
                        {restanteMes > 0
                            ? formatarCronometro(restanteMes)
                            : '1h trava'}
                      </span>
                                        </button>
                                    </div>

                                    {feedbackSync && (
                                        <div
                                            className={`rounded-xl border p-3 text-xs flex items-start justify-between gap-2 ${
                                                feedbackSync.tipo === 'sucesso'
                                                    ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                                                    : 'bg-[#BE1E23]/15 border-[#BE1E23]/40 text-rose-400'
                                            }`}
                                        >
                                            <span>{feedbackSync.texto}</span>
                                            <button
                                                type="button"
                                                onClick={() => setFeedbackSync(null)}
                                                className="cursor-pointer shrink-0"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Widget 3: Resumo Operacional */}
                                <div className={`border rounded-2xl p-5 space-y-3 ${clsCard}`}>
                                    <h2 className={`text-sm font-bold ${clsTitulo}`}>
                                        Resumo Operacional
                                    </h2>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className={`border rounded-xl p-3.5 ${clsSubCard}`}>
                                            <p className={`text-[11px] ${clsSubtexto}`}>
                                                Confirmadas
                                            </p>
                                            <p className="text-2xl font-bold text-[#1496A1] mt-0.5">
                                                {confirmadosCount}
                                            </p>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                setFiltroStatus('todos');
                                                setFiltroClinCare('pendentes');
                                            }}
                                            className={`border rounded-xl p-3.5 text-left transition cursor-pointer hover:border-[#C24124]/60 ${clsSubCard}`}
                                        >
                                            <p className={`text-[11px] ${clsSubtexto}`}>
                                                Pendentes clin.care
                                            </p>
                                            <p className="text-2xl font-bold text-[#D96B43] mt-0.5">
                                                {pendentesClinCare}
                                            </p>
                                        </button>
                                    </div>
                                </div>
                            </aside>
                        </div>
                    )}

                    {/* ABA 2: MAPA DO DIA (LARGURA TOTAL) */}
                    {aba === 'mapa' && (
                        <section className="space-y-4">
                            <div className={`border rounded-2xl p-5 space-y-4 ${clsCard}`}>
                                <div className="flex flex-wrap items-end justify-between gap-4">
                                    <div className="flex flex-wrap items-end gap-3">
                                        <div>
                                            <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                                Unidade
                                            </label>
                                            <select
                                                value={mapaUnidadeId}
                                                onChange={(e) =>
                                                    setMapaUnidadeId(Number(e.target.value))
                                                }
                                                className={`border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                                            >
                                                {unidades.map((u) => (
                                                    <option key={u.id} value={u.id}>
                                                        {u.nome}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                                Data da Grade
                                            </label>
                                            <input
                                                type="date"
                                                value={mapaData}
                                                onChange={(e) => setMapaData(e.target.value)}
                                                className={`border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                                            />
                                        </div>

                                        <div>
                                            <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                                Filtrar Professor / Matéria
                                            </label>
                                            <input
                                                type="text"
                                                value={mapaBuscaProf}
                                                onChange={(e) => setMapaBuscaProf(e.target.value)}
                                                placeholder="Buscar na grade..."
                                                className={`border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-4 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-emerald-500 font-medium">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      Livre
                    </span>
                                        <span className="inline-flex items-center gap-1.5 text-[#1496A1] font-medium">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#0E7C86]" />
                      Aula Agendada
                    </span>
                                        <span className="inline-flex items-center gap-1.5 text-[#D96B43] font-medium">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#C24124]" />
                      Bloqueio clin.care
                    </span>
                                    </div>
                                </div>
                            </div>

                            {professoresMapa.length === 0 ? (
                                <div
                                    className={`border rounded-2xl p-8 text-center text-sm ${clsCard} ${clsSubtexto}`}
                                >
                                    Nenhum professor ativo encontrado para esta unidade/filtro.
                                </div>
                            ) : (
                                <div
                                    className={`border rounded-2xl overflow-x-auto ${clsCard}`}
                                >
                                    <table className="w-full text-left border-collapse min-w-[760px]">
                                        <thead>
                                        <tr
                                            className={`border-b text-xs uppercase tracking-wider ${
                                                escuro
                                                    ? 'border-[#232B35] bg-[#0E1217] text-stone-400'
                                                    : 'border-stone-200 bg-stone-50 text-stone-500'
                                            }`}
                                        >
                                            <th className="py-3.5 px-4 font-semibold w-60">
                                                Professor(a)
                                            </th>
                                            {colunasSlotsMapa.map((slot) => (
                                                <th
                                                    key={slot.inicio}
                                                    className="py-3.5 px-3 font-semibold"
                                                >
                            <span className="inline-flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-[#1496A1]" />
                                {slot.label}
                            </span>
                                                </th>
                                            ))}
                                        </tr>
                                        </thead>
                                        <tbody
                                            className={`divide-y text-xs ${
                                                escuro ? 'divide-[#232B35]' : 'divide-stone-200'
                                            }`}
                                        >
                                        {professoresMapa.map((prof) => {
                                            const slotsProf = gerarTodosSlotsProfessor(prof);

                                            return (
                                                <tr key={prof.id}>
                                                    <td className="py-3.5 px-4 align-top">
                                                        <p className={`font-bold text-sm ${clsTitulo}`}>
                                                            {prof.nome}
                                                        </p>
                                                        <p className={`mt-0.5 ${clsSubtexto}`}>
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
                                                                    <div
                                                                        className={`border rounded-xl p-2.5 text-center ${clsSubCard} ${clsSubtexto}`}
                                                                    >
                                                                        —
                                                                    </div>
                                                                </td>
                                                            );
                                                        }

                                                        const slotInicioMin = horaParaMinutos(
                                                            slot.inicio
                                                        );
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
                                                                    b.professor_clin_care_id ===
                                                                    prof.clin_care_id);
                                                            if (!mesmoProf) return false;
                                                            const bIni = horaParaMinutos(b.hora_inicio);
                                                            const bFim = horaParaMinutos(b.hora_fim);
                                                            return (
                                                                slotInicioMin < bFim && bIni < slotFimMin
                                                            );
                                                        });

                                                        if (aulaNoSlot) {
                                                            return (
                                                                <td
                                                                    key={slot.inicio}
                                                                    className="py-2.5 px-3 align-top"
                                                                >
                                                                    <div className="bg-[#0E7C86]/15 border border-[#0E7C86]/45 rounded-xl p-2.5 space-y-1">
                                                                        <div className="flex items-center justify-between gap-1">
                                        <span
                                            className={`font-bold truncate ${clsTitulo}`}
                                        >
                                          {aulaNoSlot.nome_aluno}
                                        </span>
                                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#0E7C86]/25 text-[#25A4AF]">
                                          {aulaNoSlot.materia}
                                        </span>
                                                                        </div>
                                                                        <p
                                                                            className={`text-[10px] ${clsSubtexto}`}
                                                                        >
                                                                            Resp.:{' '}
                                                                            {aulaNoSlot.nome_responsavel ||
                                                                                'Não inf.'}
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
                                                                    <div className="bg-[#C24124]/15 border border-[#C24124]/45 rounded-xl p-2.5 text-[#E07A5F]">
                                                                        <p className="font-semibold">
                                                                            Bloqueio clin.care
                                                                        </p>
                                                                        <p className="text-[11px] opacity-85 truncate mt-0.5">
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
                                                                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-2.5 text-center text-emerald-500 font-semibold">
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

                    {/* ABA 3: BLOQUEAR / LIBERAR DIAS (LARGURA TOTAL) */}
                    {aba === 'datas' && (
                        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                            <form
                                onSubmit={(e) => void handleAdicionarData(e)}
                                className={`lg:col-span-5 border rounded-2xl p-6 space-y-4 ${clsCard}`}
                            >
                                <h3
                                    className={`text-sm font-bold flex items-center gap-2 ${clsTitulo}`}
                                >
                                    <CalendarPlus className="w-4 h-4 text-[#1496A1]" />
                                    Nova Regra de Data
                                </h3>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setNovoTipoData('bloquear')}
                                        className={`py-2.5 px-3 rounded-xl text-xs font-semibold border cursor-pointer ${
                                            novoTipoData === 'bloquear'
                                                ? 'bg-[#BE1E23]/20 border-[#BE1E23] text-rose-400'
                                                : `${clsSubCard} ${clsSubtexto}`
                                        }`}
                                    >
                                        Bloquear Dia
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setNovoTipoData('liberar')}
                                        className={`py-2.5 px-3 rounded-xl text-xs font-semibold border cursor-pointer ${
                                            novoTipoData === 'liberar'
                                                ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                                                : `${clsSubCard} ${clsSubtexto}`
                                        }`}
                                    >
                                        Liberar Extra
                                    </button>
                                </div>

                                <div>
                                    <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                        Data *
                                    </label>
                                    <input
                                        type="date"
                                        required
                                        value={novaData}
                                        onChange={(e) => setNovaData(e.target.value)}
                                        className={`w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                                    />
                                </div>

                                <div>
                                    <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                        Motivo / Descrição *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ex: Feriado Nacional ou Plantão"
                                        value={novaDescricao}
                                        onChange={(e) => setNovaDescricao(e.target.value)}
                                        className={`w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className={`w-full py-3 px-4 font-semibold rounded-xl text-sm inline-flex items-center justify-center gap-2 cursor-pointer text-white ${
                                        novoTipoData === 'bloquear'
                                            ? 'bg-[#BE1E23] hover:bg-rose-700'
                                            : 'bg-[#0E7C86] hover:bg-[#118E99]'
                                    }`}
                                >
                                    <Plus className="w-4 h-4" />
                                    {novoTipoData === 'bloquear'
                                        ? 'Salvar Bloqueio'
                                        : 'Salvar Liberação'}
                                </button>
                            </form>

                            <div
                                className={`lg:col-span-7 border rounded-2xl p-6 space-y-3 ${clsCard}`}
                            >
                                <h3 className={`text-sm font-bold ${clsTitulo}`}>
                                    Exceções Cadastradas ({datasLiberadas.length})
                                </h3>

                                {datasLiberadas.length === 0 ? (
                                    <p className={`text-xs ${clsSubtexto}`}>
                                        Nenhuma exceção configurada no momento.
                                    </p>
                                ) : (
                                    <div className="space-y-2.5">
                                        {datasLiberadas.map((d) => (
                                            <div
                                                key={d.id}
                                                className={`flex items-center justify-between gap-3 border rounded-xl p-3.5 ${clsSubCard}`}
                                            >
                                                <div>
                                                    <p className={`font-bold text-sm ${clsTitulo}`}>
                                                        {formatarDataBR(d.data)}
                                                    </p>
                                                    <p className={`text-xs ${clsSubtexto}`}>
                                                        {d.descricao}
                                                    </p>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => void alternarData(d.id, !d.ativo)}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                                                            d.ativo
                                                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/35'
                                                                : 'bg-[#BE1E23]/20 text-rose-400 border border-[#BE1E23]/40'
                                                        }`}
                                                    >
                                                        {d.ativo ? 'Liberado' : 'Bloqueado'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void excluirData(d.id)}
                                                        className={`p-2 rounded-lg border hover:text-[#BE1E23] cursor-pointer ${clsCard} ${clsSubtexto}`}
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

                    {/* ABA 4: PROFESSORES (LARGURA TOTAL) */}
                    {aba === 'professores' && (
                        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                            <form
                                onSubmit={(e) => void handleAdicionarProfessor(e)}
                                className={`lg:col-span-5 border rounded-2xl p-6 space-y-4 ${clsCard}`}
                            >
                                <h3
                                    className={`text-sm font-bold flex items-center gap-2 ${clsTitulo}`}
                                >
                                    <UserPlus className="w-4 h-4 text-[#1496A1]" />
                                    Cadastrar Professor
                                </h3>

                                <div>
                                    <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                        Nome *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ex: Fernanda Lima"
                                        value={profNome}
                                        onChange={(e) => setProfNome(e.target.value)}
                                        className={`w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                            Unidade *
                                        </label>
                                        <select
                                            value={profUnidadeId}
                                            onChange={(e) =>
                                                setProfUnidadeId(Number(e.target.value))
                                            }
                                            className={`w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                                        >
                                            {unidades.map((u) => (
                                                <option key={u.id} value={u.id}>
                                                    {u.nome}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                            ID clin.care
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Ex: 142"
                                            value={profClinCareId}
                                            onChange={(e) => setProfClinCareId(e.target.value)}
                                            className={`w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                        Matérias (vírgula) *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ex: Português, Redação"
                                        value={profMaterias}
                                        onChange={(e) => setProfMaterias(e.target.value)}
                                        className={`w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                                    />
                                </div>

                                <div
                                    className={`border rounded-xl p-3.5 space-y-3 ${clsSubCard}`}
                                >
                                    <label className="flex items-center gap-2.5 text-xs font-semibold text-[#D96B43] cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={profManhaAtivo}
                                            onChange={(e) => setProfManhaAtivo(e.target.checked)}
                                        />
                                        <Sun className="w-4 h-4" />
                                        Liberar manhã (turnos de 100 min)
                                    </label>

                                    {profManhaAtivo && (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label
                                                    className={`block text-[11px] mb-1 ${clsSubtexto}`}
                                                >
                                                    Início Manhã
                                                </label>
                                                <input
                                                    type="time"
                                                    value={profManhaInicio}
                                                    onChange={(e) => setProfManhaInicio(e.target.value)}
                                                    className={`w-full border rounded-lg px-3 py-2 text-xs ${clsInput}`}
                                                />
                                            </div>
                                            <div>
                                                <label
                                                    className={`block text-[11px] mb-1 ${clsSubtexto}`}
                                                >
                                                    Fim Manhã
                                                </label>
                                                <input
                                                    type="time"
                                                    value={profManhaFim}
                                                    onChange={(e) => setProfManhaFim(e.target.value)}
                                                    className={`w-full border rounded-lg px-3 py-2 text-xs ${clsInput}`}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                            Início Tarde
                                        </label>
                                        <input
                                            type="time"
                                            value={profInicio}
                                            onChange={(e) => setProfInicio(e.target.value)}
                                            className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                                        />
                                    </div>
                                    <div>
                                        <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                            Fim Tarde
                                        </label>
                                        <input
                                            type="time"
                                            value={profFim}
                                            onChange={(e) => setProfFim(e.target.value)}
                                            className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                                        />
                                    </div>
                                </div>

                                {previewSlotsNovoProf.length > 0 && (
                                    <div
                                        className={`text-[11px] border rounded-xl p-2.5 ${clsSubCard} ${clsSubtexto}`}
                                    >
                                        <strong className="text-[#1496A1]">
                                            Turnos ({previewSlotsNovoProf.length}):
                                        </strong>{' '}
                                        {previewSlotsNovoProf.map((s) => s.label).join(' • ')}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    className="w-full py-3 px-4 bg-[#0E7C86] hover:bg-[#118E99] text-white font-semibold rounded-xl text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    <Plus className="w-4 h-4" /> Cadastrar Professor
                                </button>
                            </form>

                            <div
                                className={`lg:col-span-7 border rounded-2xl p-6 space-y-3 ${clsCard}`}
                            >
                                <h3 className={`text-sm font-bold ${clsTitulo}`}>
                                    Professores Cadastrados ({professores.length})
                                </h3>

                                <div className="space-y-2.5 max-h-[680px] overflow-y-auto pr-1">
                                    {professores.map((p) => {
                                        const editandoEste = editProfId === p.id;
                                        const slotsProf = gerarTodosSlotsProfessor(p);

                                        if (editandoEste) {
                                            return (
                                                <form
                                                    key={p.id}
                                                    onSubmit={(e) => void salvarEdicaoProfessor(e)}
                                                    className={`border border-[#0E7C86] rounded-xl p-4 space-y-3 ${clsSubCard}`}
                                                >
                                                    <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase text-[#1496A1]">
                              Editando Professor(a)
                            </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditProfId(null)}
                                                            className={`cursor-pointer ${clsSubtexto}`}
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <input
                                                            type="text"
                                                            required
                                                            value={editProfNome}
                                                            onChange={(e) => setEditProfNome(e.target.value)}
                                                            className={`w-full border rounded-lg px-3 py-2 text-xs ${clsInput}`}
                                                        />
                                                        <select
                                                            value={editProfUnidadeId}
                                                            onChange={(e) =>
                                                                setEditProfUnidadeId(Number(e.target.value))
                                                            }
                                                            className={`w-full border rounded-lg px-3 py-2 text-xs ${clsInput}`}
                                                        >
                                                            {unidades.map((u) => (
                                                                <option key={u.id} value={u.id}>
                                                                    {u.nome}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <input
                                                        type="text"
                                                        required
                                                        value={editProfMaterias}
                                                        onChange={(e) =>
                                                            setEditProfMaterias(e.target.value)
                                                        }
                                                        className={`w-full border rounded-lg px-3 py-2 text-xs ${clsInput}`}
                                                    />

                                                    <div
                                                        className={`border rounded-xl p-2.5 space-y-2 ${clsCard}`}
                                                    >
                                                        <label className="flex items-center gap-2 text-xs font-semibold text-[#D96B43] cursor-pointer">
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
                                                                <input
                                                                    type="time"
                                                                    value={editProfManhaInicio}
                                                                    onChange={(e) =>
                                                                        setEditProfManhaInicio(e.target.value)
                                                                    }
                                                                    className={`w-full border rounded-lg px-2.5 py-1.5 text-xs ${clsInput}`}
                                                                />
                                                                <input
                                                                    type="time"
                                                                    value={editProfManhaFim}
                                                                    onChange={(e) =>
                                                                        setEditProfManhaFim(e.target.value)
                                                                    }
                                                                    className={`w-full border rounded-lg px-2.5 py-1.5 text-xs ${clsInput}`}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="grid grid-cols-3 gap-2">
                                                        <input
                                                            type="text"
                                                            placeholder="ID clin.care"
                                                            value={editProfClinCareId}
                                                            onChange={(e) =>
                                                                setEditProfClinCareId(e.target.value)
                                                            }
                                                            className={`w-full border rounded-lg px-3 py-2 text-xs ${clsInput}`}
                                                        />
                                                        <input
                                                            type="time"
                                                            value={editProfInicio}
                                                            onChange={(e) =>
                                                                setEditProfInicio(e.target.value)
                                                            }
                                                            className={`w-full border rounded-lg px-3 py-2 text-xs ${clsInput}`}
                                                        />
                                                        <input
                                                            type="time"
                                                            value={editProfFim}
                                                            onChange={(e) => setEditProfFim(e.target.value)}
                                                            className={`w-full border rounded-lg px-3 py-2 text-xs ${clsInput}`}
                                                        />
                                                    </div>

                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditProfId(null)}
                                                            className={`px-3 py-1.5 rounded-lg border text-xs cursor-pointer ${clsCard}`}
                                                        >
                                                            Cancelar
                                                        </button>
                                                        <button
                                                            type="submit"
                                                            disabled={salvandoProf}
                                                            className="px-3.5 py-1.5 rounded-lg bg-[#0E7C86] text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
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
                                                className={`flex flex-wrap items-center justify-between gap-3 border rounded-xl p-3.5 ${clsSubCard}`}
                                            >
                                                <div className="space-y-0.5">
                                                    <p className={`font-bold text-sm ${clsTitulo}`}>
                                                        {p.nome}{' '}
                                                        <span className="text-xs font-medium text-[#1496A1]">
                              • {p.unidade_nome}
                            </span>
                                                    </p>
                                                    <p className={`text-xs ${clsSubtexto}`}>
                                                        {(p.materias || []).join(', ')}
                                                    </p>
                                                    <p className={`text-[11px] ${clsSubtexto}`}>
                                                        {p.manha_ativo && (
                                                            <span className="text-[#D96B43] font-medium">
                                Manhã: {p.manha_inicio} às {p.manha_fim} •{' '}
                              </span>
                                                        )}
                                                        Tarde/Noite: {p.hora_inicio} às {p.hora_fim} (
                                                        {slotsProf.length} turnos)
                                                    </p>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => iniciarEdicaoProfessor(p)}
                                                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${clsCard}`}
                                                    >
                                                        <Edit3 className="w-3.5 h-3.5" /> Editar
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            void alternarProfessor(p.id, !p.ativo)
                                                        }
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                                                            p.ativo
                                                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/35'
                                                                : 'bg-stone-500/20 text-stone-400'
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

                    {/* ABA 5: UNIDADES / CLIN.CARE (LARGURA TOTAL) */}
                    {aba === 'unidades' && (
                        <section
                            className={`border rounded-2xl p-6 space-y-4 max-w-3xl ${clsCard}`}
                        >
                            <h3
                                className={`text-sm font-bold flex items-center gap-2 ${clsTitulo}`}
                            >
                                <Building2 className="w-4 h-4 text-[#1496A1]" />
                                Vínculo de Unidades com o clin.care
                            </h3>
                            <p className={`text-xs ${clsSubtexto}`}>
                                Para as unidades <strong>Online</strong> e{' '}
                                <strong>Imbuí</strong>, mantenha <code>id-online</code> e{' '}
                                <code>id-imbui</code> (ou informe o UUID caso elas também
                                possuam agenda no clin.care).
                            </p>

                            <div className="space-y-3">
                                {unidades.map((u) => (
                                    <div
                                        key={u.id}
                                        className={`flex flex-wrap items-center justify-between gap-3 border rounded-xl p-4 ${clsSubCard}`}
                                    >
                                        <div>
                                            <p className={`font-bold text-sm ${clsTitulo}`}>
                                                {u.nome}
                                            </p>
                                            <p className={`text-xs ${clsSubtexto}`}>
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
                                                className={`w-48 border rounded-xl px-3 py-2 text-sm focus:outline-none ${clsInput}`}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => void salvarUnidade(u)}
                                                className="px-3.5 py-2 rounded-xl bg-[#0E7C86] hover:bg-[#118E99] text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
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
            </div>
        </div>
    );
}