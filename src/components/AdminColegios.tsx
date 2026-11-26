'use client';
import { useTextoR4 } from '@/components/TextosInterfaceR4';


import type { CadastroColegioR4 } from '@/lib/colegios-r4';
import { useEffect, useState } from 'react';

interface ColegioItem {
    id: number;
    nome: string;
    aprovado: boolean;
    total_alunos: number;
}

function chaveColegio(cadastro: CadastroColegioR4) {
    return cadastro.id === null ? 'nome:' + cadastro.nome : 'id:' + cadastro.id;
}

export default function AdminColegios({ aoUnificar }: { aoUnificar?: () => Promise<unknown> }) {
    const textoR4 = useTextoR4();
    const [pendentes, setPendentes] = useState<ColegioItem[]>([]);
    const [oficiais, setOficiais] = useState<ColegioItem[]>([]);
    const [cadastros, setCadastros] = useState<CadastroColegioR4[]>([]);
    const [sugestoes, setSugestoes] = useState<[CadastroColegioR4, CadastroColegioR4][]>([]);
    const [selecionados, setSelecionados] = useState<string[]>([]);
    const [nomeFinal, setNomeFinal] = useState('');
    const [busca, setBusca] = useState('');
    const [novoColegio, setNovoColegio] = useState('');
    const [nomesEditados, setNomesEditados] = useState<Record<number, string>>({});
    const [mesclarAlvo, setMesclarAlvo] = useState<Record<number, number>>({});
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [mensagem, setMensagem] = useState<string | null>(null);

    useEffect(() => {
        let cancelado = false;

        async function carregar() {
            try {
                const res = await fetch('/api/admin/colegios', { cache: 'no-store' });
                const json = await res.json();
                if (!cancelado && res.ok) {
                    setPendentes(json.pendentes || []);
                    setOficiais(json.oficiais || []);
                    setCadastros(json.cadastros || []);
                    setSugestoes(json.sugestoes || []);
                    const mapaNomes: Record<number, string> = {};
                    for (const p of json.pendentes || []) {
                        mapaNomes[p.id] = p.nome;
                    }
                    setNomesEditados(mapaNomes);
                }
            } catch {
                if (!cancelado) setMensagem('Não foi possível carregar os colégios.');
            } finally {
                if (!cancelado) setCarregando(false);
            }
        }

        void carregar();
        return () => {
            cancelado = true;
        };
    }, []);

    async function executarAcao(payload: Record<string, unknown>, msgSucesso: string) {
        setSalvando(true);
        setMensagem(null);
        try {
            const res = await fetch('/api/admin/colegios', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (res.ok) {
                setPendentes(json.pendentes || []);
                setOficiais(json.oficiais || []);
                setCadastros(json.cadastros || []);
                setSugestoes(json.sugestoes || []);
                const mapaNomes: Record<number, string> = {};
                for (const p of json.pendentes || []) {
                    mapaNomes[p.id] = p.nome;
                }
                setNomesEditados(mapaNomes);
                setMensagem(msgSucesso);
                return true;
            } else {
                setMensagem(json.error || 'Erro ao salvar.');
            }
        } catch {
            setMensagem('Não foi possível conectar ao servidor.');
        } finally {
            setSalvando(false);
        }
    }

    async function handleAdicionar(e: React.FormEvent) {
        e.preventDefault();
        if (!novoColegio.trim()) return;
        await executarAcao(
            { acao: 'adicionar', nome: novoColegio.trim() },
            'Colégio adicionado à lista oficial!'
        );
        setNovoColegio('');
    }

    async function unificar(evento: React.FormEvent<HTMLFormElement>) {
        evento.preventDefault();
        const escolhidos = cadastros.filter((cadastro) => selecionados.includes(chaveColegio(cadastro)));
        if (escolhidos.length < 2 || !nomeFinal.trim()) return;
        if (!window.confirm(`Unificar ${escolhidos.length} cadastros em “${nomeFinal.trim()}”? As fichas vinculadas serão atualizadas.`)) return;
        const sucesso = await executarAcao({
            acao: 'unificar', nome: nomeFinal,
            cadastros: escolhidos.map(({ id, nome }) => ({ id, nome })),
        }, 'Colégios unificados. As fichas dos alunos foram atualizadas.');
        if (sucesso) {
            setSelecionados([]);
            setNomeFinal('');
            await aoUnificar?.();
        }
    }

    return (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-lg font-bold text-white">{textoR4("Gerenciar Colégios")}</h2>
                    <p className="text-xs text-slate-400">
                        Cadastre colégios oficiais e aprove os colégios digitados pelos clientes na opção &ldquo;Outros&rdquo;.
                    </p>
                </div>
                {pendentes.length > 0 && (
                    <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold">
            {pendentes.length}{' ' + textoR4("colégio(s) aguardando aprovação")}</span>
                )}
            </div>

            {mensagem && (
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-2.5 text-xs text-emerald-300">
                    {mensagem}
                </div>
            )}

            {!carregando && cadastros.length >= 2 && (
                <form onSubmit={unificar} className="rounded-xl border border-slate-700 p-4 space-y-3">
                    <h3 className="text-sm font-bold text-slate-100">Unificar colégios</h3>
                    <p className="text-xs text-slate-300">Revise uma sugestão ou marque os cadastros manualmente. Você pode editar o nome final.</p>
                    {sugestoes.length > 0 ? (
                        <div className="max-h-40 overflow-auto space-y-1">
                            {sugestoes.map(([a, b]) => (
                                <button key={JSON.stringify([chaveColegio(a), chaveColegio(b)])} type="button"
                                    className="block w-full rounded-lg border border-slate-700 px-3 py-2 text-left text-xs text-sky-300 hover:bg-slate-800"
                                    onClick={() => {
                                        setSelecionados([chaveColegio(a), chaveColegio(b)]);
                                        setNomeFinal(a.nome);
                                        setBusca('');
                                    }}>
                                    Revisar {a.nome} / {b.nome}
                                </button>
                            ))}
                        </div>
                    ) : <p className="text-xs text-slate-400">Nenhuma duplicata sugerida.</p>}
                    <input aria-label="Buscar colégio" value={busca} onChange={(e) => setBusca(e.target.value)}
                        placeholder="Buscar colégio" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
                    <div className="max-h-52 overflow-auto space-y-1">
                        {cadastros.filter((cadastro) => selecionados.includes(chaveColegio(cadastro)) ||
                            cadastro.nome.toLowerCase().includes(busca.trim().toLowerCase())).map((cadastro) => {
                            const chave = chaveColegio(cadastro);
                            return <label key={chave} className="flex gap-2 px-2 py-1.5 text-sm text-slate-200">
                                <input type="checkbox" checked={selecionados.includes(chave)} disabled={salvando}
                                    onChange={(e) => {
                                        const marcado = e.target.checked;
                                        setSelecionados((atuais) => marcado ? [...atuais, chave] : atuais.filter((id) => id !== chave));
                                    }} />
                                {cadastro.nome} · {cadastro.id === null ? 'nome nas fichas' : 'cadastro no catálogo'} · {cadastro.total_alunos} aluno(s)
                            </label>;
                        })}
                    </div>
                    <label className="block text-sm text-slate-200">Nome final do colégio
                        <input required minLength={2} maxLength={180} value={nomeFinal} onChange={(e) => setNomeFinal(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
                    </label>
                    <button type="submit" disabled={salvando || selecionados.length < 2}
                        className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                        Unificar selecionados ({selecionados.length})
                    </button>
                </form>
            )}

            {/* Colégios enviados por clientes via "Outros" */}
            {pendentes.length > 0 && (
                <div className="bg-amber-950/25 border border-amber-500/30 rounded-xl p-4 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">{textoR4("Colégios cadastrados por clientes (Outros)")}</h3>

                    <div className="space-y-3">
                        {pendentes.map((item) => (
                            <div
                                key={item.id}
                                className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                            >
                                <div className="flex-1 space-y-1">
                                    <input
                                        type="text"
                                        value={nomesEditados[item.id] ?? item.nome}
                                        onChange={(e) =>
                                            setNomesEditados((prev) => ({
                                                ...prev,
                                                [item.id]: e.target.value,
                                            }))
                                        }
                                        className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm text-white"
                                    />
                                    <span className="block text-[11px] text-slate-400">
                    {item.total_alunos}{' ' + textoR4("aluno(s) vinculado(s) a este registro")}</span>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={salvando}
                                        onClick={() =>
                                            executarAcao(
                                                {
                                                    acao: 'aprovar',
                                                    id: item.id,
                                                    nome: nomesEditados[item.id] ?? item.nome,
                                                },
                                                'Colégio aprovado e adicionado como opção oficial!'
                                            )
                                        }
                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                                    >{textoR4("Aprovar como oficial")}</button>

                                    {oficiais.length > 0 && (
                                        <div className="flex items-center gap-1.5">
                                            <select
                                                value={mesclarAlvo[item.id] || ''}
                                                onChange={(e) =>
                                                    setMesclarAlvo((prev) => ({
                                                        ...prev,
                                                        [item.id]: Number(e.target.value),
                                                    }))
                                                }
                                                className="rounded-lg bg-slate-900 border border-slate-700 px-2 py-1.5 text-xs text-slate-200"
                                            >
                                                <option value="">{textoR4("Mesclar com...")}</option>
                                                {oficiais.map((of) => (
                                                    <option key={of.id} value={of.id}>
                                                        {of.nome}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                disabled={salvando || !mesclarAlvo[item.id]}
                                                onClick={() =>
                                                    executarAcao(
                                                        {
                                                            acao: 'mesclar',
                                                            origemId: item.id,
                                                            destinoId: mesclarAlvo[item.id],
                                                        },
                                                        'Colégio mesclado com sucesso!'
                                                    )
                                                }
                                                className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-xs font-semibold text-white"
                                            >{textoR4("Mesclar")}</button>
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        disabled={salvando}
                                        onClick={() =>
                                            executarAcao(
                                                { acao: 'remover', id: item.id },
                                                'Registro removido.'
                                            )
                                        }
                                        className="px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600 border border-rose-500/40 text-xs text-rose-200 hover:text-white"
                                    >{textoR4("Excluir")}</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Adicionar novo colégio oficial */}
            <form onSubmit={handleAdicionar} className="flex flex-wrap gap-2">
                <input
                    type="text"
                    value={novoColegio}
                    onChange={(e) => setNovoColegio(e.target.value)}
                    placeholder={textoR4("Digite o nome de um novo colégio oficial...")}
                    className="flex-1 min-w-[240px] rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2 text-sm text-white"
                />
                <button
                    type="submit"
                    disabled={salvando}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                >{textoR4("+ Adicionar Colégio Oficial")}</button>
            </form>

            {/* Lista de colégios oficiais */}
            {carregando ? (
                <p className="text-xs text-slate-400">{textoR4("Carregando colégios...")}</p>
            ) : oficiais.length === 0 ? (
                <p className="text-xs text-slate-500">{textoR4("Nenhum colégio oficial cadastrado ainda.")}</p>
            ) : (
                <div className="flex flex-wrap gap-2">
                    {oficiais.map((col) => (
                        <div
                            key={col.id}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200"
                        >
                            <span>{col.nome}</span>
                            <span className="text-[10px] text-slate-500">
                ({col.total_alunos})
              </span>
                            <button
                                type="button"
                                onClick={() =>
                                    executarAcao(
                                        { acao: 'remover', id: col.id },
                                        'Colégio removido da lista oficial.'
                                    )
                                }
                                title={textoR4("Remover colégio")}
                                className="text-slate-500 hover:text-rose-400 ml-1"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}