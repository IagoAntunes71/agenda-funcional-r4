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
    Clock,
    Download,
    Edit3,
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
    Plus,
    Power,
    RefreshCw,
    RotateCcw,
    Save,
    Search,
    Sun,
    Trash2,
    UserCog,
    UserPlus,
    Users,
    X,
    XCircle,
} from 'lucide-react';
import LogoR4 from '@/components/LogoR4';
import {
    MapaMateriasSeries,
    SERIES_ENSINO_MEDIO,
    SERIES_ESCOLARES,
    SERIES_FUNDAMENTAL_1,
    SERIES_FUNDAMENTAL_2,
    SERIES_FUNDAMENTAL_COMPLETO,
    formatarTelefone,
    resumirSeriesCurto,
} from '@/lib/cliente-helpers';
import {
    ModoChaveMestra,
    gerarTodosSlotsProfessor,
    horaParaMinutos,
} from '@/lib/horarios-reforco';
import { TEXTOS_PORTAL_PADRAO, TextosPortal } from '@/lib/portal-textos-padrao';

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
    materias_series?: MapaMateriasSeries;
    manha_ativo: boolean;
    manha_inicio: string;
    manha_fim: string;
    hora_inicio: string;
    hora_fim: string;
    ativo: boolean;
}

interface AlunoAdmin {
    id: number;
    nome_aluno: string;
    responsavel_nome: string;
    telefone: string;
    telefone_formatado: string;
    colegio_nome: string;
    serie: string;
    tem_pin: boolean;
    pin_bloqueado: boolean;
    total_aulas: number;
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
    clincare_reserva_status?: string;
    clincare_reserva_erro?: string | null;
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

interface PerfilAdmin {
    id: number;
    nome: string;
    email: string;
    foto_url: string | null;
    ativo?: boolean;
    criado_em?: string;
}

type AbaAdmin =
    | 'agendamentos'
    | 'mapa'
    | 'alunos'
    | 'textos'
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

function obterIniciais(nome: string): string {
    const partes = nome.trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return 'R4';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function comprimirImagemAvatar(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const tamanho = 240;
                const canvas = document.createElement('canvas');
                canvas.width = tamanho;
                canvas.height = tamanho;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Falha ao processar imagem.'));
                    return;
                }
                const menorLado = Math.min(img.width, img.height);
                const sx = (img.width - menorLado) / 2;
                const sy = (img.height - menorLado) / 2;
                ctx.drawImage(img, sx, sy, menorLado, menorLado, 0, 0, tamanho, tamanho);
                resolve(canvas.toDataURL('image/jpeg', 0.82));
            };
            img.onerror = () => reject(new Error('Imagem inválida.'));
            img.src = String(reader.result);
        };
        reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
        reader.readAsDataURL(file);
    });
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
                <p className="text-xs font-bold text-[#1496A1]">
                    Séries permitidas por matéria
                </p>
                <p
                    className={`text-[11px] ${
                        escuro ? 'text-stone-400' : 'text-stone-500'
                    }`}
                >
                    Deixe em <strong>Todas as séries</strong> ou clique nas séries
                    específicas para restringir o agendamento dos pais.
                </p>
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
                                >
                                    Todas as séries
                                </button>
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
                                >
                                    Fund. I (1º-5º)
                                </button>
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
                                >
                                    Fund. II (6º-9º)
                                </button>
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
                                >
                                    Fundamental (1º-9º)
                                </button>
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
                                >
                                    Médio + ENEM
                                </button>
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

    // Perfil e Equipe Administrativa
    const [perfilAtual, setPerfilAtual] = useState<PerfilAdmin>({
        id: 0,
        nome: 'Administrador R4',
        email: '',
        foto_url: null,
    });
    const [perfisAdmin, setPerfisAdmin] = useState<PerfilAdmin[]>([]);
    const [modalPerfilAberto, setModalPerfilAberto] = useState(false);
    const [abaModalPerfil, setAbaModalPerfil] = useState<'meu' | 'equipe'>('meu');
    const [editMeuNome, setEditMeuNome] = useState('');
    const [editMeuEmail, setEditMeuEmail] = useState('');
    const [editMinhaNovaSenha, setEditMinhaNovaSenha] = useState('');
    const [mostrarMinhaNovaSenha, setMostrarMinhaNovaSenha] = useState(false);
    const [editMinhaFoto, setEditMinhaFoto] = useState<string | null>(null);
    const [salvandoMeuPerfil, setSalvandoMeuPerfil] = useState(false);

    // Novo Perfil Admin & Redefinição de Senha da Equipe
    const [novoAdminNome, setNovoAdminNome] = useState('');
    const [novoAdminEmail, setNovoAdminEmail] = useState('');
    const [novoAdminSenha, setNovoAdminSenha] = useState('');
    const [mostrarNovoAdminSenha, setMostrarNovoAdminSenha] = useState(false);
    const [novoAdminFoto, setNovoAdminFoto] = useState<string | null>(null);
    const [criandoNovoAdmin, setCriandoNovoAdmin] = useState(false);
    const [redefinirSenhaId, setRedefinirSenhaId] = useState<number | null>(null);
    const [novaSenhaEquipe, setNovaSenhaEquipe] = useState('');
    const [feedbackPerfil, setFeedbackPerfil] = useState<{
        tipo: 'sucesso' | 'erro';
        texto: string;
    } | null>(null);

    const inputFotoRapidaRef = useRef<HTMLInputElement | null>(null);

    // Textos Editáveis do Portal
    const [textosPortal, setTextosPortal] = useState<TextosPortal>(
        TEXTOS_PORTAL_PADRAO
    );
    const [salvandoTextos, setSalvandoTextos] = useState(false);
    const [feedbackTextos, setFeedbackTextos] = useState<{
        tipo: 'sucesso' | 'erro';
        texto: string;
    } | null>(null);

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
    const [sistemaAbertoAgora, setSistemaAbertoAgora] = useState<boolean>(false);
    const [salvandoChaveMestra, setSalvandoChaveMestra] =
        useState<boolean>(false);

    const [unidades, setUnidades] = useState<UnidadeAdmin[]>([]);
    const [professores, setProfessores] = useState<ProfessorAdmin[]>([]);
    const [alunos, setAlunos] = useState<AlunoAdmin[]>([]);
    const [datasLiberadas, setDatasLiberadas] = useState<DataAdmin[]>([]);
    const [agendamentos, setAgendamentos] = useState<AgendamentoAdmin[]>([]);
    const [bloqueios, setBloqueios] = useState<BloqueioAdmin[]>([]);

    // Filtros Agendamentos
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

    // Módulo Alunos
    const [buscaAluno, setBuscaAluno] = useState<string>('');
    const [filtroPinAluno, setFiltroPinAluno] = useState<string>('todos');
    const [editAlunoId, setEditAlunoId] = useState<number | null>(null);
    const [editAlunoNome, setEditAlunoNome] = useState<string>('');
    const [editAlunoResponsavel, setEditAlunoResponsavel] = useState<string>('');
    const [editAlunoTelefone, setEditAlunoTelefone] = useState<string>('');
    const [editAlunoColegio, setEditAlunoColegio] = useState<string>('');
    const [editAlunoSerie, setEditAlunoSerie] = useState<string>(
        SERIES_ESCOLARES[0]
    );
    const [atualizarIrmaosTelefone, setAtualizarIrmaosTelefone] =
        useState<boolean>(true);
    const [salvandoAlunoAdmin, setSalvandoAlunoAdmin] = useState<boolean>(false);
    const [confirmandoExcluirAlunoId, setConfirmandoExcluirAlunoId] = useState<
        number | null
    >(null);
    const [excluindoAlunoId, setExcluindoAlunoId] = useState<number | null>(null);
    const [feedbackAluno, setFeedbackAluno] = useState<{
        tipo: 'sucesso' | 'erro';
        texto: string;
    } | null>(null);

    // Datas
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
    const [profMateriasSeries, setProfMateriasSeries] =
        useState<MapaMateriasSeries>({});
    const [profManhaAtivo, setProfManhaAtivo] = useState(false);
    const [profManhaInicio, setProfManhaInicio] = useState('08:00');
    const [profManhaFim, setProfManhaFim] = useState('11:20');
    const [profInicio, setProfInicio] = useState('14:10');
    const [profFim, setProfFim] = useState('20:50');

    // Edição Professor
    const [editProfId, setEditProfId] = useState<number | null>(null);
    const [editProfNome, setEditProfNome] = useState('');
    const [editProfClinCareId, setEditProfClinCareId] = useState('');
    const [editProfUnidadeId, setEditProfUnidadeId] = useState<number>(1);
    const [editProfMaterias, setEditProfMaterias] = useState('');
    const [editProfMateriasSeries, setEditProfMateriasSeries] =
        useState<MapaMateriasSeries>({});
    const [editProfManhaAtivo, setEditProfManhaAtivo] = useState(false);
    const [editProfManhaInicio, setEditProfManhaInicio] = useState('08:00');
    const [editProfManhaFim, setEditProfManhaFim] = useState('11:20');
    const [editProfInicio, setEditProfInicio] = useState('14:10');
    const [editProfFim, setEditProfFim] = useState('20:50');
    const [salvandoProf, setSalvandoProf] = useState(false);

    // Unidades e Reset de PIN
    const [edicaoUnidades, setEdicaoUnidades] = useState<Record<number, string>>(
        {}
    );
    const [resetandoPin, setResetandoPin] = useState(false);

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
                    setEditMeuNome(jsonP.perfilAtual.nome || '');
                    setEditMeuEmail(jsonP.perfilAtual.email || '');
                    setEditMinhaFoto(jsonP.perfilAtual.foto_url || null);
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
            setAlunos(json.alunos || []);
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
            setEditMinhaFoto(base64);

            if (perfilAtual.id === 0) {
                setAbaModalPerfil('meu');
                setModalPerfilAberto(true);
                setFeedbackPerfil({
                    tipo: 'erro',
                    texto:
                        'Foto carregada! Preencha seu Nome, E-mail e uma Senha abaixo para ativar seu perfil pessoal e salvar sua foto.',
                });
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
            setFeedbackPerfil({
                tipo: 'erro',
                texto: 'Não foi possível processar esta imagem.',
            });
        }
    }

    async function handleSalvarMeuPerfil(e: React.FormEvent) {
        e.preventDefault();
        setSalvandoMeuPerfil(true);
        setFeedbackPerfil(null);

        try {
            const res = await fetch('/api/admin/perfis', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: perfilAtual.id,
                    nome: editMeuNome,
                    email: editMeuEmail,
                    nova_senha: editMinhaNovaSenha || undefined,
                    foto_url: editMinhaFoto,
                }),
            });
            const json = await res.json();
            if (!res.ok) {
                setFeedbackPerfil({
                    tipo: 'erro',
                    texto: json.error || 'Erro ao salvar perfil.',
                });
                return;
            }

            if (json.perfilAtual) {
                setPerfilAtual(json.perfilAtual);
            }
            setEditMinhaNovaSenha('');
            setFeedbackPerfil({
                tipo: 'sucesso',
                texto: json.mensagem || 'Perfil atualizado com sucesso!',
            });
            await carregarPerfisETextos();
        } finally {
            setSalvandoMeuPerfil(false);
        }
    }

    async function handleCriarNovoAdmin(e: React.FormEvent) {
        e.preventDefault();
        setCriandoNovoAdmin(true);
        setFeedbackPerfil(null);

        try {
            const res = await fetch('/api/admin/perfis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome: novoAdminNome,
                    email: novoAdminEmail,
                    senha: novoAdminSenha,
                    foto_url: novoAdminFoto,
                }),
            });
            const json = await res.json();
            if (!res.ok) {
                setFeedbackPerfil({
                    tipo: 'erro',
                    texto: json.error || 'Erro ao criar administrador.',
                });
                return;
            }

            setNovoAdminNome('');
            setNovoAdminEmail('');
            setNovoAdminSenha('');
            setNovoAdminFoto(null);
            setFeedbackPerfil({
                tipo: 'sucesso',
                texto: json.mensagem || 'Novo administrador cadastrado!',
            });
            await carregarPerfisETextos();
        } finally {
            setCriandoNovoAdmin(false);
        }
    }

    async function handleRedefinirSenhaEquipe(id: number) {
        if (novaSenhaEquipe.trim().length < 6) {
            setFeedbackPerfil({
                tipo: 'erro',
                texto: 'A nova senha deve ter no mínimo 6 caracteres.',
            });
            return;
        }

        const res = await fetch('/api/admin/perfis', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id,
                nova_senha: novaSenhaEquipe.trim(),
            }),
        });
        const json = await res.json();
        if (!res.ok) {
            setFeedbackPerfil({
                tipo: 'erro',
                texto: json.error || 'Falha ao redefinir senha.',
            });
            return;
        }

        setRedefinirSenhaId(null);
        setNovaSenhaEquipe('');
        setFeedbackPerfil({
            tipo: 'sucesso',
            texto: 'Senha do perfil redefinida com sucesso!',
        });
    }

    async function alternarStatusAdmin(id: number, ativo: boolean) {
        await fetch('/api/admin/perfis', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ativo }),
        });
        await carregarPerfisETextos();
    }

    async function excluirPerfilAdmin(id: number) {
        await fetch(`/api/admin/perfis?id=${id}`, { method: 'DELETE' });
        await carregarPerfisETextos();
    }

    async function handleSalvarTextosPortal(e: React.FormEvent) {
        e.preventDefault();
        setSalvandoTextos(true);
        setFeedbackTextos(null);

        try {
            const res = await fetch('/api/admin/textos-portal', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ textos: textosPortal }),
            });
            const json = await res.json();
            if (!res.ok) {
                setFeedbackTextos({
                    tipo: 'erro',
                    texto: json.error || 'Não foi possível publicar os textos.',
                });
                return;
            }
            if (json.textos) {
                setTextosPortal(json.textos);
            }
            setFeedbackTextos({
                tipo: 'sucesso',
                texto:
                    json.mensagem ||
                    'Textos publicados! O portal já está exibindo as alterações.',
            });
        } finally {
            setSalvandoTextos(false);
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
                materias_series: profMateriasSeries,
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
        setProfMateriasSeries({});
        setProfManhaAtivo(false);
        await carregarDados();
    }

    function iniciarEdicaoProfessor(p: ProfessorAdmin) {
        setEditProfId(p.id);
        setEditProfNome(p.nome);
        setEditProfClinCareId(p.clin_care_id || '');
        setEditProfUnidadeId(p.unidade_id);
        setEditProfMaterias((p.materias || []).join(', '));
        setEditProfMateriasSeries(p.materias_series || {});
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
                    materias_series: editProfMateriasSeries,
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

    async function resetarPinCliente(telefoneAlvo: string) {
        if (!telefoneAlvo.trim()) return;
        setResetandoPin(true);
        setFeedbackAluno(null);
        try {
            const res = await fetch('/api/admin/alunos/reset-pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telefone: telefoneAlvo }),
            });
            const json = await res.json();
            if (res.ok) {
                setFeedbackAluno({
                    tipo: 'sucesso',
                    texto: json.mensagem || 'PIN resetado com sucesso.',
                });
                await carregarDados();
            } else {
                setFeedbackAluno({
                    tipo: 'erro',
                    texto: json.error || 'Não foi possível resetar o PIN.',
                });
            }
        } finally {
            setResetandoPin(false);
        }
    }

    function iniciarEdicaoAlunoAdmin(al: AlunoAdmin) {
        setEditAlunoId(al.id);
        setEditAlunoNome(al.nome_aluno);
        setEditAlunoResponsavel(al.responsavel_nome || '');
        setEditAlunoTelefone(
            formatarTelefone(al.telefone || al.telefone_formatado || '')
        );
        setEditAlunoColegio(al.colegio_nome || '');
        setEditAlunoSerie(
            SERIES_ESCOLARES.includes(al.serie) ? al.serie : SERIES_ESCOLARES[0]
        );
        setAtualizarIrmaosTelefone(true);
        setFeedbackAluno(null);
    }

    async function salvarEdicaoAlunoAdmin(e: React.FormEvent) {
        e.preventDefault();
        if (!editAlunoId) return;
        setSalvandoAlunoAdmin(true);
        setFeedbackAluno(null);

        try {
            const res = await fetch('/api/admin/alunos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editAlunoId,
                    nome_aluno: editAlunoNome,
                    responsavel_nome: editAlunoResponsavel,
                    telefone: editAlunoTelefone,
                    colegio_nome: editAlunoColegio,
                    serie: editAlunoSerie,
                    atualizar_irmaos: atualizarIrmaosTelefone,
                }),
            });
            const json = await res.json();
            if (!res.ok) {
                setFeedbackAluno({
                    tipo: 'erro',
                    texto: json.error || 'Erro ao salvar dados do aluno.',
                });
                return;
            }
            setEditAlunoId(null);
            setFeedbackAluno({
                tipo: 'sucesso',
                texto: json.mensagem || 'Dados atualizados com sucesso.',
            });
            await carregarDados();
        } finally {
            setSalvandoAlunoAdmin(false);
        }
    }

    async function excluirAlunoAdmin(id: number) {
        setExcluindoAlunoId(id);
        setFeedbackAluno(null);
        try {
            const res = await fetch(`/api/admin/alunos?id=${id}`, {
                method: 'DELETE',
            });
            const json = await res.json();
            if (!res.ok) {
                setFeedbackAluno({
                    tipo: 'erro',
                    texto: json.error || 'Erro ao excluir aluno.',
                });
                return;
            }
            setConfirmandoExcluirAlunoId(null);
            setFeedbackAluno({
                tipo: 'sucesso',
                texto: json.mensagem || 'Aluno excluído com sucesso.',
            });
            await carregarDados();
        } finally {
            setExcluindoAlunoId(null);
        }
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

                    {/* SELETOR DE MODO DE ACESSO: PERFIL vs CHAVE MESTRA */}
                    <div className={`grid grid-cols-2 gap-1.5 p-1 rounded-xl border ${clsSubCard}`}>
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
            badge: professores.filter((p) => p.ativo).length,
            icone: <GraduationCap className="w-4 h-4" />,
        },
        {
            id: 'unidades',
            rotulo: 'Unidades',
            subtitulo: 'IDs e Clin Care',
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
                'Acompanhe as aulas marcadas, sincronize bloqueios do Clin Care e exporte relatórios.',
        },
        mapa: {
            titulo: 'Mapa do Dia',
            descricao:
                'Visualize horários livres, aulas agendadas e bloqueios do Clin Care por unidade.',
        },
        alunos: {
            titulo: 'Alunos & Responsáveis',
            descricao:
                'Pesquise por responsável ou número, altere WhatsApp, resete PIN de acesso ou exclua cadastros.',
        },
        textos: {
            titulo: 'Textos & Avisos do Portal',
            descricao:
                'Altere frases, avisos e regras de cancelamento do portal dos pais em tempo real, sem precisar de commit.',
        },
        datas: {
            titulo: 'Bloquear ou Liberar Datas',
            descricao:
                'Gerencie feriados bloqueados ou libere datas extras fora do calendário padrão.',
        },
        professores: {
            titulo: 'Equipe de Professores',
            descricao:
                'Configure matérias, séries atendidas e turnos de 100 minutos (manhã e tarde/noite).',
        },
        unidades: {
            titulo: 'Unidades & Integração',
            descricao:
                'Gerencie as unidades presenciais, Online, Imbuí e os vínculos com o Clin Care.',
        },
    };

    // Filtragem de Alunos
    const termoBuscaAluno = buscaAluno.trim().toLowerCase();
    const digitosBuscaAluno = buscaAluno.replace(/\D/g, '');

    const alunosFiltrados = alunos.filter((al) => {
        if (filtroPinAluno === 'com_pin' && !al.tem_pin) return false;
        if (filtroPinAluno === 'sem_pin' && al.tem_pin) return false;

        if (!termoBuscaAluno) return true;

        const bateTexto =
            al.responsavel_nome.toLowerCase().includes(termoBuscaAluno) ||
            al.nome_aluno.toLowerCase().includes(termoBuscaAluno) ||
            al.colegio_nome.toLowerCase().includes(termoBuscaAluno) ||
            al.telefone_formatado.toLowerCase().includes(termoBuscaAluno);

        const bateDigitos =
            digitosBuscaAluno.length > 0 &&
            al.telefone.replace(/\D/g, '').includes(digitosBuscaAluno);

        return bateTexto || bateDigitos;
    });

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
                                setFeedbackPerfil(null);
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
                        sistemaAbertoAgora ? 'bg-emerald-400' : 'bg-[#BE1E23]'
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
                                    className={`w-4 h-4 ${carregandoDados ? 'animate-spin' : ''}`}
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
                    {/* ABA 1: AGENDAMENTOS */}
                    {aba === 'agendamentos' && (
                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
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
                                                Lançamento Clin Care
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
                                                                    title={ag.clincare_reserva_erro || undefined}
                                                                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                                                        ag.sincronizado_clincare
                                                                            ? 'bg-[#0E7C86]/15 text-[#25A4AF] border-[#0E7C86]/35'
                                                                            : ag.clincare_reserva_status === 'reservado'
                                                                                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                                                                                : ag.clincare_reserva_status === 'erro'
                                                                                    ? 'bg-[#BE1E23]/20 text-rose-400 border-[#BE1E23]/40'
                                                                                    : 'bg-[#C24124]/15 text-amber-400 border-[#C24124]/35'
                                                                    }`}
                                                                >
    {ag.sincronizado_clincare
        ? 'Confirmado (Aluno Vinculado)'
        : ag.clincare_reserva_status === 'reservado'
            ? 'RESERVADO APP (Trocar p/ Aluno)'
            : ag.clincare_reserva_status === 'erro'
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

                                                        {ag.clincare_reserva_erro && !ag.sincronizado_clincare && (
                                                            <p className="text-[11px] text-rose-400 bg-[#BE1E23]/15 border border-[#BE1E23]/35 rounded-lg px-2.5 py-1.5 mt-1.5">
                                                                <strong>Robô Clin Care:</strong> {ag.clincare_reserva_erro}
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
                                                                ag.clincare_reserva_status !== 'reservado')) && (
                                                                <button
                                                                    type="button"
                                                                    onClick={async () => {
                                                                        try {
                                                                            const resposta = await fetch('/api/admin/agendamentos', {
                                                                                method: 'PATCH',
                                                                                headers: { 'Content-Type': 'application/json' },
                                                                                body: JSON.stringify({
                                                                                    id: ag.id,
                                                                                    reenviar_robo: true,
                                                                                }),
                                                                            });
                                                                            if (!resposta.ok) {
                                                                                const retorno = await resposta.json().catch(() => ({}));
                                                                                window.alert(retorno.error || 'Não foi possível acionar o robô.');
                                                                            }
                                                                        } catch {
                                                                            window.alert('Falha de conexão ao acionar o robô.');
                                                                        } finally {
                                                                            await carregarDados();
                                                                        }
                                                                    }}
                                                                    className="px-3 py-1.5 rounded-xl bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:bg-cyan-500/25"
                                                                >
                                                                    <RefreshCw className="w-3.5 h-3.5" />
                                                                    {ag.status === 'cancelado' ? 'Repetir cancelamento no ClinCare' : 'Reenviar Robô'}
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

                    {/* ABA 2: MAPA DO DIA */}
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
                      Bloqueio Clin Care
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
                                                                            Bloqueio Clin Care
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

                    {/* ABA 3: MÓDULO ALUNOS & RESPONSÁVEIS */}
                    {aba === 'alunos' && (
                        <section className="space-y-5">
                            <div className={`border rounded-2xl p-5 space-y-4 ${clsCard}`}>
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                                    <div className="md:col-span-7">
                                        <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                            Buscar por Responsável, Número de WhatsApp, Aluno ou
                                            Colégio
                                        </label>
                                        <div className="relative">
                                            <Search
                                                className={`w-4 h-4 absolute left-3.5 top-3 ${clsSubtexto}`}
                                            />
                                            <input
                                                type="text"
                                                value={buscaAluno}
                                                onChange={(e) => setBuscaAluno(e.target.value)}
                                                placeholder="Digite nome do responsável, aluno ou telefone..."
                                                className={`w-full border rounded-xl pl-10 pr-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                                            />
                                        </div>
                                    </div>

                                    <div className="md:col-span-3">
                                        <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                            Situação do PIN
                                        </label>
                                        <select
                                            value={filtroPinAluno}
                                            onChange={(e) => setFiltroPinAluno(e.target.value)}
                                            className={`w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                                        >
                                            <option value="todos">Todos os cadastros</option>
                                            <option value="com_pin">Com PIN ativo</option>
                                            <option value="sem_pin">Sem PIN (1º acesso)</option>
                                        </select>
                                    </div>

                                    <div className="md:col-span-2 flex items-center justify-between md:justify-end gap-2 pb-1">
                    <span className={`text-xs font-bold ${clsTitulo}`}>
                      {alunosFiltrados.length} aluno(s)
                    </span>
                                        {(buscaAluno || filtroPinAluno !== 'todos') && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setBuscaAluno('');
                                                    setFiltroPinAluno('todos');
                                                }}
                                                className="text-xs text-[#1496A1] hover:underline cursor-pointer"
                                            >
                                                Limpar
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {feedbackAluno && (
                                    <div
                                        className={`rounded-xl border px-4 py-3 text-xs flex items-center justify-between gap-2 ${
                                            feedbackAluno.tipo === 'sucesso'
                                                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                                                : 'bg-[#BE1E23]/15 border-[#BE1E23]/40 text-rose-400'
                                        }`}
                                    >
                                        <span>{feedbackAluno.texto}</span>
                                        <button
                                            type="button"
                                            onClick={() => setFeedbackAluno(null)}
                                            className="cursor-pointer"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {alunosFiltrados.length === 0 ? (
                                <div
                                    className={`border rounded-2xl p-10 text-center text-sm ${clsCard} ${clsSubtexto}`}
                                >
                                    Nenhum aluno ou responsável encontrado para esta busca.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {alunosFiltrados.map((al) => {
                                        const editandoEste = editAlunoId === al.id;
                                        const pedindoExclusao =
                                            confirmandoExcluirAlunoId === al.id;
                                        const whatsappDigitos = (al.telefone || '').replace(
                                            /\D/g,
                                            ''
                                        );

                                        if (editandoEste) {
                                            return (
                                                <form
                                                    key={al.id}
                                                    onSubmit={(e) => void salvarEdicaoAlunoAdmin(e)}
                                                    className={`border border-[#0E7C86] rounded-2xl p-5 space-y-3.5 ${clsCard}`}
                                                >
                                                    <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase text-[#1496A1]">
                              Editando Cadastro de Aluno / Responsável
                            </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditAlunoId(null)}
                                                            className={`cursor-pointer ${clsSubtexto}`}
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <div>
                                                            <label
                                                                className={`block text-[11px] mb-1 ${clsSubtexto}`}
                                                            >
                                                                Nome do Responsável *
                                                            </label>
                                                            <input
                                                                type="text"
                                                                required
                                                                value={editAlunoResponsavel}
                                                                onChange={(e) =>
                                                                    setEditAlunoResponsavel(e.target.value)
                                                                }
                                                                className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                                            />
                                                        </div>

                                                        <div>
                                                            <label
                                                                className={`block text-[11px] mb-1 ${clsSubtexto}`}
                                                            >
                                                                WhatsApp do Responsável (com DDD) *
                                                            </label>
                                                            <input
                                                                type="tel"
                                                                required
                                                                value={editAlunoTelefone}
                                                                onChange={(e) =>
                                                                    setEditAlunoTelefone(
                                                                        formatarTelefone(e.target.value)
                                                                    )
                                                                }
                                                                className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                        <div>
                                                            <label
                                                                className={`block text-[11px] mb-1 ${clsSubtexto}`}
                                                            >
                                                                Nome do Aluno(a) *
                                                            </label>
                                                            <input
                                                                type="text"
                                                                required
                                                                value={editAlunoNome}
                                                                onChange={(e) =>
                                                                    setEditAlunoNome(e.target.value)
                                                                }
                                                                className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                                            />
                                                        </div>

                                                        <div>
                                                            <label
                                                                className={`block text-[11px] mb-1 ${clsSubtexto}`}
                                                            >
                                                                Colégio
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={editAlunoColegio}
                                                                onChange={(e) =>
                                                                    setEditAlunoColegio(e.target.value)
                                                                }
                                                                className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                                            />
                                                        </div>

                                                        <div>
                                                            <label
                                                                className={`block text-[11px] mb-1 ${clsSubtexto}`}
                                                            >
                                                                Série / Ano
                                                            </label>
                                                            <select
                                                                value={editAlunoSerie}
                                                                onChange={(e) =>
                                                                    setEditAlunoSerie(e.target.value)
                                                                }
                                                                className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                                            >
                                                                {SERIES_ESCOLARES.map((s) => (
                                                                    <option key={s} value={s}>
                                                                        {s}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>

                                                    <label
                                                        className={`flex items-center gap-2 text-[11px] cursor-pointer ${clsSubtexto}`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={atualizarIrmaosTelefone}
                                                            onChange={(e) =>
                                                                setAtualizarIrmaosTelefone(e.target.checked)
                                                            }
                                                        />
                                                        Se o número mudou, atualizar também para irmãos
                                                        vinculados ao telefone antigo
                                                    </label>

                                                    <div className="flex justify-end gap-2 pt-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditAlunoId(null)}
                                                            className={`px-3 py-1.5 rounded-xl border text-xs cursor-pointer ${clsSubCard}`}
                                                        >
                                                            Cancelar
                                                        </button>
                                                        <button
                                                            type="submit"
                                                            disabled={salvandoAlunoAdmin}
                                                            className="px-4 py-1.5 rounded-xl bg-[#0E7C86] hover:bg-[#118E99] text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
                                                        >
                                                            <Save className="w-3.5 h-3.5" />
                                                            {salvandoAlunoAdmin
                                                                ? 'Salvando...'
                                                                : 'Salvar Alterações'}
                                                        </button>
                                                    </div>
                                                </form>
                                            );
                                        }

                                        return (
                                            <div
                                                key={al.id}
                                                className={`border rounded-2xl p-5 space-y-3.5 ${clsCard}`}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <h3 className={`text-base font-bold ${clsTitulo}`}>
                                                            {al.nome_aluno}
                                                        </h3>
                                                        <p className={`text-xs ${clsSubtexto}`}>
                                                            {[al.colegio_nome, al.serie]
                                                                .filter(Boolean)
                                                                .join(' • ') || 'Colégio/Série não informados'}
                                                        </p>
                                                    </div>

                                                    <div className="flex flex-col items-end gap-1">
                            <span
                                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                                    al.pin_bloqueado
                                        ? 'bg-[#BE1E23]/15 border-[#BE1E23]/40 text-rose-400'
                                        : al.tem_pin
                                            ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                                            : `${clsSubCard} ${clsSubtexto}`
                                }`}
                            >
                              {al.pin_bloqueado
                                  ? 'PIN Bloqueado'
                                  : al.tem_pin
                                      ? 'PIN Ativo'
                                      : 'Sem PIN'}
                            </span>

                                                        <span className={`text-[11px] ${clsSubtexto}`}>
                              {al.total_aulas} aula(s)
                            </span>
                                                    </div>
                                                </div>

                                                <div
                                                    className={`border rounded-xl p-3 text-xs space-y-1 ${clsSubCard}`}
                                                >
                                                    <p>
                                                        <strong>Responsável:</strong>{' '}
                                                        {al.responsavel_nome || 'Não informado'}
                                                    </p>
                                                    <p className="text-[#1496A1] font-semibold">
                                                        WhatsApp:{' '}
                                                        {formatarTelefone(
                                                            al.telefone || al.telefone_formatado
                                                        ) || 'Não cadastrado'}
                                                    </p>
                                                </div>

                                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => iniciarEdicaoAlunoAdmin(al)}
                                                            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition ${clsSubCard} ${clsTitulo} hover:border-[#0E7C86]`}
                                                        >
                                                            <Edit3 className="w-3.5 h-3.5 text-[#1496A1]" />{' '}
                                                            Editar / Trocar Número
                                                        </button>

                                                        {whatsappDigitos && (
                                                            <button
                                                                type="button"
                                                                disabled={resetandoPin}
                                                                onClick={() =>
                                                                    void resetarPinCliente(al.telefone)
                                                                }
                                                                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition ${clsSubCard} ${clsSubtexto} hover:text-[#1496A1]`}
                                                            >
                                                                <KeyRound className="w-3.5 h-3.5" /> Resetar PIN
                                                            </button>
                                                        )}

                                                        {whatsappDigitos && (
                                                            <a
                                                                href={`https://wa.me/55${whatsappDigitos}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-500 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-emerald-500/25"
                                                            >
                                                                <MessageCircle className="w-3.5 h-3.5" />{' '}
                                                                WhatsApp
                                                            </a>
                                                        )}
                                                    </div>

                                                    {pedindoExclusao ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                disabled={excluindoAlunoId === al.id}
                                                                onClick={() =>
                                                                    setConfirmandoExcluirAlunoId(null)
                                                                }
                                                                className={`px-2.5 py-1.5 rounded-xl border text-xs cursor-pointer ${clsSubCard}`}
                                                            >
                                                                Não
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={excluindoAlunoId === al.id}
                                                                onClick={() => void excluirAlunoAdmin(al.id)}
                                                                className="px-3 py-1.5 rounded-xl bg-[#BE1E23] hover:bg-rose-700 text-xs font-semibold text-white cursor-pointer"
                                                            >
                                                                {excluindoAlunoId === al.id
                                                                    ? 'Excluindo...'
                                                                    : 'Confirmar Exclusão'}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setConfirmandoExcluirAlunoId(al.id)
                                                            }
                                                            className="px-3 py-1.5 rounded-xl bg-[#BE1E23]/15 hover:bg-[#BE1E23]/25 border border-[#BE1E23]/40 text-rose-400 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" /> Excluir
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    )}

                    {/* ABA 4: EDITOR DE TEXTOS DO PORTAL (SEM COMMIT) */}
                    {aba === 'textos' && (
                        <form
                            onSubmit={(e) => void handleSalvarTextosPortal(e)}
                            className="max-w-4xl space-y-6"
                        >
                            <div className={`border rounded-2xl p-6 space-y-4 ${clsCard}`}>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h2 className={`text-base font-bold ${clsTitulo}`}>
                                            Cabeçalho & Apresentação R4 Ensina
                                        </h2>
                                        <p className={`text-xs ${clsSubtexto}`}>
                                            Qualquer palavra alterada aqui atualiza o site
                                            imediatamente após salvar.
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setTextosPortal({ ...TEXTOS_PORTAL_PADRAO });
                                            setFeedbackTextos(null);
                                        }}
                                        className={`px-3 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${clsSubCard} ${clsSubtexto} hover:text-[#1496A1]`}
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" /> Restaurar Padrões
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                            Selo Superior (Badge)
                                        </label>
                                        <input
                                            type="text"
                                            value={textosPortal.badge_topo}
                                            onChange={(e) =>
                                                setTextosPortal((prev) => ({
                                                    ...prev,
                                                    badge_topo: e.target.value,
                                                }))
                                            }
                                            className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                                        />
                                    </div>

                                    <div>
                                        <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                            Horário da Secretaria (Topo)
                                        </label>
                                        <input
                                            type="text"
                                            value={textosPortal.horario_secretaria}
                                            onChange={(e) =>
                                                setTextosPortal((prev) => ({
                                                    ...prev,
                                                    horario_secretaria: e.target.value,
                                                }))
                                            }
                                            className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                        Título Principal do Portal
                                    </label>
                                    <input
                                        type="text"
                                        value={textosPortal.titulo_principal}
                                        onChange={(e) =>
                                            setTextosPortal((prev) => ({
                                                ...prev,
                                                titulo_principal: e.target.value,
                                            }))
                                        }
                                        className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                                    />
                                </div>

                                <div>
                                    <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                        Descrição / Subtítulo de Boas-Vindas
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={textosPortal.subtitulo_principal}
                                        onChange={(e) =>
                                            setTextosPortal((prev) => ({
                                                ...prev,
                                                subtitulo_principal: e.target.value,
                                            }))
                                        }
                                        className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                                    />
                                </div>
                            </div>

                            <div className={`border rounded-2xl p-6 space-y-4 ${clsCard}`}>
                                <h2 className={`text-base font-bold ${clsTitulo}`}>
                                    Avisos de Cancelamento (Taxa 2h) & Regras de Atendimento
                                </h2>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className={`border rounded-xl p-4 space-y-3 ${clsSubCard}`}>
                                        <p className="text-xs font-bold text-[#1496A1]">
                                            Bloco 1: Aulas da Próxima Semana
                                        </p>
                                        <div>
                                            <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                                Título do Aviso
                                            </label>
                                            <input
                                                type="text"
                                                value={textosPortal.aviso_proxima_semana_titulo}
                                                onChange={(e) =>
                                                    setTextosPortal((prev) => ({
                                                        ...prev,
                                                        aviso_proxima_semana_titulo: e.target.value,
                                                    }))
                                                }
                                                className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                            />
                                        </div>
                                        <div>
                                            <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                                Texto do Aviso
                                            </label>
                                            <textarea
                                                rows={4}
                                                value={textosPortal.aviso_proxima_semana_texto}
                                                onChange={(e) =>
                                                    setTextosPortal((prev) => ({
                                                        ...prev,
                                                        aviso_proxima_semana_texto: e.target.value,
                                                    }))
                                                }
                                                className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                            />
                                        </div>
                                    </div>

                                    <div className={`border rounded-xl p-4 space-y-3 ${clsSubCard}`}>
                                        <p className="text-xs font-bold text-rose-400">
                                            Bloco 2: Política de Cancelamento (2h)
                                        </p>
                                        <div>
                                            <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                                Título do Aviso
                                            </label>
                                            <input
                                                type="text"
                                                value={textosPortal.aviso_cancelamento_titulo}
                                                onChange={(e) =>
                                                    setTextosPortal((prev) => ({
                                                        ...prev,
                                                        aviso_cancelamento_titulo: e.target.value,
                                                    }))
                                                }
                                                className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                            />
                                        </div>
                                        <div>
                                            <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                                Texto do Aviso (Topo da Página)
                                            </label>
                                            <textarea
                                                rows={4}
                                                value={textosPortal.aviso_cancelamento_texto}
                                                onChange={(e) =>
                                                    setTextosPortal((prev) => ({
                                                        ...prev,
                                                        aviso_cancelamento_texto: e.target.value,
                                                    }))
                                                }
                                                className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                        Alerta na Lista de &ldquo;Próximas Aulas&rdquo;
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={textosPortal.aviso_agenda_cancelamento}
                                        onChange={(e) =>
                                            setTextosPortal((prev) => ({
                                                ...prev,
                                                aviso_agenda_cancelamento: e.target.value,
                                            }))
                                        }
                                        className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                                    />
                                </div>

                                <div>
                                    <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                        Lembrete na Janela de Confirmação da Aula
                                    </label>
                                    <input
                                        type="text"
                                        value={textosPortal.aviso_modal_lembrete}
                                        onChange={(e) =>
                                            setTextosPortal((prev) => ({
                                                ...prev,
                                                aviso_modal_lembrete: e.target.value,
                                            }))
                                        }
                                        className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                                    />
                                </div>

                                <div>
                                    <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                        Mensagem quando o Portal Online Estiver Fechado
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={textosPortal.aviso_sistema_fechado}
                                        onChange={(e) =>
                                            setTextosPortal((prev) => ({
                                                ...prev,
                                                aviso_sistema_fechado: e.target.value,
                                            }))
                                        }
                                        className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                                    />
                                </div>

                                {feedbackTextos && (
                                    <div
                                        className={`rounded-xl border px-4 py-3 text-xs ${
                                            feedbackTextos.tipo === 'sucesso'
                                                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                                                : 'bg-[#BE1E23]/15 border-[#BE1E23]/40 text-rose-400'
                                        }`}
                                    >
                                        {feedbackTextos.texto}
                                    </div>
                                )}

                                <div className="flex justify-end pt-2">
                                    <button
                                        type="submit"
                                        disabled={salvandoTextos}
                                        className="px-6 py-3 rounded-xl bg-[#0E7C86] hover:bg-[#118E99] disabled:opacity-50 text-sm font-bold text-white inline-flex items-center gap-2 shadow-md cursor-pointer"
                                    >
                                        <Save className="w-4 h-4" />
                                        {salvandoTextos
                                            ? 'Publicando...'
                                            : 'Salvar e Publicar no Portal'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    )}

                    {/* ABA 5: BLOQUEAR / LIBERAR DIAS */}
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

                    {/* ABA 6: PROFESSORES */}
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
                                            ID Clin Care
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
                                        Matérias (separadas por vírgula) *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ex: Matemática, Geografia"
                                        value={profMaterias}
                                        onChange={(e) => setProfMaterias(e.target.value)}
                                        className={`w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                                    />
                                </div>

                                <SeletorSeriesPorMateria
                                    materiasTexto={profMaterias}
                                    mapaAtual={profMateriasSeries}
                                    onChangeMapa={setProfMateriasSeries}
                                    escuro={escuro}
                                />

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

                                <div className="space-y-2.5 max-h-[760px] overflow-y-auto pr-1">
                                    {professores.map((p) => {
                                        const editandoEste = editProfId === p.id;
                                        const slotsProf = gerarTodosSlotsProfessor(p);
                                        const mapaSeries = p.materias_series || {};

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

                                                    <SeletorSeriesPorMateria
                                                        materiasTexto={editProfMaterias}
                                                        mapaAtual={editProfMateriasSeries}
                                                        onChangeMapa={setEditProfMateriasSeries}
                                                        escuro={escuro}
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
                                                            placeholder="ID Clin Care"
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
                                                <div className="space-y-1">
                                                    <p className={`font-bold text-sm ${clsTitulo}`}>
                                                        {p.nome}{' '}
                                                        <span className="text-xs font-medium text-[#1496A1]">
                              • {p.unidade_nome}
                            </span>
                                                    </p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {(p.materias || []).map((mat) => {
                                                            const chave = Object.keys(mapaSeries).find(
                                                                (k) =>
                                                                    k.trim().toLowerCase() === mat.toLowerCase()
                                                            );
                                                            const seriesMat = chave ? mapaSeries[chave] : [];
                                                            const restrito = seriesMat.length > 0;

                                                            return (
                                                                <span
                                                                    key={mat}
                                                                    className={`text-[11px] px-2 py-0.5 rounded-md border ${
                                                                        restrito
                                                                            ? 'bg-[#0E7C86]/15 border-[#0E7C86]/40 text-[#25A4AF]'
                                                                            : `${clsCard} ${clsSubtexto}`
                                                                    }`}
                                                                >
                                  <strong>{mat}</strong>:{' '}
                                                                    {resumirSeriesCurto(seriesMat)}
                                </span>
                                                            );
                                                        })}
                                                    </div>
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

                    {/* ABA 7: UNIDADES / CLIN CARE */}
                    {aba === 'unidades' && (
                        <section
                            className={`border rounded-2xl p-6 space-y-4 max-w-3xl ${clsCard}`}
                        >
                            <h3
                                className={`text-sm font-bold flex items-center gap-2 ${clsTitulo}`}
                            >
                                <Building2 className="w-4 h-4 text-[#1496A1]" />
                                Vínculo de Unidades com o Clin Care
                            </h3>
                            <p className={`text-xs ${clsSubtexto}`}>
                                Para as unidades <strong>Online</strong> e{' '}
                                <strong>Imbuí</strong>, mantenha <code>id-online</code> e{' '}
                                <code>id-imbui</code> (ou informe o UUID caso elas também
                                possuam agenda no Clin Care).
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
                                                ID de Unidade no Clin Care
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

            {/* MODAL DE PERFIL & EQUIPE ADMINISTRATIVA */}
            {modalPerfilAberto && (
                <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
                    <div
                        className={`border rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto ${clsCard}`}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#1496A1]">
                  Conta & Administradores R4
                </span>
                                <h2 className={`text-lg font-bold ${clsTitulo}`}>
                                    Perfil e Controle de Acesso
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setModalPerfilAberto(false)}
                                className={`p-1.5 rounded-lg cursor-pointer ${clsSubtexto}`}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex gap-2 border-b pb-3 border-[#232B35]">
                            <button
                                type="button"
                                onClick={() => {
                                    setAbaModalPerfil('meu');
                                    setFeedbackPerfil(null);
                                }}
                                className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                                    abaModalPerfil === 'meu'
                                        ? 'bg-[#0E7C86] text-white'
                                        : `${clsSubCard} ${clsSubtexto}`
                                }`}
                            >
                                Meu Perfil & Foto
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setAbaModalPerfil('equipe');
                                    setFeedbackPerfil(null);
                                }}
                                className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                                    abaModalPerfil === 'equipe'
                                        ? 'bg-[#0E7C86] text-white'
                                        : `${clsSubCard} ${clsSubtexto}`
                                }`}
                            >
                                Criar / Gerenciar Perfis ({perfisAdmin.length})
                            </button>
                        </div>

                        {feedbackPerfil && (
                            <div
                                className={`rounded-xl border px-4 py-3 text-xs ${
                                    feedbackPerfil.tipo === 'sucesso'
                                        ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                                        : 'bg-[#BE1E23]/15 border-[#BE1E23]/40 text-rose-400'
                                }`}
                            >
                                {feedbackPerfil.texto}
                            </div>
                        )}

                        {abaModalPerfil === 'meu' ? (
                            <form
                                onSubmit={(e) => void handleSalvarMeuPerfil(e)}
                                className="space-y-4"
                            >
                                <div className="flex items-center gap-4">
                                    <label className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-[#0E7C86] cursor-pointer group bg-[#0E7C86]/20 flex items-center justify-center shrink-0">
                                        {editMinhaFoto ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={editMinhaFoto}
                                                alt="Avatar"
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <span className="text-lg font-bold text-[#1496A1]">
                        {obterIniciais(editMeuNome || perfilAtual.nome)}
                      </span>
                                        )}
                                        <span className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                      <Camera className="w-5 h-5" />
                    </span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={async (e) => {
                                                const f = e.target.files?.[0];
                                                if (f) {
                                                    const b64 = await comprimirImagemAvatar(f);
                                                    setEditMinhaFoto(b64);
                                                }
                                            }}
                                            className="hidden"
                                        />
                                    </label>

                                    <div className="space-y-1">
                                        <p className={`text-sm font-bold ${clsTitulo}`}>
                                            Foto de Perfil
                                        </p>
                                        <p className={`text-xs ${clsSubtexto}`}>
                                            Clique no círculo ao lado para escolher uma foto do seu
                                            computador ou celular.
                                        </p>
                                        {editMinhaFoto && (
                                            <button
                                                type="button"
                                                onClick={() => setEditMinhaFoto(null)}
                                                className="text-xs text-rose-400 hover:underline cursor-pointer"
                                            >
                                                Remover foto
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                            Seu Nome Completo *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={editMeuNome}
                                            onChange={(e) => setEditMeuNome(e.target.value)}
                                            placeholder="Ex: Coordenação R4"
                                            className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                                        />
                                    </div>

                                    <div>
                                        <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                            Seu E-mail de Login *
                                        </label>
                                        <input
                                            type="email"
                                            required
                                            autoComplete="off"
                                            value={editMeuEmail}
                                            onChange={(e) => setEditMeuEmail(e.target.value)}
                                            placeholder="nome@r4ensina.com.br"
                                            className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                        {perfilAtual.id === 0
                                            ? 'Defina sua Senha Pessoal (mín. 6 caracteres) *'
                                            : 'Nova Senha (deixe em branco para manter a atual)'}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={mostrarMinhaNovaSenha ? 'text' : 'password'}
                                            autoComplete="new-password"
                                            required={perfilAtual.id === 0}
                                            value={editMinhaNovaSenha}
                                            onChange={(e) => setEditMinhaNovaSenha(e.target.value)}
                                            placeholder="Digite a senha desejada"
                                            className={`w-full border rounded-xl pl-3.5 pr-10 py-2.5 text-sm ${clsInput}`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setMostrarMinhaNovaSenha((v) => !v)}
                                            className={`absolute right-3 top-3 cursor-pointer ${clsSubtexto}`}
                                        >
                                            {mostrarMinhaNovaSenha ? (
                                                <EyeOff className="w-4 h-4" />
                                            ) : (
                                                <Eye className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setModalPerfilAberto(false)}
                                        className={`px-4 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${clsSubCard}`}
                                    >
                                        Fechar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={salvandoMeuPerfil}
                                        className="px-5 py-2.5 rounded-xl bg-[#0E7C86] hover:bg-[#118E99] text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <Save className="w-3.5 h-3.5" />
                                        {salvandoMeuPerfil ? 'Salvando...' : 'Salvar Meu Perfil'}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <div className="space-y-5">
                                <form
                                    onSubmit={(e) => void handleCriarNovoAdmin(e)}
                                    className={`border rounded-xl p-4 space-y-3 ${clsSubCard}`}
                                >
                                    <p className="text-xs font-bold text-[#1496A1] flex items-center gap-1.5">
                                        <UserPlus className="w-4 h-4" /> Cadastrar Novo Perfil
                                        Administrativo
                                    </p>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <input
                                            type="text"
                                            required
                                            value={novoAdminNome}
                                            onChange={(e) => setNovoAdminNome(e.target.value)}
                                            placeholder="Nome completo *"
                                            className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                        />
                                        <input
                                            type="email"
                                            required
                                            autoComplete="off"
                                            value={novoAdminEmail}
                                            onChange={(e) => setNovoAdminEmail(e.target.value)}
                                            placeholder="E-mail de acesso *"
                                            className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                        />
                                        <div className="relative">
                                            <input
                                                type={mostrarNovoAdminSenha ? 'text' : 'password'}
                                                required
                                                autoComplete="new-password"
                                                value={novoAdminSenha}
                                                onChange={(e) => setNovoAdminSenha(e.target.value)}
                                                placeholder="Senha (mín. 6) *"
                                                className={`w-full border rounded-xl pl-3 pr-8 py-2 text-xs ${clsInput}`}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setMostrarNovoAdminSenha((v) => !v)}
                                                className={`absolute right-2.5 top-2 cursor-pointer ${clsSubtexto}`}
                                            >
                                                {mostrarNovoAdminSenha ? (
                                                    <EyeOff className="w-3.5 h-3.5" />
                                                ) : (
                                                    <Eye className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <label
                                            className={`text-xs inline-flex items-center gap-2 cursor-pointer ${clsSubtexto} hover:text-[#1496A1]`}
                                        >
                                            <Camera className="w-4 h-4 text-[#1496A1]" />
                                            <span>
                        {novoAdminFoto
                            ? 'Foto selecionada ✓'
                            : 'Adicionar foto opcional'}
                      </span>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={async (e) => {
                                                    const f = e.target.files?.[0];
                                                    if (f) {
                                                        const b64 = await comprimirImagemAvatar(f);
                                                        setNovoAdminFoto(b64);
                                                    }
                                                }}
                                                className="hidden"
                                            />
                                        </label>

                                        <button
                                            type="submit"
                                            disabled={criandoNovoAdmin}
                                            className="px-4 py-2 rounded-xl bg-[#0E7C86] hover:bg-[#118E99] text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            {criandoNovoAdmin ? 'Criando...' : 'Criar Perfil'}
                                        </button>
                                    </div>
                                </form>

                                <div className="space-y-2">
                                    <p className={`text-xs font-bold ${clsTitulo}`}>
                                        Perfis Cadastrados ({perfisAdmin.length})
                                    </p>
                                    {perfisAdmin.length === 0 ? (
                                        <p className={`text-xs ${clsSubtexto}`}>
                                            Nenhum perfil individual cadastrado ainda.
                                        </p>
                                    ) : (
                                        perfisAdmin.map((p) => (
                                            <div
                                                key={p.id}
                                                className={`border rounded-xl p-3 space-y-2.5 ${clsSubCard}`}
                                            >
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-9 h-9 rounded-full overflow-hidden bg-[#0E7C86]/20 border border-[#0E7C86] flex items-center justify-center text-xs font-bold text-[#1496A1] shrink-0">
                                                            {p.foto_url ? (
                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                <img
                                                                    src={p.foto_url}
                                                                    alt={p.nome}
                                                                    className="w-full h-full object-cover"
                                                                />
                                                            ) : (
                                                                obterIniciais(p.nome)
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p
                                                                className={`text-xs font-bold truncate ${clsTitulo}`}
                                                            >
                                                                {p.nome}{' '}
                                                                {p.id === perfilAtual.id && (
                                                                    <span className="text-[10px] text-[#1496A1]">
                                    (Você)
                                  </span>
                                                                )}
                                                            </p>
                                                            <p className={`text-[11px] truncate ${clsSubtexto}`}>
                                                                {p.email}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setRedefinirSenhaId(
                                                                    redefinirSenhaId === p.id ? null : p.id
                                                                );
                                                                setNovaSenhaEquipe('');
                                                            }}
                                                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${clsCard} ${clsSubtexto} hover:text-[#1496A1]`}
                                                        >
                                                            Redefinir Senha
                                                        </button>

                                                        {p.id !== perfilAtual.id && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        void alternarStatusAdmin(p.id, !p.ativo)
                                                                    }
                                                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                                                                        p.ativo
                                                                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/35'
                                                                            : 'bg-stone-500/20 text-stone-400'
                                                                    }`}
                                                                >
                                                                    {p.ativo ? 'Ativo' : 'Desativado'}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void excluirPerfilAdmin(p.id)}
                                                                    className="p-1.5 rounded-lg text-rose-400 hover:bg-[#BE1E23]/15 cursor-pointer"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                {redefinirSenhaId === p.id && (
                                                    <div className="flex items-center gap-2 pt-1">
                                                        <input
                                                            type="text"
                                                            autoComplete="new-password"
                                                            value={novaSenhaEquipe}
                                                            onChange={(e) =>
                                                                setNovaSenhaEquipe(e.target.value)
                                                            }
                                                            placeholder="Nova senha (mín. 6 caracteres)"
                                                            className={`flex-1 border rounded-lg px-3 py-1.5 text-xs ${clsInput}`}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                void handleRedefinirSenhaEquipe(p.id)
                                                            }
                                                            className="px-3 py-1.5 rounded-lg bg-[#0E7C86] text-xs font-semibold text-white cursor-pointer"
                                                        >
                                                            Salvar Senha
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

