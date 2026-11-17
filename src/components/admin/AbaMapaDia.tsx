'use client';

import { useState } from 'react';
import { Clock } from 'lucide-react';
import {
    gerarTodosSlotsProfessor,
    horaParaMinutos,
} from '@/lib/horarios-reforco';
import {
    AgendamentoAdmin,
    BloqueioAdmin,
    ProfessorAdmin,
    TemaClasses,
    UnidadeAdmin,
} from './types';

function obterAmanhaISO(): string {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    return `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(
        2,
        '0'
    )}-${String(amanha.getDate()).padStart(2, '0')}`;
}

export default function AbaMapaDia({
                                       unidades,
                                       professores,
                                       agendamentos,
                                       bloqueios,
                                       escuro,
                                       classes,
                                   }: {
    unidades: UnidadeAdmin[];
    professores: ProfessorAdmin[];
    agendamentos: AgendamentoAdmin[];
    bloqueios: BloqueioAdmin[];
    escuro: boolean;
    classes: TemaClasses;
}) {
    const { clsCard, clsSubCard, clsInput, clsTitulo, clsSubtexto } = classes;

    const [mapaUnidadeId, setMapaUnidadeId] = useState<number>(0);
    const [mapaData, setMapaData] = useState<string>(() => obterAmanhaISO());
    const [mapaBuscaProf, setMapaBuscaProf] = useState<string>('');

    const unidadeIdAtiva = mapaUnidadeId || unidades[0]?.id || 0;

    const professoresMapa = professores.filter((p) => {
        if (!p.ativo) return false;
        if (unidadeIdAtiva && p.unidade_id !== unidadeIdAtiva) return false;
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

    return (
        <section className="space-y-4">
            <div className={`border rounded-2xl p-5 space-y-4 ${clsCard}`}>
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="flex flex-wrap items-end gap-3">
                        <div>
                            <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                Unidade
                            </label>
                            <select
                                value={unidadeIdAtiva}
                                onChange={(e) => setMapaUnidadeId(Number(e.target.value))}
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
                <div className={`border rounded-2xl overflow-x-auto ${clsCard}`}>
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
    );
}