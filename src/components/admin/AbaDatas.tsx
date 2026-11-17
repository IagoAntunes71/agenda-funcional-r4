'use client';

import { useState } from 'react';
import { CalendarPlus, Plus, Trash2 } from 'lucide-react';
import { DataAdmin, TemaClasses, formatarDataBR } from './types';

export default function AbaDatas({
                                     datasLiberadas,
                                     classes,
                                     onRecarregarDados,
                                 }: {
    datasLiberadas: DataAdmin[];
    classes: TemaClasses;
    onRecarregarDados: () => Promise<void>;
}) {
    const { clsCard, clsSubCard, clsInput, clsTitulo, clsSubtexto } = classes;

    const [novaData, setNovaData] = useState('');
    const [novaDescricao, setNovaDescricao] = useState('');
    const [novoTipoData, setNovoTipoData] = useState<'bloquear' | 'liberar'>(
        'bloquear'
    );

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
        await onRecarregarDados();
    }

    async function alternarData(id: number, ativo: boolean) {
        await fetch('/api/admin/datas', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ativo }),
        });
        await onRecarregarDados();
    }

    async function excluirData(id: number) {
        await fetch(`/api/admin/datas?id=${id}`, { method: 'DELETE' });
        await onRecarregarDados();
    }

    return (
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
                    {novoTipoData === 'bloquear' ? 'Salvar Bloqueio' : 'Salvar Liberação'}
                </button>
            </form>

            <div className={`lg:col-span-7 border rounded-2xl p-6 space-y-3 ${clsCard}`}>
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
                                    <p className={`text-xs ${clsSubtexto}`}>{d.descricao}</p>
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
    );
}