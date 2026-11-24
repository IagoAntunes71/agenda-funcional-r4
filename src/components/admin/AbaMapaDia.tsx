'use client';

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
    GripVertical,
    Lock,
    Pencil,
    RotateCcw,
    Search,
    Trash2,
    User,
    Users,
    X,
} from 'lucide-react';
import { RoleSistema } from '@/lib/admin-auth';
import {
    HORAS_GRADE_R4,
    normalizarStatusAulaR4,
    obterMetaStatusR4,
} from '@/lib/agenda-status-r4';
import { filtrarMateriasVisiveis } from '@/lib/cliente-helpers';
import { adicionarDiasISO, horaParaMinutos, minutosParaHora } from '@/lib/horarios-reforco';
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

const ALTURA_LINHA_PX = 84;
const HORA_INICIAL_GRADE = 8; // 08:00
const HORAS_BLOQUEIO = Array.from({ length: 15 }, (_, i) => String(8 + i).padStart(2, '0'));
const MINUTOS_BLOQUEIO = ['00', '10', '20', '30', '40', '50'];

function obterHojeISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
    ).padStart(2, '0')}`;
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
        .replace(/^bloqueio\s*[-•:]\s*/i, '')
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
                                       onRecarregarDadosAction,
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
    onRecarregarDadosAction: () => Promise<void>;
}) {
    const { clsCard, clsSubCard, clsInput, clsTitulo, clsSubtexto } = classes;
    const ehProfessor = roleUsuario === 'professor';

    const [modoVisualizacao, setModoVisualizacao] = useState<'dia' | 'semana'>('dia');
    const [unidadeId, setUnidadeId] = useState<number>(0);
    const [dataGlobal, setDataGlobal] = useState<string>(() => obterHojeISO());
    const [datasPorProfessor, setDatasPorProfessor] = useState<Record<number, string>>({});
    const [busca, setBusca] = useState<string>('');
    const [slotAtivoKey, setSlotAtivoKey] = useState<string | null>(null);

    const [modalNovoAberto, setModalNovoAberto] = useState<boolean>(false);
    const [modalNovoModo, setModalNovoModo] = useState<'aula' | 'bloqueio'>('aula');
    const [modalProfInicial, setModalProfInicial] = useState<number>(0);
    const [modalDataInicial, setModalDataInicial] = useState<string>(() => obterHojeISO());
    const [modalHoraInicial, setModalHoraInicial] = useState<string>('08:00');
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

    // Sincronização de scroll horizontal superior <-> grade
    const scrollTopoRef = useRef<HTMLDivElement | null>(null);
    const scrollGradeRef = useRef<HTMLDivElement | null>(null);
    const tabelaRef = useRef<HTMLTableElement | null>(null);
    const inputDataGlobalRef = useRef<HTMLInputElement | null>(null);
    const sincronizandoScrollRef = useRef<boolean>(false);
    const [larguraTabela, setLarguraTabela] = useState<number>(1200);

    const unidadeIdAtiva = unidadeId || unidades[0]?.id || 0;

    const professoresVisiveis = useMemo(() => {
        if (ehProfessor) {
            return Array.from(
                new Map(professores.map((p) => [p.nome.trim().toLowerCase(), p])).values()
            );
        }

        return professores.filter((p) => {
            if (!p.ativo) return false;
            if (unidadeIdAtiva && p.unidade_id !== unidadeIdAtiva) return false;
            if (busca.trim()) {
                const termo = busca.trim().toLowerCase();
                const materiasVisiveis = filtrarMateriasVisiveis(p.materias);
                const bateNome = p.nome.toLowerCase().includes(termo);
                const bateMateria = materiasVisiveis.some((m) => m.toLowerCase().includes(termo));
                if (!bateNome && !bateMateria) return false;
            }
            return true;
        });
    }, [ehProfessor, professores, unidadeIdAtiva, busca]);

    // Faixa rápida de 7 dias ao redor da data selecionada
    const faixaDiasSemana = useMemo(() => {
        const diasSigla = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
        return Array.from({ length: 7 }, (_, idx) => {
            const offset = idx - 2;
            const iso = adicionarDiasISO(dataGlobal, offset);
            const [ano, mes, dia] = iso.split('-').map(Number);
            const dt = new Date(ano, (mes || 1) - 1, dia || 1);
            return {
                iso,
                sigla: diasSigla[dt.getDay()],
                numero: String(dia).padStart(2, '0'),
                ativo: iso === dataGlobal,
            };
        });
    }, [dataGlobal]);

    // Resumo dinâmico do dia visível
    const resumoDia = useMemo(() => {
        const profIdsVisiveis = new Set(professoresVisiveis.map((p) => p.id));
        const clinCareIdsVisiveis = new Set(
            professoresVisiveis.map((p) => p.clin_care_id).filter(Boolean)
        );

        const aulasVisiveis = agendamentos.filter((ag) => {
            const profCorrespondente = professoresVisiveis.find(
                (p) =>
                    p.id === ag.professor_id ||
                    (p.clin_care_id && ag.professor_clin_care_id === p.clin_care_id)
            );
            if (!profCorrespondente && !ehProfessor) return false;
            const dataEsperada = profCorrespondente
                ? datasPorProfessor[profCorrespondente.id] || dataGlobal
                : dataGlobal;
            if (ag.data !== dataEsperada) return false;

            const st = normalizarStatusAulaR4(ag.status);
            return st !== 'cancelado';
        });

        const confirmadas = aulasVisiveis.filter(
            (ag) => normalizarStatusAulaR4(ag.status) === 'confirmado'
        ).length;

        const bloqueiosVisiveis = bloqueios.filter((bl) => {
            const profCorrespondente = professoresVisiveis.find(
                (p) =>
                    p.id === bl.professor_id ||
                    (p.clin_care_id && bl.professor_clin_care_id === p.clin_care_id)
            );
            if (!profCorrespondente && !ehProfessor) {
                if (
                    bl.professor_id !== null &&
                    !profIdsVisiveis.has(bl.professor_id) &&
                    (!bl.professor_clin_care_id ||
                        !clinCareIdsVisiveis.has(bl.professor_clin_care_id))
                ) {
                    return false;
                }
            }
            const dataEsperada = profCorrespondente
                ? datasPorProfessor[profCorrespondente.id] || dataGlobal
                : dataGlobal;
            return bl.data === dataEsperada;
        });

        return {
            totalAulas: aulasVisiveis.length,
            confirmadas,
            totalBloqueios: bloqueiosVisiveis.length,
        };
    }, [
        agendamentos,
        bloqueios,
        professoresVisiveis,
        datasPorProfessor,
        dataGlobal,
        ehProfessor,
    ]);

    useEffect(() => {
        const atualizarLargura = () => {
            if (tabelaRef.current) {
                setLarguraTabela(tabelaRef.current.scrollWidth);
            }
        };
        atualizarLargura();
        window.addEventListener('resize', atualizarLargura);
        return () => window.removeEventListener('resize', atualizarLargura);
    }, [professoresVisiveis.length, modoTelaCheia, modoVisualizacao]);

    function handleScrollTopo() {
        if (sincronizandoScrollRef.current) return;
        if (scrollTopoRef.current && scrollGradeRef.current) {
            sincronizandoScrollRef.current = true;
            scrollGradeRef.current.scrollLeft = scrollTopoRef.current.scrollLeft;
            requestAnimationFrame(() => {
                sincronizandoScrollRef.current = false;
            });
        }
    }

    function handleScrollGrade() {
        setHoverCard(null);
        if (sincronizandoScrollRef.current) return;
        if (scrollTopoRef.current && scrollGradeRef.current) {
            sincronizandoScrollRef.current = true;
            scrollTopoRef.current.scrollLeft = scrollGradeRef.current.scrollLeft;
            requestAnimationFrame(() => {
                sincronizandoScrollRef.current = false;
            });
        }
    }

    function obterDataDoProfessor(profId: number): string {
        return datasPorProfessor[profId] || dataGlobal;
    }

    function alterarDataGlobal(novaData: string) {
        if (!novaData) return;
        setDataGlobal(novaData);
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
        const pId = profId || professoresVisiveis[0]?.id || 0;
        setModalNovoModo(ehProfessor ? 'bloqueio' : modo);
        setModalProfInicial(pId);
        setModalDataInicial(dataSlot || obterDataDoProfessor(pId));
        setModalHoraInicial(horaSlot || '08:00');
        setModalNovoAberto(true);
    }

    function abrirDetalhesBloqueio(
        e: React.MouseEvent,
        bl: BloqueioAdmin,
        professorNome: string
    ) {
        e.stopPropagation();
        setBloqueioSelecionado({ bloqueio: bl, professorNome });
    }

    function iniciarEdicaoBloqueio() {
        if (!bloqueioSelecionado) return;
        const { bloqueio, professorNome } = bloqueioSelecionado;
        const [hIni, mIni] = (bloqueio.hora_inicio || '08:00').split(':');
        const duracaoTotal = Math.max(
            10,
            horaParaMinutos(bloqueio.hora_fim) - horaParaMinutos(bloqueio.hora_inicio)
        );
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
            minuto: MINUTOS_BLOQUEIO.includes(mIni) ? mIni : '00',
            duracaoHoras: dHoras,
            duracaoMinutos: dMinutos,
        });
    }

    async function excluirBloqueioSelecionado() {
        if (!bloqueioSelecionado) return;
        setSalvandoBloqueio(true);
        try {
            const res = await fetch(
                `/api/admin/bloqueios?id=${bloqueioSelecionado.bloqueio.id}`,
                { method: 'DELETE' }
            );
            if (res.ok) {
                setBloqueioSelecionado(null);
                await onRecarregarDadosAction();
            }
        } finally {
            setSalvandoBloqueio(false);
        }
    }

    async function salvarEdicaoBloqueio(e: React.FormEvent) {
        e.preventDefault();
        if (!bloqueioEditando) return;
        const totalMinutos =
            bloqueioEditando.duracaoHoras * 60 + bloqueioEditando.duracaoMinutos;
        if (totalMinutos < 10) return;

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
            }
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
        if (!aulaArrastando || ehProfessor) return;

        const horaOriginal = aulaArrastando.hora_inicio || (aulaArrastando.horario || '').slice(0, 5);
        const [, minOrig] = horaOriginal.split(':');
        const [horaFaixaBase] = horaFaixa.split(':');
        const novoHorario = `${horaFaixaBase}:${minOrig || '00'}`;

        const mudouProf = aulaArrastando.professor_id !== profDestino.id;
        const mudouData = aulaArrastando.data !== dataDestino;
        const mudouHora = horaOriginal !== novoHorario;

        if (!mudouProf && !mudouData && !mudouHora) {
            setAulaArrastando(null);
            return;
        }

        const materiasDestino = filtrarMateriasVisiveis(profDestino.materias);
        const materiaAtualNorm = normalizarTextoComparacao(aulaArrastando.materia);
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

        setSalvandoTransferencia(true);
        try {
            const { aula, professorDestino, novaData, novoHorario } = transferenciaPendente;
            const res = await fetch('/api/admin/agendamentos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: aula.id,
                    professor_id: professorDestino.id,
                    unidade_id: professorDestino.unidade_id,
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
            }
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

    function calcularEstiloBloqueioContinuo(bl: BloqueioAdmin) {
        const iniMin = Math.max(HORA_INICIAL_GRADE * 60, horaParaMinutos(bl.hora_inicio));
        const fimMin = Math.min(23 * 60, horaParaMinutos(bl.hora_fim));
        const duracaoMin = Math.max(30, fimMin - iniMin);
        const offsetMin = iniMin - HORA_INICIAL_GRADE * 60;

        return {
            top: `${(offsetMin / 60) * ALTURA_LINHA_PX + 6}px`,
            height: `${(duracaoMin / 60) * ALTURA_LINHA_PX - 12}px`,
        };
    }

    function obterEstiloCardAula(statusBruto: string) {
        const status = normalizarStatusAulaR4(statusBruto);
        if (status === 'confirmado') {
            return {
                card: escuro
                    ? 'bg-[#122923] border-emerald-500/50 border-l-emerald-400 text-stone-100'
                    : 'bg-[#ECFDF3] border-[#A7F3D0] border-l-[#16A34A] text-slate-900',
                materia: escuro ? 'text-emerald-300' : 'text-slate-600',
                badgeIcone: 'bg-[#16A34A] text-white',
            };
        }
        if (status === 'agendado') {
            return {
                card: escuro
                    ? 'bg-[#10262B] border-[#1496A1]/50 border-l-[#1496A1] text-stone-100'
                    : 'bg-[#F0FDFA] border-[#99F6E4] border-l-[#0E7C86] text-slate-900',
                materia: escuro ? 'text-[#5EEAD4]' : 'text-[#0F766E]',
                badgeIcone: 'bg-[#0E7C86] text-white',
            };
        }
        if (status === 'realizado') {
            return {
                card: escuro
                    ? 'bg-[#2A2412] border-amber-500/50 border-l-amber-400 text-stone-100'
                    : 'bg-amber-50 border-amber-200 border-l-amber-500 text-slate-900',
                materia: escuro ? 'text-amber-300' : 'text-amber-800',
                badgeIcone: 'bg-amber-500 text-white',
            };
        }
        return {
            card: escuro
                ? 'bg-stone-800 border-stone-700 border-l-stone-400 text-stone-300'
                : 'bg-slate-100 border-slate-300 border-l-slate-400 text-slate-600',
            materia: escuro ? 'text-stone-400' : 'text-slate-500',
            badgeIcone: 'bg-slate-400 text-white',
        };
    }

    const clsBordaGrade = escuro ? 'border-[#26303D]' : 'border-slate-200';
    const clsLinhaHora = escuro ? 'divide-[#26303D]' : 'divide-slate-200';
    const clsCabecalhoClaro = escuro
        ? 'bg-[#11161D] text-stone-100 border-[#26303D]'
        : 'bg-white text-slate-900 border-slate-200';

    const legendaCompacta = [
        { rotulo: 'Agendada', cor: 'bg-[#0E7C86]' },
        { rotulo: 'Confirmada', cor: 'bg-[#16A34A]' },
        { rotulo: 'Realizada', cor: 'bg-[#EAB308]' },
        { rotulo: 'Cancelada', cor: 'bg-slate-400' },
        { rotulo: 'Bloqueio', cor: 'bg-[#F87171]' },
    ];

    const duracaoTotalEdicaoBloqueio = bloqueioEditando
        ? bloqueioEditando.duracaoHoras * 60 + bloqueioEditando.duracaoMinutos
        : 0;

    return (
        <section className={modoTelaCheia ? 'space-y-2.5' : 'space-y-3.5'}>
            {/* Barra de Controle Superior + Resumo do Dia */}
            <div className={`border rounded-2xl p-3 sm:p-3.5 space-y-2.5 shadow-2xs ${clsCard}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    {/* Grupo Esquerdo: Dia/Semana, Data, Hoje, Faixa 7 dias, Unidade, Busca */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Toggle Dia / Semana */}
                        <div
                            className={`inline-flex items-center rounded-xl border p-0.5 ${
                                escuro
                                    ? 'bg-[#0E1319] border-[#26303D]'
                                    : 'bg-slate-100/90 border-slate-200'
                            }`}
                        >
                            <button
                                type="button"
                                onClick={() => setModoVisualizacao('dia')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                                    modoVisualizacao === 'dia'
                                        ? 'bg-[#0E7C86] text-white shadow-2xs'
                                        : `${clsSubtexto} hover:text-[#0E7C86]`
                                }`}
                            >
                                Dia
                            </button>
                            <button
                                type="button"
                                onClick={() => setModoVisualizacao('semana')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                                    modoVisualizacao === 'semana'
                                        ? 'bg-[#0E7C86] text-white shadow-2xs'
                                        : `${clsSubtexto} hover:text-[#0E7C86]`
                                }`}
                            >
                                Semana
                            </button>
                        </div>

                        {/* Seletor de Data Global (< 23/11/2026 📅 >) */}
                        <div
                            className={`inline-flex items-center rounded-xl border overflow-hidden ${
                                escuro
                                    ? 'bg-[#11161D] border-[#26303D]'
                                    : 'bg-white border-slate-200'
                            }`}
                        >
                            <button
                                type="button"
                                onClick={() => alterarDataGlobal(adicionarDiasISO(dataGlobal, -1))}
                                title="Dia anterior"
                                className={`p-2 transition cursor-pointer ${clsSubtexto} hover:text-[#0E7C86]`}
                            >
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </button>

                            <label
                                onClick={() => inputDataGlobalRef.current?.showPicker?.()}
                                className={`relative inline-flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold cursor-pointer select-none ${clsTitulo}`}
                            >
                                <span>{formatarDataBR(dataGlobal)}</span>
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                <input
                                    ref={inputDataGlobalRef}
                                    type="date"
                                    value={dataGlobal}
                                    onChange={(e) => alterarDataGlobal(e.target.value)}
                                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                                />
                            </label>

                            <button
                                type="button"
                                onClick={() => alterarDataGlobal(adicionarDiasISO(dataGlobal, 1))}
                                title="Próximo dia"
                                className={`p-2 transition cursor-pointer ${clsSubtexto} hover:text-[#0E7C86]`}
                            >
                                <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* Botão Hoje */}
                        <button
                            type="button"
                            onClick={() => alterarDataGlobal(obterHojeISO())}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition ${
                                escuro
                                    ? 'bg-[#11161D] border-[#26303D] text-stone-200 hover:border-[#0E7C86]'
                                    : 'bg-white border-slate-200 text-slate-700 hover:border-[#0E7C86] hover:text-[#0E7C86]'
                            }`}
                        >
                            Hoje
                        </button>

                        {/* Faixa rápida de 7 dias */}
                        <div
                            className={`hidden xl:inline-flex items-center gap-0.5 rounded-xl border p-0.5 ${
                                escuro
                                    ? 'bg-[#0E1319] border-[#26303D]'
                                    : 'bg-slate-50 border-slate-200'
                            }`}
                        >
                            {faixaDiasSemana.map((diaItem) => (
                                <button
                                    key={diaItem.iso}
                                    type="button"
                                    onClick={() => alterarDataGlobal(diaItem.iso)}
                                    className={`px-2 py-1 rounded-lg flex flex-col items-center leading-tight transition cursor-pointer min-w-[34px] ${
                                        diaItem.ativo
                                            ? escuro
                                                ? 'bg-[#0E7C86]/30 text-[#5EEAD4] font-bold'
                                                : 'bg-[#CCFBF1] text-[#0F766E] font-bold'
                                            : `${clsSubtexto} hover:bg-slate-200/60 dark:hover:bg-white/5`
                                    }`}
                                >
                                    <span className="text-[9px] font-semibold tracking-tight">
                                        {diaItem.sigla}
                                    </span>
                                    <span className="text-xs font-extrabold">{diaItem.numero}</span>
                                </button>
                            ))}
                        </div>

                        {temDatasIndividuais && (
                            <button
                                type="button"
                                onClick={() => setDatasPorProfessor({})}
                                title="Voltar todos os professores para a data principal"
                                className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-600 dark:text-amber-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer hover:bg-amber-500/25"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Sincronizar
                            </button>
                        )}

                        {!ehProfessor && (
                            <>
                                {/* Seletor de Unidade */}
                                <select
                                    value={unidadeIdAtiva}
                                    onChange={(e) => setUnidadeId(Number(e.target.value))}
                                    className={`border rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none cursor-pointer ${
                                        escuro
                                            ? clsInput
                                            : 'bg-white border-slate-200 text-slate-800'
                                    }`}
                                >
                                    {unidades.map((u) => (
                                        <option key={u.id} value={u.id}>
                                            {u.nome}
                                        </option>
                                    ))}
                                </select>

                                {/* Campo de Busca */}
                                <div className="relative">
                                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    <input
                                        type="text"
                                        value={busca}
                                        onChange={(e) => setBusca(e.target.value)}
                                        placeholder="Filtrar professor ou matéria..."
                                        className={`border rounded-xl pl-8 pr-3 py-1.5 text-xs focus:outline-none w-44 sm:w-52 ${
                                            escuro
                                                ? clsInput
                                                : 'bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-[#0E7C86]'
                                        }`}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {/* Grupo Direito: Apenas botão principal de ação (sem < PROFS >) */}
                    <div className="flex flex-wrap items-center gap-2">
                        {ehProfessor ? (
                            <button
                                type="button"
                                onClick={() => abrirModalCriacao('bloqueio')}
                                className="px-3.5 py-2 rounded-xl bg-[#C24124] hover:bg-[#A93218] text-white text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
                            >
                                <Ban className="w-3.5 h-3.5" />
                                <span>Bloquear Horário</span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => abrirModalCriacao('aula')}
                                className="px-4 py-2 rounded-xl bg-[#0E7C86] hover:bg-[#118E99] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                            >
                                <CalendarPlus className="w-3.5 h-3.5" />
                                <span>Agendar Aula</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Segunda Linha: Resumo do dia + Legenda compacta + Dica */}
                <div
                    className={`flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t text-xs ${
                        escuro ? 'border-[#232B35]' : 'border-slate-100'
                    }`}
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-bold text-xs ${clsTitulo}`}>Resumo do dia:</span>

                        <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${
                                escuro
                                    ? 'bg-[#11161D] border-[#26303D] text-stone-200'
                                    : 'bg-slate-50 border-slate-200 text-slate-700'
                            }`}
                        >
                            <Calendar className="w-3 h-3 text-slate-500" />
                            <strong className="font-extrabold">{resumoDia.totalAulas}</strong>{' '}
                            {resumoDia.totalAulas === 1 ? 'aula' : 'aulas'}
                        </span>

                        <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${
                                escuro
                                    ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            }`}
                        >
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A]" />
                            <strong className="font-extrabold">{resumoDia.confirmadas}</strong>{' '}
                            {resumoDia.confirmadas === 1 ? 'confirmada' : 'confirmadas'}
                        </span>

                        <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${
                                escuro
                                    ? 'bg-rose-500/15 border-rose-500/35 text-rose-300'
                                    : 'bg-rose-50 border-rose-200 text-rose-700'
                            }`}
                        >
                            <Ban className="w-3.5 h-3.5 text-[#DC2626]" />
                            <strong className="font-extrabold">{resumoDia.totalBloqueios}</strong>{' '}
                            {resumoDia.totalBloqueios === 1 ? 'bloqueio' : 'bloqueios'}
                        </span>

                        <span
                            className={`hidden md:inline-block h-4 w-px mx-1 ${
                                escuro ? 'bg-[#26303D]' : 'bg-slate-200'
                            }`}
                        />

                        {/* Legenda compacta */}
                        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px]">
                            {legendaCompacta.map((item) => (
                                <span
                                    key={item.rotulo}
                                    className={`inline-flex items-center gap-1.5 font-medium ${clsSubtexto}`}
                                >
                                    <span className={`w-2.5 h-2.5 rounded-full ${item.cor}`} />
                                    {item.rotulo}
                                </span>
                            ))}
                        </div>
                    </div>

                    {!ehProfessor && (
                        <span className={`text-[11px] ${clsSubtexto}`}>
                            Dica: arraste uma aula para trocar de professor/horário.
                        </span>
                    )}
                </div>
            </div>

            {/* Grade Principal */}
            {professoresVisiveis.length === 0 ? (
                <div className={`border rounded-2xl p-8 text-center text-sm ${clsCard} ${clsSubtexto}`}>
                    Nenhum professor encontrado para a unidade/filtro selecionado.
                </div>
            ) : (
                <div className={`border rounded-2xl overflow-hidden shadow-2xs ${clsCard}`}>
                    {/* Barra de Rolagem Horizontal Superior */}
                    <div
                        ref={scrollTopoRef}
                        onScroll={handleScrollTopo}
                        className={`overflow-x-auto border-b ${
                            escuro
                                ? 'bg-[#0E1319] border-[#26303D]'
                                : 'bg-slate-100/80 border-slate-200'
                        }`}
                        style={{ height: '10px' }}
                    >
                        <div style={{ width: `${larguraTabela}px`, height: '1px' }} />
                    </div>

                    {/* Container Rolável da Grade */}
                    <div
                        ref={scrollGradeRef}
                        onScroll={handleScrollGrade}
                        className={`overflow-x-auto overflow-y-auto ${
                            modoTelaCheia ? 'max-h-[calc(100vh-195px)]' : 'max-h-[75vh]'
                        }`}
                    >
                        <table
                            ref={tabelaRef}
                            className="w-full text-left border-collapse min-w-[920px]"
                        >
                            <thead className="sticky top-0 z-30">
                            <tr className={`border-b text-xs ${clsCabecalhoClaro}`}>
                                <th
                                    className={`py-4 px-3 font-bold w-20 text-center sticky left-0 z-40 border-r ${clsCabecalhoClaro}`}
                                >
                                    Horário
                                </th>

                                {professoresVisiveis.map((prof) => {
                                    const dataProf =
                                        modoVisualizacao === 'semana'
                                            ? dataGlobal
                                            : obterDataDoProfessor(prof.id);
                                    const dataCustomizada =
                                        modoVisualizacao === 'dia' &&
                                        Boolean(datasPorProfessor[prof.id]);
                                    const materiasLimpas = filtrarMateriasVisiveis(
                                        prof.materias
                                    );

                                    return (
                                        <th
                                            key={prof.id}
                                            className={`p-0 font-bold min-w-[215px] max-w-[240px] border-r align-top ${
                                                escuro
                                                    ? 'border-[#26303D] bg-[#11161D]'
                                                    : 'border-slate-200 bg-white'
                                            }`}
                                        >
                                            {/* Cabeçalho Claro do Professor (sem Acompanhamento Escolar) */}
                                            <div className="px-3 pt-3 pb-2 flex items-center gap-2.5">
                                                    <span className="w-8 h-8 rounded-full bg-[#0E7C86] text-white text-xs font-extrabold flex items-center justify-center shrink-0">
                                                        {obterIniciais(prof.nome)}
                                                    </span>
                                                <div className="min-w-0 flex-1">
                                                    <p
                                                        className={`text-xs font-bold truncate ${
                                                            escuro
                                                                ? 'text-stone-100'
                                                                : 'text-slate-900'
                                                        }`}
                                                    >
                                                        {prof.nome}
                                                    </p>
                                                    <p
                                                        className={`text-[10.5px] truncate font-normal mt-0.5 ${
                                                            escuro
                                                                ? 'text-stone-400'
                                                                : 'text-slate-500'
                                                        }`}
                                                        title={materiasLimpas.join(' • ')}
                                                    >
                                                        {materiasLimpas.join(' • ') || '—'}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Sub-barra de Data Individual do Professor */}
                                            <div
                                                className={`px-2 py-1.5 flex items-center justify-between gap-1 ${
                                                    dataCustomizada
                                                        ? escuro
                                                            ? 'bg-[#0E7C86]/25'
                                                            : 'bg-[#CCFBF1]/60'
                                                        : ''
                                                }`}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        alterarDataProfessor(
                                                            prof.id,
                                                            adicionarDiasISO(dataProf, -1)
                                                        )
                                                    }
                                                    title={`Dia anterior para ${prof.nome}`}
                                                    className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer ${clsSubtexto}`}
                                                >
                                                    <ChevronLeft className="w-3.5 h-3.5" />
                                                </button>

                                                <label
                                                    className={`relative flex items-center justify-center gap-1.5 text-[11px] font-bold cursor-pointer px-2 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-white/10 ${
                                                        escuro
                                                            ? 'text-stone-200'
                                                            : 'text-slate-700'
                                                    }`}
                                                    title="Clique para escolher uma data só para este professor"
                                                >
                                                    <Calendar className="w-3 h-3 text-[#0E7C86]" />
                                                    <span>{formatarDiaCurtoPT(dataProf)}</span>
                                                    <input
                                                        type="date"
                                                        value={dataProf}
                                                        onChange={(e) =>
                                                            alterarDataProfessor(
                                                                prof.id,
                                                                e.target.value
                                                            )
                                                        }
                                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                                    />
                                                </label>

                                                <div className="flex items-center">
                                                    {dataCustomizada && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                alterarDataProfessor(
                                                                    prof.id,
                                                                    dataGlobal
                                                                )
                                                            }
                                                            title="Voltar para data geral"
                                                            className="p-1 rounded hover:bg-amber-500/15 text-amber-500 cursor-pointer"
                                                        >
                                                            <RotateCcw className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            alterarDataProfessor(
                                                                prof.id,
                                                                adicionarDiasISO(dataProf, 1)
                                                            )
                                                        }
                                                        title={`Próximo dia para ${prof.nome}`}
                                                        className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer ${clsSubtexto}`}
                                                    >
                                                        <ChevronRight className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                            </thead>

                            {/* Corpo da Grade */}
                            <tbody className={`divide-y text-xs ${clsLinhaHora}`}>
                            {HORAS_GRADE_R4.map((horaFaixa, idxHora) => {
                                const faixaIniMin = horaParaMinutos(horaFaixa);
                                const faixaFimMin = faixaIniMin + 60;

                                return (
                                    <tr
                                        key={horaFaixa}
                                        style={{ height: `${ALTURA_LINHA_PX}px` }}
                                        className={escuro ? 'bg-[#151A21]' : 'bg-white'}
                                    >
                                        {/* Coluna de Horário Fixa à Esquerda */}
                                        <td
                                            className={`py-2.5 px-2.5 align-top font-bold text-xs text-center sticky left-0 z-25 border-r ${clsBordaGrade} ${
                                                escuro
                                                    ? 'bg-[#11161D] text-stone-200'
                                                    : 'bg-slate-50/70 text-slate-800'
                                            }`}
                                        >
                                                <span className="text-[13px] font-extrabold tracking-tight">
                                                    {horaFaixa}
                                                </span>
                                            <span
                                                className={`block text-[10px] font-medium mt-1.5 ${
                                                    escuro ? 'text-stone-500' : 'text-slate-400'
                                                }`}
                                            >
                                                    {horaFaixa.slice(0, 2)}:30
                                                </span>
                                        </td>

                                        {/* Células dos Professores */}
                                        {professoresVisiveis.map((prof) => {
                                            const dataProf = obterDataDoProfessor(prof.id);
                                            const chaveCelula = `${prof.id}-${dataProf}-${horaFaixa}`;
                                            const estaSobreDrop = alvoDrop === chaveCelula;
                                            const estaSelecionada =
                                                slotAtivoKey === chaveCelula;

                                            const aulasNaFaixa = agendamentos.filter((ag) => {
                                                if (ag.data !== dataProf) return false;
                                                const mesmoProf = ehProfessor
                                                    ? true
                                                    : ag.professor_id === prof.id ||
                                                    (prof.clin_care_id &&
                                                        ag.professor_clin_care_id ===
                                                        prof.clin_care_id);
                                                if (!mesmoProf) return false;
                                                const iniMin = horaParaMinutos(
                                                    ag.hora_inicio || ag.horario
                                                );
                                                return (
                                                    iniMin >= faixaIniMin &&
                                                    iniMin < faixaFimMin
                                                );
                                            });

                                            // Bloqueios contínuos renderizados na primeira linha (z-10, clicáveis para editar/excluir)
                                            const bloqueiosContinuosProf =
                                                idxHora === 0
                                                    ? bloqueios.filter((b) => {
                                                        if (b.data !== dataProf) return false;
                                                        return ehProfessor
                                                            ? true
                                                            : b.professor_id === prof.id ||
                                                            (prof.clin_care_id &&
                                                                b.professor_clin_care_id ===
                                                                prof.clin_care_id);
                                                    })
                                                    : [];

                                            const temBloqueioNaFaixa = bloqueios.some((b) => {
                                                if (b.data !== dataProf) return false;
                                                const mesmoProf = ehProfessor
                                                    ? true
                                                    : b.professor_id === prof.id ||
                                                    (prof.clin_care_id &&
                                                        b.professor_clin_care_id ===
                                                        prof.clin_care_id);
                                                if (!mesmoProf) return false;
                                                const bIni = horaParaMinutos(b.hora_inicio);
                                                const bFim = horaParaMinutos(b.hora_fim);
                                                return (
                                                    faixaIniMin < bFim && bIni < faixaFimMin
                                                );
                                            });

                                            return (
                                                <td
                                                    key={prof.id}
                                                    onClick={() => setSlotAtivoKey(chaveCelula)}
                                                    onDragOver={(e) => {
                                                        if (ehProfessor) return;
                                                        e.preventDefault();
                                                        if (alvoDrop !== chaveCelula) {
                                                            setAlvoDrop(chaveCelula);
                                                        }
                                                    }}
                                                    onDragLeave={() => {
                                                        if (alvoDrop === chaveCelula) {
                                                            setAlvoDrop(null);
                                                        }
                                                    }}
                                                    onDrop={(e) =>
                                                        soltarAulaNaCelula(
                                                            e,
                                                            prof,
                                                            dataProf,
                                                            horaFaixa
                                                        )
                                                    }
                                                    className={`relative p-1.5 align-top border-r transition-colors group/cell ${clsBordaGrade} ${
                                                        estaSobreDrop
                                                            ? 'bg-[#0E7C86]/15 ring-2 ring-inset ring-[#0E7C86]'
                                                            : ''
                                                    }`}
                                                >
                                                    {/* Linha divisória sutil de 30 minutos */}
                                                    <div
                                                        className={`pointer-events-none absolute inset-x-0 top-1/2 border-t ${
                                                            escuro
                                                                ? 'border-[#232B35]/55'
                                                                : 'border-slate-100'
                                                        }`}
                                                    />

                                                    {/* Bloqueios Contínuos (z-10: ficam abaixo das aulas sobrepostas e abrem modal ao clicar) */}
                                                    {bloqueiosContinuosProf.map((bl) => (
                                                        <div
                                                            key={bl.id}
                                                            role="button"
                                                            tabIndex={0}
                                                            onClick={(e) =>
                                                                abrirDetalhesBloqueio(
                                                                    e,
                                                                    bl,
                                                                    prof.nome
                                                                )
                                                            }
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    abrirDetalhesBloqueio(
                                                                        e as unknown as React.MouseEvent,
                                                                        bl,
                                                                        prof.nome
                                                                    );
                                                                }
                                                            }}
                                                            style={calcularEstiloBloqueioContinuo(
                                                                bl
                                                            )}
                                                            title="Clique para editar ou excluir este bloqueio"
                                                            className={`absolute inset-x-1.5 z-10 rounded-xl border p-2.5 flex flex-col justify-start text-left transition cursor-pointer ${
                                                                escuro
                                                                    ? 'bg-[#C24124]/25 border-[#E07A5F]/50 text-[#FCA5A5] hover:bg-[#C24124]/35'
                                                                    : 'bg-[#FDE2E1]/90 border-[#F5A8A5] text-[#B91C1C] hover:bg-[#FBD5D3]'
                                                            }`}
                                                        >
                                                            <div className="flex items-center justify-between gap-1">
                                                                    <span className="text-[11px] font-bold tracking-tight">
                                                                        {bl.hora_inicio} –{' '}
                                                                        {bl.hora_fim}
                                                                    </span>
                                                                <Ban className="w-4 h-4 shrink-0 opacity-85" />
                                                            </div>
                                                            <p className="text-xs sm:text-[13px] font-extrabold leading-snug mt-1">
                                                                {formatarMotivoBloqueio(
                                                                    bl.motivo
                                                                )}
                                                            </p>
                                                        </div>
                                                    ))}

                                                    {/* Cards de Aula (z-20: sempre visíveis mesmo quando sobrepostos a um bloqueio) */}
                                                    <div className="relative z-20 space-y-1.5">
                                                        {/* Badge DUPLA / TRIO */}
                                                        {aulasNaFaixa.length > 1 && (
                                                            <div
                                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide shadow-2xs ${
                                                                    escuro
                                                                        ? 'bg-[#0E7C86] text-white'
                                                                        : 'bg-[#CCFBF1] text-[#0F766E]'
                                                                }`}
                                                            >
                                                                <Users className="w-3 h-3" />
                                                                {aulasNaFaixa.length === 2
                                                                    ? 'DUPLA'
                                                                    : aulasNaFaixa.length === 3
                                                                        ? 'TRIO'
                                                                        : `${aulasNaFaixa.length} ALUNOS`}
                                                            </div>
                                                        )}

                                                        {aulasNaFaixa.map((aula) => {
                                                            const estilo = obterEstiloCardAula(
                                                                aula.status
                                                            );
                                                            const meta = obterMetaStatusR4(
                                                                aula.status
                                                            );
                                                            const estaSendoArrastada =
                                                                aulaArrastando?.id === aula.id;

                                                            return (
                                                                <button
                                                                    key={aula.id}
                                                                    type="button"
                                                                    draggable={!ehProfessor}
                                                                    onDragStart={(e) =>
                                                                        iniciarArrasteAula(
                                                                            e,
                                                                            aula
                                                                        )
                                                                    }
                                                                    onDragEnd={() => {
                                                                        setAulaArrastando(null);
                                                                        setAlvoDrop(null);
                                                                    }}
                                                                    onMouseEnter={(e) =>
                                                                        abrirHoverCard(e, aula)
                                                                    }
                                                                    onMouseLeave={() =>
                                                                        setHoverCard(null)
                                                                    }
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setHoverCard(null);
                                                                        setAulaSelecionada(
                                                                            aula
                                                                        );
                                                                    }}
                                                                    className={`w-full text-left border border-l-4 rounded-xl px-2.5 py-2 transition cursor-pointer ${
                                                                        temBloqueioNaFaixa
                                                                            ? 'shadow-md ring-1 ring-black/10'
                                                                            : 'shadow-2xs'
                                                                    } ${estilo.card} ${
                                                                        estaSendoArrastada
                                                                            ? 'opacity-40 scale-95'
                                                                            : 'hover:brightness-97 dark:hover:brightness-110'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center justify-between gap-1.5">
                                                                            <span className="font-extrabold text-[12px] leading-tight truncate inline-flex items-center gap-1">
                                                                                {!ehProfessor && (
                                                                                    <GripVertical className="w-3 h-3 opacity-35 shrink-0" />
                                                                                )}
                                                                                {aula.nome_aluno}
                                                                            </span>

                                                                        <span className="inline-flex items-center gap-1 text-[10.5px] font-bold shrink-0 opacity-85">
                                                                                {formatarIntervaloCard(
                                                                                    aula
                                                                                )}
                                                                            <span
                                                                                title={
                                                                                    meta.rotulo
                                                                                }
                                                                                className={`w-4 h-4 rounded-full inline-flex items-center justify-center ${estilo.badgeIcone}`}
                                                                            >
                                                                                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                                                                                </span>
                                                                            </span>
                                                                    </div>

                                                                    <div className="flex items-center justify-between gap-1.5 mt-1 text-[10.5px]">
                                                                            <span
                                                                                className={`font-medium truncate ${estilo.materia}`}
                                                                            >
                                                                                {aula.materia}
                                                                            </span>
                                                                        <span
                                                                            className={`shrink-0 font-semibold ${clsSubtexto}`}
                                                                        >
                                                                                {aula.duracao_minutos ||
                                                                                    100}
                                                                            &apos;
                                                                            </span>
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}

                                                        {/* Slot vazio limpo: mostra caixa suave com "+" no hover ou quando selecionado */}
                                                        {aulasNaFaixa.length === 0 &&
                                                            !temBloqueioNaFaixa && (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSlotAtivoKey(
                                                                            chaveCelula
                                                                        );
                                                                        abrirModalCriacao(
                                                                            ehProfessor
                                                                                ? 'bloqueio'
                                                                                : 'aula',
                                                                            prof.id,
                                                                            horaFaixa,
                                                                            dataProf
                                                                        );
                                                                    }}
                                                                    title={
                                                                        ehProfessor
                                                                            ? `Bloquear ${horaFaixa}`
                                                                            : `Agendar aula às ${horaFaixa}`
                                                                    }
                                                                    className={`w-full h-[66px] rounded-xl border flex items-center justify-center text-lg font-medium transition cursor-pointer ${
                                                                        estaSelecionada
                                                                            ? escuro
                                                                                ? 'opacity-100 bg-[#0E7C86]/15 border-[#1496A1]/40 text-[#5EEAD4]'
                                                                                : 'opacity-100 bg-[#F0FDFA] border-[#99F6E4] text-[#0E7C86]'
                                                                            : escuro
                                                                                ? 'opacity-0 group-hover/cell:opacity-100 bg-[#0E7C86]/10 border-[#1496A1]/30 text-[#5EEAD4]'
                                                                                : 'opacity-0 group-hover/cell:opacity-100 bg-[#F0FDFA] border-[#99F6E4] text-[#0E7C86]'
                                                                    }`}
                                                                >
                                                                    +
                                                                </button>
                                                            )}
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
                </div>
            )}

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
                            {hoverCard.aula.materia}{' '}
                            {hoverCard.aula.duracao_minutos || 100}&apos;
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
                                    {meta.rotulo}
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
                        {transferenciaPendente.materiaIncompativel ? (
                            <>
                                <h3 className={`text-xl font-extrabold ${clsTitulo}`}>
                                    Selecione o serviço
                                </h3>

                                <p className={`text-sm leading-relaxed ${clsSubtexto}`}>
                                    Transferir para{' '}
                                    <strong className={clsTitulo}>
                                        {transferenciaPendente.professorDestino.nome}
                                    </strong>{' '}
                                    em{' '}
                                    <strong className={clsTitulo}>
                                        {formatarDiaCurtoPT(transferenciaPendente.novaData)}
                                    </strong>{' '}
                                    às{' '}
                                    <strong className={clsTitulo}>
                                        {transferenciaPendente.novoHorario}
                                    </strong>
                                </p>

                                <p className="text-xs font-medium text-[#D97706] dark:text-amber-400 leading-relaxed">
                                    O serviço atual não está disponível para este profissional.
                                    Selecione um dos serviços abaixo para continuar.
                                </p>

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
                                        {salvandoTransferencia ? 'Transferindo...' : 'Confirmar'}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={salvandoTransferencia}
                                        onClick={() => {
                                            setTransferenciaPendente(null);
                                            setServicoEscolhidoId('');
                                        }}
                                        className={`py-2.5 px-4 rounded-xl border text-sm font-bold transition cursor-pointer ${clsSubCard} ${clsTitulo}`}
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex items-center gap-2.5">
                                    <span className="w-9 h-9 rounded-xl bg-[#0E7C86]/15 text-[#0E7C86] flex items-center justify-center">
                                        <ArrowRightLeft className="w-4 h-4" />
                                    </span>
                                    <h3 className={`text-lg font-bold ${clsTitulo}`}>
                                        Confirmar transferência
                                    </h3>
                                </div>

                                <p className={`text-sm leading-relaxed ${clsSubtexto}`}>
                                    Transferir a aula de{' '}
                                    <strong className={clsTitulo}>
                                        {transferenciaPendente.aula.nome_aluno}
                                    </strong>{' '}
                                    para{' '}
                                    <strong className={clsTitulo}>
                                        {transferenciaPendente.professorDestino.nome}
                                    </strong>{' '}
                                    em{' '}
                                    <strong className={clsTitulo}>
                                        {formatarDiaCurtoPT(transferenciaPendente.novaData)}
                                    </strong>{' '}
                                    às{' '}
                                    <strong className={clsTitulo}>
                                        {transferenciaPendente.novoHorario}
                                    </strong>
                                    ?
                                </p>

                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <button
                                        type="button"
                                        disabled={salvandoTransferencia}
                                        onClick={() => void confirmarTransferencia()}
                                        className="py-2.5 px-4 rounded-xl bg-[#0E7C86] hover:bg-[#118E99] text-white text-sm font-bold transition cursor-pointer shadow-sm"
                                    >
                                        {salvandoTransferencia ? 'Transferindo...' : 'Confirmar'}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={salvandoTransferencia}
                                        onClick={() => setTransferenciaPendente(null)}
                                        className={`py-2.5 px-4 rounded-xl border text-sm font-bold transition cursor-pointer ${clsSubCard} ${clsTitulo}`}
                                    >
                                        Cancelar
                                    </button>
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
                                    <h3 className={`text-lg font-extrabold ${clsTitulo}`}>
                                        Bloqueio
                                    </h3>
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
                                {salvandoBloqueio ? 'Excluindo...' : 'Excluir'}
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
                                <Pencil className="w-4 h-4" />
                                Editar bloqueio
                            </button>
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
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CalendarX className="w-5 h-5 text-[#0E7C86]" />
                                <h3 className={`text-base font-extrabold ${clsTitulo}`}>
                                    Editar bloqueio
                                </h3>
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
                                placeholder="Título do bloqueio"
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
                                placeholder="Descrição do bloqueio"
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
                                <span className={`text-xs font-bold w-16 ${clsSubtexto}`}>
                                    Início *
                                </span>
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
                                    {MINUTOS_BLOQUEIO.map((m) => (
                                        <option key={m} value={m}>
                                            {m}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <span className={`text-xs font-bold w-16 ${clsSubtexto}`}>
                                    Duração *
                                </span>
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
                                    {[0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 14].map((hr) => (
                                        <option key={hr} value={hr}>
                                            {hr}
                                        </option>
                                    ))}
                                </select>
                                <span className={`text-xs ${clsSubtexto}`}>hr</span>

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
                                    {MINUTOS_BLOQUEIO.map((m) => (
                                        <option key={m} value={Number(m)}>
                                            {Number(m)}
                                        </option>
                                    ))}
                                </select>
                                <span className={`text-xs ${clsSubtexto}`}>min</span>

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
                            {salvandoBloqueio ? 'Salvando...' : 'SALVAR BLOQUEIO'}
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
                unidadeInicialId={unidadeIdAtiva}
                professorInicialId={modalProfInicial}
                dataInicial={modalDataInicial}
                horaInicial={modalHoraInicial}
                unidades={unidades}
                professores={professores}
                alunos={alunos}
                onSucessoAction={onRecarregarDadosAction}
                classes={classes}
            />

            <ModalDetalhesAulaR4
                aula={aulaSelecionada}
                onFecharAction={() => setAulaSelecionada(null)}
                roleUsuario={roleUsuario}
                onAtualizadoAction={onRecarregarDadosAction}
                classes={classes}
            />
        </section>
    );
}