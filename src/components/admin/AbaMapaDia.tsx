'use client';

import { useEffect, useRef, useState } from 'react';
import {
    ArrowRightLeft,
    Ban,
    Building2,
    Calendar,
    CalendarPlus,
    ChevronLeft,
    ChevronRight,
    Clock,
    GraduationCap,
    GripVertical,
    Maximize2,
    Minimize2,
    RotateCcw,
    Trash2,
    User,
    Users,
} from 'lucide-react';
import { RoleSistema } from '@/lib/admin-auth';
import {
    HORAS_GRADE_R4,
    LISTA_STATUS_AULA_R4,
    formatarDuracaoLabel,
    obterMetaStatusR4,
} from '@/lib/agenda-status-r4';
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
    obterIniciais,
} from './types';

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
    const fim = minutosParaHora(horaParaMinutos(ini) + dur);
    return `${ini} - ${fim}`;
}

interface TransferenciaPendente {
    aula: AgendamentoAdmin;
    professorDestino: ProfessorAdmin;
    novaData: string;
    novoHorario: string;
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

    const [unidadeId, setUnidadeId] = useState<number>(0);
    const [dataGlobal, setDataGlobal] = useState<string>(() => obterHojeISO());
    const [datasPorProfessor, setDatasPorProfessor] = useState<Record<number, string>>({});
    const [busca, setBusca] = useState<string>('');

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
    const [salvandoTransferencia, setSalvandoTransferencia] = useState<boolean>(false);

    // Hover Card flutuante
    const [hoverCard, setHoverCard] = useState<HoverCardEstado | null>(null);

    // Sincronização de scroll horizontal superior <-> grade
    const scrollTopoRef = useRef<HTMLDivElement | null>(null);
    const scrollGradeRef = useRef<HTMLDivElement | null>(null);
    const tabelaRef = useRef<HTMLTableElement | null>(null);
    const sincronizandoScrollRef = useRef<boolean>(false);
    const [larguraTabela, setLarguraTabela] = useState<number>(1200);

    const unidadeIdAtiva = unidadeId || unidades[0]?.id || 0;

    const professoresVisiveis = ehProfessor
        ? Array.from(
            new Map(professores.map((p) => [p.nome.trim().toLowerCase(), p])).values()
        )
        : professores.filter((p) => {
            if (!p.ativo) return false;
            if (unidadeIdAtiva && p.unidade_id !== unidadeIdAtiva) return false;
            if (
                busca.trim() &&
                !p.nome.toLowerCase().includes(busca.trim().toLowerCase()) &&
                !p.materias.some((m) =>
                    m.toLowerCase().includes(busca.trim().toLowerCase())
                )
            ) {
                return false;
            }
            return true;
        });

    useEffect(() => {
        const atualizarLargura = () => {
            if (tabelaRef.current) {
                setLarguraTabela(tabelaRef.current.scrollWidth);
            }
        };
        atualizarLargura();
        window.addEventListener('resize', atualizarLargura);
        return () => window.removeEventListener('resize', atualizarLargura);
    }, [professoresVisiveis.length, modoTelaCheia]);

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

    function rolarHorizontal(delta: number) {
        if (scrollGradeRef.current) {
            scrollGradeRef.current.scrollBy({ left: delta, behavior: 'smooth' });
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

    async function removerBloqueio(bloqueioId: number) {
        if (!window.confirm('Deseja remover este bloqueio da agenda?')) return;
        await fetch(`/api/admin/bloqueios?id=${bloqueioId}`, { method: 'DELETE' });
        await onRecarregarDadosAction();
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

        // Mantém os minutos originais da aula se soltou na mesma hora base, ou usa o horário da faixa
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

        setTransferenciaPendente({
            aula: aulaArrastando,
            professorDestino: profDestino,
            novaData: dataDestino,
            novoHorario,
        });
        setAulaArrastando(null);
    }

    async function confirmarTransferencia() {
        if (!transferenciaPendente) return;
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
                }),
            });
            if (res.ok) {
                setTransferenciaPendente(null);
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

    const clsBordaGrade = escuro ? 'border-[#26303D]' : 'border-slate-300';
    const clsLinhaHora = escuro ? 'divide-[#26303D]' : 'divide-slate-300';
    const clsCabecalhoGrade = escuro
        ? 'bg-[#11161D] text-stone-200 border-[#26303D]'
        : 'bg-[#17232B] text-white border-slate-400';

    return (
        <section className={modoTelaCheia ? 'space-y-3' : 'space-y-4'}>
            {/* Barra de Controle Superior */}
            <div className={`border rounded-2xl p-3.5 sm:p-4 space-y-3 ${clsCard}`}>
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Seletor de Data Global */}
                        <div
                            className={`inline-flex items-center rounded-xl border overflow-hidden ${
                                escuro ? 'border-[#0E7C86]/50' : 'border-slate-400 bg-white'
                            }`}
                        >
                            <button
                                type="button"
                                onClick={() => alterarDataGlobal(adicionarDiasISO(dataGlobal, -1))}
                                title="Dia anterior (todos os professores)"
                                className="p-2 bg-[#0E7C86]/15 hover:bg-[#0E7C86] text-[#0E7C86] hover:text-white transition cursor-pointer"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <input
                                type="date"
                                value={dataGlobal}
                                onChange={(e) => alterarDataGlobal(e.target.value)}
                                title="Alterar data geral da grade"
                                className={`px-2.5 py-1.5 text-xs font-bold focus:outline-none ${clsInput} border-0`}
                            />
                            <button
                                type="button"
                                onClick={() => alterarDataGlobal(adicionarDiasISO(dataGlobal, 1))}
                                title="Próximo dia (todos os professores)"
                                className="p-2 bg-[#0E7C86]/15 hover:bg-[#0E7C86] text-[#0E7C86] hover:text-white transition cursor-pointer"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => alterarDataGlobal(obterHojeISO())}
                            className={`px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition ${clsSubCard} ${clsTitulo} hover:border-[#0E7C86]`}
                        >
                            Hoje
                        </button>

                        {temDatasIndividuais && (
                            <button
                                type="button"
                                onClick={() => setDatasPorProfessor({})}
                                title="Voltar todos os professores para a data principal"
                                className="px-2.5 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-600 dark:text-amber-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer hover:bg-amber-500/25"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Sincronizar datas
                            </button>
                        )}

                        {!ehProfessor && (
                            <>
                                <select
                                    value={unidadeIdAtiva}
                                    onChange={(e) => setUnidadeId(Number(e.target.value))}
                                    className={`border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none ${clsInput}`}
                                >
                                    {unidades.map((u) => (
                                        <option key={u.id} value={u.id}>
                                            {u.nome}
                                        </option>
                                    ))}
                                </select>

                                <input
                                    type="text"
                                    value={busca}
                                    onChange={(e) => setBusca(e.target.value)}
                                    placeholder="Filtrar professor ou matéria..."
                                    className={`border rounded-xl px-3 py-2 text-xs focus:outline-none w-48 sm:w-56 ${clsInput}`}
                                />
                            </>
                        )}
                    </div>

                    {/* Ações + Navegação Horizontal + Tela Cheia */}
                    <div className="flex flex-wrap items-center gap-2">
                        {!ehProfessor && professoresVisiveis.length > 1 && (
                            <div
                                className={`inline-flex items-center rounded-xl border p-0.5 ${clsSubCard}`}
                                title="Deslizar colunas de professores"
                            >
                                <button
                                    type="button"
                                    onClick={() => rolarHorizontal(-320)}
                                    title="Professores anteriores (esquerda)"
                                    className={`p-1.5 rounded-lg transition cursor-pointer ${clsTitulo} hover:bg-[#0E7C86] hover:text-white`}
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className={`px-1.5 text-[10px] font-bold uppercase ${clsSubtexto}`}>
                                    Profs
                                </span>
                                <button
                                    type="button"
                                    onClick={() => rolarHorizontal(320)}
                                    title="Próximos professores (direita)"
                                    className={`p-1.5 rounded-lg transition cursor-pointer ${clsTitulo} hover:bg-[#0E7C86] hover:text-white`}
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        {onAlternarTelaCheiaAction && (
                            <button
                                type="button"
                                onClick={onAlternarTelaCheiaAction}
                                title={
                                    modoTelaCheia
                                        ? 'Sair da visão ampliada'
                                        : 'Ampliar grade para tela cheia'
                                }
                                className={`px-3 py-2 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer ${
                                    modoTelaCheia
                                        ? 'bg-[#0E7C86] border-[#0E7C86] text-white'
                                        : `${clsSubCard} ${clsTitulo} hover:border-[#0E7C86]`
                                }`}
                            >
                                {modoTelaCheia ? (
                                    <>
                                        <Minimize2 className="w-3.5 h-3.5" />
                                        <span className="hidden sm:inline">Reduzir</span>
                                    </>
                                ) : (
                                    <>
                                        <Maximize2 className="w-3.5 h-3.5 text-[#0E7C86]" />
                                        <span className="hidden sm:inline">Tela Cheia</span>
                                    </>
                                )}
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => abrirModalCriacao('bloqueio')}
                            className="px-3 py-2 rounded-xl bg-[#C24124]/15 hover:bg-[#C24124] border border-[#C24124]/50 text-[#B8371B] dark:text-[#E07A5F] hover:text-white text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
                        >
                            <Ban className="w-3.5 h-3.5" />
                            <span>Bloquear</span>
                        </button>

                        {!ehProfessor && (
                            <button
                                type="button"
                                onClick={() => abrirModalCriacao('aula')}
                                className="px-3.5 py-2 rounded-xl bg-[#0E7C86] hover:bg-[#118E99] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm shadow-[#0E7C86]/30 transition cursor-pointer"
                            >
                                <CalendarPlus className="w-3.5 h-3.5" />
                                <span>Agendar Aula</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Legenda compacta + Dica de Drag & Drop */}
                <div
                    className={`flex flex-wrap items-center justify-between gap-2 pt-2 border-t text-[11px] ${
                        escuro ? 'border-[#232B35]' : 'border-slate-300'
                    }`}
                >
                    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
                        {LISTA_STATUS_AULA_R4.map((st) => (
                            <span
                                key={st.valor}
                                className={`inline-flex items-center gap-1.5 font-semibold ${clsSubtexto}`}
                            >
                                <span className={`w-2.5 h-2.5 rounded-full ${st.corPonto}`} />
                                {st.rotulo}
                            </span>
                        ))}
                        <span className="inline-flex items-center gap-1.5 font-semibold text-[#C24124] dark:text-[#E07A5F]">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#C24124]" />
                            Bloqueio
                        </span>
                    </div>

                    {!ehProfessor && (
                        <span className={`text-[11px] font-medium ${clsSubtexto}`}>
                            Dica: arraste uma aula para trocar de professor/horário ou passe o mouse para detalhes
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
                <div className={`border rounded-2xl overflow-hidden ${clsCard}`}>
                    {/* Barra de Rolagem Horizontal Superior (visível logo acima dos professores) */}
                    <div
                        ref={scrollTopoRef}
                        onScroll={handleScrollTopo}
                        className={`overflow-x-auto border-b ${
                            escuro
                                ? 'bg-[#0E1319] border-[#26303D]'
                                : 'bg-slate-200/80 border-slate-300'
                        }`}
                        style={{ height: '14px' }}
                    >
                        <div style={{ width: `${larguraTabela}px`, height: '1px' }} />
                    </div>

                    {/* Container Rolável da Grade */}
                    <div
                        ref={scrollGradeRef}
                        onScroll={handleScrollGrade}
                        className={`overflow-x-auto overflow-y-auto ${
                            modoTelaCheia ? 'max-h-[calc(100vh-195px)]' : 'max-h-[74vh]'
                        }`}
                    >
                        <table
                            ref={tabelaRef}
                            className="w-full text-left border-collapse min-w-[860px]"
                        >
                            <thead className="sticky top-0 z-20">
                            <tr className={`border-b text-xs ${clsCabecalhoGrade}`}>
                                <th
                                    className={`py-3 px-2.5 font-bold w-20 text-center sticky left-0 z-30 border-r ${clsCabecalhoGrade}`}
                                >
                                    Horário
                                </th>

                                {professoresVisiveis.map((prof) => {
                                    const dataProf = obterDataDoProfessor(prof.id);
                                    const dataCustomizada = Boolean(datasPorProfessor[prof.id]);

                                    return (
                                        <th
                                            key={prof.id}
                                            className={`p-0 font-bold min-w-[235px] max-w-[260px] border-r align-top ${
                                                escuro ? 'border-[#26303D]' : 'border-slate-600/50'
                                            }`}
                                        >
                                            {/* Cabeçalho do Professor */}
                                            <div className="px-3 py-2.5 flex items-center gap-2.5">
                                                    <span className="w-8 h-8 rounded-full bg-[#0E7C86] text-white text-xs font-extrabold flex items-center justify-center shrink-0 ring-2 ring-[#1496A1]/40">
                                                        {obterIniciais(prof.nome)}
                                                    </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-bold truncate text-white">
                                                        {prof.nome}
                                                    </p>
                                                    <p className="text-[10px] text-slate-300 truncate font-normal">
                                                        {prof.materias.join(' • ')}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Sub-barra de Data Individual do Professor (estilo Clin Care) */}
                                            <div
                                                className={`px-2 py-1.5 border-t flex items-center justify-between gap-1 ${
                                                    dataCustomizada
                                                        ? 'bg-[#0E7C86]/35 border-[#1496A1]/60'
                                                        : escuro
                                                            ? 'bg-[#161D26] border-[#26303D]'
                                                            : 'bg-[#21313C] border-slate-600/50'
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
                                                    className="p-1 rounded hover:bg-white/15 text-slate-200 cursor-pointer"
                                                >
                                                    <ChevronLeft className="w-3.5 h-3.5" />
                                                </button>

                                                <label
                                                    className="relative flex items-center justify-center gap-1.5 text-[11px] font-bold text-white cursor-pointer px-2 py-0.5 rounded hover:bg-white/10"
                                                    title="Clique para escolher uma data só para este professor"
                                                >
                                                    <Calendar className="w-3 h-3 text-[#38BDF8]" />
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
                                                            className="p-1 rounded hover:bg-white/15 text-amber-300 cursor-pointer"
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
                                                        className="p-1 rounded hover:bg-white/15 text-slate-200 cursor-pointer"
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

                            <tbody className={`divide-y text-xs ${clsLinhaHora}`}>
                            {HORAS_GRADE_R4.map((horaFaixa, idxHora) => {
                                const faixaIniMin = horaParaMinutos(horaFaixa);
                                const faixaFimMin = faixaIniMin + 60;
                                const linhaPar = idxHora % 2 === 1;

                                return (
                                    <tr
                                        key={horaFaixa}
                                        className={
                                            escuro
                                                ? linhaPar
                                                    ? 'bg-[#12171F]/65'
                                                    : 'bg-[#151A21]'
                                                : linhaPar
                                                    ? 'bg-slate-100/75'
                                                    : 'bg-white'
                                        }
                                    >
                                        {/* Coluna de Horário Fixa à Esquerda */}
                                        <td
                                            className={`py-2 px-2.5 align-top font-mono font-bold text-xs text-center sticky left-0 z-10 border-r ${clsBordaGrade} ${
                                                escuro
                                                    ? 'bg-[#11161D] text-[#25A4AF]'
                                                    : 'bg-slate-100 text-[#0B5C63]'
                                            }`}
                                        >
                                            <span>{horaFaixa}</span>
                                            <span
                                                className={`block text-[9px] font-normal mt-2 ${
                                                    escuro ? 'text-stone-600' : 'text-slate-400'
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

                                            const bloqueiosNaFaixa = bloqueios.filter((b) => {
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
                                                    className={`relative p-1.5 align-top border-r min-h-[68px] transition-colors group/cell ${clsBordaGrade} ${
                                                        estaSobreDrop
                                                            ? 'bg-[#0E7C86]/20 ring-2 ring-inset ring-[#0E7C86]'
                                                            : ''
                                                    }`}
                                                >
                                                    {/* Linha divisória linear sutil de 30 minutos */}
                                                    <div
                                                        className={`pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed ${
                                                            escuro
                                                                ? 'border-[#232B35]/80'
                                                                : 'border-slate-200'
                                                        }`}
                                                    />

                                                    <div className="relative z-10 space-y-1">
                                                        {aulasNaFaixa.length > 1 && (
                                                            <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#0E7C86]/20 text-[#0E7C86] dark:text-[#25A4AF] text-[9px] font-extrabold uppercase">
                                                                <Users className="w-2.5 h-2.5" />
                                                                {aulasNaFaixa.length === 2
                                                                    ? 'Dupla'
                                                                    : aulasNaFaixa.length === 3
                                                                        ? 'Trio'
                                                                        : `${aulasNaFaixa.length} alunos`}
                                                            </div>
                                                        )}

                                                        {/* Cards Compactos das Aulas (estilo Clin Care + R4) */}
                                                        {aulasNaFaixa.map((aula) => {
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
                                                                    onClick={() => {
                                                                        setHoverCard(null);
                                                                        setAulaSelecionada(
                                                                            aula
                                                                        );
                                                                    }}
                                                                    className={`w-full text-left border border-l-4 rounded-lg px-2 py-1.5 transition cursor-pointer shadow-2xs ${
                                                                        meta.clsCardAgenda
                                                                    } ${
                                                                        estaSendoArrastada
                                                                            ? 'opacity-40 scale-95'
                                                                            : 'hover:brightness-95 dark:hover:brightness-110'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center justify-between gap-1">
                                                                            <span className="text-[10px] font-mono font-bold inline-flex items-center gap-1 opacity-90">
                                                                                {!ehProfessor && (
                                                                                    <GripVertical className="w-2.5 h-2.5 opacity-50 shrink-0" />
                                                                                )}
                                                                                {formatarIntervaloCard(
                                                                                    aula
                                                                                )}
                                                                            </span>
                                                                        <span
                                                                            className={`w-2 h-2 rounded-full shrink-0 ${meta.corPonto}`}
                                                                            title={meta.rotulo}
                                                                        />
                                                                    </div>

                                                                    <p
                                                                        className={`font-bold text-[11px] leading-tight truncate mt-0.5 ${clsTitulo}`}
                                                                    >
                                                                        {aula.nome_aluno}
                                                                    </p>

                                                                    <div className="flex items-center justify-between gap-1 mt-0.5 text-[10px]">
                                                                            <span className="font-semibold text-[#0B5C63] dark:text-[#25A4AF] truncate">
                                                                                {aula.materia}
                                                                            </span>
                                                                        <span
                                                                            className={`shrink-0 font-medium ${clsSubtexto}`}
                                                                        >
                                                                                {
                                                                                    aula.duracao_minutos ||
                                                                                    100
                                                                                }
                                                                            &apos;
                                                                            </span>
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}

                                                        {/* Bloqueios */}
                                                        {bloqueiosNaFaixa.map((bl) => (
                                                            <div
                                                                key={bl.id}
                                                                className="bg-[#C24124]/15 border border-[#C24124]/50 border-l-4 border-l-[#C24124] rounded-lg px-2 py-1 text-[#A93218] dark:text-[#E07A5F] flex items-center justify-between gap-1.5"
                                                            >
                                                                <div className="min-w-0">
                                                                    <p className="text-[10px] font-mono font-bold leading-tight">
                                                                        {bl.hora_inicio} –{' '}
                                                                        {bl.hora_fim}
                                                                    </p>
                                                                    <p className="text-[11px] font-bold truncate leading-tight">
                                                                        {bl.motivo}
                                                                    </p>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        void removerBloqueio(
                                                                            bl.id
                                                                        )
                                                                    }
                                                                    title="Remover bloqueio"
                                                                    className="p-1 rounded hover:bg-[#C24124]/25 shrink-0 cursor-pointer"
                                                                >
                                                                    <Trash2 className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        ))}

                                                        {/* Botão discreto para agendar no horário */}
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                abrirModalCriacao(
                                                                    ehProfessor
                                                                        ? 'bloqueio'
                                                                        : 'aula',
                                                                    prof.id,
                                                                    horaFaixa,
                                                                    dataProf
                                                                )
                                                            }
                                                            className={`w-full py-1 px-2 rounded border border-dashed text-[10px] font-semibold transition cursor-pointer ${
                                                                aulasNaFaixa.length === 0 &&
                                                                bloqueiosNaFaixa.length === 0
                                                                    ? 'opacity-45 group-hover/cell:opacity-100'
                                                                    : 'opacity-0 group-hover/cell:opacity-100'
                                                            } ${
                                                                escuro
                                                                    ? 'border-[#2E3947] text-stone-400 hover:border-[#0E7C86] hover:text-[#25A4AF]'
                                                                    : 'border-slate-300 text-slate-600 hover:border-[#0E7C86] hover:text-[#0E7C86] hover:bg-[#0E7C86]/5'
                                                            }`}
                                                        >
                                                            {ehProfessor
                                                                ? `+ Bloquear ${horaFaixa}`
                                                                : `+ Marcar ${horaFaixa}`}
                                                        </button>
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

            {/* Hover Card Flutuante ao Passar o Mouse na Aula (estilo Print 6) */}
            {hoverCard && (
                <div
                    style={{ left: `${hoverCard.x}px`, top: `${hoverCard.y}px` }}
                    className={`fixed z-50 w-[300px] pointer-events-none border rounded-2xl p-4 shadow-2xl space-y-2.5 transition-opacity ${
                        escuro
                            ? 'bg-[#151B23] border-[#2D3846] text-stone-100'
                            : 'bg-white border-slate-300 text-slate-900'
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
                                escuro ? 'bg-[#0E1319] text-stone-300' : 'bg-slate-100 text-slate-700'
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

            {/* Modal de Confirmação de Transferência (Drag & Drop - estilo Print 4) */}
            {transferenciaPendente && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className={`border rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl ${clsCard}`}>
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
                    </div>
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