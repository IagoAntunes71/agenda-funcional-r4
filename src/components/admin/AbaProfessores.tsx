'use client';

import { useMemo, useState } from 'react';
import {
    Check,
    Edit3,
    Plus,
    Save,
    Search,
    Sun,
    UserPlus,
    X,
} from 'lucide-react';
import {
    MapaMateriasSeries,
    SERIES_ENSINO_MEDIO,
    SERIES_ESCOLARES,
    SERIES_FUNDAMENTAL_1,
    SERIES_FUNDAMENTAL_2,
    SERIES_FUNDAMENTAL_COMPLETO,
    resumirSeriesCurto,
} from '@/lib/cliente-helpers';
import { gerarTodosSlotsProfessor } from '@/lib/horarios-reforco';
import { ProfessorAdmin, TemaClasses, UnidadeAdmin } from './types';

function extrairListaMaterias(texto: string): string[] {
    return Array.from(
        new Set(
            texto
                .split(',')
                .map((m) => m.trim())
                .filter(Boolean)
        )
    );
}

interface ProfessorAgrupadoLista extends ProfessorAdmin {
    unidades_ids: number[];
    unidades_nomes: string[];
}

function SeletorSeriesPorMateria({
                                     materiasTexto,
                                     mapaAtual,
                                     onChangeMapa,
                                     escuro,
                                 }: {
    materiasTexto: string;
    mapaAtual: MapaMateriasSeries;
    onChangeMapa: (novo: MapaMateriasSeries) => void;
    escuro: boolean;
}) {
    const listaMaterias = extrairListaMaterias(materiasTexto);
    if (listaMaterias.length === 0) return null;

    function obterSeriesMateria(materia: string): string[] {
        const chave = Object.keys(mapaAtual).find(
            (k) => k.trim().toLowerCase() === materia.toLowerCase()
        );
        return chave && Array.isArray(mapaAtual[chave]) ? mapaAtual[chave] : [];
    }

    function definirSeriesMateria(materia: string, novasSeries: string[]) {
        const proximo: MapaMateriasSeries = {};
        for (const [k, v] of Object.entries(mapaAtual)) {
            if (k.trim().toLowerCase() !== materia.toLowerCase() && v.length > 0) {
                proximo[k] = v;
            }
        }
        if (novasSeries.length > 0) {
            proximo[materia] = novasSeries;
        }
        onChangeMapa(proximo);
    }

    function alternarSerie(materia: string, serie: string) {
        const atuais = obterSeriesMateria(materia);
        const existe = atuais.includes(serie);
        const atualizadas = existe
            ? atuais.filter((s) => s !== serie)
            : SERIES_ESCOLARES.filter((s) => atuais.includes(s) || s === serie);
        definirSeriesMateria(materia, atualizadas);
    }

    return (
        <div
            className={`border rounded-xl p-3.5 space-y-3 ${
                escuro
                    ? 'bg-[#0E1217] border-[#232B35]'
                    : 'bg-stone-50 border-stone-200/80'
            }`}
        >
            <div>
                <p className="text-xs font-bold text-[#1496A1]">
                    Séries permitidas por matéria
                </p>
                <p
                    className={`text-[11px] ${
                        escuro ? 'text-stone-400' : 'text-stone-500'
                    }`}
                >
                    Deixe em <strong>Todas as séries</strong> ou clique nas séries
                    específicas para restringir o agendamento dos pais.
                </p>
            </div>

            <div className="space-y-3">
                {listaMaterias.map((mat) => {
                    const selecionadas = obterSeriesMateria(mat);
                    const todasAtivas = selecionadas.length === 0;

                    return (
                        <div
                            key={mat}
                            className={`border rounded-xl p-3 space-y-2.5 ${
                                escuro
                                    ? 'bg-[#151A21] border-[#232B35]'
                                    : 'bg-white border-stone-200'
                            }`}
                        >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span
                                    className={`text-xs font-bold ${
                                        escuro ? 'text-stone-100' : 'text-stone-900'
                                    }`}
                                >
                                    {mat}
                                </span>
                                <span className="text-[11px] font-semibold text-[#1496A1]">
                                    {resumirSeriesCurto(selecionadas)}
                                </span>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => definirSeriesMateria(mat, [])}
                                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold border cursor-pointer ${
                                        todasAtivas
                                            ? 'bg-[#0E7C86] border-[#1496A1] text-white'
                                            : escuro
                                                ? 'bg-[#0E1217] border-[#232B35] text-stone-400'
                                                : 'bg-stone-100 border-stone-200 text-stone-600'
                                    }`}
                                >
                                    Todas as séries
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        definirSeriesMateria(mat, SERIES_FUNDAMENTAL_1)
                                    }
                                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold border cursor-pointer ${
                                        escuro
                                            ? 'bg-[#0E1217] border-[#232B35] text-stone-300 hover:border-[#0E7C86]'
                                            : 'bg-stone-100 border-stone-200 text-stone-700 hover:border-[#0E7C86]'
                                    }`}
                                >
                                    Fund. I (1º-5º)
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        definirSeriesMateria(mat, SERIES_FUNDAMENTAL_2)
                                    }
                                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold border cursor-pointer ${
                                        escuro
                                            ? 'bg-[#0E1217] border-[#232B35] text-stone-300 hover:border-[#0E7C86]'
                                            : 'bg-stone-100 border-stone-200 text-stone-700 hover:border-[#0E7C86]'
                                    }`}
                                >
                                    Fund. II (6º-9º)
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        definirSeriesMateria(mat, SERIES_FUNDAMENTAL_COMPLETO)
                                    }
                                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold border cursor-pointer ${
                                        escuro
                                            ? 'bg-[#0E1217] border-[#232B35] text-stone-300 hover:border-[#0E7C86]'
                                            : 'bg-stone-100 border-stone-200 text-stone-700 hover:border-[#0E7C86]'
                                    }`}
                                >
                                    Fundamental (1º-9º)
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        definirSeriesMateria(mat, SERIES_ENSINO_MEDIO)
                                    }
                                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold border cursor-pointer ${
                                        escuro
                                            ? 'bg-[#0E1217] border-[#232B35] text-stone-300 hover:border-[#0E7C86]'
                                            : 'bg-stone-100 border-stone-200 text-stone-700 hover:border-[#0E7C86]'
                                    }`}
                                >
                                    Médio + ENEM
                                </button>
                            </div>

                            <div className="flex flex-wrap gap-1">
                                {SERIES_ESCOLARES.map((serie) => {
                                    const marcada = selecionadas.includes(serie);
                                    const rotuloCurto = serie
                                        .replace(' - Ensino Fundamental', ' Fund.')
                                        .replace(' - Ensino Médio', ' Médio')
                                        .replace('Pré-Vestibular / ENEM', 'ENEM')
                                        .replace('Outra Série / Curso', 'Outros');

                                    return (
                                        <button
                                            key={serie}
                                            type="button"
                                            onClick={() => alternarSerie(mat, serie)}
                                            className={`px-2 py-0.5 rounded-md text-[10px] font-medium border transition cursor-pointer ${
                                                marcada
                                                    ? 'bg-[#0E7C86]/25 border-[#1496A1] text-[#39B8C4]'
                                                    : escuro
                                                        ? 'bg-[#0E1217] border-[#232B35] text-stone-400 hover:text-stone-200'
                                                        : 'bg-stone-50 border-stone-200 text-stone-500 hover:text-stone-800'
                                            }`}
                                        >
                                            {rotuloCurto}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function AbaProfessores({
                                           unidades,
                                           professores,
                                           escuro,
                                           classes,
                                           onRecarregarDados,
                                       }: {
    unidades: UnidadeAdmin[];
    professores: ProfessorAdmin[];
    escuro: boolean;
    classes: TemaClasses;
    onRecarregarDados: () => Promise<void>;
}) {
    const { clsCard, clsSubCard, clsInput, clsTitulo, clsSubtexto } = classes;

    const [buscaProf, setBuscaProf] = useState('');
    const [filtroUnidadeLista, setFiltroUnidadeLista] = useState('todas');

    const [profNome, setProfNome] = useState('');
    const [profClinCareId, setProfClinCareId] = useState('');
    const [profUnidadesIds, setProfUnidadesIds] = useState<number[]>(() =>
        unidades[0]?.id ? [unidades[0].id] : []
    );
    const [profMaterias, setProfMaterias] = useState('');
    const [profMateriasSeries, setProfMateriasSeries] =
        useState<MapaMateriasSeries>({});
    const [profManhaAtivo, setProfManhaAtivo] = useState(false);
    const [profManhaInicio, setProfManhaInicio] = useState('08:00');
    const [profManhaFim, setProfManhaFim] = useState('11:20');
    const [profInicio, setProfInicio] = useState('14:10');
    const [profFim, setProfFim] = useState('20:50');
    const [cadastrandoProf, setCadastrandoProf] = useState(false);

    const [editProfId, setEditProfId] = useState<number | null>(null);
    const [editProfNome, setEditProfNome] = useState('');
    const [editProfClinCareId, setEditProfClinCareId] = useState('');
    const [editProfUnidadesIds, setEditProfUnidadesIds] = useState<number[]>([]);
    const [editProfMaterias, setEditProfMaterias] = useState('');
    const [editProfMateriasSeries, setEditProfMateriasSeries] =
        useState<MapaMateriasSeries>({});
    const [editProfManhaAtivo, setEditProfManhaAtivo] = useState(false);
    const [editProfManhaInicio, setEditProfManhaInicio] = useState('08:00');
    const [editProfManhaFim, setEditProfManhaFim] = useState('11:20');
    const [editProfInicio, setEditProfInicio] = useState('14:10');
    const [editProfFim, setEditProfFim] = useState('20:50');
    const [salvandoProf, setSalvandoProf] = useState(false);

    const unidadesAtivas = useMemo(
        () => unidades.filter((u) => u.ativa !== false),
        [unidades]
    );

    const unidadesNovoEfetivas = useMemo(() => {
        if (profUnidadesIds.length > 0) return profUnidadesIds;
        return unidadesAtivas[0]?.id ? [unidadesAtivas[0].id] : [];
    }, [profUnidadesIds, unidadesAtivas]);

    const professoresAgrupados = useMemo(() => {
        const mapa = new Map<string, ProfessorAgrupadoLista>();
        for (const p of professores) {
            const chave = p.clin_care_id
                ? `cc:${p.clin_care_id}`
                : `nm:${p.nome.trim().toLowerCase()}`;

            const existente = mapa.get(chave);
            if (!existente) {
                mapa.set(chave, {
                    ...p,
                    unidades_ids: [p.unidade_id],
                    unidades_nomes: [p.unidade_nome],
                });
            } else {
                if (!existente.unidades_ids.includes(p.unidade_id)) {
                    existente.unidades_ids.push(p.unidade_id);
                    existente.unidades_nomes.push(p.unidade_nome);
                }
                existente.ativo = existente.ativo || p.ativo;
            }
        }
        return Array.from(mapa.values()).sort((a, b) =>
            a.nome.localeCompare(b.nome, 'pt-BR')
        );
    }, [professores]);

    const professoresFiltrados = useMemo(() => {
        const termo = buscaProf.trim().toLowerCase();
        return professoresAgrupados.filter((p) => {
            if (filtroUnidadeLista !== 'todas') {
                const uid = Number(filtroUnidadeLista);
                if (!p.unidades_ids.includes(uid)) return false;
            }
            if (termo) {
                const bateNome = p.nome.toLowerCase().includes(termo);
                const bateMat = (p.materias || []).some((m) =>
                    m.toLowerCase().includes(termo)
                );
                if (!bateNome && !bateMat) return false;
            }
            return true;
        });
    }, [professoresAgrupados, buscaProf, filtroUnidadeLista]);

    function alternarUnidadeNovo(uid: number) {
        setProfUnidadesIds((prev) => {
            const base =
                prev.length > 0
                    ? prev
                    : unidadesAtivas[0]?.id
                        ? [unidadesAtivas[0].id]
                        : [];
            if (base.includes(uid)) {
                return base.length > 1 ? base.filter((id) => id !== uid) : base;
            }
            return [...base, uid];
        });
    }

    function alternarUnidadeEdicao(uid: number) {
        setEditProfUnidadesIds((prev) => {
            if (prev.includes(uid)) {
                return prev.length > 1 ? prev.filter((id) => id !== uid) : prev;
            }
            return [...prev, uid];
        });
    }

    async function handleAdicionarProfessor(e: React.FormEvent) {
        e.preventDefault();
        if (
            !profNome.trim() ||
            !profMaterias.trim() ||
            unidadesNovoEfetivas.length === 0
        ) {
            return;
        }
        setCadastrandoProf(true);
        try {
            await fetch('/api/admin/professores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome: profNome,
                    clin_care_id: profClinCareId,
                    unidade_id: unidadesNovoEfetivas[0],
                    unidades_ids: unidadesNovoEfetivas,
                    materias: profMaterias,
                    materias_series: profMateriasSeries,
                    manha_ativo: profManhaAtivo,
                    manha_inicio: profManhaInicio,
                    manha_fim: profManhaFim,
                    hora_inicio: profInicio,
                    hora_fim: profFim,
                }),
            });
            setProfNome('');
            setProfClinCareId('');
            setProfMaterias('');
            setProfMateriasSeries({});
            setProfManhaAtivo(false);
            await onRecarregarDados();
        } finally {
            setCadastrandoProf(false);
        }
    }

    function iniciarEdicaoProfessor(p: ProfessorAgrupadoLista) {
        setEditProfId(p.id);
        setEditProfNome(p.nome);
        setEditProfClinCareId(p.clin_care_id || '');
        setEditProfUnidadesIds(
            p.unidades_ids.length > 0 ? [...p.unidades_ids] : [p.unidade_id]
        );
        setEditProfMaterias((p.materias || []).join(', '));
        setEditProfMateriasSeries(p.materias_series || {});
        setEditProfManhaAtivo(Boolean(p.manha_ativo));
        setEditProfManhaInicio(p.manha_inicio || '08:00');
        setEditProfManhaFim(p.manha_fim || '11:20');
        setEditProfInicio(p.hora_inicio || '14:10');
        setEditProfFim(p.hora_fim || '20:50');
    }

    async function salvarEdicaoProfessor(e: React.FormEvent) {
        e.preventDefault();
        if (
            !editProfId ||
            !editProfNome.trim() ||
            !editProfMaterias.trim() ||
            editProfUnidadesIds.length === 0
        ) {
            return;
        }
        setSalvandoProf(true);
        try {
            await fetch('/api/admin/professores', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editProfId,
                    nome: editProfNome,
                    clin_care_id: editProfClinCareId,
                    unidade_id: editProfUnidadesIds[0],
                    unidades_ids: editProfUnidadesIds,
                    materias: editProfMaterias,
                    materias_series: editProfMateriasSeries,
                    manha_ativo: editProfManhaAtivo,
                    manha_inicio: editProfManhaInicio,
                    manha_fim: editProfManhaFim,
                    hora_inicio: editProfInicio,
                    hora_fim: editProfFim,
                }),
            });
            setEditProfId(null);
            await onRecarregarDados();
        } finally {
            setSalvandoProf(false);
        }
    }

    async function alternarProfessor(id: number, ativo: boolean) {
        await fetch('/api/admin/professores', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ativo }),
        });
        await onRecarregarDados();
    }

    const previewSlotsNovoProf = gerarTodosSlotsProfessor({
        manha_ativo: profManhaAtivo,
        manha_inicio: profManhaInicio,
        manha_fim: profManhaFim,
        hora_inicio: profInicio,
        hora_fim: profFim,
    });

    return (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <form
                onSubmit={(e) => void handleAdicionarProfessor(e)}
                className={`lg:col-span-5 border rounded-2xl p-6 space-y-4 ${clsCard}`}
            >
                <h3
                    className={`text-sm font-bold flex items-center gap-2 ${clsTitulo}`}
                >
                    <UserPlus className="w-4 h-4 text-[#1496A1]" />
                    Cadastrar Professor
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                        <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                            Nome *
                        </label>
                        <input
                            type="text"
                            required
                            placeholder="Ex: Fernanda Lima"
                            value={profNome}
                            onChange={(e) => setProfNome(e.target.value)}
                            className={`w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                        />
                    </div>

                    <div>
                        <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                            ID Clin Care
                        </label>
                        <input
                            type="text"
                            placeholder="Ex: 142"
                            value={profClinCareId}
                            onChange={(e) => setProfClinCareId(e.target.value)}
                            className={`w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                        />
                    </div>
                </div>

                <div className={`border rounded-xl p-3 space-y-2 ${clsSubCard}`}>
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[#1496A1]">
                            Unidades de Atendimento *
                        </label>
                        <span className={`text-[11px] ${clsSubtexto}`}>
                            Clique para marcar 1 ou mais
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {unidadesAtivas.map((u) => {
                            const selecionada = unidadesNovoEfetivas.includes(u.id);
                            return (
                                <button
                                    key={u.id}
                                    type="button"
                                    onClick={() => alternarUnidadeNovo(u.id)}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                                        selecionada
                                            ? 'bg-[#0E7C86] border-[#1496A1] text-white'
                                            : `${clsCard} ${clsSubtexto} hover:border-[#0E7C86]`
                                    }`}
                                >
                                    {selecionada && <Check className="w-3.5 h-3.5" />}
                                    {u.nome}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div>
                    <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                        Matérias (separadas por vírgula) *
                    </label>
                    <input
                        type="text"
                        required
                        placeholder="Ex: Matemática, Geografia"
                        value={profMaterias}
                        onChange={(e) => setProfMaterias(e.target.value)}
                        className={`w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                    />
                </div>

                <SeletorSeriesPorMateria
                    materiasTexto={profMaterias}
                    mapaAtual={profMateriasSeries}
                    onChangeMapa={setProfMateriasSeries}
                    escuro={escuro}
                />

                <div className={`border rounded-xl p-3.5 space-y-3 ${clsSubCard}`}>
                    <label className="flex items-center gap-2.5 text-xs font-semibold text-[#D96B43] cursor-pointer">
                        <input
                            type="checkbox"
                            checked={profManhaAtivo}
                            onChange={(e) => setProfManhaAtivo(e.target.checked)}
                        />
                        <Sun className="w-4 h-4" />
                        Liberar manhã (turnos de 100 min)
                    </label>

                    {profManhaAtivo && (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label
                                    className={`block text-[11px] mb-1 ${clsSubtexto}`}
                                >
                                    Início Manhã
                                </label>
                                <input
                                    type="time"
                                    value={profManhaInicio}
                                    onChange={(e) => setProfManhaInicio(e.target.value)}
                                    className={`w-full border rounded-lg px-3 py-2 text-xs ${clsInput}`}
                                />
                            </div>
                            <div>
                                <label
                                    className={`block text-[11px] mb-1 ${clsSubtexto}`}
                                >
                                    Fim Manhã
                                </label>
                                <input
                                    type="time"
                                    value={profManhaFim}
                                    onChange={(e) => setProfManhaFim(e.target.value)}
                                    className={`w-full border rounded-lg px-3 py-2 text-xs ${clsInput}`}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                            Início Tarde
                        </label>
                        <input
                            type="time"
                            value={profInicio}
                            onChange={(e) => setProfInicio(e.target.value)}
                            className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                        />
                    </div>
                    <div>
                        <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                            Fim Tarde
                        </label>
                        <input
                            type="time"
                            value={profFim}
                            onChange={(e) => setProfFim(e.target.value)}
                            className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                        />
                    </div>
                </div>

                {previewSlotsNovoProf.length > 0 && (
                    <div
                        className={`text-[11px] border rounded-xl p-2.5 ${clsSubCard} ${clsSubtexto}`}
                    >
                        <strong className="text-[#1496A1]">
                            Turnos ({previewSlotsNovoProf.length}):
                        </strong>{' '}
                        {previewSlotsNovoProf.map((s) => s.label).join(' • ')}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={cadastrandoProf}
                    className="w-full py-3 px-4 bg-[#0E7C86] hover:bg-[#118E99] disabled:opacity-50 text-white font-semibold rounded-xl text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                    <Plus className="w-4 h-4" />
                    {cadastrandoProf ? 'Cadastrando...' : 'Cadastrar Professor'}
                </button>
            </form>

            <div
                className={`lg:col-span-7 border rounded-2xl p-6 space-y-4 ${clsCard}`}
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className={`text-sm font-bold ${clsTitulo}`}>
                        Professores Cadastrados ({professoresFiltrados.length})
                    </h3>

                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-52">
                            <Search
                                className={`w-3.5 h-3.5 absolute left-3 top-2.5 ${clsSubtexto}`}
                            />
                            <input
                                type="text"
                                value={buscaProf}
                                onChange={(e) => setBuscaProf(e.target.value)}
                                placeholder="Buscar professor ou matéria..."
                                className={`w-full border rounded-xl pl-8 pr-3 py-1.5 text-xs focus:outline-none ${clsInput}`}
                            />
                        </div>

                        <select
                            value={filtroUnidadeLista}
                            onChange={(e) => setFiltroUnidadeLista(e.target.value)}
                            className={`border rounded-xl px-3 py-1.5 text-xs focus:outline-none ${clsInput}`}
                        >
                            <option value="todas">Todas unidades</option>
                            {unidadesAtivas.map((u) => (
                                <option key={u.id} value={String(u.id)}>
                                    {u.nome}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="space-y-2.5 max-h-[760px] overflow-y-auto pr-1">
                    {professoresFiltrados.map((p) => {
                        const editandoEste = editProfId === p.id;
                        const slotsProf = gerarTodosSlotsProfessor(p);
                        const mapaSeries = p.materias_series || {};

                        if (editandoEste) {
                            return (
                                <form
                                    key={p.id}
                                    onSubmit={(e) => void salvarEdicaoProfessor(e)}
                                    className={`border border-[#0E7C86] rounded-xl p-4 space-y-3 ${clsSubCard}`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold uppercase text-[#1496A1]">
                                            Editando Professor(a)
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setEditProfId(null)}
                                            className={`cursor-pointer ${clsSubtexto}`}
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <input
                                        type="text"
                                        required
                                        value={editProfNome}
                                        onChange={(e) => setEditProfNome(e.target.value)}
                                        className={`w-full border rounded-lg px-3 py-2 text-xs ${clsInput}`}
                                    />

                                    <div
                                        className={`border rounded-xl p-2.5 space-y-2 ${clsCard}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold text-[#1496A1]">
                                                Unidades habilitadas (selecione 1 ou mais)
                                            </span>
                                            <span className={`text-[10px] ${clsSubtexto}`}>
                                                {editProfUnidadesIds.length} selecionada(s)
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {unidadesAtivas.map((u) => {
                                                const marcada = editProfUnidadesIds.includes(
                                                    u.id
                                                );
                                                return (
                                                    <button
                                                        key={u.id}
                                                        type="button"
                                                        onClick={() =>
                                                            alternarUnidadeEdicao(u.id)
                                                        }
                                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                                                            marcada
                                                                ? 'bg-[#0E7C86] border-[#1496A1] text-white'
                                                                : `${clsSubCard} ${clsSubtexto} hover:border-[#0E7C86]`
                                                        }`}
                                                    >
                                                        {marcada && (
                                                            <Check className="w-3.5 h-3.5" />
                                                        )}
                                                        {u.nome}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <input
                                        type="text"
                                        required
                                        value={editProfMaterias}
                                        onChange={(e) =>
                                            setEditProfMaterias(e.target.value)
                                        }
                                        className={`w-full border rounded-lg px-3 py-2 text-xs ${clsInput}`}
                                    />

                                    <SeletorSeriesPorMateria
                                        materiasTexto={editProfMaterias}
                                        mapaAtual={editProfMateriasSeries}
                                        onChangeMapa={setEditProfMateriasSeries}
                                        escuro={escuro}
                                    />

                                    <div
                                        className={`border rounded-xl p-2.5 space-y-2 ${clsCard}`}
                                    >
                                        <label className="flex items-center gap-2 text-xs font-semibold text-[#D96B43] cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={editProfManhaAtivo}
                                                onChange={(e) =>
                                                    setEditProfManhaAtivo(e.target.checked)
                                                }
                                            />
                                            <Sun className="w-3.5 h-3.5" />
                                            Liberar aulas pela manhã (100 min)
                                        </label>

                                        {editProfManhaAtivo && (
                                            <div className="grid grid-cols-2 gap-2">
                                                <input
                                                    type="time"
                                                    value={editProfManhaInicio}
                                                    onChange={(e) =>
                                                        setEditProfManhaInicio(e.target.value)
                                                    }
                                                    className={`w-full border rounded-lg px-2.5 py-1.5 text-xs ${clsInput}`}
                                                />
                                                <input
                                                    type="time"
                                                    value={editProfManhaFim}
                                                    onChange={(e) =>
                                                        setEditProfManhaFim(e.target.value)
                                                    }
                                                    className={`w-full border rounded-lg px-2.5 py-1.5 text-xs ${clsInput}`}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-3 gap-2">
                                        <input
                                            type="text"
                                            placeholder="ID Clin Care"
                                            value={editProfClinCareId}
                                            onChange={(e) =>
                                                setEditProfClinCareId(e.target.value)
                                            }
                                            className={`w-full border rounded-lg px-3 py-2 text-xs ${clsInput}`}
                                        />
                                        <input
                                            type="time"
                                            value={editProfInicio}
                                            onChange={(e) =>
                                                setEditProfInicio(e.target.value)
                                            }
                                            className={`w-full border rounded-lg px-3 py-2 text-xs ${clsInput}`}
                                        />
                                        <input
                                            type="time"
                                            value={editProfFim}
                                            onChange={(e) => setEditProfFim(e.target.value)}
                                            className={`w-full border rounded-lg px-3 py-2 text-xs ${clsInput}`}
                                        />
                                    </div>

                                    <div className="flex justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setEditProfId(null)}
                                            className={`px-3 py-1.5 rounded-lg border text-xs cursor-pointer ${clsCard}`}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={salvandoProf}
                                            className="px-3.5 py-1.5 rounded-lg bg-[#0E7C86] text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
                                        >
                                            <Save className="w-3.5 h-3.5" />
                                            {salvandoProf ? 'Salvando...' : 'Salvar'}
                                        </button>
                                    </div>
                                </form>
                            );
                        }

                        return (
                            <div
                                key={p.id}
                                className={`flex flex-wrap items-center justify-between gap-3 border rounded-xl p-3.5 ${clsSubCard}`}
                            >
                                <div className="space-y-1">
                                    <p className={`font-bold text-sm ${clsTitulo}`}>
                                        {p.nome}{' '}
                                        <span className="text-xs font-medium text-[#1496A1]">
                                            • {p.unidades_nomes.join(' • ')}
                                        </span>
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(p.materias || []).map((mat) => {
                                            const chave = Object.keys(mapaSeries).find(
                                                (k) =>
                                                    k.trim().toLowerCase() ===
                                                    mat.toLowerCase()
                                            );
                                            const seriesMat = chave ? mapaSeries[chave] : [];
                                            const restrito = seriesMat.length > 0;

                                            return (
                                                <span
                                                    key={mat}
                                                    className={`text-[11px] px-2 py-0.5 rounded-md border ${
                                                        restrito
                                                            ? 'bg-[#0E7C86]/15 border-[#0E7C86]/40 text-[#25A4AF]'
                                                            : `${clsCard} ${clsSubtexto}`
                                                    }`}
                                                >
                                                    <strong>{mat}</strong>:{' '}
                                                    {resumirSeriesCurto(seriesMat)}
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <p className={`text-[11px] ${clsSubtexto}`}>
                                        {p.manha_ativo && (
                                            <span className="text-[#D96B43] font-medium">
                                                Manhã: {p.manha_inicio} às {p.manha_fim} •{' '}
                                            </span>
                                        )}
                                        Tarde/Noite: {p.hora_inicio} às {p.hora_fim} (
                                        {slotsProf.length} turnos)
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => iniciarEdicaoProfessor(p)}
                                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${clsCard}`}
                                    >
                                        <Edit3 className="w-3.5 h-3.5" /> Editar
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            void alternarProfessor(p.id, !p.ativo)
                                        }
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                                            p.ativo
                                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/35'
                                                : 'bg-stone-500/20 text-stone-400'
                                        }`}
                                    >
                                        {p.ativo ? 'Ativo' : 'Pausado'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}