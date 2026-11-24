'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Building2,
    Check,
    Loader2,
    RefreshCw,
    Search,
    Sparkles,
    Users,
} from 'lucide-react';
import { TemaClasses } from './types';

interface UnidadeItem {
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

export default function MatrizProfessoresUnidades({
                                                      classes,
                                                      onAlteradoAction,
                                                  }: {
    classes: TemaClasses;
    onAlteradoAction?: () => Promise<void>;
}) {
    const { clsCard, clsSubCard, clsInput, clsTitulo, clsSubtexto } = classes;

    const [carregando, setCarregando] = useState(true);
    const [unidades, setUnidades] = useState<UnidadeItem[]>([]);
    const [professores, setProfessores] = useState<ProfessorAgrupado[]>([]);
    const [busca, setBusca] = useState('');
    const [filtroUnidadeId, setFiltroUnidadeId] = useState<string>('todas');
    const [filtroStatus, setFiltroStatus] = useState<'ativos' | 'todos' | 'multi'>(
        'ativos'
    );
    const [salvandoChave, setSalvandoChave] = useState<string | null>(null);
    const [mesclando, setMesclando] = useState(false);
    const [feedback, setFeedback] = useState<{
        tipo: 'sucesso' | 'erro';
        texto: string;
    } | null>(null);

    const carregarMatriz = useCallback(async () => {
        setCarregando(true);
        try {
            const res = await fetch('/api/admin/professores-unidades', {
                cache: 'no-store',
            });
            if (res.ok) {
                const json = await res.json();
                setUnidades(json.unidades || []);
                setProfessores(json.professores || []);
            }
        } finally {
            setCarregando(false);
        }
    }, []);

    useEffect(() => {
        void carregarMatriz();
    }, [carregarMatriz]);

    async function alternarUnidadeProfessor(
        prof: ProfessorAgrupado,
        unidadeId: number
    ) {
        if (salvandoChave) return;

        const jaTem = prof.unidades_ids.includes(unidadeId);
        const novasUnidades = jaTem
            ? prof.unidades_ids.filter((id) => id !== unidadeId)
            : [...prof.unidades_ids, unidadeId];

        if (novasUnidades.length === 0) {
            setFeedback({
                tipo: 'erro',
                texto: `O(a) Prof. ${prof.nome} precisa ficar vinculado(a) a pelo menos 1 unidade.`,
            });
            return;
        }

        setSalvandoChave(prof.chave);
        setFeedback(null);

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

            const json = await res.json();
            if (!res.ok) {
                setFeedback({
                    tipo: 'erro',
                    texto: json.error || 'Falha ao atualizar unidades do professor.',
                });
                return;
            }

            setUnidades(json.unidades || unidades);
            setProfessores(json.professores || []);
            if (onAlteradoAction) await onAlteradoAction();
        } catch {
            setFeedback({
                tipo: 'erro',
                texto: 'Erro de conexão ao salvar unidade.',
            });
        } finally {
            setSalvandoChave(null);
        }
    }

    async function handleMesclarDuplicados() {
        setMesclando(true);
        setFeedback(null);
        try {
            const res = await fetch('/api/admin/professores-unidades', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ acao: 'mesclarDuplicados' }),
            });
            const json = await res.json();
            if (res.ok) {
                setProfessores(json.professores || []);
                setFeedback({
                    tipo: 'sucesso',
                    texto: 'Cadastros duplicados do mesmo professor foram unificados.',
                });
                if (onAlteradoAction) await onAlteradoAction();
            }
        } finally {
            setMesclando(false);
        }
    }

    const professoresFiltrados = useMemo(() => {
        const termo = busca.trim().toLowerCase();
        return professores.filter((p) => {
            if (filtroStatus === 'ativos' && !p.ativo) return false;
            if (filtroStatus === 'multi' && p.unidades_ids.length < 2) return false;

            if (filtroUnidadeId !== 'todas') {
                const uid = Number(filtroUnidadeId);
                if (!p.unidades_ids.includes(uid)) return false;
            }

            if (termo) {
                const matchNome = p.nome.toLowerCase().includes(termo);
                const matchMateria = (p.materias || []).some((m) =>
                    m.toLowerCase().includes(termo)
                );
                if (!matchNome && !matchMateria) return false;
            }

            return true;
        });
    }, [professores, busca, filtroUnidadeId, filtroStatus]);

    const totalMultiUnidade = useMemo(
        () => professores.filter((p) => p.unidades_ids.length >= 2).length,
        [professores]
    );

    return (
        <div className={`border rounded-2xl p-6 space-y-5 ${clsCard}`}>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-[#1496A1]" />
                        <h3 className={`text-sm sm:text-base font-bold ${clsTitulo}`}>
                            Distribuição Rápida de Professores por Unidade
                        </h3>
                    </div>
                    <p className={`text-xs mt-1 ${clsSubtexto}`}>
                        Clique nos botões de unidade ao lado de cada professor para ativar
                        ou remover o atendimento na hora. Total:{' '}
                        <strong>{professores.length}</strong> professores (
                        <strong>{totalMultiUnidade}</strong> em 2 ou mais unidades).
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void handleMesclarDuplicados()}
                        disabled={mesclando}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${clsSubCard} ${clsTitulo} hover:border-[#0E7C86]`}
                    >
                        {mesclando ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        Unificar Duplicados
                    </button>

                    <button
                        type="button"
                        onClick={() => void carregarMatriz()}
                        disabled={carregando}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${clsSubCard} ${clsTitulo} hover:border-[#0E7C86]`}
                    >
                        <RefreshCw
                            className={`w-3.5 h-3.5 ${carregando ? 'animate-spin' : ''}`}
                        />
                        Atualizar Lista
                    </button>
                </div>
            </div>

            {feedback && (
                <div
                    className={`rounded-xl px-4 py-2.5 text-xs font-medium border ${
                        feedback.tipo === 'erro'
                            ? 'bg-[#BE1E23]/15 border-[#BE1E23]/40 text-rose-400'
                            : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                    }`}
                >
                    {feedback.texto}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-6 relative">
                    <Search
                        className={`w-4 h-4 absolute left-3.5 top-3 ${clsSubtexto}`}
                    />
                    <input
                        type="text"
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        placeholder="Buscar professor por nome ou matéria..."
                        className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none ${clsInput}`}
                    />
                </div>

                <div className="md:col-span-3">
                    <select
                        value={filtroUnidadeId}
                        onChange={(e) => setFiltroUnidadeId(e.target.value)}
                        className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none ${clsInput}`}
                    >
                        <option value="todas">Todas as unidades</option>
                        {unidades.map((u) => (
                            <option key={u.id} value={String(u.id)}>
                                Somente {u.nome}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="md:col-span-3">
                    <select
                        value={filtroStatus}
                        onChange={(e) =>
                            setFiltroStatus(
                                e.target.value as 'ativos' | 'todos' | 'multi'
                            )
                        }
                        className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none ${clsInput}`}
                    >
                        <option value="ativos">Apenas ativos</option>
                        <option value="multi">
                            Multi-unidade ({totalMultiUnidade})
                        </option>
                        <option value="todos">Todos (ativos + inativos)</option>
                    </select>
                </div>
            </div>

            {carregando ? (
                <div className={`py-12 flex items-center justify-center gap-2 text-sm ${clsSubtexto}`}>
                    <Loader2 className="w-4 h-4 animate-spin text-[#1496A1]" />
                    Carregando professores...
                </div>
            ) : professoresFiltrados.length === 0 ? (
                <div className={`py-10 text-center text-sm ${clsSubtexto}`}>
                    Nenhum professor encontrado com os filtros atuais.
                </div>
            ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                    {professoresFiltrados.map((prof) => {
                        const estaSalvando = salvandoChave === prof.chave;

                        return (
                            <div
                                key={prof.chave}
                                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl border transition ${clsSubCard} ${
                                    !prof.ativo ? 'opacity-60' : ''
                                }`}
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`font-bold text-sm truncate ${clsTitulo}`}>
                                            {prof.nome}
                                        </span>
                                        {prof.unidades_ids.length > 1 && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#0E7C86]/20 text-[#25A4AF] border border-[#0E7C86]/40">
                                                <Users className="w-3 h-3" />
                                                {prof.unidades_ids.length} unidades
                                            </span>
                                        )}
                                        {!prof.ativo && (
                                            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-stone-500/20 text-stone-400">
                                                Inativo
                                            </span>
                                        )}
                                    </div>
                                    <p className={`text-xs truncate mt-0.5 ${clsSubtexto}`}>
                                        {(prof.materias || []).join(', ') || 'Sem matérias'}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap shrink-0">
                                    {estaSalvando && (
                                        <Loader2 className="w-4 h-4 animate-spin text-[#1496A1] mr-1" />
                                    )}
                                    {unidades.map((u) => {
                                        const ativoNaUnidade = prof.unidades_ids.includes(u.id);
                                        return (
                                            <button
                                                key={u.id}
                                                type="button"
                                                disabled={estaSalvando}
                                                onClick={() =>
                                                    void alternarUnidadeProfessor(prof, u.id)
                                                }
                                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                                                    ativoNaUnidade
                                                        ? 'bg-[#0E7C86] text-white border-[#1496A1] shadow-xs'
                                                        : `${clsCard} ${clsSubtexto} hover:border-[#0E7C86]`
                                                }`}
                                            >
                                                {ativoNaUnidade && (
                                                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                                )}
                                                {u.nome}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}