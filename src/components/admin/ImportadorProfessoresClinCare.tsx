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

interface UnidadeSimples {
    id: number;
    nome: string;
}

interface ProfessorAgrupado {
    chave: string;
    clin_care_id: string | null;
    nome: string;
    unidades_ids: number[];
    materias: string[];
    hora_inicio: string;
    hora_fim: string;
    ativo: boolean;
    registros_ids: number[];
}

export default function ImportadorProfessoresClinCare() {
    const [textoIds, setTextoIds] = useState('');
    const [itens, setItens] = useState<ItemImportacao[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [sucesso, setSucesso] = useState<string | null>(null);

    // Estado do Editor de Unidades e Matérias dos Professores
    const [unidades, setUnidades] = useState<UnidadeSimples[]>([]);
    const [professores, setProfessores] = useState<ProfessorAgrupado[]>([]);
    const [totalBruto, setTotalBruto] = useState(0);
    const [buscaProf, setBuscaProf] = useState('');
    const [filtroUnidadeId, setFiltroUnidadeId] = useState<number | 'todas'>('todas');
    const [permitirMultiUnidade, setPermitirMultiUnidade] = useState(false);
    const [salvandoChave, setSalvandoChave] = useState<string | null>(null);

    async function carregarLista() {
        setCarregando(true);
        try {
            const [resImp, resProf] = await Promise.all([
                fetch('/api/admin/importar-professores', { cache: 'no-store' }),
                fetch('/api/admin/professores-unidades', { cache: 'no-store' }),
            ]);

            if (resImp.ok) {
                const dataImp = await resImp.json();
                setItens(dataImp.itens || []);
            }

            if (resProf.ok) {
                const dataProf = await resProf.json();
                setUnidades(dataProf.unidades || []);
                setProfessores(dataProf.professores || []);
                setTotalBruto(dataProf.totalRegistrosBrutos || 0);
            }
        } catch {
            setErro('Falha de rede ao consultar dados do servidor.');
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
            if (Array.isArray(data.itens)) setItens(data.itens);
            setSucesso(
                `${data.total} ID(s) gravado(s)! Execute "Run workflow" no GitHub Actions para importar.`
            );
        } finally {
            setSalvando(false);
        }
    }

    async function handleAcaoFila(payload: Record<string, boolean>, msgSucesso: string) {
        setSalvando(true);
        setErro(null);
        setSucesso(null);

        try {
            const res = await fetch('/api/admin/importar-professores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (!res.ok) {
                setErro(data.error || 'Não foi possível agendar a tarefa.');
                return;
            }

            if (Array.isArray(data.itens)) setItens(data.itens);
            setSucesso(msgSucesso);
        } finally {
            setSalvando(false);
        }
    }

    async function handleMesclarDuplicados() {
        setSalvando(true);
        setErro(null);
        setSucesso(null);

        try {
            const res = await fetch('/api/admin/professores-unidades', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ acao: 'mesclarDuplicados' }),
            });
            const data = await res.json();
            if (res.ok) {
                setUnidades(data.unidades || []);
                setProfessores(data.professores || []);
                setTotalBruto(data.totalRegistrosBrutos || 0);
                setSucesso('Professores duplicados juntados em um único registro cada!');
            }
        } finally {
            setSalvando(false);
        }
    }

    async function handleClicarUnidade(prof: ProfessorAgrupado, unidadeId: number) {
        let novasUnidades: number[];

        if (!permitirMultiUnidade) {
            novasUnidades = [unidadeId];
        } else if (prof.unidades_ids.includes(unidadeId)) {
            if (prof.unidades_ids.length === 1) return; // Mantém ao menos 1 unidade
            novasUnidades = prof.unidades_ids.filter((id) => id !== unidadeId);
        } else {
            novasUnidades = [...prof.unidades_ids, unidadeId];
        }

        setSalvandoChave(prof.chave);
        try {
            const res = await fetch('/api/admin/professores-unidades', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    acao: 'atualizarUnidades',
                    registrosIds: prof.registros_ids,
                    unidadesIds: novasUnidades,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setProfessores(data.professores || []);
                setTotalBruto(data.totalRegistrosBrutos || 0);
            } else {
                setErro(data.error || 'Erro ao atualizar unidade.');
            }
        } finally {
            setSalvandoChave(null);
        }
    }

    async function handleAlternarAtivo(prof: ProfessorAgrupado) {
        setSalvandoChave(prof.chave);
        try {
            const res = await fetch('/api/admin/professores-unidades', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    acao: 'alternarAtivo',
                    registrosIds: prof.registros_ids,
                    ativo: !prof.ativo,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setProfessores(data.professores || []);
            }
        } finally {
            setSalvandoChave(null);
        }
    }

    const professoresFiltrados = professores.filter((p) => {
        const matchNome =
            !buscaProf.trim() ||
            p.nome.toLowerCase().includes(buscaProf.trim().toLowerCase()) ||
            p.materias.some((m) =>
                m.toLowerCase().includes(buscaProf.trim().toLowerCase())
            );

        const matchUnidade =
            filtroUnidadeId === 'todas' || p.unidades_ids.includes(filtroUnidadeId);

        return matchNome && matchUnidade;
    });

    const temDuplicados = totalBruto > professores.length;

    return (
        <div className="space-y-6">
            {/* Bloco 1: Editor Rápido de Unidades e Matérias dos Professores */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-white">
                            Unidades e Matérias dos Professores ({professores.length})
                        </h2>
                        <p className="text-sm text-slate-400 mt-1">
                            Clique na unidade de cada professor para salvar automaticamente. As matérias são importadas de &quot;Serviços e Valores&quot; no Clin Care.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {temDuplicados && (
                            <button
                                type="button"
                                onClick={handleMesclarDuplicados}
                                disabled={salvando}
                                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white transition"
                            >
                                Juntar Duplicados ({totalBruto} → {professores.length})
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() =>
                                handleAcaoFila(
                                    { reimportarMaterias: true },
                                    'Reimportação de matérias agendada! Execute "Run workflow" no GitHub Actions para ler Serviços e Valores de cada professor.'
                                )
                            }
                            disabled={salvando}
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white transition"
                        >
                            Reimportar Matérias (Serviços e Valores)
                        </button>
                    </div>
                </div>

                {/* Filtros e Modo Multi-Unidade */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                    <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
                        <input
                            type="text"
                            value={buscaProf}
                            onChange={(e) => setBuscaProf(e.target.value)}
                            placeholder="Buscar por nome ou matéria..."
                            className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 w-64"
                        />

                        <select
                            value={filtroUnidadeId}
                            onChange={(e) =>
                                setFiltroUnidadeId(
                                    e.target.value === 'todas' ? 'todas' : Number(e.target.value)
                                )
                            }
                            className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                        >
                            <option value="todas">Todas as unidades</option>
                            {unidades.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.nome}
                                </option>
                            ))}
                        </select>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={permitirMultiUnidade}
                            onChange={(e) => setPermitirMultiUnidade(e.target.checked)}
                            className="rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-0"
                        />
                        Permitir selecionar mais de 1 unidade por professor
                    </label>
                </div>

                <div className="overflow-x-auto border border-slate-800 rounded-xl max-h-[520px] overflow-y-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-slate-950 text-slate-400 uppercase sticky top-0 z-10">
                        <tr>
                            <th className="px-3 py-2.5">Professor</th>
                            <th className="px-3 py-2.5">Unidade(s)</th>
                            <th className="px-3 py-2.5">Matérias (Serviços Ativos)</th>
                            <th className="px-3 py-2.5 text-right">Status</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                        {carregando ? (
                            <tr>
                                <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                                    Carregando professores...
                                </td>
                            </tr>
                        ) : professoresFiltrados.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                                    Nenhum professor encontrado para este filtro.
                                </td>
                            </tr>
                        ) : (
                            professoresFiltrados.map((prof) => {
                                const ocupado = salvandoChave === prof.chave;
                                return (
                                    <tr
                                        key={prof.chave}
                                        className={!prof.ativo ? 'opacity-50 bg-slate-950/30' : ''}
                                    >
                                        <td className="px-3 py-2.5 font-medium text-white whitespace-nowrap">
                                            {prof.nome}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <div className="flex flex-wrap gap-1.5">
                                                {unidades.map((u) => {
                                                    const selecionada = prof.unidades_ids.includes(u.id);
                                                    return (
                                                        <button
                                                            key={u.id}
                                                            type="button"
                                                            disabled={ocupado}
                                                            onClick={() => handleClicarUnidade(prof, u.id)}
                                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition border ${
                                                                selecionada
                                                                    ? 'bg-emerald-600/25 border-emerald-500 text-emerald-300'
                                                                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                                                            }`}
                                                        >
                                                            {u.nome}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <div className="flex flex-wrap gap-1">
                                                {prof.materias.map((mat, idx) => (
                                                    <span
                                                        key={`${prof.chave}-${idx}`}
                                                        className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 text-[11px]"
                                                    >
                              {mat}
                            </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                            <button
                                                type="button"
                                                disabled={ocupado}
                                                onClick={() => handleAlternarAtivo(prof)}
                                                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                                                    prof.ativo
                                                        ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                                                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                                }`}
                                            >
                                                {prof.ativo ? 'Ativo' : 'Inativo'}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Bloco 2: Sincronização e Descoberta com Clin Care */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-white">
                            Importação Automática de Professores (Clin Care)
                        </h2>
                        <p className="text-sm text-slate-400 mt-1">
                            Descubra novos profissionais de /painel/profissionais ou cole IDs específicos abaixo.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() =>
                            handleAcaoFila(
                                { descobrirTodos: true },
                                'Varredura agendada! Execute "Run workflow" no GitHub Actions para descobrir novos profissionais.'
                            )
                        }
                        disabled={salvando}
                        className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-sm font-medium text-white transition"
                    >
                        {salvando ? 'Agendando...' : 'Descobrir Novos do Clin Care'}
                    </button>
                </div>

                <form onSubmit={handleSalvarIds} className="space-y-3">
          <textarea
              rows={2}
              value={textoIds}
              onChange={(e) => setTextoIds(e.target.value)}
              placeholder="Opcional: cole IDs (UUID) de profissionais específicos..."
              className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
          />

                    <button
                        type="submit"
                        disabled={salvando || !textoIds.trim()}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-medium text-white transition"
                    >
                        Salvar IDs Específicos
                    </button>

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

                {itens.length > 0 && (
                    <p className="text-xs text-slate-400">
                        Fila Clin Care: {itens.filter((i) => i.clin_care_id !== '__TODOS__').length}{' '}
                        profissional(is) mapeado(s).
                    </p>
                )}
            </section>
        </div>
    );
}