'use client';

import { useState } from 'react';
import {
    Ban,
    CalendarPlus,
    ChevronLeft,
    ChevronRight,
    Clock,
    Trash2,
    Users,
} from 'lucide-react';
import { RoleSistema } from '@/lib/admin-auth';
import {
    HORAS_GRADE_R4,
    LISTA_STATUS_AULA_R4,
    formatarDuracaoLabel,
    obterMetaStatusR4,
} from '@/lib/agenda-status-r4';
import { adicionarDiasISO, horaParaMinutos } from '@/lib/horarios-reforco';
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

function obterHojeISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
    ).padStart(2, '0')}`;
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
    onRecarregarDadosAction: () => Promise<void>;
}) {
    const { clsCard, clsSubCard, clsInput, clsTitulo, clsSubtexto } = classes;
    const ehProfessor = roleUsuario === 'professor';

    const [unidadeId, setUnidadeId] = useState<number>(0);
    const [dataSelecionada, setDataSelecionada] = useState<string>(() => obterHojeISO());
    const [busca, setBusca] = useState<string>('');

    const [modalNovoAberto, setModalNovoAberto] = useState<boolean>(false);
    const [modalNovoModo, setModalNovoModo] = useState<'aula' | 'bloqueio'>('aula');
    const [modalProfInicial, setModalProfInicial] = useState<number>(0);
    const [modalHoraInicial, setModalHoraInicial] = useState<string>('08:00');
    const [aulaSelecionada, setAulaSelecionada] = useState<AgendamentoAdmin | null>(null);

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

    function abrirModalCriacao(
        modo: 'aula' | 'bloqueio',
        profId?: number,
        horaSlot?: string
    ) {
        setModalNovoModo(ehProfessor ? 'bloqueio' : modo);
        setModalProfInicial(profId || professoresVisiveis[0]?.id || 0);
        setModalHoraInicial(horaSlot || '08:00');
        setModalNovoAberto(true);
    }

    async function removerBloqueio(bloqueioId: number) {
        if (!window.confirm('Deseja remover este bloqueio da agenda?')) return;
        await fetch(`/api/admin/bloqueios?id=${bloqueioId}`, { method: 'DELETE' });
        await onRecarregarDadosAction();
    }

    return (
        <section className="space-y-4">
            <div className={`border rounded-2xl p-4 sm:p-5 space-y-4 ${clsCard}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className="inline-flex items-center rounded-xl border border-[#0E7C86]/40 overflow-hidden">
                            <button
                                type="button"
                                onClick={() =>
                                    setDataSelecionada((d) => adicionarDiasISO(d, -1))
                                }
                                title="Dia anterior"
                                className="p-2.5 bg-[#0E7C86]/15 hover:bg-[#0E7C86] text-[#1496A1] hover:text-white transition cursor-pointer"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <input
                                type="date"
                                value={dataSelecionada}
                                onChange={(e) => setDataSelecionada(e.target.value)}
                                className={`px-3 py-2 text-xs font-bold focus:outline-none ${clsInput}`}
                            />
                            <button
                                type="button"
                                onClick={() =>
                                    setDataSelecionada((d) => adicionarDiasISO(d, 1))
                                }
                                title="Próximo dia"
                                className="p-2.5 bg-[#0E7C86]/15 hover:bg-[#0E7C86] text-[#1496A1] hover:text-white transition cursor-pointer"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => setDataSelecionada(obterHojeISO())}
                            className={`px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${clsSubCard} ${clsTitulo} hover:border-[#0E7C86]`}
                        >
                            Hoje
                        </button>

                        {!ehProfessor && (
                            <>
                                <select
                                    value={unidadeIdAtiva}
                                    onChange={(e) => setUnidadeId(Number(e.target.value))}
                                    className={`border rounded-xl px-3.5 py-2 text-xs font-bold focus:outline-none ${clsInput}`}
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
                                    className={`border rounded-xl px-3.5 py-2 text-xs focus:outline-none ${clsInput}`}
                                />
                            </>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => abrirModalCriacao('bloqueio')}
                            className="px-3.5 py-2 rounded-xl bg-[#C24124]/15 hover:bg-[#C24124] border border-[#C24124]/45 text-[#E07A5F] hover:text-white text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
                        >
                            <Ban className="w-3.5 h-3.5" />
                            Bloquear Horário
                        </button>

                        {!ehProfessor && (
                            <button
                                type="button"
                                onClick={() => abrirModalCriacao('aula')}
                                className="px-4 py-2 rounded-xl bg-[#0E7C86] hover:bg-[#118E99] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm shadow-[#0E7C86]/30 transition cursor-pointer"
                            >
                                <CalendarPlus className="w-3.5 h-3.5" />
                                Agendar Aula
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 border-t border-stone-500/15 text-[11px]">
                    {LISTA_STATUS_AULA_R4.map((st) => (
                        <span
                            key={st.valor}
                            className={`inline-flex items-center gap-1.5 font-medium ${clsSubtexto}`}
                        >
                            <span className={`w-2.5 h-2.5 rounded-full ${st.corPonto}`} />
                            {st.rotulo}
                        </span>
                    ))}
                    <span className="inline-flex items-center gap-1.5 font-medium text-[#E07A5F]">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#C24124]" />
                        Bloqueio
                    </span>
                </div>
            </div>

            {professoresVisiveis.length === 0 ? (
                <div className={`border rounded-2xl p-8 text-center text-sm ${clsCard} ${clsSubtexto}`}>
                    Nenhum professor encontrado para a unidade/filtro selecionado.
                </div>
            ) : (
                <div className={`border rounded-2xl overflow-x-auto ${clsCard}`}>
                    <table className="w-full text-left border-collapse min-w-[820px]">
                        <thead>
                        <tr
                            className={`border-b text-xs ${
                                escuro
                                    ? 'border-[#232B35] bg-[#11151A] text-stone-300'
                                    : 'border-stone-200 bg-[#231917] text-white'
                            }`}
                        >
                            <th className="py-3.5 px-3 font-bold w-24 sticky left-0 z-10 bg-inherit">
                                Horário
                            </th>
                            {professoresVisiveis.map((prof) => (
                                <th
                                    key={prof.id}
                                    className="py-3.5 px-3 font-bold min-w-[230px] border-l border-stone-500/15"
                                >
                                    <div className="flex items-center gap-2.5">
                                            <span className="w-8 h-8 rounded-full bg-[#0E7C86] text-white text-xs font-extrabold flex items-center justify-center shrink-0">
                                                {obterIniciais(prof.nome)}
                                            </span>
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold truncate">
                                                {prof.nome}
                                            </p>
                                            <p className="text-[10px] opacity-75 truncate font-normal">
                                                {prof.materias.join(' • ')}
                                            </p>
                                        </div>
                                    </div>
                                </th>
                            ))}
                        </tr>
                        </thead>

                        <tbody
                            className={`divide-y text-xs ${
                                escuro ? 'divide-[#1F262E]' : 'divide-stone-200'
                            }`}
                        >
                        {HORAS_GRADE_R4.map((horaFaixa) => {
                            const faixaIniMin = horaParaMinutos(horaFaixa);
                            const faixaFimMin = faixaIniMin + 60;

                            return (
                                <tr key={horaFaixa} className="group">
                                    <td
                                        className={`py-3 px-3 align-top font-mono font-bold text-xs sticky left-0 z-10 ${
                                            escuro
                                                ? 'bg-[#11151A] text-[#25A4AF]'
                                                : 'bg-stone-50 text-[#0E7C86]'
                                        }`}
                                    >
                                        {horaFaixa}
                                    </td>

                                    {professoresVisiveis.map((prof) => {
                                        const aulasNaFaixa = agendamentos.filter((ag) => {
                                            if (ag.data !== dataSelecionada) return false;
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
                                            return iniMin >= faixaIniMin && iniMin < faixaFimMin;
                                        });

                                        const bloqueiosNaFaixa = bloqueios.filter((b) => {
                                            if (b.data !== dataSelecionada) return false;
                                            const mesmoProf = ehProfessor
                                                ? true
                                                : b.professor_id === prof.id ||
                                                (prof.clin_care_id &&
                                                    b.professor_clin_care_id ===
                                                    prof.clin_care_id);
                                            if (!mesmoProf) return false;
                                            const bIni = horaParaMinutos(b.hora_inicio);
                                            const bFim = horaParaMinutos(b.hora_fim);
                                            return faixaIniMin < bFim && bIni < faixaFimMin;
                                        });

                                        return (
                                            <td
                                                key={prof.id}
                                                className="p-2 align-top border-l border-stone-500/15 space-y-1.5"
                                            >
                                                {aulasNaFaixa.length > 1 && (
                                                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0E7C86]/20 text-[#25A4AF] text-[10px] font-bold">
                                                        <Users className="w-3 h-3" />
                                                        {aulasNaFaixa.length === 2
                                                            ? 'Dupla'
                                                            : aulasNaFaixa.length === 3
                                                                ? 'Trio'
                                                                : `${aulasNaFaixa.length} alunos`}
                                                    </div>
                                                )}

                                                {aulasNaFaixa.map((aula) => {
                                                    const meta = obterMetaStatusR4(aula.status);
                                                    return (
                                                        <button
                                                            key={aula.id}
                                                            type="button"
                                                            onClick={() =>
                                                                setAulaSelecionada(aula)
                                                            }
                                                            className={`w-full text-left border rounded-xl p-2.5 transition cursor-pointer space-y-1 ${meta.clsCardAgenda}`}
                                                        >
                                                            <div className="flex items-center justify-between gap-1.5">
                                                                    <span className="text-[10px] font-mono font-bold inline-flex items-center gap-1">
                                                                        <Clock className="w-3 h-3" />
                                                                        {aula.horario ||
                                                                            aula.hora_inicio}
                                                                    </span>
                                                                <span
                                                                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${meta.clsBadge}`}
                                                                >
                                                                        {meta.rotulo}
                                                                    </span>
                                                            </div>

                                                            <p
                                                                className={`font-bold text-xs truncate ${clsTitulo}`}
                                                            >
                                                                {aula.nome_aluno}
                                                            </p>

                                                            <div
                                                                className={`flex items-center justify-between text-[10px] ${clsSubtexto}`}
                                                            >
                                                                    <span className="font-semibold text-[#1496A1]">
                                                                        {aula.materia}
                                                                    </span>
                                                                <span>
                                                                        {formatarDuracaoLabel(
                                                                            aula.duracao_minutos ||
                                                                            100
                                                                        )}
                                                                    </span>
                                                            </div>
                                                        </button>
                                                    );
                                                })}

                                                {bloqueiosNaFaixa.map((bl) => (
                                                    <div
                                                        key={bl.id}
                                                        className="bg-[#C24124]/15 border border-[#C24124]/45 rounded-xl p-2 text-[#E07A5F] flex items-start justify-between gap-2"
                                                    >
                                                        <div className="min-w-0">
                                                            <p className="text-[10px] font-mono font-bold">
                                                                {bl.hora_inicio} – {bl.hora_fim}
                                                            </p>
                                                            <p className="text-xs font-bold truncate">
                                                                {bl.motivo}
                                                            </p>
                                                            {bl.descricao && (
                                                                <p className="text-[10px] opacity-80 truncate">
                                                                    {bl.descricao}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                void removerBloqueio(bl.id)
                                                            }
                                                            title="Remover bloqueio"
                                                            className="p-1 rounded-lg hover:bg-[#C24124]/25 shrink-0 cursor-pointer"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ))}

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        abrirModalCriacao(
                                                            ehProfessor ? 'bloqueio' : 'aula',
                                                            prof.id,
                                                            horaFaixa
                                                        )
                                                    }
                                                    className={`w-full py-1.5 px-2 rounded-lg border border-dashed text-[10px] font-semibold opacity-60 hover:opacity-100 transition cursor-pointer ${
                                                        escuro
                                                            ? 'border-[#2B3440] text-stone-400 hover:border-[#0E7C86] hover:text-[#25A4AF]'
                                                            : 'border-stone-300 text-stone-500 hover:border-[#0E7C86] hover:text-[#0E7C86]'
                                                    }`}
                                                >
                                                    {ehProfessor
                                                        ? `+ Bloquear ${horaFaixa}`
                                                        : `+ Marcar às ${horaFaixa}`}
                                                </button>
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

            <ModalNovoAgendamentoR4
                aberto={modalNovoAberto}
                onFecharAction={() => setModalNovoAberto(false)}
                modoInicial={modalNovoModo}
                roleUsuario={roleUsuario}
                professorTravadoId={professorTravadoId}
                unidadeInicialId={unidadeIdAtiva}
                professorInicialId={modalProfInicial}
                dataInicial={dataSelecionada || formatarDataBR(dataSelecionada)}
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