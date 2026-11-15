'use client';

import { useEffect, useState } from 'react';

interface ItemImportacao {
    id: number;
    clin_care_id: string;
    nome_detectado: string | null;
    unidades_detectadas: string | null;
    materias_detectadas: string | null;
    status: string;
    mensagem: string | null;
    atualizado_em: string;
}

export default function ImportadorProfessoresClinCare() {
    const [textoIds, setTextoIds] = useState('');
    const [itens, setItens] = useState<ItemImportacao[]>([]);
    const [salvando, setSalvando] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);

    async function carregarLista() {
        const res = await fetch('/api/admin/importar-professores', { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            setItens(data.itens || []);
        }
    }

    useEffect(() => {
        carregarLista();
    }, []);

    async function handleSalvarIds(e: React.FormEvent) {
        e.preventDefault();
        setSalvando(true);
        setFeedback(null);

        try {
            const res = await fetch('/api/admin/importar-professores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: textoIds }),
            });

            const data = await res.json();
            if (!res.ok) {
                setFeedback(data.error || 'Erro ao salvar IDs.');
                return;
            }

            setTextoIds('');
            setFeedback(
                `${data.total} ID(s) salvo(s)! Agora execute "Run workflow" no GitHub Actions (ou aguarde a sincronização automática) para importar nome, unidades e matérias.`
            );
            await carregarLista();
        } finally {
            setSalvando(false);
        }
    }

    async function handleRemover(id: number) {
        await fetch(`/api/admin/importar-professores?id=${id}`, { method: 'DELETE' });
        await carregarLista();
    }

    return (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
            <div>
                <h2 className="text-lg font-semibold text-white">
                    Importação Automática de Professores por ID (clin.care)
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                    Cole um ou mais IDs (UUID) de profissionais do clin.care (um por linha ou separados por vírgula). Na próxima execução do robô, o sistema buscará automaticamente o nome, unidades e matérias de cada um.
                </p>
            </div>

            <form onSubmit={handleSalvarIds} className="space-y-3">
        <textarea
            rows={3}
            value={textoIds}
            onChange={(e) => setTextoIds(e.target.value)}
            placeholder="Ex:&#10;7884d4a2-fe74-4f00-9859-fd2b08f4d0db&#10;a289a589-60ee-485d-aa02-25b2fcbe38c6"
            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
        />

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="submit"
                        disabled={salvando || !textoIds.trim()}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-medium text-white transition"
                    >
                        {salvando ? 'Salvando...' : 'Salvar IDs para Importar'}
                    </button>

                    {feedback && <p className="text-xs text-emerald-400">{feedback}</p>}
                </div>
            </form>

            {itens.length > 0 && (
                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                    <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-slate-950/70 text-slate-400 uppercase">
                        <tr>
                            <th className="px-3 py-2.5">ID clin.care</th>
                            <th className="px-3 py-2.5">Professor</th>
                            <th className="px-3 py-2.5">Unidades</th>
                            <th className="px-3 py-2.5">Matérias</th>
                            <th className="px-3 py-2.5">Status</th>
                            <th className="px-3 py-2.5 text-right">Ação</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                        {itens.map((item) => (
                            <tr key={item.id}>
                                <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400">
                                    {item.clin_care_id}
                                </td>
                                <td className="px-3 py-2.5 font-medium text-white">
                                    {item.nome_detectado || '—'}
                                </td>
                                <td className="px-3 py-2.5">{item.unidades_detectadas || '—'}</td>
                                <td className="px-3 py-2.5">{item.materias_detectadas || '—'}</td>
                                <td className="px-3 py-2.5">
                    <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            item.status === 'importado'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : item.status === 'erro'
                                    ? 'bg-rose-500/15 text-rose-400'
                                    : 'bg-amber-500/15 text-amber-300'
                        }`}
                        title={item.mensagem || ''}
                    >
                      {item.status} ({item.atualizado_em})
                    </span>
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                    <button
                                        type="button"
                                        onClick={() => handleRemover(item.id)}
                                        className="text-rose-400 hover:text-rose-300"
                                    >
                                        Remover
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}