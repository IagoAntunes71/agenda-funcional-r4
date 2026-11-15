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
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [sucesso, setSucesso] = useState<string | null>(null);

    async function carregarLista() {
        setCarregando(true);
        try {
            const res = await fetch('/api/admin/importar-professores', { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) {
                setErro(data.error || 'Erro ao carregar fila de IDs.');
                return;
            }
            setItens(data.itens || []);
        } catch {
            setErro('Falha de rede ao consultar IDs salvos.');
        } finally {
            setCarregando(false);
        }
    }

    useEffect(() => {
        carregarLista();
    }, []);

    async function handleSalvarIds(e: React.FormEvent) {
        e.preventDefault();
        setSalvando(true);
        setErro(null);
        setSucesso(null);

        try {
            const res = await fetch('/api/admin/importar-professores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: textoIds }),
            });

            const data = await res.json();
            if (!res.ok) {
                setErro(data.error || 'Não foi possível salvar os IDs.');
                return;
            }

            setTextoIds('');
            if (Array.isArray(data.itens)) {
                setItens(data.itens);
            } else {
                await carregarLista();
            }
            setSucesso(
                `${data.total} ID(s) gravado(s) na fila! Execute "Run workflow" no GitHub Actions para buscar nome, unidades e matérias.`
            );
        } catch {
            setErro('Falha de comunicação ao enviar os IDs.');
        } finally {
            setSalvando(false);
        }
    }

    async function handleDescobrirTodos() {
        setSalvando(true);
        setErro(null);
        setSucesso(null);

        try {
            const res = await fetch('/api/admin/importar-professores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ descobrirTodos: true }),
            });

            const data = await res.json();
            if (!res.ok) {
                setErro(data.error || 'Não foi possível agendar a busca completa.');
                return;
            }

            if (Array.isArray(data.itens)) {
                setItens(data.itens);
            } else {
                await carregarLista();
            }
            setSucesso(
                'Busca completa agendada! Agora execute "Run workflow" no GitHub Actions para capturar todos os profissionais de /painel/profissionais.'
            );
        } catch {
            setErro('Falha de comunicação ao agendar busca completa.');
        } finally {
            setSalvando(false);
        }
    }

    async function handleRemover(id: number) {
        setErro(null);
        const res = await fetch(`/api/admin/importar-professores?id=${id}`, {
            method: 'DELETE',
        });
        const data = await res.json();
        if (res.ok && Array.isArray(data.itens)) {
            setItens(data.itens);
        } else {
            await carregarLista();
        }
    }

    return (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-white">
                        Importação Automática de Professores (clin.care)
                    </h2>
                    <p className="text-sm text-slate-400 mt-1">
                        Busque todos os profissionais automaticamente da tela /painel/profissionais ou cole IDs específicos abaixo.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={handleDescobrirTodos}
                    disabled={salvando}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-sm font-medium text-white transition"
                >
                    {salvando ? 'Agendando...' : 'Descobrir Todos do clin.care'}
                </button>
            </div>

            <form onSubmit={handleSalvarIds} className="space-y-3">
        <textarea
            rows={3}
            value={textoIds}
            onChange={(e) => setTextoIds(e.target.value)}
            placeholder="Opcional: cole IDs (UUID) ou links de profissionais específicos (um por linha)..."
            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
        />

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="submit"
                        disabled={salvando || !textoIds.trim()}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-medium text-white transition"
                    >
                        {salvando ? 'Salvando...' : 'Salvar IDs Específicos'}
                    </button>
                </div>

                {erro && (
                    <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-300">
                        {erro}
                    </div>
                )}

                {sucesso && (
                    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-300">
                        {sucesso}
                    </div>
                )}
            </form>

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
                    {carregando ? (
                        <tr>
                            <td colSpan={6} className="px-3 py-4 text-center text-slate-400">
                                Carregando fila de importação...
                            </td>
                        </tr>
                    ) : itens.length === 0 ? (
                        <tr>
                            <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                                Nenhum item na fila ainda. Clique em "Descobrir Todos do clin.care" ou cole IDs acima.
                            </td>
                        </tr>
                    ) : (
                        itens.map((item) => (
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
                        ))
                    )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}