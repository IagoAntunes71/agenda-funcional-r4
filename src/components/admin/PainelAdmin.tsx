'use client';
import { LISTA_STATUS_AULA_R4, normalizarStatusAulaR4, type StatusAulaR4 } from '@/lib/agenda-status-r4';
import { materiaBase, rotuloMateriaAula } from '@/lib/materia-aula';
import { intervaloAula } from './mapa-dia-horarios';
import { useTextoR4 } from '@/components/TextosInterfaceR4';


import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SessaoAdmin } from '@/lib/admin-auth';
import { enderecoAdmin, MODULOS_GESTAO, MODULOS_PORTAL, podeAcessarModulo } from '@/lib/admin-navegacao';
import { BarraLayoutR4, BotoesLayoutR4, LayoutR4Context, useEditorLayoutR4 } from './EditorLayoutR4';
import { CardsLayoutR4, TextosLivresR4, TextoLayoutR4 } from './ConteudoLayoutR4';
import InicioAdminR4, { type ResumoSemana } from './InicioAdminR4';
import {
    ArrowLeft,
    Building2,
    CalendarCheck2,
    CalendarDays,
    CalendarPlus,
    Camera,
    ChevronLeft,
    ChevronRight,
    ClipboardCheck,
    Download,
    ExternalLink,
    Eye,
    EyeOff,
    FileText,
    GraduationCap,
    KeyRound,
    Lock,
    LayoutGrid,
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
import AdminColegios from '@/components/AdminColegios';
import FichaAlunosR4 from './FichaAlunosR4';
import AbaDatas from './AbaDatas';
import AbaMapaDia from './AbaMapaDia';
import PainelProfessorR4 from './PainelProfessorR4';
import { obterAgoraBahia } from '@/lib/horarios-reforco';
import DiretorioProfessoresR4 from './DiretorioProfessoresR4';
import AbaProfessores from './AbaProfessores';
import { ConfiguracoesOperacaoR4, RelatorioOperacaoR4, useOperacaoR4 } from './OperacaoPainelR4';
import RecepcaoR4 from './RecepcaoR4';
import EditorCoresInterface from './EditorCoresInterface';
import { useCoresR4, variaveisCoresR4 } from '@/components/CoresInterfaceR4';
import EditorTextosInterface from './EditorTextosInterface';
import AbaTextosPortal from './AbaTextosPortal';
import AbaUnidades from './AbaUnidades';
import ModalPerfilAdmin from './ModalPerfilAdmin';
import {
    AbaAdmin,
    AgendamentoAdmin,
    AlunoAdmin,
    BloqueioAdmin,
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

function materiaAgendamento(aula: AgendamentoAdmin) {
    const intervalo = intervaloAula(aula);
    return rotuloMateriaAula(aula.materia, intervalo.fim - intervalo.inicio);
}

function escaparCelulaCSV(valor: unknown): string {
    const texto = String(valor ?? '').replace(/\r?\n/g, ' ').trim();
    if (texto.includes(';') || texto.includes('"')) {
        return `"${texto.replace(/"/g, '""')}"`;
    }
    return texto;
}

export default function PainelAdmin({
                                        sessaoInicial,
                                        pagina,
                                    }: {
    sessaoInicial: SessaoAdmin | null;
    pagina: AbaAdmin;
}) {
    const textoR4 = useTextoR4();
    const { paleta } = useCoresR4();
    const { cfg: operacao } = useOperacaoR4();
    const router = useRouter();
    const [autenticado, setAutenticado] = useState(Boolean(sessaoInicial));
    const [modoLogin, setModoLogin] = useState<'perfil' | 'master'>('perfil');
    const [emailLogin, setEmailLogin] = useState('');
    const [senha, setSenha] = useState('');
    const [mostrarSenhaLogin, setMostrarSenhaLogin] = useState(false);
    const [erroLogin, setErroLogin] = useState<string | null>(null);
    const [entrando, setEntrando] = useState(false);

    const [tema, setTema] = useState<'escuro' | 'claro'>('escuro');
    const [menuMobileAberto, setMenuMobileAberto] = useState(false);
    const [sidebarRecolhida, setSidebarRecolhida] = useState(false);

    const [resumoSemana, setResumoSemana] = useState<ResumoSemana | null>(null);
    const [carregandoDados, setCarregandoDados] = useState(false);
    const [mesProfessor, setMesProfessor] = useState(() => obterAgoraBahia().dataISO.slice(0, 7));
    const [consultaProfessor, setConsultaProfessor] = useState<{ mes: string; erro?: string } | null>(null);

    const [perfilAtual, setPerfilAtual] = useState<PerfilAdmin>({
        id: 0,
        nome: 'Administrador R4',
        email: '',
        foto_url: null,
        role: 'admin',
        professor_id: null,
        ...sessaoInicial,
    });
    const aba = podeAcessarModulo(perfilAtual.role, pagina) ? pagina : 'inicio';
    const inicio = aba === 'inicio';
    const mapa = aba === 'mapa';
    const admin = perfilAtual.role === 'admin';
    const editorLayout = useEditorLayoutR4(autenticado && perfilAtual.role !== 'professor', admin, tema, inicio ? undefined : aba);
    const [painelLayout, setPainelLayout] = useState<HTMLDivElement | null>(null);

    const professor = perfilAtual.role === 'professor';
    const mesConsulta = professor ? mesProfessor : '';
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
    const [filtroStatus, setFiltroStatus] = useState<string>('todos');
    const [salvandoStatusId, setSalvandoStatusId] = useState<number | null>(null);
    const [retornoStatus, setRetornoStatus] = useState<{ texto: string; erro: boolean } | null>(null);

    useEffect(() => {
        const salvo = window.localStorage.getItem('r4_admin_tema');
        if (salvo === 'claro' || salvo === 'escuro') {
            setTema(salvo);
        }
    }, []);

    function alternarTema() {
        if (editorLayout.ocupado) return;
        if (editorLayout.ativo) {
            if (!window.confirm('Trocar de tema e descartar as alterações ainda não salvas?')) return;
            editorLayout.fechar();
        }
        setTema((prev) => {
            const proximo = prev === 'escuro' ? 'claro' : 'escuro';
            window.localStorage.setItem('r4_admin_tema', proximo);
            return proximo;
        });
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

    const [datasMapa, setDatasMapa] = useState('');
    const consultaMapa = aba === 'mapa' ? datasMapa : '';
    const carregarDados = useCallback(async (signal?: AbortSignal, silencioso = false) => {
        if (!silencioso) setCarregandoDados(true);
        try {
            const params = new URLSearchParams();
            if (consultaMapa) params.set('datasMapa', consultaMapa);
            else if (mesConsulta) params.set('mesProfessor', mesConsulta);
            const url = '/api/admin/painel?' + params;
            const res = await fetch(url, { cache: 'no-store', signal });
            if (signal?.aborted) return;
            if (res.status === 401) {
                setAutenticado(false);
                return;
            }
            const json = await res.json();
            if (signal?.aborted) return;
            if (!res.ok) throw new Error(json.error || 'Falha ao carregar a agenda.');
            if (mesConsulta) setConsultaProfessor({ mes: mesConsulta });

            if (json.sessao) {
                setPerfilAtual((prev) => ({
                    ...prev,
                    id: json.sessao.id,
                    nome: json.sessao.nome,
                    email: json.sessao.email,
                    role: json.sessao.role || 'admin',
                    professor_id: json.sessao.professor_id ?? null,
                }));


            }

            if (json.chaveMestra) {
                setModoChaveMestra(json.chaveMestra.modo || 'auto');
                setSistemaAbertoAgora(Boolean(json.chaveMestra.aberto));
            }


            setUnidades(json.unidades || []);
            setProfessores(json.professores || []);
            setAlunos(json.alunos || []);
            setResponsaveis(json.responsaveis || []);
            setDatasLiberadas(json.datasLiberadas || []);
            setAgendamentos(json.agendamentos || []);
            setResumoSemana(json.resumoSemana || null);
            setBloqueios(json.bloqueios || []);

            if (!silencioso) await carregarPerfisETextos();
        } catch (erro) {
            if (mesConsulta && !signal?.aborted) setConsultaProfessor({
                mes: mesConsulta, erro: erro instanceof Error ? erro.message : 'Falha ao carregar a agenda.',
            });
        } finally {
            if (!silencioso && !signal?.aborted) setCarregandoDados(false);
        }
    }, [carregarPerfisETextos, mesConsulta, consultaMapa]);

    useEffect(() => {
        if (!autenticado) return;
        const pedido = new AbortController();
        const timer = window.setTimeout(() => void carregarDados(pedido.signal), 0);
        return () => { window.clearTimeout(timer); pedido.abort(); };
    }, [autenticado, carregarDados]);

    useEffect(() => {
        if (!autenticado || (aba !== 'inicio' && aba !== 'mapa')) return;
        const pedido = new AbortController();
        let atualizando = false;
        async function atualizarAgenda() {
            if (document.hidden || atualizando) return;
            atualizando = true;
            try { await carregarDados(pedido.signal, true); }
            finally { atualizando = false; }
        }
        const timer = window.setInterval(() => void atualizarAgenda(), 5000);
        window.addEventListener('focus', atualizarAgenda);
        return () => {
            pedido.abort();
            clearInterval(timer);
            window.removeEventListener('focus', atualizarAgenda);
        };
    }, [autenticado, aba, carregarDados]);

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
                    role: json.perfil.role || 'admin',
                    professor_id: json.perfil.professor_id ?? null,
                });
            }
            setAutenticado(true);
            window.dispatchEvent(new Event('r4-sessao-alterada'));
        } finally {
            setEntrando(false);
        }
    }

    async function handleLogout() {
        await fetch('/api/admin/login', { method: 'DELETE' });
        setAutenticado(false);
        window.dispatchEvent(new Event('r4-sessao-alterada'));
        if (pagina !== 'inicio') router.replace('/admin');
    }

    async function alterarStatusAgendamento(id: number, status: StatusAulaR4) {
        if (salvandoStatusId !== null) return;
        setSalvandoStatusId(id);
        setRetornoStatus(null);
        try {
            const resposta = await fetch('/api/admin/agendamentos', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status }),
            });
            const dados = await resposta.json().catch(() => ({}));
            if (!resposta.ok) throw new Error(dados.error || 'Não foi possível atualizar o status.');
            setAgendamentos((atuais) => atuais.map((aula) => aula.id === id ? { ...aula, status: dados.status || status } : aula));
            setRetornoStatus({ texto: dados.aviso || 'Status atualizado.', erro: false });
        } catch (erro) {
            setRetornoStatus({ texto: erro instanceof Error ? erro.message : 'Falha ao atualizar o status.', erro: true });
        } finally {
            setSalvandoStatusId(null);
        }
    }

    const clsCard = 'r4-painel shadow-xs';
    const clsSubCard = 'r4-painel-secundario';
    const escuro = tema === 'escuro';
    const clsInput = escuro
        ? 'bg-[#251b19] border-[#60443d] text-stone-100 placeholder:text-stone-500 focus:border-[#1496A1]'
        : 'bg-white border-slate-400/80 text-slate-900 font-medium placeholder:text-slate-500 focus:border-[#0E7C86] focus:ring-2 focus:ring-[#0E7C86]/20';
    const clsTitulo = 'r4-texto';
    const clsSubtexto = 'r4-subtexto';

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
                className="r4-admin min-h-screen flex items-center justify-center p-4 transition-colors"
                data-tema={tema} style={variaveisCoresR4(paleta[tema])}
            >
                <div
                    className={`max-w-md w-full border rounded-2xl p-7 sm:p-8 space-y-6 ${clsCard}`}
                >
                    <div className="flex items-center justify-between">
                        <LogoR4 temaEscuro={escuro} subtitulo={textoR4("Painel Administrativo")} />
                        <button
                            type="button"
                            onClick={alternarTema}
                            title={textoR4("Alternar tema claro/escuro")}
                            className={`p-2.5 rounded-xl border transition cursor-pointer ${
                                escuro
                                    ? 'bg-[#251b19] border-[#60443d] text-amber-300 hover:border-stone-500'
                                    : 'bg-slate-200 border-slate-300 text-slate-800 hover:bg-slate-300'
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
                        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0E7C86] dark:text-[#1496A1]">
                            <Lock className="w-3.5 h-3.5" />{' ' + textoR4("Acesso Administrativo R4 Ensina")}</div>
                        <h2 className={`text-xl font-bold ${clsTitulo}`}>{textoR4("Entrar no Sistema")}</h2>
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
                            className={`py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                                modoLogin === 'perfil'
                                    ? 'r4-acao shadow-xs'
                                    : `${clsSubtexto} hover:text-[#0E7C86]`
                            }`}
                        >{textoR4("Perfil (E-mail e Senha)")}</button>
                        <button
                            type="button"
                            onClick={() => {
                                setModoLogin('master');
                                setErroLogin(null);
                            }}
                            className={`py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer inline-flex items-center justify-center gap-1.5 ${
                                modoLogin === 'master'
                                    ? 'r4-acao shadow-xs'
                                    : `${clsSubtexto} hover:text-[#0E7C86]`
                            }`}
                        >
                            <KeyRound className="w-3.5 h-3.5" />{textoR4("Chave Mestra")}</button>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                        {modoLogin === 'perfil' ? (
                            <div>
                                <label
                                    htmlFor="email-admin"
                                    className={`block text-xs font-semibold mb-1.5 ${clsSubtexto}`}
                                >{textoR4("E-mail do Perfil *")}</label>
                                <input
                                    id="email-admin"
                                    type="email"
                                    required
                                    value={emailLogin}
                                    onChange={(e) => setEmailLogin(e.target.value)}
                                    placeholder={textoR4("seuemail@r4ensina.com.br")}
                                    className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none ${clsInput}`}
                                />
                            </div>
                        ) : (
                            <div
                                className={`border rounded-xl p-3 text-xs leading-relaxed ${clsSubCard} ${clsSubtexto}`}
                            >
                                <strong className="text-[#0E7C86] dark:text-[#1496A1]">{textoR4("Modo Chave Mestra:")}</strong>{' '}{textoR4("use a senha geral do sistema para entrar sem e-mail ou redefinir a senha de perfis esquecidos.")}</div>
                        )}

                        <div>
                            <label
                                htmlFor="senha-admin"
                                className={`block text-xs font-semibold mb-1.5 ${clsSubtexto}`}
                            >
                                {modoLogin === 'master'
                                    ? textoR4("Senha da Chave Mestra *")
                                    : textoR4("Senha do Perfil *")}
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
                                    title={mostrarSenhaLogin ? textoR4("Ocultar senha") : textoR4("Ver senha")}
                                    className={`absolute right-3 top-3.5 cursor-pointer ${clsSubtexto} hover:text-[#0E7C86]`}
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
                            <p className="text-xs text-[#BE1E23] dark:text-[#F87171] bg-[#BE1E23]/15 border border-[#BE1E23]/40 rounded-xl px-3.5 py-2.5 font-medium">
                                {erroLogin}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={entrando}
                            className="w-full py-3 px-4 r4-acao  font-semibold rounded-xl text-base shadow-md shadow-[#0E7C86]/25 transition cursor-pointer"
                        >
                            {entrando
                                ? textoR4("Verificando...")
                                : modoLogin === 'master'
                                    ? textoR4("Entrar com Chave Mestra")
                                    : textoR4("Acessar Painel")}
                        </button>
                    </form>

                    <div
                        className={`pt-3 border-t text-center ${
                            escuro ? 'border-[#513932]' : 'border-slate-300'
                        }`}
                    >
                        <Link
                            href="/"
                            className={`text-xs font-medium inline-flex items-center gap-1.5 hover:text-[#0E7C86] ${clsSubtexto}`}
                        >
                            <ArrowLeft className="w-3.5 h-3.5" />{' ' + textoR4("Voltar para o agendamento")}</Link>
                    </div>
                </div>
            </div>
        );
    }


    const confirmadosCount = agendamentos.filter(
        (a) => a.status === 'confirmado'
    ).length;

    const professoresUnicosCount = new Set(
        professores
            .filter((p) => p.ativo)
            .map((p) =>
                p.grupo_professor
                    ? `grupo:${p.grupo_professor}`
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
        { id: 'inicio', rotulo: 'Início', subtitulo: 'Visão geral e atalhos', icone: <LayoutGrid className="w-4 h-4" /> },
        { id: 'portal', rotulo: 'Portal do Aluno', subtitulo: 'Acesso, textos e automação', icone: <GraduationCap className="w-4 h-4" /> },
        { id: 'portal-textos', rotulo: 'Textos do Portal', subtitulo: 'Conteúdo exibido às famílias', icone: <FileText className="w-4 h-4" /> },
        { id: 'portal-regras', rotulo: 'Regras e automação', subtitulo: 'Antecedência e confirmação', icone: <ClipboardCheck className="w-4 h-4" /> },
        { id: 'configuracoes', rotulo: 'Configurações', subtitulo: 'Agenda e permissões', icone: <LayoutGrid className="w-4 h-4" /> },
        { id: 'controle-alunos', rotulo: 'Controle dos Alunos', subtitulo: 'Consulte os feedbacks das aulas', icone: <Users className="w-4 h-4" /> },
        { id: 'recepcao', rotulo: perfilAtual.role === 'professor' ? 'Meus repasses' : 'Recepção', subtitulo: 'Aulas e agenda financeira', icone: <CalendarDays className="w-4 h-4" /> },
        { id: 'metas', rotulo: 'Metas de feedback', subtitulo: 'Acompanhe registros e pendências', icone: <ClipboardCheck className="w-4 h-4" /> },
        {
            id: 'agendamentos',
            rotulo: 'Agendamentos',
            subtitulo: 'Aulas e relatórios',
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
            rotulo: 'Textos e cores do Admin',
            subtitulo: 'Cabeçalhos, rótulos e identidade do R4',
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
            subtitulo: 'Professores, matérias e unidades',
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

    const itensVisiveis = itensMenuLateral.filter((item) => podeAcessarModulo(perfilAtual.role, item.id));

    const itensPortal = itensVisiveis.filter((item) => MODULOS_PORTAL.includes(item.id));
    const ordemPrincipal = ['inicio', 'mapa', 'recepcao', 'portal'];
    const itensPrincipais = ordemPrincipal.flatMap((id) => itensVisiveis.filter((item) => item.id === id));
    const itensGestao = itensVisiveis.filter((item) => MODULOS_GESTAO.includes(item.id));
    const noPortal = MODULOS_PORTAL.includes(aba);

    const metaAbaAtual: Record<AbaAdmin, { titulo: string }> = {
        portal: { titulo: 'Portal do Aluno' },
        'portal-textos': { titulo: 'Textos do Portal' },
        'portal-regras': { titulo: 'Regras e automação' },
        configuracoes: { titulo: 'Configurações' },
        'controle-alunos': { titulo: 'Controle dos Alunos' },
        recepcao: { titulo: perfilAtual.role === 'professor' ? 'Meus repasses' : 'Recepção' },
        metas: { titulo: 'Metas de feedback' },
        inicio: { titulo: 'Visão geral' },
        agendamentos: { titulo: 'Agendamentos & Operação' },
        mapa: { titulo: 'Mapa do Dia' },
        alunos: { titulo: 'Alunos & Responsáveis' },
        textos: { titulo: 'Textos e cores do Admin' },
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
        if (filtroStatus !== 'todos' && normalizarStatusAulaR4(a.status) !== filtroStatus) return false;
        return true;
    });

    const demandaPorMateria = Object.entries(
        agendamentosFiltrados.reduce<Record<string, number>>((acc, ag) => {
            const mat = materiaBase(ag.materia) || 'Outros';
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
            'Assunto / Observações',
        ];

        const linhas = agendamentosFiltrados.map((ag) => [
            formatarDataBR(ag.data),
            ag.horario || ag.hora_inicio,
            ag.unidade_nome,
            ag.professor_nome,
            materiaAgendamento(ag),
            ag.nome_aluno,
            ag.colegio_aluno,
            ag.serie_aluno,
            ag.nome_responsavel,
            ag.whatsapp_responsavel,
            ag.status.toUpperCase(),
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

    function renderItemMenu(item: (typeof itensVisiveis)[number], recolhida: boolean) {
        return <Link key={item.id} href={enderecoAdmin(item.id)} aria-current={aba === item.id ? 'page' : undefined}
            title={recolhida ? textoR4(item.rotulo) : undefined} onClick={() => setMenuMobileAberto(false)}
            className="r4-sidebar-item" data-recolhido={recolhida}
            {...editorLayout.item("menu_" + item.id, "menu", item.rotulo)} >
            <span className="r4-sidebar-icone">{item.icone}</span>
            {!recolhida && <>
                <span className="r4-sidebar-rotulo"><strong>{textoR4(item.rotulo)}</strong><small>{textoR4(item.subtitulo)}</small></span>
                {typeof item.badge === 'number' && <span className="r4-sidebar-contagem">{item.badge}</span>}
            </>}
        </Link>;
    }

    function renderConteudoSidebar(recolhida = false) {
        return (
            <div
                className={`flex flex-col justify-between h-full overflow-y-auto ${
                    recolhida ? 'p-2.5 items-center' : 'p-5'
                }`}
            >
                <div className={recolhida ? 'space-y-4 w-full flex flex-col items-center' : 'space-y-6'}>
                    <div className="r4-sidebar-marca flex items-center justify-between w-full">
                        {recolhida ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setSidebarRecolhida(false);
                                }}
                                title={textoR4("Expandir menu lateral")}
                                className="w-10 h-10 mx-auto rounded-xl r4-acao font-extrabold text-xs flex items-center justify-center shadow-sm cursor-pointer"
                            >{textoR4("R4")}</button>
                        ) : (
                            <Link href="/admin" aria-label={textoR4("Voltar ao painel R4")}>
                                <LogoR4 temaEscuro subtitulo={textoR4("Painel Administrativo")} />
                            </Link>
                        )}
                        <button
                            type="button"
                            onClick={() => setMenuMobileAberto(false)}
                            className="lg:hidden p-1.5 rounded-lg text-stone-400 hover:text-white"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {recolhida ? (
                        <button
                            type="button"
                            onClick={() => inputFotoRapidaRef.current?.click()}
                            title={`${perfilAtual.nome} — clique para alterar foto`}
                            className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-[#0E7C86] cursor-pointer bg-[#0E7C86]/20 flex items-center justify-center"
                        >
                            {perfilAtual.foto_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={perfilAtual.foto_url}
                                    alt={perfilAtual.nome}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <span className="text-[11px] font-bold text-[#0E7C86] dark:text-[#1496A1]">
                                    {obterIniciais(perfilAtual.nome)}
                                </span>
                            )}
                        </button>
                    ) : (
                        <div className={`r4-sidebar-perfil border rounded-xl p-3 space-y-2.5 ${clsSubCard}`}>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => inputFotoRapidaRef.current?.click()}
                                    title={textoR4("Clique na foto para alterar seu avatar")}
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
                                        <span className="text-xs font-bold text-[#0E7C86] dark:text-[#1496A1]">
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
                                className={`w-full py-1.5 px-2.5 rounded-xl border text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition ${clsCard} ${clsSubtexto} hover:text-[#0E7C86] hover:border-[#0E7C86]`}
                            >
                                <UserCog className="w-3.5 h-3.5 text-[#0E7C86] dark:text-[#1496A1]" />{textoR4("Editar Perfil / Equipe")}</button>
                        </div>
                    )}

                    <nav className="flex flex-col gap-1.5 w-full">
                        {!recolhida && (
                            <p
                                className={`px-2 text-[10px] font-bold uppercase tracking-widest mb-2 ${clsSubtexto}`}
                            >{textoR4("Módulos")}</p>
                        )}

                        {itensPrincipais.map((item) => renderItemMenu(item, recolhida))}
                        {itensGestao.length > 0 && (recolhida ? itensGestao.map((item) => renderItemMenu(item, true)) :
                            <details className="border-t mt-3 pt-2 order-last">
                                <summary className="cursor-pointer rounded-lg px-2 py-2 text-xs font-bold">Gestão da agenda</summary>
                                <div className="flex flex-col gap-1">{itensGestao.map((item) => renderItemMenu(item, false))}</div>
                            </details>)}
                    </nav>
                </div>

                <div
                    className={`pt-4 mt-4 border-t space-y-1.5 w-full ${
                        escuro ? 'border-[#1F262E]' : 'border-slate-300'
                    }`}
                >
                    <Link
                        href="/"
                        title={textoR4("Link dos Pais")}
                        className={`w-full flex items-center ${
                            recolhida ? 'justify-center p-2' : 'gap-3 px-3 py-2'
                        } rounded-xl text-xs font-semibold transition ${
                            escuro
                                ? 'text-stone-300 hover:bg-[#181E26]'
                                : 'text-slate-800 hover:bg-slate-200/80'
                        }`}
                    >
                        <span
                            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                escuro
                                    ? 'bg-[#251b19] text-[#25A4AF] border border-[#513932]'
                                    : 'bg-slate-200 text-[#0E7C86] border border-slate-300'
                            }`}
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                        </span>
                        {!recolhida && <span>{textoR4("Link dos Pais")}</span>}
                    </Link>

                    <button
                        type="button"
                        title={textoR4("Sair do Painel")}
                        onClick={() => void handleLogout()}
                        className={`w-full flex items-center ${
                            recolhida ? 'justify-center p-2' : 'gap-3 px-3 py-2'
                        } rounded-xl text-xs font-semibold transition cursor-pointer ${
                            escuro
                                ? 'text-rose-300 hover:bg-[#BE1E23]/15'
                                : 'text-[#B91C1C] hover:bg-rose-100'
                        }`}
                    >
                        <span
                            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                escuro
                                    ? 'bg-[#251b19] text-[#F87171] border border-[#513932]'
                                    : 'bg-rose-100 text-[#B91C1C] border border-rose-200'
                            }`}
                        >
                            <LogOut className="w-3.5 h-3.5" />
                        </span>
                        {!recolhida && <span>{textoR4("Sair do Painel")}</span>}
                    </button>
                </div>
            </div>
        );
    }

    if (professor) {
        const consulta = consultaProfessor?.mes === mesProfessor ? consultaProfessor : null;
        return <div className="r4-admin min-h-screen" data-tema={tema} style={variaveisCoresR4(paleta[tema])}>
            <input ref={inputFotoRapidaRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => void handleTrocaFotoRapida(e)} />
            <PainelProfessorR4 perfil={perfilAtual} mes={mesProfessor} onMes={setMesProfessor}
                aulas={consulta && !consulta.erro ? agendamentos : []} carregando={!consulta || carregandoDados}
                erro={consulta?.erro} atualizar={carregarDados} sair={handleLogout} alternarTema={alternarTema}
                escuro={escuro} trocarFoto={() => inputFotoRapidaRef.current?.click()}
                abrirPerfil={() => { setAbaModalPerfil('meu'); setModalPerfilAberto(true); }}
                unidades={unidades} professores={professores} alunos={alunos} operacao={operacao} />
            <ModalPerfilAdmin aberto={modalPerfilAberto} onFecharAction={() => setModalPerfilAberto(false)}
                abaInicial="meu" perfilAtual={perfilAtual} perfisAdmin={perfisAdmin} professores={professores}
                feedbackInicial={feedbackModalPerfil} onPerfilAtualizadoAction={setPerfilAtual}
                onRecarregarPerfisAction={carregarPerfisETextos} classes={classesCompartilhadas} />
        </div>;
    }

    return (
        <div className="r4-admin min-h-screen flex transition-colors" data-tema={escuro ? 'escuro' : 'claro'} data-visao-geral={inicio || undefined} style={variaveisCoresR4(paleta[tema])}>
            <input
                ref={inputFotoRapidaRef}
                type="file"
                accept="image/*"
                onChange={(e) => void handleTrocaFotoRapida(e)}
                className="hidden"
            />

            {inicio && <aside
                className={`hidden lg:block shrink-0 border-r sticky top-0 h-screen relative transition-all duration-200 r4-admin-sidebar ${
                    sidebarRecolhida ? 'w-[74px]' : 'w-72'
                }`}
            >
                <button
                    type="button"
                    onClick={() => {
                        setSidebarRecolhida((prev) => {
                            const proximo = !prev;
                            return proximo;
                        });
                    }}
                    title={sidebarRecolhida ? textoR4("Expandir barra lateral") : textoR4("Recolher barra lateral")}
                    className={`hidden lg:flex items-center justify-center w-7 h-7 rounded-full border shadow-md absolute -right-3.5 top-20 z-40 transition cursor-pointer ${
                        escuro
                            ? 'bg-[#1A222C] border-[#2E3947] text-stone-200 hover:bg-[#0E7C86] hover:text-white hover:border-[#0E7C86]'
                            : 'bg-white border-slate-300 text-slate-700 hover:bg-[#0E7C86] hover:text-white hover:border-[#0E7C86]'
                    }`}
                >
                    {sidebarRecolhida ? (
                        <ChevronRight className="w-4 h-4" />
                    ) : (
                        <ChevronLeft className="w-4 h-4" />
                    )}
                </button>

                {renderConteudoSidebar(sidebarRecolhida)}
            </aside>}

            {inicio && menuMobileAberto && (
                <div className="fixed inset-0 z-50 lg:hidden flex">
                    <div
                        onClick={() => setMenuMobileAberto(false)}
                        className="fixed inset-0 bg-black/60 backdrop-blur-xs"
                    />
                    <aside
                        className={`relative w-72 max-w-[85vw] h-full border-r r4-admin-sidebar`}
                    >
                        {renderConteudoSidebar(false)}
                    </aside>
                </div>
            )}

            <div className="flex-1 min-w-0 flex flex-col">
                <header
                    className="r4-admin-topo sticky top-0 z-30 border-b px-4 sm:px-6 py-2.5"
                >
                    <div
                        className={`${
                            mapa
                                ? 'max-w-full'
                                : aba === 'recepcao' ? 'max-w-[1680px]'
                                : 'max-w-[1440px]'
                        } mx-auto flex flex-wrap items-center justify-between gap-4`}
                    >
                        <div className="flex items-center gap-3 sm:gap-5">
                            {inicio && <button
                                type="button"
                                onClick={() => setMenuMobileAberto(true)}
                                className={`lg:hidden p-2.5 rounded-xl border ${
                                    escuro
                                        ? 'bg-[#312320] border-[#513932] text-stone-200'
                                        : 'bg-white border-slate-300 text-slate-800'
                                }`}
                            >
                                <Menu className="w-5 h-5" />
                            </button>}

                            {!inicio && <Link href="/admin" aria-label={textoR4("Voltar ao painel R4")} className="shrink-0">
                                <LogoR4 temaEscuro={escuro} subtitulo={textoR4("Painel Administrativo")} />
                            </Link>}
                            <div>
                                <h1
                                    className={`text-xl sm:text-2xl font-extrabold tracking-tight ${clsTitulo}`}
                                >
                                    {textoR4(metaAbaAtual[aba].titulo)}
                                </h1>
                            </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                            {!mapa && <button
                                type="button"
                                onClick={() => inputFotoRapidaRef.current?.click()}
                                title={`Logado como ${perfilAtual.nome} — clique para trocar a foto`}
                                className={`hidden sm:inline-flex items-center gap-2 pr-3 pl-1.5 py-1 rounded-full border transition cursor-pointer ${clsCard}`}
                            >
                                <span className="w-7 h-7 rounded-full overflow-hidden bg-[#0E7C86]/20 border border-[#0E7C86] flex items-center justify-center text-[10px] font-bold text-[#0E7C86] dark:text-[#1496A1]">
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
                                <span className={`text-xs font-bold ${clsTitulo}`}>
                                    {perfilAtual.nome.split(' ')[0]}
                                </span>
                            </button>}

                            {admin && <span
                                className={`hidden md:inline-flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-full border ${
                                    sistemaAbertoAgora
                                        ? escuro
                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                            : 'bg-emerald-100 border-emerald-300 text-emerald-800'
                                        : escuro
                                            ? 'bg-[#BE1E23]/15 border-[#BE1E23]/40 text-rose-300'
                                            : 'bg-rose-100 border-rose-300 text-rose-800'
                                }`}
                            >
                                <span
                                    className={`w-2 h-2 rounded-full ${
                                        sistemaAbertoAgora
                                            ? 'bg-emerald-500'
                                            : 'bg-[#BE1E23]'
                                    }`}
                                />
                                {sistemaAbertoAgora ? textoR4("Link Aberto") : textoR4("Link Fechado")}
                            </span>}

                            {!mapa &&
                            <button
                                type="button"
                                onClick={() => void carregarDados()}
                                title={textoR4("Atualizar dados")}
                                className={`p-2.5 rounded-xl border transition cursor-pointer ${
                                    escuro
                                        ? 'bg-[#312320] border-[#513932] text-stone-300 hover:text-white hover:border-stone-600'
                                        : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-200'
                                }`}
                            >
                                <RefreshCw
                                    className={`w-4 h-4 ${
                                        carregandoDados ? 'animate-spin' : ''
                                    }`}
                                />
                            </button>}

                            <button
                                type="button"
                                onClick={alternarTema}
                                className={`px-3.5 py-2 rounded-xl border text-xs font-bold inline-flex items-center gap-2 transition cursor-pointer ${
                                    escuro
                                        ? 'bg-[#312320] border-[#513932] text-amber-300 hover:border-stone-600'
                                        : 'bg-[#17232B] border-[#17232B] text-white hover:bg-slate-800 shadow-xs'
                                }`}
                            >
                                {escuro ? (
                                    <>
                                        <Sun className="w-4 h-4" />
                                        <span>{textoR4("Tema Claro")}</span>
                                    </>
                                ) : (
                                    <>
                                        <Moon className="w-4 h-4" />
                                        <span>{textoR4("Tema Escuro")}</span>
                                    </>
                                )}
                            </button>
                            {admin && <BotoesLayoutR4 editor={editorLayout} />}
                        </div>
                    </div>
                </header>

                <LayoutR4Context.Provider value={editorLayout}>
                <div ref={setPainelLayout} data-r4-posicionando-texto={!inicio && Boolean(editorLayout.posicionarTexto) || undefined}
                    onClickCapture={!inicio ? editorLayout.colocarTexto : undefined}
                    className={`${
                        mapa
                            ? 'max-w-full px-3 sm:px-5 py-4'
                            : aba === 'recepcao' ? 'max-w-[1728px] px-4 sm:px-6 py-5'
                            : aba === 'professores' ? 'max-w-full px-4 sm:px-8 py-6'
                            : 'max-w-[1440px] px-4 sm:px-8 py-6'
                    } w-full mx-auto transition-all`}
                >
                    {aba === 'inicio' && (
                            <InicioAdminR4 perfil={perfilAtual} unidades={unidades} resumo={resumoSemana}
                                modulos={itensVisiveis.filter((item) => item.id !== 'inicio' && (item.id === 'portal' || !MODULOS_PORTAL.includes(item.id)))} escuro={escuro}>
                                {admin && <section className="space-y-2" {...editorLayout.item('bloco_feedback', 'secoes', 'Metas de feedback')}>
                                    <RelatorioOperacaoR4 painel="metas" perfil={perfilAtual.role} compacto />
                                </section>}
                            </InicioAdminR4>
                    )}
                    {noPortal && admin && <nav aria-label="Portal do Aluno" className="flex flex-wrap gap-1 border-b border-[var(--r4-borda)] pb-2 mb-5">
                        {itensPortal.map((item) => <Link key={item.id} href={enderecoAdmin(item.id)}
                            {...editorLayout.item("portal_aba_" + item.id, "portal_abas", item.rotulo)}
                            aria-current={aba === item.id ? 'page' : undefined}
                            className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold ${aba === item.id ? 'r4-acao' : 'hover:underline'}`}>
                            {item.icone}<TextoLayoutR4 id={"portal_aba_" + item.id} campo="titulo" texto={item.rotulo} />
                        </Link>)}
                    </nav>}
                    {aba === 'portal' && admin && <section className="space-y-4" {...editorLayout.item('portal_chave', 'portal_conteudo', 'Acesso das famílias')}>
                        {admin && <div className={`border rounded-2xl p-5 space-y-4 ${clsCard}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-9 h-9 rounded-xl r4-acao flex items-center justify-center shadow-xs">
                                                <Power className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h2 className={`text-sm font-bold ${clsTitulo}`}>{textoR4("Chave Mestra")}</h2>
                                                <p className={`text-[11px] ${clsSubtexto}`}>{textoR4("Controle do Link dos Pais")}</p>
                                            </div>
                                        </div>

                                        <span
                                            className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                                                sistemaAbertoAgora
                                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-600/40'
                                                    : 'bg-[#BE1E23]/20 text-rose-700 dark:text-rose-400 border border-[#BE1E23]/40'
                                            }`}
                                        >
                                            {sistemaAbertoAgora ? textoR4("ABERTO") : textoR4("FECHADO")}
                                        </span>
                                    </div>

                                    <p className={`text-xs leading-relaxed ${clsSubtexto}`}>{textoR4("No modo") + ' '}<strong>{textoR4("Automático")}</strong>{textoR4(", abre de segunda a sexta, das 18:00 às 22:00.")}</p>

                                    <div className="grid grid-cols-3 gap-2">
                                        <button
                                            type="button"
                                            disabled={salvandoChaveMestra}
                                            onClick={() => void alterarChaveMestra('auto')}
                                            className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition cursor-pointer ${
                                                modoChaveMestra === 'auto'
                                                    ? 'bg-[#0E7C86] border-[#1496A1] text-white'
                                                    : `${clsSubCard} ${clsSubtexto}`
                                            }`}
                                        >{textoR4("Automático")}</button>

                                        <button
                                            type="button"
                                            disabled={salvandoChaveMestra}
                                            onClick={() => void alterarChaveMestra('ativo')}
                                            className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition cursor-pointer ${
                                                modoChaveMestra === 'ativo'
                                                    ? 'bg-emerald-700 border-emerald-500 text-white'
                                                    : `${clsSubCard} ${clsSubtexto}`
                                            }`}
                                        >{textoR4("Sempre Ativo")}</button>

                                        <button
                                            type="button"
                                            disabled={salvandoChaveMestra}
                                            onClick={() => void alterarChaveMestra('inativo')}
                                            className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition cursor-pointer ${
                                                modoChaveMestra === 'inativo'
                                                    ? 'bg-[#BE1E23] border-rose-500 text-white'
                                                    : `${clsSubCard} ${clsSubtexto}`
                                            }`}
                                        >{textoR4("Desativado")}</button>
                                    </div>
                                </div>}
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {itensPortal.filter((item) => item.id !== 'portal').map((item) => <Link key={item.id} href={enderecoAdmin(item.id)}
                                className={`border rounded-xl p-4 grid gap-2 ${clsCard}`}>
                                <span className="text-sm font-bold inline-flex gap-2 items-center">{item.icone}{item.rotulo}</span>
                                <small>{item.subtitulo}</small>
                            </Link>)}
                            <Link href="/" target="_blank" rel="noopener" className={`border rounded-xl p-4 font-semibold ${clsCard}`}>Abrir portal como aluno ↗</Link>
                        </div>
                    </section>}
                    {aba === 'portal-regras' && admin && <ConfiguracoesOperacaoR4 somentePortal />}
                    {aba === 'configuracoes' && admin && <ConfiguracoesOperacaoR4 />}
                    {aba === 'controle-alunos' && <RelatorioOperacaoR4 painel="alunos" perfil={perfilAtual.role} unidades={unidades} />}
                    {aba === 'recepcao' && <RecepcaoR4 perfil={perfilAtual.role} unidades={unidades} professores={professores} alunos={alunos}
                            escuro={escuro} classes={classesCompartilhadas} atualizarAgenda={carregarDados} />}
                    {aba === 'metas' && <RelatorioOperacaoR4 painel="metas" perfil={perfilAtual.role} />}
                    {aba === 'agendamentos' && retornoStatus && (
                        <p className={`mb-3 rounded-lg border p-3 text-sm ${clsCard}`} role={retornoStatus.erro ? 'alert' : 'status'}>
                            {retornoStatus.texto}
                        </p>
                    )}
                    {aba === 'agendamentos' && (
                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start" data-r4-layout-grid="colunas-12">
                            <section className="xl:col-span-8 space-y-4" {...editorLayout.item("agendamentos_lista", "colunas", "Agenda e filtros")}>
                                <div className={`border rounded-2xl p-5 space-y-4 ${clsCard}`}>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        <div>
                                            <label
                                                className={`block text-[11px] font-semibold mb-1 ${clsSubtexto}`}
                                            >{textoR4("Período (Mês)")}</label>
                                            <input
                                                type="month"
                                                value={filtroMes}
                                                onChange={(e) => setFiltroMes(e.target.value)}
                                                className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${clsInput}`}
                                            />
                                        </div>

                                        <div>
                                            <label
                                                className={`block text-[11px] font-semibold mb-1 ${clsSubtexto}`}
                                            >{textoR4("Unidade")}</label>
                                            <select
                                                value={filtroUnidade}
                                                onChange={(e) =>
                                                    setFiltroUnidade(e.target.value)
                                                }
                                                className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${clsInput}`}
                                            >
                                                <option value="todas">{textoR4("Todas as Unidades")}</option>
                                                {unidades.map((u) => (
                                                    <option key={u.id} value={String(u.id)}>
                                                        {u.nome}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label
                                                className={`block text-[11px] font-semibold mb-1 ${clsSubtexto}`}
                                            >{textoR4("Professor(a)")}</label>
                                            <select
                                                value={filtroProfessor}
                                                onChange={(e) =>
                                                    setFiltroProfessor(e.target.value)
                                                }
                                                className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${clsInput}`}
                                            >
                                                <option value="todos">{textoR4("Todos os Professores")}</option>
                                                {professores.map((p) => (
                                                    <option key={p.id} value={String(p.id)}>
                                                        {p.nome} ({p.unidade_nome})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label
                                                className={`block text-[11px] font-semibold mb-1 ${clsSubtexto}`}
                                            >{textoR4("Colégio")}</label>
                                            <select
                                                value={filtroColegio}
                                                onChange={(e) =>
                                                    setFiltroColegio(e.target.value)
                                                }
                                                className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${clsInput}`}
                                            >
                                                <option value="todos">{textoR4("Todos os Colégios")}</option>
                                                {colegiosUnicos.map((col) => (
                                                    <option key={col} value={col}>
                                                        {col}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label
                                                className={`block text-[11px] font-semibold mb-1 ${clsSubtexto}`}
                                            >{textoR4("Status")}</label>
                                            <select
                                                value={filtroStatus}
                                                onChange={(e) =>
                                                    setFiltroStatus(e.target.value)
                                                }
                                                className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${clsInput}`}
                                            >
                                                <option value="todos">{textoR4("Todos os Status")}</option>
                                                {LISTA_STATUS_AULA_R4.map((item) => <option key={item.valor} value={item.valor}>
                                                    {textoR4(item.rotulo)}
                                                </option>)}
                                            </select>
                                        </div>

                                    </div>

                                    <div
                                        className={`flex flex-wrap items-center justify-between gap-3 pt-3 border-t ${
                                            escuro ? 'border-[#513932]' : 'border-slate-300'
                                        }`}
                                    >
                                        <div className="flex flex-wrap items-center gap-2 text-xs">
                                            <span className={`font-bold ${clsTitulo}`}>
                                                {agendamentosFiltrados.length}{' ' + textoR4("aula(s)")}</span>
                                            {demandaPorMateria.slice(0, 4).map(([mat, qtd]) => (
                                                <span
                                                    key={mat}
                                                    className={`px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${clsSubCard}`}
                                                >
                                                    {mat}:{' '}
                                                    <strong className="text-[#0E7C86] dark:text-[#1496A1]">
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
                                                    className="text-xs font-bold text-[#0E7C86] dark:text-[#1496A1] hover:underline cursor-pointer"
                                                >{textoR4("Limpar filtros")}</button>
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            disabled={agendamentosFiltrados.length === 0}
                                            onClick={exportarRelatorioCSV}
                                            className="px-4 py-2 rounded-xl r4-acao disabled:opacity-40 text-xs font-semibold  inline-flex items-center gap-1.5 shadow-sm cursor-pointer transition"
                                        >
                                            <Download className="w-3.5 h-3.5" />{textoR4("Exportar CSV")}</button>
                                    </div>
                                </div>

                                {agendamentosFiltrados.length === 0 ? (
                                    <div
                                        className={`border rounded-2xl p-10 text-center text-sm font-medium ${clsCard} ${clsSubtexto}`}
                                    >{textoR4("Nenhum agendamento encontrado para este filtro.")}</div>
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
                                                            <p className={`text-xs font-medium ${clsSubtexto}`}>
                                                                {[ag.colegio_aluno, ag.serie_aluno]
                                                                    .filter(Boolean)
                                                                    .join(' • ')}
                                                            </p>
                                                        </div>

                                                        <div className="flex flex-col items-end gap-1.5">
                                                            <select aria-label={`Status de ${ag.nome_aluno}`}
                                                                className={`r4-status rounded-lg border px-2 py-1 text-xs font-bold ${clsInput}`}
                                                                data-status={normalizarStatusAulaR4(ag.status)}
                                                                disabled={salvandoStatusId !== null}
                                                                value={normalizarStatusAulaR4(ag.status)}
                                                                onChange={(e) => void alterarStatusAgendamento(ag.id, e.target.value as StatusAulaR4)}>
                                                                {LISTA_STATUS_AULA_R4.filter((item) => operacao.status[item.valor]?.ativo || item.valor === normalizarStatusAulaR4(ag.status)).map((item) => <option key={item.valor} value={item.valor}>
                                                                    {textoR4(item.rotulo)}
                                                                </option>)}
                                                            </select>

                                                        </div>
                                                    </div>

                                                    <div
                                                        className={`border rounded-xl p-3.5 text-xs space-y-1.5 ${clsSubCard}`}
                                                    >
                                                        <p>
                                                            <strong>{textoR4("Unidade:")}</strong>{' '}
                                                            {ag.unidade_nome} •{' '}
                                                            <strong>{textoR4("Matéria:")}</strong> {materiaAgendamento(ag)}
                                                        </p>
                                                        <p>
                                                            <strong>{textoR4("Professor(a):")}</strong>{' '}
                                                            {ag.professor_nome}
                                                        </p>
                                                        <p className="text-[#0E7C86] dark:text-[#1496A1] font-bold">{textoR4("Data:") + ' '}{formatarDataBR(ag.data)}
                                                            {ag.horario
                                                                ? ` às ${ag.horario}`
                                                                : ''}
                                                        </p>
                                                        <p>
                                                            <strong>{textoR4("Responsável:")}</strong>{' '}
                                                            {ag.nome_responsavel || 'Não informado'}
                                                            {ag.whatsapp_responsavel
                                                                ? ` (${ag.whatsapp_responsavel})`
                                                                : ''}
                                                        </p>
                                                        {ag.observacoes && (
                                                            <p className={clsSubtexto}>
                                                                <strong>{textoR4("Assunto:")}</strong>{' '}
                                                                {ag.observacoes}
                                                            </p>
                                                        )}

                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                                        {whatsappNumeros && (
                                                            <a
                                                                href={linkWhatsapp}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-600/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold inline-flex items-center gap-1.5 hover:bg-emerald-500/25"
                                                            >
                                                                <MessageCircle className="w-3.5 h-3.5" />{' '}{textoR4("WhatsApp")}</a>
                                                        )}


                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>

                            <aside className="xl:col-span-4 space-y-5" {...editorLayout.item("agendamentos_resumo", "colunas", "Resumo")}>

                                <div className={`border rounded-2xl p-5 space-y-3 ${clsCard}`}>
                                    <h2 className={`text-sm font-bold ${clsTitulo}`}>{textoR4("Resumo Operacional")}</h2>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className={`border rounded-xl p-3.5 ${clsSubCard}`}>
                                            <p className={`text-[11px] font-semibold ${clsSubtexto}`}>{textoR4("Confirmadas")}</p>
                                            <p className="text-2xl font-extrabold text-[#0E7C86] dark:text-[#1496A1] mt-0.5">
                                                {confirmadosCount}
                                            </p>
                                        </div>

                                    </div>
                                </div>
                            </aside>
                        </div>
                    )}

                    {aba === 'mapa' && (
                        <AbaMapaDia
                            roleUsuario={perfilAtual.role}
                            professorTravadoId={perfilAtual.professor_id ?? null}
                            unidades={unidades}
                            professores={professores}
                            alunos={alunos}
                            agendamentos={agendamentos}
                            bloqueios={bloqueios}
                            onDatasMapaChange={setDatasMapa}
                            escuro={escuro}
                            classes={classesCompartilhadas}
                            modoTelaCheia
                            onRecarregarDadosAction={carregarDados}
                        />
                    )}

                    {aba === 'alunos' && (
                        <div className="space-y-4">
                            <FichaAlunosR4 atualizarPainel={carregarDados} contas={
                                <AbaAlunos responsaveis={responsaveis} classes={classesCompartilhadas}
                                    onRecarregarDadosAction={carregarDados} />
                            } />
                            {admin && <details className="rounded-xl border p-3">
                                <summary className="cursor-pointer text-sm font-semibold">Gerenciar colégios</summary>
                                <div className="mt-3"><AdminColegios aoUnificar={carregarDados} /></div>
                            </details>}
                        </div>
                    )}

                    {aba === 'textos' && admin && (
                        <div className="flex flex-col gap-5">
                        <div {...editorLayout.item("cores", "configuracao", "Cores da interface")}><EditorCoresInterface classes={classesCompartilhadas} /></div>
                        <div {...editorLayout.item("textos", "configuracao", "Textos da interface")}><EditorTextosInterface classes={classesCompartilhadas} /></div>
                        </div>
                    )}

                    {aba === 'portal-textos' && admin && (
                        <div className="flex flex-col gap-5">
                        <div {...editorLayout.item("portal_interface", "configuracao", "Interface do portal")}><EditorTextosInterface classes={classesCompartilhadas} portal /></div>
                        <div {...editorLayout.item("portal_mensagens", "configuracao", "Mensagens do portal")}><AbaTextosPortal
                            textosIniciais={textosPortal}
                            onTextosAtualizadosAction={setTextosPortal}
                            classes={classesCompartilhadas}
                        /></div>
                        </div>
                    )}

                    {aba === 'datas' && (
                        <AbaDatas
                            datasLiberadas={datasLiberadas}
                            classes={classesCompartilhadas}
                            onRecarregarDadosAction={carregarDados}
                        />
                    )}

                    {aba === 'professores' && (admin ? (
                        <AbaProfessores
                            agendamentos={agendamentos}
                            unidades={unidades}
                            professores={professores}
                            escuro={escuro}
                            classes={classesCompartilhadas}
                            onRecarregarDadosAction={carregarDados}
                        />
                    ) : <DiretorioProfessoresR4 professores={professores} classes={classesCompartilhadas} />)}

                    {aba === 'unidades' && (
                        <AbaUnidades
                            unidades={unidades}
                            classes={classesCompartilhadas}
                            onRecarregarDadosAction={carregarDados}
                        />
                    )}

                    {aba === 'whatsapp' && <section {...editorLayout.item('whatsapp', 'modulos', 'WhatsApp e automação')}><AdminWhatsApp /></section>}
                    {!inicio && <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 empty:hidden mt-4" data-r4-layout-grid="atalhos">
                            <CardsLayoutR4 grupo="secoes" perfil={perfilAtual.role} />
                        </div>
                        <TextosLivresR4 painel={painelLayout} />
                    </>}
                </div>
                {admin && <BarraLayoutR4 editor={editorLayout} />}
                </LayoutR4Context.Provider>
            </div>

            <ModalPerfilAdmin
                aberto={modalPerfilAberto}
                onFecharAction={() => setModalPerfilAberto(false)}
                abaInicial={abaModalPerfil}
                perfilAtual={perfilAtual}
                perfisAdmin={perfisAdmin}
                professores={professores}
                feedbackInicial={feedbackModalPerfil}
                onPerfilAtualizadoAction={setPerfilAtual}
                onRecarregarPerfisAction={carregarPerfisETextos}
                classes={classesCompartilhadas}
            />
        </div>
    );
}