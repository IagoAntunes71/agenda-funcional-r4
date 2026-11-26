'use client';
import { useLayoutR4 } from './EditorLayoutR4';
import { useTextoR4 } from '@/components/TextosInterfaceR4';


import { materiaBase, materiasBase, rotuloMateriaAula } from '@/lib/materia-aula';
import { useOperacaoR4 } from './OperacaoPainelR4';
import { CORES_STATUS_R4, podeOperacao } from '@/lib/operacao-r4';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { enderecoMapa } from '@/lib/admin-navegacao';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlignLeft,
    ArrowRightLeft,
    Ban,
    Building2,
    Calendar,
    CalendarPlus,
    CalendarX,
    Check,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    GraduationCap,
    Lock,
    Pencil,
    RotateCcw,
    Search,
    Plus,
    SlidersHorizontal,
    Trash2,
    User,
    X,
} from 'lucide-react';
import { RoleSistema } from '@/lib/admin-auth';
import {
    LISTA_STATUS_AULA_R4,
    normalizarStatusAulaR4,
    obterMetaStatusR4,
} from '@/lib/agenda-status-r4';
import { filtrarMateriasVisiveis } from '@/lib/cliente-helpers';
import { adicionarDiasISO, horaParaMinutos, minutosParaHora } from '@/lib/horarios-reforco';
import {
    alturaSlotMapa,
    distribuirSobreposicoes,
    intervaloAula,
    intervaloBloqueio,
    relogioBahia,
    consolidarBloqueiosMapa,
} from './mapa-dia-horarios';
import styles from './MapaDia.module.css';
import ArquivoAgendamentosR4 from './ArquivoAgendamentosR4';
import ModalDetalhesAulaR4 from './ModalDetalhesAulaR4';
import ModalNovoAgendamentoR4 from './ModalNovoAgendamentoR4';
import {
    AgendamentoAdmin,
    AlunoAdmin,
    BloqueioAdmin,
    ProfessorAdmin,
    TemaClasses,
    UnidadeAdmin,
    formatarDataBR,
    obterIniciais,
} from './types';

const HORAS_BLOQUEIO = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTOS_INICIO = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
function obterHojeISO() {
    return relogioBahia().data;
}



function correspondeProfessor(
    item: { professor_id: number | null; professor_grupo_professor?: string | null },
    professor: ProfessorAdmin,
) {
    return item.professor_id === professor.id ||
        Boolean(professor.grupo_professor && item.professor_grupo_professor === professor.grupo_professor);
}

function formatarDiaCurtoPT(dataISO: string): string {
    const [ano, mes, dia] = dataISO.split('-').map(Number);
    if (!ano || !mes || !dia) return dataISO;
    const dt = new Date(ano, mes - 1, dia);
    const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    return `${dias[dt.getDay()]} ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
}

function formatarDataExtensoPT(dataISO: string): string {
    const [ano, mes, dia] = dataISO.split('-').map(Number);
    if (!ano || !mes || !dia) return dataISO;
    const dt = new Date(ano, mes - 1, dia);
    const diasSemana = [
        'Domingo',
        'Segunda-feira',
        'Terça-feira',
        'Quarta-feira',
        'Quinta-feira',
        'Sexta-feira',
        'Sábado',
    ];
    const meses = [
        'Jan.',
        'Fev.',
        'Mar.',
        'Abr.',
        'Mai.',
        'Jun.',
        'Jul.',
        'Ago.',
        'Set.',
        'Out.',
        'Nov.',
        'Dez.',
    ];
    return `${diasSemana[dt.getDay()]}, ${String(dia).padStart(2, '0')} de ${
        meses[dt.getMonth()]
    } de ${ano}`;
}

function duracaoDaAula(aula: AgendamentoAdmin) {
    const intervalo = intervaloAula(aula);
    return intervalo.fim - intervalo.inicio;
}

function formatarIntervaloCard(aula: AgendamentoAdmin): string {
    const ini = aula.hora_inicio || (aula.horario || '').slice(0, 5);
    if (!ini) return '';
    const dur = aula.duracao_minutos || 100;
    const fim = aula.hora_fim || minutosParaHora(horaParaMinutos(ini) + dur);
    return `${ini} – ${fim}`;
}

function normalizarTextoComparacao(valor: string): string {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function formatarMotivoBloqueio(motivo: string): string {
    const limpo = String(motivo || '')
        .replace(/^(?:bloqueio\s*[-•:]\s*)+/i, '')
        .trim();
    return limpo ? `Bloqueio • ${limpo}` : 'Bloqueio';
}

interface OpcaoServicoTransferencia {
    id: string;
    materia: string;
    duracao: number;
    label: string;
}

interface TransferenciaPendente {
    aula: AgendamentoAdmin;
    professorDestino: ProfessorAdmin;
    novaData: string;
    novoHorario: string;
    materiaIncompativel: boolean;
    opcoesServico: OpcaoServicoTransferencia[];
}

interface HoverCardEstado {
    aula: AgendamentoAdmin;
    x: number;
    y: number;
}

export default function AbaMapaDia({
                                       roleUsuario = 'admin',
                                       professorTravadoId = null,
                                       unidades,
                                       professores,
                                       alunos,
                                       agendamentos,
                                       bloqueios,
                                       escuro,
                                       classes,
                                       modoTelaCheia = false,
                                       onAlternarTelaCheiaAction,
                                       onRecarregarDadosAction,
                                       onDatasMapaChange,
                                   }: {
    roleUsuario?: RoleSistema;
    professorTravadoId?: number | null;
    unidades: UnidadeAdmin[];
    professores: ProfessorAdmin[];
    alunos: AlunoAdmin[];
    agendamentos: AgendamentoAdmin[];
    bloqueios: BloqueioAdmin[];
    escuro: boolean;
    classes: TemaClasses;
    modoTelaCheia?: boolean;
    onAlternarTelaCheiaAction?: () => void;
    onDatasMapaChange: (datas: string) => void;
    onRecarregarDadosAction: () => Promise<void>;
}) {
    const textoR4 = useTextoR4();
    const { clsCard, clsSubCard, clsInput, clsTitulo, clsSubtexto } = classes;
    const { cfg } = useOperacaoR4();
    const inicioMapa = cfg.primeiraHora * 60;
    const fimMapa = (cfg.ultimaHora + 1) * 60;
    const [apresentacao, setApresentacao] = useState(false);
    const [somenteComAula, setSomenteComAula] = useState(false);
    const [ocultos, setOcultos] = useState<number[]>([]);
    const [semanaExpandida, setSemanaExpandida] = useState<number | null>(null);
    const [alturaTela, setAlturaTela] = useState(900);
    const mapaRef = useRef<HTMLElement>(null);
    const alturaSlot = alturaSlotMapa(cfg.intervalo, apresentacao ? alturaTela : undefined, fimMapa - inicioMapa);
    const horariosGrade = Array.from({ length: (fimMapa - inicioMapa) / cfg.intervalo }, (_, i) => inicioMapa + i * cfg.intervalo);
    const alturaGrade = horariosGrade.length * alturaSlot;
    const posicao = (minuto: number) => (minuto - inicioMapa) * alturaSlot / cfg.intervalo;
    const podeAgendar = podeOperacao(cfg, roleUsuario, 'agenda');
    const podeVerOutrasAgendas = podeOperacao(cfg, roleUsuario, 'outrasAgendas');
    const ehProfessor = roleUsuario === 'professor';

    const [modoVisualizacao, setModoVisualizacao] = useState<'dia' | 'semana'>('dia');
    const parametros = useSearchParams();
    const todasUnidades = parametros.get('unidade') === 'todas';
    const unidadeId = Number(parametros.get('unidade'));
    const [hojeInicial] = useState(obterHojeISO);
    const dataPedida = parametros.get('data') || '';
    const dataLida = new Date(dataPedida + 'T12:00:00Z');
    const dataGlobal = /^\d{4}-\d{2}-\d{2}$/.test(dataPedida) &&
        Number.isFinite(dataLida.getTime()) && dataLida.toISOString().slice(0, 10) === dataPedida
        ? dataPedida : hojeInicial;
    const [datasPorProfessor, setDatasPorProfessor] = useState<Record<number, string>>({});
    const [busca, setBusca] = useState<string>('');
    const [professorSemanaId, setProfessorSemanaId] = useState(0);
    const [filtroStatus, setFiltroStatus] = useState('todos');

    const [erroBloqueio, setErroBloqueio] = useState('');
    const [erroTransferencia, setErroTransferencia] = useState('');

    const [modalNovoAberto, setModalNovoAberto] = useState<boolean>(false);
    const [modalNovoModo, setModalNovoModo] = useState<'aula' | 'bloqueio'>('aula');
    const [modalProfInicial, setModalProfInicial] = useState<number>(0);
    const [modalDataInicial, setModalDataInicial] = useState<string>(() => obterHojeISO());
    const [modalHoraInicial, setModalHoraInicial] = useState<string>('08:00');
    const [arquivoAberto, setArquivoAberto] = useState(false);
    const [aulaSelecionada, setAulaSelecionada] = useState<AgendamentoAdmin | null>(null);

    // Drag & Drop entre professores/horários
    const [aulaArrastando, setAulaArrastando] = useState<AgendamentoAdmin | null>(null);
    const [alvoDrop, setAlvoDrop] = useState<string | null>(null);
    const [transferenciaPendente, setTransferenciaPendente] =
        useState<TransferenciaPendente | null>(null);
    const [servicoEscolhidoId, setServicoEscolhidoId] = useState<string>('');
    const [salvandoTransferencia, setSalvandoTransferencia] = useState<boolean>(false);

    // Modais de visualização/exclusão e edição de bloqueio (Prints 3 e 4)
    const [bloqueioSelecionado, setBloqueioSelecionado] = useState<{
        bloqueio: BloqueioAdmin;
        professorNome: string;
    } | null>(null);
    const [bloqueioEditando, setBloqueioEditando] = useState<{
        id: number;
        professorNome: string;
        motivo: string;
        descricao: string;
        data: string;
        hora: string;
        minuto: string;
        duracaoHoras: number;
        duracaoMinutos: number;
    } | null>(null);
    const [salvandoBloqueio, setSalvandoBloqueio] = useState<boolean>(false);

    // Hover Card flutuante
    const [hoverCard, setHoverCard] = useState<HoverCardEstado | null>(null);

    const scrollGradeRef = useRef<HTMLDivElement | null>(null);
    const [rolagem, setRolagem] = useState({ anterior: false, proximo: false });
    const unidadesFiltro = unidades.filter((unidade) => unidade.ativa && !unidade.unidade_presencial_id);
    const unidadeBase = unidades.find((unidade) => unidade.id === unidadeId)?.unidade_presencial_id || unidadeId;
    const unidadeIdAtiva = todasUnidades ? 0 : unidadesFiltro.find((unidade) => unidade.id === unidadeBase)?.id || unidadesFiltro[0]?.id || 0;
    const unidadeEndereco = todasUnidades ? 'todas' : unidadeIdAtiva;

    useEffect(() => {
        function voltarNoMapa() { setDatasPorProfessor({}); }
        window.addEventListener('popstate', voltarNoMapa);
        return () => window.removeEventListener('popstate', voltarNoMapa);
    }, []);

    useEffect(() => {
        if (!ehProfessor && !unidadeEndereco) return;
        const endereco = enderecoMapa(dataGlobal, ehProfessor && !podeVerOutrasAgendas ? undefined : unidadeEndereco);
        if (window.location.pathname === '/admin/mapa' &&
            window.location.pathname + window.location.search !== endereco) {
            window.history.replaceState(null, '', endereco);
        }
    }, [dataGlobal, unidadeEndereco, ehProfessor, podeVerOutrasAgendas, parametros]);

    function atualizarEndereco(data: string, unidade: number | 'todas') {
        const endereco = enderecoMapa(data, ehProfessor && !podeVerOutrasAgendas ? undefined : unidade);
        if (endereco !== window.location.pathname + window.location.search) {
            window.history.pushState(null, '', endereco);
        }
    }
    const semana = modoVisualizacao === 'semana';

    useEffect(() => {
        const atualizar = () => setAlturaTela(window.innerHeight);
        const sair = () => {
            if (document.fullscreenElement !== mapaRef.current) setApresentacao(false);
        };
        const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setApresentacao(false); };
        atualizar();
        window.addEventListener('resize', atualizar);
        document.addEventListener('fullscreenchange', sair);
        document.addEventListener('keydown', tecla);
        return () => {
            window.removeEventListener('resize', atualizar);
            document.removeEventListener('fullscreenchange', sair);
            document.removeEventListener('keydown', tecla);
        };
    }, []);

    async function alternarApresentacao() {
        if (apresentacao) {
            setApresentacao(false);
            if (document.fullscreenElement === mapaRef.current) await document.exitFullscreen();
            return;
        }
        setHoverCard(null);
        setApresentacao(true);
        await mapaRef.current?.requestFullscreen?.().catch(() => undefined);
    }

    const professoresVisiveis = useMemo(() => {
        if (ehProfessor && !podeVerOutrasAgendas) {
            const principal = professores.find((p) => p.id === professorTravadoId);
            return principal ? [principal] : [];
        }
        const termo = normalizarTextoComparacao(busca);
        return professores.filter((p) => p.ativo &&
            (unidadeIdAtiva ? (p.unidade_id === unidadeIdAtiva || unidades.some((u) => u.id === p.unidade_id && u.unidade_presencial_id === unidadeIdAtiva)) : unidades.some((u) => u.ativa && u.id === p.unidade_id)) &&
            (!termo || [p.nome, ...filtrarMateriasVisiveis(p.materias)]
                .some((texto) => normalizarTextoComparacao(texto).includes(termo))));
    }, [ehProfessor, podeVerOutrasAgendas, professorTravadoId, professores, unidadeIdAtiva, unidades, busca]);

    const professorSemana = professoresVisiveis.find((p) => p.id === professorSemanaId) ||
        professoresVisiveis[0];

    const faixaDiasSemana = useMemo(() => {
        const diaSemana = new Date(dataGlobal + 'T12:00:00Z').getUTCDay();
        const segunda = adicionarDiasISO(dataGlobal, -((diaSemana + 6) % 7));
        return Array.from({ length: 7 }, (_, idx) => adicionarDiasISO(segunda, idx));
    }, [dataGlobal]);

    const datasConsulta = [...new Set(semana || semanaExpandida !== null ? [...faixaDiasSemana, dataGlobal, ...Object.values(datasPorProfessor)] : [dataGlobal, ...Object.values(datasPorProfessor)])].sort().join(',');
    useEffect(() => { onDatasMapaChange(datasConsulta); }, [datasConsulta, onDatasMapaChange]);

    const colunasCalculadas = useMemo(() => {
        const professoresDoProprioPerfil = ehProfessor && professorSemana
            ? professores.filter((p) => correspondeProfessor({
                professor_id: professorSemana.id,
                professor_grupo_professor: professorSemana.grupo_professor,
            }, p))
            : [];
        const dias = semana
            ? (professorSemana ? faixaDiasSemana.map((data) => ({ prof: professorSemana, data })) : [])
            : professoresVisiveis.flatMap((prof) => prof.id === semanaExpandida
                ? faixaDiasSemana.map((data) => ({ prof, data }))
                : [{ prof, data: datasPorProfessor[prof.id] || dataGlobal }]);

        return dias.map(({ prof, data }) => {
            const perfis = ehProfessor && !podeVerOutrasAgendas ? professoresDoProprioPerfil : [prof];
            const recortarIntervalo = (intervalo: { inicio: number; fim: number }) => {
                const inicio = Math.max(inicioMapa, intervalo.inicio);
                const fim = Math.min(fimMapa, intervalo.fim);
                return fim > inicio ? { inicio, fim } : null;
            };
            const aulas = agendamentos.flatMap((aula) => {
                if (aula.data !== data || !perfis.some((p) => correspondeProfessor(aula, p))) return [];
                if (!ehProfessor) {
                    const unidadeAula = unidades.find((unidade) => unidade.id === aula.unidade_id);
                    const unidadeProfessor = unidades.find((unidade) => unidade.id === prof.unidade_id);
                    if ((unidadeAula?.unidade_presencial_id ?? aula.unidade_id) !==
                        (unidadeIdAtiva || unidadeProfessor?.unidade_presencial_id || prof.unidade_id)) return [];
                    if (aula.professor_id !== prof.id && (
                        !unidadeIdAtiva || (!semana && professoresVisiveis.some((p) => p.id === aula.professor_id))
                    )) return [];
                }
                const intervalo = recortarIntervalo(intervaloAula(aula));
                return intervalo ? [{ ...intervalo, aula }] : [];
            });
            const bloqueiosVisiveis = bloqueios.flatMap((bloqueio) => {
                if (!perfis.some((p) => ehProfessor ? correspondeProfessor(bloqueio, p) :
                    bloqueio.professor_id != null ? bloqueio.professor_id === p.id : correspondeProfessor(bloqueio, p))) return [];
                const original = intervaloBloqueio(bloqueio, data);
                const intervalo = original && recortarIntervalo(original);
                return intervalo ? [{ ...intervalo, bloqueio }] : [];
            });
            return {
                prof,
                data,
                chave: prof.id + '-' + data,
                aulas,
                bloqueiosOriginais: bloqueiosVisiveis,
                bloqueios: distribuirSobreposicoes(consolidarBloqueiosMapa(bloqueiosVisiveis, aulas.filter(({ aula }) => filtroStatus === 'todos' || normalizarStatusAulaR4(aula.status) === filtroStatus))),
                aulasExibidas: distribuirSobreposicoes(aulas.filter(({ aula }) =>
                    filtroStatus === 'todos' || normalizarStatusAulaR4(aula.status) === filtroStatus)),
            };
        });
    }, [agendamentos, bloqueios, unidades, unidadeIdAtiva, dataGlobal, datasPorProfessor, ehProfessor, faixaDiasSemana,
        filtroStatus, professorSemana, professores, professoresVisiveis, semana, semanaExpandida, podeVerOutrasAgendas, inicioMapa, fimMapa]);

    const layout = useLayoutR4();
    const professoresComAula = new Set(colunasCalculadas.filter(({ aulasExibidas }) =>
        aulasExibidas.some(({ aula }) => obterMetaStatusR4(aula.status).ocupaHorario)).map(({ prof }) => prof.id));
    const colunasVisiveis = semana ? colunasCalculadas : colunasCalculadas.filter(({ prof }) =>
        !ocultos.includes(prof.id) && (!somenteComAula || professoresComAula.has(prof.id)));

    const gruposColunas = colunasVisiveis.reduce<{ id: string; dias: typeof colunasVisiveis }[]>((grupos, coluna) => {
        const id = semana ? 'dia_' + new Date(coluna.data + 'T12:00:00Z').getUTCDay() : 'professor_' + coluna.prof.id;
        const anterior = grupos.at(-1);
        if (anterior?.id === id) anterior.dias.push(coluna);
        else grupos.push({ id, dias: [coluna] });
        return grupos;
    }, []).filter(({ id }) => !layout?.layout[id]?.oculto)
        .sort((a, b) => (layout?.layout[a.id]?.order ?? 1000) - (layout?.layout[b.id]?.order ?? 1000));
    const colunas = gruposColunas.flatMap(({ dias }) => dias);
    const temSemanaExpandida = gruposColunas.some(({ dias }) => dias.length > 1);
    const larguraColunas = gruposColunas.map(({ dias }) => dias.length > 1 ? 'repeat(7, 112px)' :
        temSemanaExpandida ? 'minmax(175px, 1fr)' : `minmax(${apresentacao ? 118 : semana ? 150 : 190}px, 1fr)`).join(' ');

    const resumoAulas = new Map(colunasVisiveis.flatMap((coluna) =>
        coluna.aulas.map(({ aula }) => [aula.id, aula] as const)));
    const resumoBloqueios = new Set(colunasVisiveis.flatMap((coluna) =>
        coluna.bloqueios.map(({ bloqueio }) => bloqueio.id)));
    const confirmadas = [...resumoAulas.values()].filter((aula) =>
        normalizarStatusAulaR4(aula.status) === 'confirmado').length;

    useEffect(() => {
        const grade = scrollGradeRef.current;
        if (!grade) return;
        function medir() {
            if (!grade) return;
            setRolagem({
                anterior: grade.scrollLeft > 1,
                proximo: grade.scrollLeft + grade.clientWidth < grade.scrollWidth - 1,
            });
        }
        const observer = new ResizeObserver(medir);
        observer.observe(grade);
        if (grade.firstElementChild) observer.observe(grade.firstElementChild);
        grade.addEventListener('scroll', medir, { passive: true });
        medir();
        return () => {
            observer.disconnect();
            grade.removeEventListener('scroll', medir);
        };
    }, [colunas.length]);

    function obterDataDoProfessor(profId: number): string {
        return datasPorProfessor[profId] || dataGlobal;
    }

    function alterarDataGlobal(novaData: string) {
        if (!novaData) return;
        atualizarEndereco(novaData, unidadeEndereco);
        setDatasPorProfessor({});
    }

    function alterarDataProfessor(profId: number, novaData: string) {
        if (!novaData) return;
        setDatasPorProfessor((prev) => {
            if (novaData === dataGlobal) {
                const copia = { ...prev };
                delete copia[profId];
                return copia;
            }
            return { ...prev, [profId]: novaData };
        });
    }

    const temDatasIndividuais = Object.keys(datasPorProfessor).length > 0;

    function abrirModalCriacao(
        modo: 'aula' | 'bloqueio',
        profId?: number,
        horaSlot?: string,
        dataSlot?: string
    ) {
        const pId = (ehProfessor && modo === 'bloqueio' ? professorTravadoId : profId) || (semana ? professorSemana?.id : professoresVisiveis[0]?.id) || 0;
        setModalNovoModo(modo === 'aula' && !podeAgendar ? 'bloqueio' : modo);
        setModalProfInicial(pId);
        setModalDataInicial(dataSlot || (semana ? dataGlobal : obterDataDoProfessor(pId)));
        setModalHoraInicial(horaSlot || '08:00');
        setModalNovoAberto(true);
    }

    function abrirDetalhesBloqueio(
        bl: BloqueioAdmin,
        professorNome: string
    ) {
        setErroBloqueio('');
        setBloqueioSelecionado({ bloqueio: bl, professorNome });
    }

    function iniciarEdicaoBloqueio() {
        if (!bloqueioSelecionado) return;
        const { bloqueio, professorNome } = bloqueioSelecionado;
        const [hIni, mIni] = (bloqueio.hora_inicio || '08:00').split(':');
        const inicio = horaParaMinutos(bloqueio.hora_inicio);
        const fim = horaParaMinutos(bloqueio.hora_fim);
        const duracaoTotal = Math.max(10, fim - inicio + (fim < inicio ? 1440 : 0));
        const dHoras = Math.floor(duracaoTotal / 60);
        const dMinutos = duracaoTotal % 60;

        setBloqueioSelecionado(null);
        setBloqueioEditando({
            id: bloqueio.id,
            professorNome,
            motivo: bloqueio.motivo || '',
            descricao: bloqueio.descricao || '',
            data: bloqueio.data,
            hora: HORAS_BLOQUEIO.includes(hIni) ? hIni : '08',
            minuto: MINUTOS_INICIO.includes(mIni) ? mIni : '00',
            duracaoHoras: dHoras,
            duracaoMinutos: dMinutos,
        });
    }

    async function excluirBloqueioSelecionado() {
        if (!bloqueioSelecionado) return;
        setErroBloqueio('');
        setSalvandoBloqueio(true);
        try {
            const res = await fetch(
                `/api/admin/bloqueios?id=${bloqueioSelecionado.bloqueio.id}`,
                { method: 'DELETE' }
            );
            if (res.ok) {
                setBloqueioSelecionado(null);
                await onRecarregarDadosAction();
            } else {
                const resposta = await res.json().catch(() => null);
                setErroBloqueio(resposta?.error || 'Não foi possível excluir o bloqueio.');
            }
        } catch {
            setErroBloqueio('Falha na conexão. Tente novamente.');
        } finally {
            setSalvandoBloqueio(false);
        }
    }

    async function salvarEdicaoBloqueio(e: React.FormEvent) {
        e.preventDefault();
        if (!bloqueioEditando) return;
        const totalMinutos =
            bloqueioEditando.duracaoHoras * 60 + bloqueioEditando.duracaoMinutos;
        if (totalMinutos < 10 || totalMinutos > 840) {
            setErroBloqueio('Escolha uma duração entre 10 minutos e 14 horas.');
            return;
        }
        const inicio = horaParaMinutos(`${bloqueioEditando.hora}:${bloqueioEditando.minuto}`);
        if (inicio + totalMinutos > 23 * 60 + 50) {
            setErroBloqueio('O bloqueio editado precisa terminar até 23:50. Para cobrir o dia seguinte, crie outro bloqueio.');
            return;
        }

        setErroBloqueio('');
        setSalvandoBloqueio(true);
        try {
            const res = await fetch('/api/admin/bloqueios', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: bloqueioEditando.id,
                    motivo: bloqueioEditando.motivo,
                    descricao: bloqueioEditando.descricao,
                    data: bloqueioEditando.data,
                    hora_inicio: `${bloqueioEditando.hora}:${bloqueioEditando.minuto}`,
                    duracao_minutos: totalMinutos,
                }),
            });
            if (res.ok) {
                setBloqueioEditando(null);
                await onRecarregarDadosAction();
            } else {
                const resposta = await res.json().catch(() => null);
                setErroBloqueio(resposta?.error || 'Não foi possível atualizar o bloqueio.');
            }
        } catch {
            setErroBloqueio('Falha na conexão. Tente novamente.');
        } finally {
            setSalvandoBloqueio(false);
        }
    }

    function iniciarArrasteAula(e: React.DragEvent, aula: AgendamentoAdmin) {
        if (ehProfessor) return;
        setHoverCard(null);
        setAulaArrastando(aula);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(aula.id));
    }

    function soltarAulaNaCelula(
        e: React.DragEvent,
        profDestino: ProfessorAdmin,
        dataDestino: string,
        horaFaixa: string
    ) {
        e.preventDefault();
        setAlvoDrop(null);
        if (!aulaArrastando || ehProfessor || !podeAgendar) return;

        const horaOriginal = aulaArrastando.hora_inicio || (aulaArrastando.horario || '').slice(0, 5);
        const minutoOriginal = horaParaMinutos(horaOriginal);
        const inicioSlot = horaParaMinutos(horaFaixa);
        const novoHorario = minutoOriginal >= inicioSlot && minutoOriginal < inicioSlot + cfg.intervalo
            ? horaOriginal : horaFaixa;

        const mudouProf = aulaArrastando.professor_id !== profDestino.id;
        const mudouData = aulaArrastando.data !== dataDestino;
        const mudouHora = horaOriginal !== novoHorario;

        if (!mudouProf && !mudouData && !mudouHora) {
            setAulaArrastando(null);
            return;
        }

        const materiasDestino = materiasBase(filtrarMateriasVisiveis(profDestino.materias));
        const materiaAtualNorm = normalizarTextoComparacao(materiaBase(aulaArrastando.materia));
        const profTemMateria =
            materiasDestino.length === 0 ||
            materiasDestino.some((m) => normalizarTextoComparacao(m) === materiaAtualNorm);

        const opcoesServico: OpcaoServicoTransferencia[] = [];
        if (!profTemMateria) {
            for (const mat of materiasDestino) {
                opcoesServico.push({
                    id: `${mat}-100`,
                    materia: mat,
                    duracao: 100,
                    label: `${mat} 100'`,
                });
            }
            for (const mat of materiasDestino) {
                opcoesServico.push({
                    id: `${mat}-50`,
                    materia: mat,
                    duracao: 50,
                    label: `${mat} 50'`,
                });
            }
        }

        setServicoEscolhidoId('');
        setErroTransferencia('');
        setTransferenciaPendente({
            aula: aulaArrastando,
            professorDestino: profDestino,
            novaData: dataDestino,
            novoHorario,
            materiaIncompativel: !profTemMateria,
            opcoesServico,
        });
        setAulaArrastando(null);
    }

    function unidadeDaTransferencia(aula: AgendamentoAdmin, destino: ProfessorAdmin) {
        const origem = unidades.find((unidade) => unidade.id === aula.unidade_id);
        const unidadeDestino = unidades.find((unidade) => unidade.id === destino.unidade_id);
        if (!origem?.unidade_presencial_id || unidadeDestino?.unidade_presencial_id) return unidadeDestino;
        return unidades.find((unidade) => unidade.ativa && unidade.unidade_presencial_id === destino.unidade_id);
    }

    async function confirmarTransferencia() {
        if (!transferenciaPendente) return;

        let novaMateria: string | undefined;
        let novaDuracao: number | undefined;

        if (transferenciaPendente.materiaIncompativel) {
            const escolhida = transferenciaPendente.opcoesServico.find(
                (op) => op.id === servicoEscolhidoId
            );
            if (!escolhida) return;
            novaMateria = escolhida.materia;
            novaDuracao = escolhida.duracao;
        }

        setErroTransferencia('');
        setSalvandoTransferencia(true);
        try {
            const { aula, professorDestino, novaData, novoHorario } = transferenciaPendente;
            const unidadeDestino = unidadeDaTransferencia(aula, professorDestino);
            if (!unidadeDestino) {
                setErroTransferencia('A unidade de destino não tem sala online ativa para esta aula.');
                return;
            }
            const res = await fetch('/api/admin/agendamentos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: aula.id,
                    professor_id: professorDestino.id,
                    unidade_id: unidadeDestino.id,
                    data: novaData,
                    hora_inicio: novoHorario,
                    ...(novaMateria ? { materia: novaMateria } : {}),
                    ...(novaDuracao ? { duracao_minutos: novaDuracao } : {}),
                }),
            });
            if (res.ok) {
                setTransferenciaPendente(null);
                setServicoEscolhidoId('');
                await onRecarregarDadosAction();
            } else {
                const resposta = await res.json().catch(() => null);
                setErroTransferencia(resposta?.error || 'Não foi possível transferir a aula.');
            }
        } catch {
            setErroTransferencia('Falha na conexão. Tente novamente.');
        } finally {
            setSalvandoTransferencia(false);
        }
    }

    function abrirHoverCard(e: React.MouseEvent<HTMLButtonElement>, aula: AgendamentoAdmin) {
        if (aulaArrastando) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const cardWidth = 300;
        const cardHeight = 195;

        let x = rect.right + 10;
        if (x + cardWidth > window.innerWidth - 16) {
            x = Math.max(16, rect.left - cardWidth - 10);
        }

        let y = rect.top - 8;
        if (y + cardHeight > window.innerHeight - 16) {
            y = Math.max(16, window.innerHeight - cardHeight - 16);
        }

        setHoverCard({ aula, x, y });
    }

    const duracaoTotalEdicaoBloqueio = bloqueioEditando
        ? bloqueioEditando.duracaoHoras * 60 + bloqueioEditando.duracaoMinutos
        : 0;

    function moverGrade(direcao: number) {
        const grade = scrollGradeRef.current;
        if (grade) grade.scrollBy({ left: direcao * grade.clientWidth * 0.75, behavior: 'smooth' });
    }

    function alterarPeriodo(direcao: number) {
        alterarDataGlobal(adicionarDiasISO(dataGlobal, direcao * (semana ? 7 : 1)));
    }

    const primeiroDia = faixaDiasSemana[0];
    const ultimoDia = faixaDiasSemana[6];

    return (
        <section ref={mapaRef} data-apresentacao={apresentacao} className={styles.mapa} data-tema={escuro ? 'escuro' : 'claro'}>
            <div className={styles.painel} {...layout?.item("mapa_filtros", "mapa_blocos", "Filtros do mapa")} hidden={apresentacao}>
                <div className={styles.topo}>
                    <div className={styles.controles}>
                        <div className={styles.segmentado} role="group" aria-label={textoR4("Visualização")}>
                            <button type="button" aria-pressed={!semana} onClick={() => setModoVisualizacao('dia')}>{textoR4("Dia")}</button>
                            <button type="button" aria-pressed={semana} onClick={() => setModoVisualizacao('semana')}>{textoR4("Semana")}</button>
                        </div>
                        <div className={styles.periodo}>
                            <button type="button" aria-label={semana ? textoR4("Semana anterior") : textoR4("Dia anterior")} onClick={() => alterarPeriodo(-1)}>
                                <ChevronLeft />
                            </button>
                            <label className={styles.data}>
                                <Calendar />
                                {semana ? `${formatarDataBR(primeiroDia).slice(0, 5)} – ${formatarDataBR(ultimoDia)}` : formatarDataBR(dataGlobal)}
                                <input type="date" aria-label={textoR4("Escolher data")} value={dataGlobal} onChange={(e) => alterarDataGlobal(e.target.value)} />
                            </label>
                            <button type="button" aria-label={semana ? textoR4("Próxima semana") : textoR4("Próximo dia")} onClick={() => alterarPeriodo(1)}>
                                <ChevronRight />
                            </button>
                        </div>
                        <button type="button" className={styles.botao} onClick={() => alterarDataGlobal(obterHojeISO())}>{textoR4("Hoje")}</button>
                    </div>
                    <div className={styles.controles}>
                        {!ehProfessor && <>
                            <Link className={styles.botao} href={enderecoMapa(dataGlobal, unidadeEndereco)}
                                target="_blank" rel="noopener">{textoR4("Abrir em nova aba")}</Link>
                            <button type="button" className={styles.botao} onClick={() => setArquivoAberto(true)}>{textoR4("Aulas excluídas")}</button>
                            <button type="button" className={styles.botao} disabled={!colunas.length} onClick={() => abrirModalCriacao('bloqueio')}>
                                <Ban />{' ' + textoR4("Bloquear")}</button>
                        </>}
                        <button type="button" className={styles.primario} disabled={!colunas.length || (!ehProfessor && !podeAgendar)}
                            onClick={() => abrirModalCriacao(ehProfessor && !podeAgendar ? 'bloqueio' : 'aula')}>
                            {ehProfessor && !podeAgendar ? <Ban /> : <CalendarPlus />}
                            {ehProfessor && !podeAgendar ? textoR4("Bloquear horário") : textoR4("Agendar aula")}
                        </button>
                    </div>
                </div>
                <div className={styles.filtros}>
                    <div className={styles.dias} role="group" aria-label={textoR4("Dias da semana")}>
                        {faixaDiasSemana.map((data) => (
                            <button type="button" key={data} aria-pressed={data === dataGlobal}
                                aria-label={formatarDataExtensoPT(data)} onClick={() => alterarDataGlobal(data)}>
                                <small>{formatarDiaCurtoPT(data).split(' ')[0]}</small>{data.slice(-2)}
                            </button>
                        ))}
                    </div>
                    <div className={styles.controles}>
                        {(!ehProfessor || podeVerOutrasAgendas) && (
                            <>
                                <select aria-label={textoR4("Unidade")} value={unidadeEndereco || 'todas'} onChange={(e) => {
                                    setDatasPorProfessor({});
                                    atualizarEndereco(dataGlobal, e.target.value === 'todas' ? 'todas' : Number(e.target.value));
                                }}>
                                    <option value="todas">{textoR4("Todas as unidades")}</option>
                                    {unidadesFiltro.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                                </select>
                                <label className={styles.busca}>
                                    <Search />
                                    <input type="search" aria-label={textoR4("Buscar professor ou matéria")} placeholder={textoR4("Professor ou matéria")} value={busca} onChange={(e) => setBusca(e.target.value)} />
                                </label>
                            </>
                        )}
                        {semana && (!ehProfessor || podeVerOutrasAgendas) && professoresVisiveis.length > 0 && (
                            <select aria-label={textoR4("Professor da semana")} value={professorSemana?.id ?? ''}
                                onChange={(e) => setProfessorSemanaId(Number(e.target.value))}>
                                {professoresVisiveis.map((p) => <option key={p.id} value={p.id}>{p.nome}{todasUnidades && p.unidade_nome ? ' · ' + p.unidade_nome : ''}</option>)}
                            </select>
                        )}
                        <label className={styles.seletorStatus}>
                            <SlidersHorizontal />
                            <select aria-label={textoR4("Filtrar por status da aula")} value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                                <option value="todos">{textoR4("Todos os status")}</option>
                                {LISTA_STATUS_AULA_R4.map((status) => <option key={status.valor} value={status.valor}>{textoR4(status.rotulo)}</option>)}
                            </select>
                        </label>
                        {!semana && temDatasIndividuais && (
                            <button type="button" className={styles.botao} onClick={() => setDatasPorProfessor({})}>
                                <RotateCcw />{' ' + textoR4("Sincronizar datas")}</button>
                        )}
                    </div>
                </div>
            </div>

            <div className={styles.agenda} {...layout?.item("mapa_grade", "mapa_blocos", "Grade de horários")}>
                <div className={styles.barraGrade}>
                    <div>
                        <h2>{semana ? textoR4("Visão semanal") : textoR4("Agenda por professor")}</h2>
                        <p>{semana ? professorSemana?.nome || 'Nenhum professor' : formatarDataExtensoPT(dataGlobal)}</p>
                    </div>
                    <div className={styles.resumo} aria-label={textoR4("Resumo da agenda")}>
                        <span><Calendar /> <b>{resumoAulas.size}</b> {resumoAulas.size === 1 ? textoR4("aula") : textoR4("aulas")}</span>
                        <span data-cor="verde"><CheckCircle2 /> <b>{confirmadas}</b> {confirmadas === 1 ? textoR4("confirmada") : textoR4("confirmadas")}</span>
                        <span data-cor="coral"><Ban /> <b>{resumoBloqueios.size}</b> {resumoBloqueios.size === 1 ? textoR4("bloqueio") : textoR4("bloqueios")}</span>
                    </div>
                    <div className={styles.controles}>
                        {!semana && <label className={styles.botao}>
                            <input type="checkbox" checked={somenteComAula} onChange={(e) => setSomenteComAula(e.target.checked)} /> Só professores com aula
                        </label>}
                        {!semana && ocultos.length > 0 && <button type="button" className={styles.botao}
                            onClick={() => setOcultos([])}>+ Mostrar professores ocultos ({ocultos.length})</button>}
                        <button type="button" className={styles.botao} onClick={() => void alternarApresentacao()}>
                            {apresentacao ? 'Sair da tela cheia' : 'Tela cheia'}
                        </button>
                        {onAlternarTelaCheiaAction && (
                            <button type="button" className={styles.botao} onClick={onAlternarTelaCheiaAction}>
                                {modoTelaCheia ? textoR4("Reduzir") : textoR4("Expandir")}
                            </button>
                        )}
                        <div className={styles.periodo} role="group" aria-label={textoR4("Navegação horizontal na grade")}>
                            <button type="button" aria-label={textoR4("Rolar grade para esquerda")} disabled={!rolagem.anterior} onClick={() => moverGrade(-1)}><ChevronLeft /></button>
                            <button type="button" aria-label={textoR4("Rolar grade para direita")} disabled={!rolagem.proximo} onClick={() => moverGrade(1)}><ChevronRight /></button>
                        </div>
                    </div>
                </div>
                {colunas.length === 0 ? (
                    <p className={styles.vazio}>{textoR4("Nenhum professor encontrado com os filtros atuais.")}</p>
                ) : (
                    <div ref={scrollGradeRef} onScroll={() => { if (hoverCard) setHoverCard(null); }}
                        className={styles.scroll} data-expandido={modoTelaCheia} data-arrastando={Boolean(aulaArrastando)}
                        tabIndex={0} aria-label={textoR4("Grade de horários")}>
                        <div className={styles.grade} style={{
                            gridTemplateColumns: `58px ${larguraColunas}`,
                        }}>
                            <div className={`${styles.cabecalho} ${styles.canto}`}>{textoR4("Horário")}</div>
                            {gruposColunas.map(({ id, dias }) => {
                                const [{ prof, data }] = dias;
                                const expandida = dias.length > 1;
                                const props = layout?.item(id, 'mapa_colunas', semana ? formatarDiaCurtoPT(data) : prof.nome);
                                return <div className={styles.cabecalho} key={id} {...props}
                                    style={{ ...props?.style, order: undefined, gridColumn: `span ${dias.length}` }}>
                                    {semana ? (
                                        <div className={styles.professor}>
                                            <span className={styles.avatar}><Calendar /></span>
                                            <div><strong>{formatarDiaCurtoPT(data)}</strong>{data === obterHojeISO() && <small>{textoR4("Hoje")}</small>}</div>
                                        </div>
                                    ) : (
                                        <>
                                            <button type="button" className={styles.ocultarProfessor} aria-label={`Ocultar ${prof.nome}`}
                                                title="Ocultar professor da grade" onClick={() => {
                                                    setOcultos((atuais) => [...atuais, prof.id]);
                                                    if (expandida) setSemanaExpandida(null);
                                                }}><X /></button>
                                            <div className={styles.professor}>
                                                <span className={styles.avatar}>{obterIniciais(prof.nome)}</span>
                                                <div>
                                                    <strong title={prof.nome}>{prof.nome}</strong>
                                                    {prof.unidade_nome && <small className={styles.unidadeProfessor}>{prof.unidade_nome}</small>}
                                                    <small title={filtrarMateriasVisiveis(prof.materias).join(' · ')}>
                                                        {filtrarMateriasVisiveis(prof.materias).join(' · ') || '—'}
                                                    </small>
                                                </div>
                                            </div>
                                            {expandida ? (
                                                <>
                                                    <button type="button" className={styles.recolherSemana} onClick={() => setSemanaExpandida(null)}
                                                        aria-label={`Recolher semana de ${prof.nome}`} title="Recolher semana"><ChevronLeft /></button>
                                                    <div className={styles.diasProfessor}>
                                                        {dias.map((dia) => <span key={dia.chave} data-atual={dia.data === dataGlobal}>
                                                            {formatarDiaCurtoPT(dia.data)}
                                                        </span>)}
                                                    </div>
                                                </>
                                            ) : <div className={styles.dataProfessor} data-individual={data !== dataGlobal}>
                                                <button type="button" aria-label={`Semana de ${prof.nome}`} title="Expandir ou recolher semana"
                                                    aria-pressed={semanaExpandida === prof.id}
                                                    onClick={() => setSemanaExpandida((atual) => atual === prof.id ? null : prof.id)}><Calendar /></button>
                                                <button type="button" aria-label={`Dia anterior para ${prof.nome}`}
                                                    onClick={() => alterarDataProfessor(prof.id, adicionarDiasISO(data, -1))}><ChevronLeft /></button>
                                                <label className={styles.data}>
                                                    {formatarDiaCurtoPT(data)}
                                                    <input type="date" aria-label={`Data de ${prof.nome}`} value={data}
                                                        onChange={(e) => alterarDataProfessor(prof.id, e.target.value)} />
                                                </label>
                                                <button type="button" aria-label={`Próximo dia para ${prof.nome}`}
                                                    onClick={() => alterarDataProfessor(prof.id, adicionarDiasISO(data, 1))}><ChevronRight /></button>
                                            </div>}
                                        </>
                                    )}
                                </div>;
                            })}
                            <div className={styles.horas} style={{ height: alturaGrade }}>
                                {horariosGrade.map((minuto) => (
                                    <div key={minuto} className={styles.hora} style={{ height: alturaSlot }}>
                                        <b>{minutosParaHora(minuto)}</b>
                                    </div>
                                ))}
                                
                            </div>
                            {colunas.map(({ chave, prof, data, aulas, bloqueios, bloqueiosOriginais, aulasExibidas }) => (
                                <div className={styles.coluna} key={chave} style={{ height: alturaGrade }}>
                                    {horariosGrade.map((minuto) => {
                                        const hora = minutosParaHora(minuto);
                                        const chaveSlot = chave + '-' + hora;
                                        const ocupado = bloqueiosOriginais.some((b) => minuto < b.fim && minuto + cfg.intervalo > b.inicio) ||
                                            aulas.some(({ aula, inicio, fim }) =>
                                                obterMetaStatusR4(aula.status).ocupaHorario && minuto < fim && minuto + cfg.intervalo > inicio);
                                        return (
                                            <div key={hora} className={styles.slot} data-cheio={ocupado}
                                                data-drop={alvoDrop === chaveSlot} style={{ height: alturaSlot }}
                                                onDragOver={(e) => {
                                                    if (!aulaArrastando || ehProfessor || !podeAgendar) return;
                                                    e.preventDefault();
                                                    setAlvoDrop(chaveSlot);
                                                }}
                                                onDragLeave={(e) => {
                                                    if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget))
                                                        setAlvoDrop((atual) => atual === chaveSlot ? null : atual);
                                                }}
                                                onDrop={(e) => soltarAulaNaCelula(e, prof, data, hora)}>
                                                {!ocupado && (podeAgendar || ehProfessor) && (
                                                    <button type="button"
                                                        aria-label={`${ehProfessor ? 'Bloquear' : 'Agendar'} ${hora}, ${prof.nome}, ${formatarDiaCurtoPT(data)}`}
                                                        onClick={() => abrirModalCriacao(ehProfessor && !podeAgendar ? 'bloqueio' : 'aula', prof.id, hora, data)}>
                                                        <Plus /><span>{hora}</span>
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {bloqueios.map(({ bloqueio, inicio, fim, faixa, totalFaixas }) => (
                                        <button type="button" key={bloqueio.id + '-' + inicio} className={styles.bloqueio} disabled={bloqueio.origem !== 'manual'}
                                            style={{ top: posicao(inicio), height: posicao(fim) - posicao(inicio),
                                                left: `${faixa / totalFaixas * 100}%`, width: `${100 / totalFaixas}%` }}
                                            title={`${bloqueio.origem === 'manual' ? formatarMotivoBloqueio(bloqueio.motivo) : 'Bloqueio de agenda'} · ${minutosParaHora(inicio)}–${minutosParaHora(fim)}`}
                                            onClick={() => abrirDetalhesBloqueio(bloqueio, prof.nome)}>
                                            <span><Ban />{minutosParaHora(inicio)}–{minutosParaHora(fim)}</span>
                                            <strong>{bloqueio.origem === 'manual' ? formatarMotivoBloqueio(bloqueio.motivo) : 'Bloqueio de agenda'}</strong>
                                        </button>
                                    ))}
                                    {aulasExibidas.map(({ aula, inicio, fim, faixa, totalFaixas }) => {
                                        const meta = obterMetaStatusR4(aula.status);
                                        return (
                                            <button type="button" key={aula.id} className={styles.aula}
                                                title={`${aula.nome_aluno} · ${aula.materia} · ${formatarIntervaloCard(aula)} · ${aula.unidade_nome || ""} · ${meta.rotulo}`}
                                                data-compacta={semana || prof.id === semanaExpandida} data-curta={fim - inicio < 45}
                                                data-status={meta.valor} data-dividida={totalFaixas > 1} data-arrastando={aulaArrastando?.id === aula.id}
                                                aria-label={`${aula.nome_aluno}, ${aula.materia}, ${formatarIntervaloCard(aula)}, ${textoR4(meta.rotulo)}`}
                                                style={{ top: posicao(inicio), height: posicao(fim) - posicao(inicio),
                                                    ...(cfg.status[meta.valor]?.cor || !['agendado', 'confirmado', 'realizado', 'desmarcado_com_cobranca', 'desmarcado_sem_cobranca', 'cancelado'].includes(meta.valor)
                                                        ? { '--event': cfg.status[meta.valor]?.cor || CORES_STATUS_R4[meta.valor] } : {}),
                                                    left: `${faixa / totalFaixas * 100}%`, width: `${100 / totalFaixas}%` }}
                                                draggable={!ehProfessor && podeAgendar && meta.ocupaHorario}
                                                onDragStart={(e) => iniciarArrasteAula(e, aula)}
                                                onDragEnd={() => { setAulaArrastando(null); setAlvoDrop(null); }}
                                                onMouseEnter={(e) => { if (!apresentacao) abrirHoverCard(e, aula); }}
                                                onMouseLeave={() => setHoverCard(null)}
                                                onClick={() => { setHoverCard(null); setAulaSelecionada(aula); }}>
                                                <span className={styles.aulaHora}>
                                                    {meta.valor === 'confirmado' ? <Check /> : <i />}
                                                    {formatarIntervaloCard(aula)}
                                                </span>
                                                <strong>{aula.nome_aluno}</strong>
                                                <small>{rotuloMateriaAula(aula.materia, duracaoDaAula(aula))}</small>
                                                <small>{[aula.unidade_nome, meta.rotulo].filter(Boolean).join(' · ')}</small>
                                            </button>
                                        );
                                    })}
                                    
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div className={styles.legenda}>
                    {LISTA_STATUS_AULA_R4.map((status) => (
                        <span key={status.valor} data-status={status.valor}
                            style={{ '--event': cfg.status[status.valor]?.cor || (LISTA_STATUS_AULA_R4.slice(0, 6).some((item) => item.valor === status.valor) ? undefined : CORES_STATUS_R4[status.valor]) } as React.CSSProperties}><i />{textoR4(status.rotulo)}</span>
                    ))}
                    <span data-status="bloqueio"><i />{textoR4("Bloqueio")}</span>
                </div>
            </div>

            {/* Hover Card Flutuante ao Passar o Mouse na Aula */}
            {hoverCard && (
                <div
                    style={{ left: `${hoverCard.x}px`, top: `${hoverCard.y}px` }}
                    className={`fixed z-50 w-[300px] pointer-events-none border rounded-2xl p-4 shadow-2xl space-y-2.5 transition-opacity ${
                        escuro
                            ? 'bg-[#151B23] border-[#2D3846] text-stone-100'
                            : 'bg-white border-slate-200 text-slate-900'
                    }`}
                >
                    <div>
                        <p className="text-xs font-bold text-[#0E7C86] dark:text-[#25A4AF]">
                            {formatarDataExtensoPT(hoverCard.aula.data)}
                        </p>
                        <p className={`text-sm font-extrabold font-mono ${clsTitulo}`}>
                            {formatarIntervaloCard(hoverCard.aula)}
                        </p>
                    </div>

                    <div className="flex items-start gap-2">
                        <User className="w-4 h-4 text-[#0E7C86] shrink-0 mt-0.5" />
                        <div className="min-w-0">
                            <p className={`text-xs font-bold leading-snug ${clsTitulo}`}>
                                {hoverCard.aula.nome_aluno}
                                {hoverCard.aula.serie_aluno
                                    ? ` - ${hoverCard.aula.serie_aluno}`
                                    : ''}
                                {hoverCard.aula.colegio_aluno
                                    ? ` - ${hoverCard.aula.colegio_aluno}`
                                    : ''}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 font-semibold">
                            <GraduationCap className="w-3.5 h-3.5 text-[#0E7C86]" />
                            {rotuloMateriaAula(hoverCard.aula.materia, duracaoDaAula(hoverCard.aula))}
                        </span>
                        <span className="inline-flex items-center gap-1 font-bold uppercase text-[11px]">
                            <Building2 className="w-3.5 h-3.5 text-[#0E7C86]" />
                            {hoverCard.aula.unidade_nome}
                        </span>
                    </div>

                    {hoverCard.aula.observacoes && (
                        <p
                            className={`text-[11px] line-clamp-2 rounded-lg px-2.5 py-1.5 ${
                                escuro
                                    ? 'bg-[#0E1319] text-stone-300'
                                    : 'bg-slate-100 text-slate-700'
                            }`}
                        >
                            {hoverCard.aula.observacoes}
                        </p>
                    )}

                    <div className="pt-0.5">
                        {(() => {
                            const meta = obterMetaStatusR4(hoverCard.aula.status);
                            return (
                                <span
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${meta.clsBadge}`}
                                >
                                    <span className={`w-2 h-2 rounded-full ${meta.corPonto}`} />
                                    {textoR4(meta.rotulo)}
                                </span>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Modal de Transferência / Selecione o serviço (Print 2) */}
            {transferenciaPendente && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div
                        className={`border rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl ${clsCard}`}
                    >
                        {erroTransferencia && <p role="alert" className={styles.erro}>{erroTransferencia}</p>}
                        {transferenciaPendente.materiaIncompativel ? (
                            <>
                                <h3 className={`text-xl font-extrabold ${clsTitulo}`}>{textoR4("Selecione o serviço")}</h3>

                                <p className={`text-sm leading-relaxed ${clsSubtexto}`}>{textoR4("Transferir para")}{' '}
                                    <strong className={clsTitulo}>
                                        {transferenciaPendente.professorDestino.nome}
                                    </strong>{' '}{textoR4("em")}{' '}
                                    <strong className={clsTitulo}>
                                        {formatarDiaCurtoPT(transferenciaPendente.novaData)}
                                    </strong>{' '}{textoR4("às")}{' '}
                                    <strong className={clsTitulo}>
                                        {transferenciaPendente.novoHorario}
                                    </strong>
                                </p>

                                <p className="text-xs font-medium text-[#D97706] dark:text-amber-400 leading-relaxed">{textoR4("O serviço atual não está disponível para este profissional. Selecione um dos serviços abaixo para continuar.")}</p>

                                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                                    {transferenciaPendente.opcoesServico.map((opcao) => {
                                        const selecionada = servicoEscolhidoId === opcao.id;
                                        return (
                                            <button
                                                key={opcao.id}
                                                type="button"
                                                onClick={() => setServicoEscolhidoId(opcao.id)}
                                                className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition cursor-pointer ${
                                                    selecionada
                                                        ? 'border-[#0E7C86] bg-[#0E7C86]/10 text-[#0E7C86] dark:text-[#5EEAD4] font-bold ring-1 ring-[#0E7C86]'
                                                        : escuro
                                                            ? 'border-[#26303D] bg-[#11161D] text-stone-200 hover:border-[#0E7C86]/60'
                                                            : 'border-slate-200 bg-white text-slate-800 hover:border-[#0E7C86]/60'
                                                }`}
                                            >
                                                {opcao.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <button
                                        type="button"
                                        disabled={salvandoTransferencia || !servicoEscolhidoId}
                                        onClick={() => void confirmarTransferencia()}
                                        className={`py-2.5 px-4 rounded-xl text-white text-sm font-bold transition ${
                                            !servicoEscolhidoId
                                                ? 'bg-slate-400/70 cursor-not-allowed'
                                                : 'bg-[#0E7C86] hover:bg-[#118E99] cursor-pointer shadow-sm'
                                        }`}
                                    >
                                        {salvandoTransferencia ? textoR4("Transferindo...") : textoR4("Confirmar")}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={salvandoTransferencia}
                                        onClick={() => {
                                            setTransferenciaPendente(null);
                                            setServicoEscolhidoId('');
                                        }}
                                        className={`py-2.5 px-4 rounded-xl border text-sm font-bold transition cursor-pointer ${clsSubCard} ${clsTitulo}`}
                                    >{textoR4("Cancelar")}</button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex items-center gap-2.5">
                                    <span className="w-9 h-9 rounded-xl bg-[#0E7C86]/15 text-[#0E7C86] flex items-center justify-center">
                                        <ArrowRightLeft className="w-4 h-4" />
                                    </span>
                                    <h3 className={`text-lg font-bold ${clsTitulo}`}>{textoR4("Confirmar transferência")}</h3>
                                </div>

                                <p className={`text-sm leading-relaxed ${clsSubtexto}`}>{textoR4("Transferir a aula de")}{' '}
                                    <strong className={clsTitulo}>
                                        {transferenciaPendente.aula.nome_aluno}
                                    </strong>{' '}{textoR4("para")}{' '}
                                    <strong className={clsTitulo}>
                                        {transferenciaPendente.professorDestino.nome}
                                    </strong>{' '}{textoR4("em")}{' '}
                                    <strong className={clsTitulo}>
                                        {formatarDiaCurtoPT(transferenciaPendente.novaData)}
                                    </strong>{' '}{textoR4("às")}{' '}
                                    <strong className={clsTitulo}>
                                        {transferenciaPendente.novoHorario}
                                    </strong>{' · '}
                                    {unidadeDaTransferencia(transferenciaPendente.aula, transferenciaPendente.professorDestino)?.nome || 'Sala online indisponível'}?
                                </p>

                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <button
                                        type="button"
                                        disabled={salvandoTransferencia}
                                        onClick={() => void confirmarTransferencia()}
                                        className="py-2.5 px-4 rounded-xl r4-acao  text-sm font-bold transition cursor-pointer shadow-sm"
                                    >
                                        {salvandoTransferencia ? textoR4("Transferindo...") : textoR4("Confirmar")}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={salvandoTransferencia}
                                        onClick={() => setTransferenciaPendente(null)}
                                        className={`py-2.5 px-4 rounded-xl border text-sm font-bold transition cursor-pointer ${clsSubCard} ${clsTitulo}`}
                                    >{textoR4("Cancelar")}</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Modal de Visualização de Bloqueio (Print 3: Excluir / Editar bloqueio) */}
            {bloqueioSelecionado && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div
                        className={`border rounded-2xl max-w-md w-full p-5 space-y-5 shadow-2xl ${clsCard}`}
                    >
                        {erroBloqueio && <p role="alert" className={styles.erro}>{erroBloqueio}</p>}
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3.5">
                                <div
                                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                                        escuro
                                            ? 'bg-[#1D2530] text-stone-300'
                                            : 'bg-slate-100 text-slate-600'
                                    }`}
                                >
                                    <Lock className="w-6 h-6" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className={`text-lg font-extrabold ${clsTitulo}`}>{textoR4("Bloqueio")}</h3>
                                    <p className="text-xs font-bold text-[#0E7C86] truncate">
                                        {bloqueioSelecionado.bloqueio.motivo}
                                    </p>
                                    <p className={`text-[11px] mt-0.5 ${clsSubtexto}`}>
                                        {bloqueioSelecionado.professorNome} •{' '}
                                        {formatarDataBR(bloqueioSelecionado.bloqueio.data)} (
                                        {bloqueioSelecionado.bloqueio.hora_inicio} –{' '}
                                        {bloqueioSelecionado.bloqueio.hora_fim})
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setBloqueioSelecionado(null)}
                                className={`p-1.5 rounded-lg cursor-pointer ${clsSubtexto}`}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {bloqueioSelecionado.bloqueio.descricao && (
                            <p
                                className={`text-xs rounded-xl px-3 py-2 border ${
                                    escuro
                                        ? 'bg-[#11161D] border-[#26303D] text-stone-300'
                                        : 'bg-slate-50 border-slate-200 text-slate-600'
                                }`}
                            >
                                {bloqueioSelecionado.bloqueio.descricao}
                            </p>
                        )}

                        <div
                            className={`pt-4 border-t grid grid-cols-2 gap-3 ${
                                escuro ? 'border-[#232B35]' : 'border-slate-100'
                            }`}
                        >
                            <button
                                type="button"
                                disabled={salvandoBloqueio}
                                onClick={() => void excluirBloqueioSelecionado()}
                                className={`py-2.5 px-4 rounded-xl border text-sm font-bold inline-flex items-center justify-center gap-2 transition cursor-pointer ${
                                    escuro
                                        ? 'border-[#26303D] bg-[#11161D] text-rose-400 hover:bg-rose-500/15'
                                        : 'border-slate-200 bg-white text-slate-600 hover:text-rose-600 hover:border-rose-300'
                                }`}
                            >
                                <Trash2 className="w-4 h-4" />
                                {salvandoBloqueio ? textoR4("Excluindo...") : textoR4("Excluir")}
                            </button>

                            <button
                                type="button"
                                disabled={salvandoBloqueio}
                                onClick={iniciarEdicaoBloqueio}
                                className={`py-2.5 px-4 rounded-xl border text-sm font-bold inline-flex items-center justify-center gap-2 transition cursor-pointer ${
                                    escuro
                                        ? 'border-[#26303D] bg-[#11161D] text-stone-100 hover:border-[#0E7C86]'
                                        : 'border-slate-200 bg-white text-slate-800 hover:border-[#0E7C86] hover:text-[#0E7C86]'
                                }`}
                            >
                                <Pencil className="w-4 h-4" />{textoR4("Editar bloqueio")}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Edição de Bloqueio (Print 4: SALVAR BLOQUEIO) */}
            {bloqueioEditando && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <form
                        onSubmit={(e) => void salvarEdicaoBloqueio(e)}
                        className={`border rounded-2xl max-w-md w-full p-5 space-y-3.5 shadow-2xl ${clsCard}`}
                    >
                        {erroBloqueio && <p role="alert" className={styles.erro}>{erroBloqueio}</p>}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CalendarX className="w-5 h-5 text-[#0E7C86]" />
                                <h3 className={`text-base font-extrabold ${clsTitulo}`}>{textoR4("Editar bloqueio")}</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setBloqueioEditando(null)}
                                className={`p-1 rounded-lg cursor-pointer ${clsSubtexto}`}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Professor */}
                        <div
                            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs font-bold ${
                                escuro
                                    ? 'bg-[#11161D] border-[#26303D] text-stone-200'
                                    : 'bg-slate-50 border-slate-200 text-slate-800'
                            }`}
                        >
                            <User className="w-4 h-4 text-[#0E7C86] shrink-0" />
                            <span>{bloqueioEditando.professorNome}</span>
                        </div>

                        {/* Título do bloqueio */}
                        <div
                            className={`flex items-stretch rounded-xl border overflow-hidden ${
                                escuro
                                    ? 'bg-[#11161D] border-[#26303D]'
                                    : 'bg-white border-slate-200'
                            }`}
                        >
                            <span
                                className={`px-3 flex items-center justify-center border-r ${
                                    escuro
                                        ? 'bg-amber-500/15 border-[#26303D] text-amber-400'
                                        : 'bg-orange-50 border-slate-200 text-orange-500'
                                }`}
                            >
                                <Ban className="w-4 h-4" />
                            </span>
                            <input
                                type="text"
                                required
                                value={bloqueioEditando.motivo}
                                onChange={(e) =>
                                    setBloqueioEditando({
                                        ...bloqueioEditando,
                                        motivo: e.target.value,
                                    })
                                }
                                placeholder={textoR4("Título do bloqueio")}
                                className={`w-full px-3 py-2.5 text-xs font-semibold focus:outline-none ${
                                    escuro
                                        ? 'bg-transparent text-stone-100'
                                        : 'bg-transparent text-slate-900'
                                }`}
                            />
                        </div>

                        {/* Descrição do bloqueio */}
                        <div
                            className={`flex items-stretch rounded-xl border overflow-hidden ${
                                escuro
                                    ? 'bg-[#11161D] border-[#26303D]'
                                    : 'bg-white border-slate-200'
                            }`}
                        >
                            <span
                                className={`px-3 pt-2.5 flex items-start justify-center border-r ${
                                    escuro
                                        ? 'bg-[#151B23] border-[#26303D] text-stone-400'
                                        : 'bg-slate-50 border-slate-200 text-slate-400'
                                }`}
                            >
                                <AlignLeft className="w-4 h-4" />
                            </span>
                            <textarea
                                rows={3}
                                value={bloqueioEditando.descricao}
                                onChange={(e) =>
                                    setBloqueioEditando({
                                        ...bloqueioEditando,
                                        descricao: e.target.value,
                                    })
                                }
                                placeholder={textoR4("Descrição do bloqueio")}
                                className={`w-full px-3 py-2.5 text-xs focus:outline-none resize-none ${
                                    escuro
                                        ? 'bg-transparent text-stone-100'
                                        : 'bg-transparent text-slate-900'
                                }`}
                            />
                        </div>

                        {/* Bloco Início e Duração */}
                        <div
                            className={`rounded-xl border p-3.5 space-y-3 ${
                                escuro
                                    ? 'bg-[#11161D] border-[#26303D]'
                                    : 'bg-slate-50/80 border-slate-200'
                            }`}
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={`text-xs font-bold w-16 ${clsSubtexto}`}>{textoR4("Início *")}</span>
                                <input
                                    type="date"
                                    required
                                    value={bloqueioEditando.data}
                                    onChange={(e) =>
                                        setBloqueioEditando({
                                            ...bloqueioEditando,
                                            data: e.target.value,
                                        })
                                    }
                                    className={`border rounded-xl px-2.5 py-1.5 text-xs font-semibold ${clsInput}`}
                                />
                                <select
                                    value={bloqueioEditando.hora}
                                    onChange={(e) =>
                                        setBloqueioEditando({
                                            ...bloqueioEditando,
                                            hora: e.target.value,
                                        })
                                    }
                                    className={`border rounded-xl px-2 py-1.5 text-xs font-bold ${clsInput}`}
                                >
                                    {HORAS_BLOQUEIO.map((h) => (
                                        <option key={h} value={h}>
                                            {h}
                                        </option>
                                    ))}
                                </select>
                                <span className="font-bold">:</span>
                                <select
                                    value={bloqueioEditando.minuto}
                                    onChange={(e) =>
                                        setBloqueioEditando({
                                            ...bloqueioEditando,
                                            minuto: e.target.value,
                                        })
                                    }
                                    className={`border rounded-xl px-2 py-1.5 text-xs font-bold ${clsInput}`}
                                >
                                    {MINUTOS_INICIO.map((m) => (
                                        <option key={m} value={m}>
                                            {m}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <span className={`text-xs font-bold w-16 ${clsSubtexto}`}>{textoR4("Duração *")}</span>
                                <select
                                    value={bloqueioEditando.duracaoHoras}
                                    onChange={(e) =>
                                        setBloqueioEditando({
                                            ...bloqueioEditando,
                                            duracaoHoras: Number(e.target.value),
                                        })
                                    }
                                    className={`border rounded-xl px-2.5 py-1.5 text-xs font-bold ${clsInput}`}
                                >
                                    {Array.from({ length: Math.max(14, bloqueioEditando.duracaoHoras) + 1 }, (_, hr) => hr).map((hr) => (
                                        <option key={hr} value={hr}>
                                            {hr}
                                        </option>
                                    ))}
                                </select>
                                <span className={`text-xs ${clsSubtexto}`}>{textoR4("hr")}</span>

                                <select
                                    value={bloqueioEditando.duracaoMinutos}
                                    onChange={(e) =>
                                        setBloqueioEditando({
                                            ...bloqueioEditando,
                                            duracaoMinutos: Number(e.target.value),
                                        })
                                    }
                                    className={`border rounded-xl px-2.5 py-1.5 text-xs font-bold ${clsInput}`}
                                >
                                    {MINUTOS_INICIO.map((m) => (
                                        <option key={m} value={Number(m)}>
                                            {Number(m)}
                                        </option>
                                    ))}
                                </select>
                                <span className={`text-xs ${clsSubtexto}`}>{textoR4("min")}</span>

                                <span
                                    className={`ml-auto px-3 py-1.5 rounded-lg text-xs font-extrabold ${
                                        escuro
                                            ? 'bg-[#1D2530] text-stone-200'
                                            : 'bg-slate-200/80 text-slate-700'
                                    }`}
                                >
                                    {duracaoTotalEdicaoBloqueio}
                                </span>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={salvandoBloqueio || duracaoTotalEdicaoBloqueio < 10}
                            className="w-full py-3 rounded-xl bg-[#00A8B5] hover:bg-[#00929E] text-white text-xs font-extrabold uppercase tracking-wider shadow-sm transition cursor-pointer"
                        >
                            {salvandoBloqueio ? textoR4("Salvando...") : textoR4("SALVAR BLOQUEIO")}
                        </button>
                    </form>
                </div>
            )}

            <ModalNovoAgendamentoR4
                aberto={modalNovoAberto}
                onFecharAction={() => setModalNovoAberto(false)}
                modoInicial={modalNovoModo}
                roleUsuario={roleUsuario}
                professorTravadoId={professorTravadoId}
                unidadeInicialId={unidadeIdAtiva || professores.find((prof) => prof.id === modalProfInicial)?.unidade_id || 0}
                professorInicialId={modalProfInicial}
                dataInicial={modalDataInicial}
                horaInicial={modalHoraInicial}
                unidades={unidades}
                professores={professores}
                alunos={alunos}
                onSucessoAction={onRecarregarDadosAction}
                classes={classes}
            />

            {arquivoAberto && <ArquivoAgendamentosR4 escuro={escuro} onFechar={() => setArquivoAberto(false)}
                onSelecionar={(aula) => { setAulaSelecionada(aula); setArquivoAberto(false); }} />}

            <ModalDetalhesAulaR4
                aula={aulaSelecionada}
                iniciarNoHistorico={Boolean(aulaSelecionada?.excluido_em)}
                onFecharAction={() => setAulaSelecionada(null)}
                roleUsuario={roleUsuario}
                onAtualizadoAction={onRecarregarDadosAction}
                unidades={unidades}
                professores={professores}
                alunos={alunos}
                escuro={escuro}
            />
        </section>
    );
}