'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    Building2,
    CalendarCheck2,
    CalendarDays,
    CalendarPlus,
    Camera,
    CheckCircle2,
    ClipboardCheck,
    Download,
    ExternalLink,
    Eye,
    EyeOff,
    FileText,
    GraduationCap,
    KeyRound,
    Lock,
    LogOut,
    Menu,
    MessageCircle,
    Moon,
    Play,
    Power,
    RefreshCw,
    Sun,
    UserCog,
    Users,
    X,
    XCircle,
} from 'lucide-react';
import AdminWhatsApp from '@/components/AdminWhatsApp';
import LogoR4 from '@/components/LogoR4';
import {
    ModoChaveMestra,
    avaliarStatusChaveMestra,
} from '@/lib/horarios-reforco';
import { TEXTOS_PORTAL_PADRAO, TextosPortal } from '@/lib/portal-textos-padrao';
import AbaAlunos from './AbaAlunos';
import AbaDatas from './AbaDatas';
import AbaMapaDia from './AbaMapaDia';
import AbaProfessores from './AbaProfessores';
import AbaTextosPortal from './AbaTextosPortal';
import AbaUnidades from './AbaUnidades';
import ModalPerfilAdmin from './ModalPerfilAdmin';
import {
    AbaAdmin,
    AgendamentoAdmin,
    AlunoAdmin,
    BloqueioAdmin,
    CooldownsSync,
    DataAdmin,
    PerfilAdmin,
    ProfessorAdmin,
    ResponsavelContaAdmin,
    TemaClasses,
    UnidadeAdmin,
    comprimirImagemAvatar,
    formatarDataBR,
    obterIniciais,
} from './types';

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
    const [modoLogin, setModoLogin] = useState<'perfil' | 'master'>('perfil');
    const [emailLogin, setEmailLogin] = useState('');
    const [senha, setSenha] = useState('');
    const [mostrarSenhaLogin, setMostrarSenhaLogin] = useState(false);
    const [erroLogin, setErroLogin] = useState<string | null>(null);
    const [entrando, setEntrando] = useState(false);

    const [tema, setTema] = useState<'escuro' | 'claro'>('escuro');
    const [menuMobileAberto, setMenuMobileAberto] = useState(false);

    const [aba, setAba] = useState<AbaAdmin>('agendamentos');
    const [carregandoDados, setCarregandoDados] = useState(false);
    const [ultimaSincronizacao, setUltimaSincronizacao] = useState<string | null>(
        null
    );

    const [perfilAtual, setPerfilAtual] = useState<PerfilAdmin>({
        id: 0,
        nome: 'Administrador R4',
        email: '',
        foto_url: null,
    });
    const [perfisAdmin, setPerfisAdmin] = useState<PerfilAdmin[]>([]);
    const [modalPerfilAberto, setModalPerfilAberto] = useState(false);
    const [abaModalPerfil, setAbaModalPerfil] = useState<'meu' | 'equipe'>('meu');
    const [feedbackModalPerfil, setFeedbackModalPerfil] = useState<{
        tipo: 'sucesso' | 'erro';
        texto: string;
    } | null>(null);

    const inputFotoRapidaRef = useRef<HTMLInputElement | null>(null);

    const [textosPortal, setTextosPortal] = useState<TextosPortal>(
        TEXTOS_PORTAL_PADRAO
    );

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

    const [modoChaveMestra, setModoChaveMestra] =
        useState<ModoChaveMestra>('auto');
    const [sistemaAbertoAgora, setSistemaAbertoAgora] = useState<boolean>(() =>
        avaliarStatusChaveMestra('auto').aberto
    );
    const [salvandoChaveMestra, setSalvandoChaveMestra] =
        useState<boolean>(false);

    const [unidades, setUnidades] = useState<UnidadeAdmin[]>([]);
    const [professores, setProfessores] = useState<ProfessorAdmin[]>([]);
    const [responsaveis, setResponsaveis] = useState<ResponsavelContaAdmin[]>([]);
    const [alunos, setAlunos] = useState<AlunoAdmin[]>([]);
    const [datasLiberadas, setDatasLiberadas] = useState<DataAdmin[]>([]);
    const [agendamentos, setAgendamentos] = useState<AgendamentoAdmin[]>([]);
    const [bloqueios, setBloqueios] = useState<BloqueioAdmin[]>([]);

    const [filtroMes, setFiltroMes] = useState<string>('');
    const [filtroUnidade, setFiltroUnidade] = useState<string>('todas');
    const [filtroProfessor, setFiltroProfessor] = useState<string>('todos');
    const [filtroColegio, setFiltroColegio] = useState<string>('todos');
    const [filtroStatus, setFiltroStatus] = useState<string>('confirmado');
    const [filtroClinCare, setFiltroClinCare] = useState<string>('todos');

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

    const carregarPerfisETextos = useCallback(async () => {
        try {
            const [resPerfis, resTextos] = await Promise.all([
                fetch('/api/admin/perfis', { cache: 'no-store' }),
                fetch('/api/admin/textos-portal', { cache: 'no-store' }),
            ]);

            if (resPerfis.ok) {
                const jsonP = await resPerfis.json();
                if (jsonP.perfilAtual) {
                    setPerfilAtual(jsonP.perfilAtual);
                }
                setPerfisAdmin(jsonP.perfis || []);
            }

            if (resTextos.ok) {
                const jsonT = await resTextos.json();
                if (jsonT.textos) {
                    setTextosPortal(jsonT.textos);
                }
            }
        } catch {
            // Ignora falha silenciosa
        }
    }, []);

    const carregarDados = useCallback(async () => {
        setCarregandoDados(true);
        try {
            const res = await fetch('/api/admin/painel', { cache: 'no-store' });
            if (res.status === 401) {
                setAutenticado(false);
                return;
            }
            const json = await res.json();

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

            setUnidades(json.unidades || []);
            setProfessores(json.professores || []);
            setAlunos(json.alunos || []);
            setResponsaveis(json.responsaveis || []);
            setDatasLiberadas(json.datasLiberadas || []);
            setAgendamentos(json.agendamentos || []);
            setBloqueios(json.bloqueios || []);
            setUltimaSincronizacao(json.ultimaSincronizacao || null);

            await carregarPerfisETextos();
        } finally {
            setCarregandoDados(false);
        }
    }, [carregarPerfisETextos]);

    useEffect(() => {
        if (!autenticado) return;
        const timer = window.setTimeout(() => {
            void carregarDados();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [autenticado, carregarDados]);

    async function handleTrocaFotoRapida(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;

        try {
            const base64 = await comprimirImagemAvatar(file);

            if (perfilAtual.id === 0) {
                setPerfilAtual((prev) => ({ ...prev, foto_url: base64 }));
                setAbaModalPerfil('meu');
                setFeedbackModalPerfil({
                    tipo: 'erro',
                    texto:
                        'Foto carregada! Preencha seu Nome, E-mail e uma Senha abaixo para ativar seu perfil pessoal e salvar sua foto.',
                });
                setModalPerfilAberto(true);
                return;
            }

            const res = await fetch('/api/admin/perfis', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: perfilAtual.id,
                    foto_url: base64,
                }),
            });

            if (res.ok) {
                setPerfilAtual((prev) => ({ ...prev, foto_url: base64 }));
                await carregarPerfisETextos();
            }
        } catch {
            setFeedbackModalPerfil({
                tipo: 'erro',
                texto: 'Não foi possível processar esta imagem.',
            });
            setModalPerfilAberto(true);
        }
    }

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
                texto: `Sincronização "${json.rotulo}" iniciada! Os bloqueios do Clin Care serão atualizados em ${tempoEstimado}.`,
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
                body: JSON.stringify({
                    modo: modoLogin,
                    email: modoLogin === 'perfil' ? emailLogin : '',
                    senha,
                }),
            });
            const json = await res.json();
            if (!res.ok) {
                setErroLogin(json.error || 'Falha no login.');
                return;
            }
            setSenha('');
            if (json.perfil) {
                setPerfilAtual({
                    id: json.perfil.id,
                    nome: json.perfil.nome,
                    email: json.perfil.email,
                    foto_url: null,
                });
            }
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

    const escuro = tema === 'escuro';

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

    const classesCompartilhadas: TemaClasses = {
        clsCard,
        clsSubCard,
        clsInput,
        clsTitulo,
        clsSubtexto,
    };

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
                            <Lock className="w-3.5 h-3.5" /> Acesso Administrativo R4 Ensina
                        </div>
                        <h2 className={`text-xl font-bold ${clsTitulo}`}>
                            Entrar no Sistema
                        </h2>
                    </div>

                    <div
                        className={`grid grid-cols-2 gap-1.5 p-1 rounded-xl border ${clsSubCard}`}
                    >
                        <button
                            type="button"
                            onClick={() => {
                                setModoLogin('perfil');
                                setErroLogin(null);
                            }}
                            className={`py-2 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
                                modoLogin === 'perfil'
                                    ? 'bg-[#0E7C86] text-white shadow-xs'
                                    : `${clsSubtexto} hover:text-[#1496A1]`
                            }`}
                        >
                            Perfil (E-mail e Senha)
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setModoLogin('master');
                                setErroLogin(null);
                            }}
                            className={`py-2 px-3 rounded-lg text-xs font-semibold transition cursor-pointer inline-flex items-center justify-center gap-1.5 ${
                                modoLogin === 'master'
                                    ? 'bg-[#0E7C86] text-white shadow-xs'
                                    : `${clsSubtexto} hover:text-[#1496A1]`
                            }`}
                        >
                            <KeyRound className="w-3.5 h-3.5" />
                            Chave Mestra
                        </button>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                        {modoLogin === 'perfil' ? (
                            <div>
                                <label
                                    htmlFor="email-admin"
                                    className={`block text-xs font-medium mb-1.5 ${clsSubtexto}`}
                                >
                                    E-mail do Perfil *
                                </label>
                                <input
                                    id="email-admin"
                                    type="email"
                                    required
                                    value={emailLogin}
                                    onChange={(e) => setEmailLogin(e.target.value)}
                                    placeholder="seuemail@r4ensina.com.br"
                                    className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none ${clsInput}`}
                                />
                            </div>
                        ) : (
                            <div
                                className={`border rounded-xl p-3 text-xs leading-relaxed ${clsSubCard} ${clsSubtexto}`}
                            >
                                <strong className="text-[#1496A1]">Modo Chave Mestra:</strong>{' '}
                                use a senha geral do sistema para entrar sem e-mail ou
                                redefinir a senha de perfis esquecidos.
                            </div>
                        )}

                        <div>
                            <label
                                htmlFor="senha-admin"
                                className={`block text-xs font-medium mb-1.5 ${clsSubtexto}`}
                            >
                                {modoLogin === 'master'
                                    ? 'Senha da Chave Mestra *'
                                    : 'Senha do Perfil *'}
                            </label>
                            <div className="relative">
                                <input
                                    id="senha-admin"
                                    type={mostrarSenhaLogin ? 'text' : 'password'}
                                    required
                                    value={senha}
                                    onChange={(e) => setSenha(e.target.value)}
                                    placeholder="••••••••"
                                    className={`w-full border rounded-xl pl-4 pr-11 py-3 text-base focus:outline-none ${clsInput}`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setMostrarSenhaLogin((v) => !v)}
                                    title={mostrarSenhaLogin ? 'Ocultar senha' : 'Ver senha'}
                                    className={`absolute right-3 top-3.5 cursor-pointer ${clsSubtexto} hover:text-[#1496A1]`}
                                >
                                    {mostrarSenhaLogin ? (
                                        <EyeOff className="w-4 h-4" />
                                    ) : (
                                        <Eye className="w-4 h-4" />
                                    )}
                                </button>
                            </div>
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
                            {entrando
                                ? 'Verificando...'
                                : modoLogin === 'master'
                                    ? 'Entrar com Chave Mestra'
                                    : 'Acessar Painel'}
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

    const professoresUnicosCount = new Set(
        professores
            .filter((p) => p.ativo)
            .map((p) =>
                p.clin_care_id
                    ? `cc:${p.clin_care_id}`
                    : `nm:${p.nome.trim().toLowerCase()}`
            )
    ).size;

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
            id: 'alunos',
            rotulo: 'Alunos',
            subtitulo: 'Responsáveis, WhatsApp e PIN',
            badge: alunos.length,
            icone: <Users className="w-4 h-4" />,
        },
        {
            id: 'textos',
            rotulo: 'Textos do Portal',
            subtitulo: 'Avisos e regras ao vivo',
            icone: <FileText className="w-4 h-4" />,
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
            subtitulo: 'Turnos, matérias e séries',
            badge: professoresUnicosCount,
            icone: <GraduationCap className="w-4 h-4" />,
        },
        {
            id: 'unidades',
            rotulo: 'Unidades',
            subtitulo: 'IDs e matriz de profs',
            icone: <Building2 className="w-4 h-4" />,
        },
        {
            id: 'whatsapp',
            rotulo: 'WhatsApp / Webhook',
            subtitulo: 'Avisos e integração CRM',
            icone: <MessageCircle className="w-4 h-4" />,
        },
    ];

    const metaAbaAtual: Record<AbaAdmin, { titulo: string }> = {
        agendamentos: { titulo: 'Agendamentos & Operação' },
        mapa: { titulo: 'Mapa do Dia' },
        alunos: { titulo: 'Alunos & Responsáveis' },
        textos: { titulo: 'Textos & Avisos do Portal' },
        datas: { titulo: 'Bloquear ou Liberar Datas' },
        professores: { titulo: 'Equipe de Professores' },
        unidades: { titulo: 'Unidades & Distribuição' },
        whatsapp: { titulo: 'WhatsApp & Webhook CRM' },
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
            'Lançado Clin Care',
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

    function renderConteudoSidebar() {
        return (
            <div className="flex flex-col justify-between h-full p-5 overflow-y-auto">
                <div className="space-y-6">
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

                    <div className={`border rounded-2xl p-3 space-y-2.5 ${clsSubCard}`}>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => inputFotoRapidaRef.current?.click()}
                                title="Clique na foto para alterar seu avatar"
                                className="relative w-11 h-11 rounded-full shrink-0 overflow-hidden border-2 border-[#0E7C86] group cursor-pointer bg-[#0E7C86]/20 flex items-center justify-center"
                            >
                                {perfilAtual.foto_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={perfilAtual.foto_url}
                                        alt={perfilAtual.nome}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <span className="text-xs font-bold text-[#1496A1]">
                                        {obterIniciais(perfilAtual.nome)}
                                    </span>
                                )}
                                <span className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                                    <Camera className="w-4 h-4" />
                                </span>
                            </button>

                            <div className="min-w-0 flex-1">
                                <p className={`text-xs font-bold truncate ${clsTitulo}`}>
                                    {perfilAtual.nome}
                                </p>
                                <p className={`text-[10px] truncate ${clsSubtexto}`}>
                                    {perfilAtual.email || 'Acesso Chave Mestra'}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                setFeedbackModalPerfil(null);
                                setAbaModalPerfil(perfilAtual.id === 0 ? 'equipe' : 'meu');
                                setModalPerfilAberto(true);
                                setMenuMobileAberto(false);
                            }}
                            className={`w-full py-1.5 px-2.5 rounded-xl border text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition ${clsCard} ${clsSubtexto} hover:text-[#1496A1] hover:border-[#0E7C86]`}
                        >
                            <UserCog className="w-3.5 h-3.5 text-[#1496A1]" />
                            Editar Perfil / Equipe
                        </button>
                    </div>

                    <nav className="space-y-1">
                        <p
                            className={`px-2 text-[10px] font-bold uppercase tracking-widest mb-2 ${clsSubtexto}`}
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
                                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl transition cursor-pointer group ${
                                        ativo
                                            ? escuro
                                                ? 'bg-[#0E7C86]/20 text-white border border-[#0E7C86]/50'
                                                : 'bg-[#0E7C86]/10 text-[#0B5C63] border border-[#0E7C86]/30'
                                            : escuro
                                                ? 'text-stone-400 hover:bg-[#181E26] hover:text-stone-100 border border-transparent'
                                                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-transparent'
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span
                                            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition ${
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
                                            <p className="text-xs font-semibold leading-tight truncate">
                                                {item.rotulo}
                                            </p>
                                            <p
                                                className={`text-[10px] truncate ${
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
                                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
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

                <div
                    className={`pt-4 mt-4 border-t space-y-1.5 ${
                        escuro ? 'border-[#1F262E]' : 'border-stone-200'
                    }`}
                >
                    <Link
                        href="/"
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition ${
                            escuro
                                ? 'text-stone-300 hover:bg-[#181E26]'
                                : 'text-stone-700 hover:bg-stone-100'
                        }`}
                    >
                        <span
                            className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                escuro
                                    ? 'bg-[#0E1217] text-[#25A4AF] border border-[#232B35]'
                                    : 'bg-stone-100 text-[#0E7C86]'
                            }`}
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                        </span>
                        <span>Link dos Pais</span>
                    </Link>

                    <button
                        type="button"
                        onClick={() => void handleLogout()}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                            escuro
                                ? 'text-rose-300 hover:bg-[#BE1E23]/15'
                                : 'text-[#BE1E23] hover:bg-rose-50'
                        }`}
                    >
                        <span
                            className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                escuro
                                    ? 'bg-[#0E1217] text-[#F87171] border border-[#232B35]'
                                    : 'bg-rose-50 text-[#BE1E23]'
                            }`}
                        >
                            <LogOut className="w-3.5 h-3.5" />
                        </span>
                        <span>Sair do Painel</span>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen flex transition-colors ${clsBgApp}`}>
            <input
                ref={inputFotoRapidaRef}
                type="file"
                accept="image/*"
                onChange={(e) => void handleTrocaFotoRapida(e)}
                className="hidden"
            />

            <aside
                className={`hidden lg:block w-72 shrink-0 border-r sticky top-0 h-screen ${clsSidebar}`}
            >
                {renderConteudoSidebar()}
            </aside>

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

            <div className="flex-1 min-w-0 flex flex-col">
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
                            <button
                                type="button"
                                onClick={() => inputFotoRapidaRef.current?.click()}
                                title={`Logado como ${perfilAtual.nome} — clique para trocar a foto`}
                                className={`hidden sm:inline-flex items-center gap-2 pr-3 pl-1.5 py-1 rounded-full border transition cursor-pointer ${clsCard}`}
                            >
                                <span className="w-7 h-7 rounded-full overflow-hidden bg-[#0E7C86]/20 border border-[#0E7C86] flex items-center justify-center text-[10px] font-bold text-[#1496A1]">
                                    {perfilAtual.foto_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={perfilAtual.foto_url}
                                            alt={perfilAtual.nome}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        obterIniciais(perfilAtual.nome)
                                    )}
                                </span>
                                <span className={`text-xs font-semibold ${clsTitulo}`}>
                                    {perfilAtual.nome.split(' ')[0]}
                                </span>
                            </button>

                            <span
                                className={`hidden md:inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-full border ${
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
                                        sistemaAbertoAgora
                                            ? 'bg-emerald-400'
                                            : 'bg-[#BE1E23]'
                                    }`}
                                />
                                {sistemaAbertoAgora ? 'Link Aberto' : 'Link Fechado'}
                            </span>

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
                                    className={`w-4 h-4 ${
                                        carregandoDados ? 'animate-spin' : ''
                                    }`}
                                />
                            </button>

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

                <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 py-6">
                    {aba === 'agendamentos' && (
                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                            <section className="xl:col-span-8 space-y-4">
                                <div className={`border rounded-2xl p-5 space-y-4 ${clsCard}`}>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        <div>
                                            <label
                                                className={`block text-[11px] mb-1 ${clsSubtexto}`}
                                            >
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
                                            <label
                                                className={`block text-[11px] mb-1 ${clsSubtexto}`}
                                            >
                                                Unidade
                                            </label>
                                            <select
                                                value={filtroUnidade}
                                                onChange={(e) =>
                                                    setFiltroUnidade(e.target.value)
                                                }
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
                                            <label
                                                className={`block text-[11px] mb-1 ${clsSubtexto}`}
                                            >
                                                Professor(a)
                                            </label>
                                            <select
                                                value={filtroProfessor}
                                                onChange={(e) =>
                                                    setFiltroProfessor(e.target.value)
                                                }
                                                className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${clsInput}`}
                                            >
                                                <option value="todos">
                                                    Todos os Professores
                                                </option>
                                                {professores.map((p) => (
                                                    <option key={p.id} value={String(p.id)}>
                                                        {p.nome} ({p.unidade_nome})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label
                                                className={`block text-[11px] mb-1 ${clsSubtexto}`}
                                            >
                                                Colégio
                                            </label>
                                            <select
                                                value={filtroColegio}
                                                onChange={(e) =>
                                                    setFiltroColegio(e.target.value)
                                                }
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
                                            <label
                                                className={`block text-[11px] mb-1 ${clsSubtexto}`}
                                            >
                                                Status
                                            </label>
                                            <select
                                                value={filtroStatus}
                                                onChange={(e) =>
                                                    setFiltroStatus(e.target.value)
                                                }
                                                className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${clsInput}`}
                                            >
                                                <option value="confirmado">Confirmados</option>
                                                <option value="concluido">Concluídos</option>
                                                <option value="cancelado">Cancelados</option>
                                                <option value="todos">Todos os Status</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label
                                                className={`block text-[11px] mb-1 ${clsSubtexto}`}
                                            >
                                                Lançamento Clin Care
                                            </label>
                                            <select
                                                value={filtroClinCare}
                                                onChange={(e) =>
                                                    setFiltroClinCare(e.target.value)
                                                }
                                                className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${clsInput}`}
                                            >
                                                <option value="todos">Todos</option>
                                                <option value="pendentes">
                                                    Pendentes de lançar
                                                </option>
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
                                                    <strong className="text-[#1496A1]">
                                                        {qtd}
                                                    </strong>
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
                                                            <h3
                                                                className={`text-base font-bold ${clsTitulo}`}
                                                            >
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
                                                                    title={
                                                                        ag.clincare_reserva_erro ||
                                                                        undefined
                                                                    }
                                                                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                                                        ag.sincronizado_clincare
                                                                            ? 'bg-[#0E7C86]/15 text-[#25A4AF] border-[#0E7C86]/35'
                                                                            : ag.clincare_reserva_status ===
                                                                            'reservado'
                                                                                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                                                                                : ag.clincare_reserva_status ===
                                                                                'erro'
                                                                                    ? 'bg-[#BE1E23]/20 text-rose-400 border-[#BE1E23]/40'
                                                                                    : 'bg-[#C24124]/15 text-amber-400 border-[#C24124]/35'
                                                                    }`}
                                                                >
                                                                    {ag.sincronizado_clincare
                                                                        ? 'Confirmado (Aluno Vinculado)'
                                                                        : ag.clincare_reserva_status ===
                                                                        'reservado'
                                                                            ? 'RESERVADO APP (Trocar p/ Aluno)'
                                                                            : ag.clincare_reserva_status ===
                                                                            'erro'
                                                                                ? 'Erro Robô Clin Care'
                                                                                : 'Robô Reservando...'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div
                                                        className={`border rounded-xl p-3.5 text-xs space-y-1.5 ${clsSubCard}`}
                                                    >
                                                        <p>
                                                            <strong>Unidade:</strong>{' '}
                                                            {ag.unidade_nome} •{' '}
                                                            <strong>Matéria:</strong> {ag.materia}
                                                        </p>
                                                        <p>
                                                            <strong>Professor(a):</strong>{' '}
                                                            {ag.professor_nome}
                                                        </p>
                                                        <p className="text-[#1496A1] font-bold">
                                                            Data: {formatarDataBR(ag.data)}
                                                            {ag.horario
                                                                ? ` às ${ag.horario}`
                                                                : ''}
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
                                                                <strong>Assunto:</strong>{' '}
                                                                {ag.observacoes}
                                                            </p>
                                                        )}

                                                        {ag.clincare_reserva_erro &&
                                                            !ag.sincronizado_clincare && (
                                                                <p className="text-[11px] text-rose-400 bg-[#BE1E23]/15 border border-[#BE1E23]/35 rounded-lg px-2.5 py-1.5 mt-1.5">
                                                                    <strong>
                                                                        Robô Clin Care:
                                                                    </strong>{' '}
                                                                    {ag.clincare_reserva_erro}
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

                                                        {(ag.status === 'cancelado' ||
                                                            (ag.status === 'confirmado' &&
                                                                !ag.sincronizado_clincare &&
                                                                ag.clincare_reserva_status !==
                                                                'reservado')) && (
                                                            <button
                                                                type="button"
                                                                onClick={async () => {
                                                                    try {
                                                                        const resposta =
                                                                            await fetch(
                                                                                '/api/admin/agendamentos',
                                                                                {
                                                                                    method: 'PATCH',
                                                                                    headers: {
                                                                                        'Content-Type':
                                                                                            'application/json',
                                                                                    },
                                                                                    body: JSON.stringify(
                                                                                        {
                                                                                            id: ag.id,
                                                                                            reenviar_robo:
                                                                                                true,
                                                                                        }
                                                                                    ),
                                                                                }
                                                                            );
                                                                        if (!resposta.ok) {
                                                                            const retorno =
                                                                                await resposta
                                                                                    .json()
                                                                                    .catch(
                                                                                        () => ({})
                                                                                    );
                                                                            window.alert(
                                                                                retorno.error ||
                                                                                'Não foi possível acionar o robô.'
                                                                            );
                                                                        }
                                                                    } catch {
                                                                        window.alert(
                                                                            'Falha de conexão ao acionar o robô.'
                                                                        );
                                                                    } finally {
                                                                        await carregarDados();
                                                                    }
                                                                }}
                                                                className="px-3 py-1.5 rounded-xl bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:bg-cyan-500/25"
                                                            >
                                                                <RefreshCw className="w-3.5 h-3.5" />
                                                                {ag.status === 'cancelado'
                                                                    ? 'Repetir cancelamento no ClinCare'
                                                                    : 'Reenviar Robô'}
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
                                                                    <XCircle className="w-3.5 h-3.5" />{' '}
                                                                    Cancelar
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

                            <aside className="xl:col-span-4 space-y-5">
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

                                <div className={`border rounded-2xl p-5 space-y-4 ${clsCard}`}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className={`text-sm font-bold ${clsTitulo}`}>
                                                Sincronizar Clin Care
                                            </h2>
                                            <p className={`text-[11px] ${clsSubtexto}`}>
                                                Última leitura:{' '}
                                                <strong>
                                                    {ultimaSincronizacao || 'Aguardando'}
                                                </strong>
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
                                                Pendentes Clin Care
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

                    {aba === 'mapa' && (
                        <AbaMapaDia
                            unidades={unidades}
                            professores={professores}
                            agendamentos={agendamentos}
                            bloqueios={bloqueios}
                            escuro={escuro}
                            classes={classesCompartilhadas}
                        />
                    )}

                    {aba === 'alunos' && (
                        <AbaAlunos
                            responsaveis={responsaveis}
                            classes={classesCompartilhadas}
                            onRecarregarDados={carregarDados}
                        />
                    )}

                    {aba === 'textos' && (
                        <AbaTextosPortal
                            textosIniciais={textosPortal}
                            onTextosAtualizados={setTextosPortal}
                            classes={classesCompartilhadas}
                        />
                    )}

                    {aba === 'datas' && (
                        <AbaDatas
                            datasLiberadas={datasLiberadas}
                            classes={classesCompartilhadas}
                            onRecarregarDados={carregarDados}
                        />
                    )}

                    {aba === 'professores' && (
                        <AbaProfessores
                            unidades={unidades}
                            professores={professores}
                            escuro={escuro}
                            classes={classesCompartilhadas}
                            onRecarregarDados={carregarDados}
                        />
                    )}

                    {aba === 'unidades' && (
                        <AbaUnidades
                            unidades={unidades}
                            classes={classesCompartilhadas}
                            onRecarregarDados={carregarDados}
                        />
                    )}

                    {aba === 'whatsapp' && <AdminWhatsApp />}
                </div>
            </div>

            <ModalPerfilAdmin
                aberto={modalPerfilAberto}
                onFechar={() => setModalPerfilAberto(false)}
                abaInicial={abaModalPerfil}
                perfilAtual={perfilAtual}
                perfisAdmin={perfisAdmin}
                feedbackInicial={feedbackModalPerfil}
                onPerfilAtualizado={setPerfilAtual}
                onRecarregarPerfis={carregarPerfisETextos}
                classes={classesCompartilhadas}
            />
        </div>
    );
}