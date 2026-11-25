'use client';
import { useTextoR4 } from '@/components/TextosInterfaceR4';


import { useState } from 'react';
import {
    CheckCircle2,
    Edit3,
    KeyRound,
    MessageCircle,
    Save,
    Search,
    Trash2,
    Users,
    X,
} from 'lucide-react';
import { SERIES_ESCOLARES, formatarTelefone } from '@/lib/cliente-helpers';
import { AlunoAdmin, ResponsavelContaAdmin, TemaClasses } from './types';

export default function AbaAlunos({
                                      responsaveis,
                                      classes,
                                      onRecarregarDadosAction,
                                  }: {
    responsaveis: ResponsavelContaAdmin[];
    classes: TemaClasses;
    onRecarregarDadosAction: () => Promise<void>;
}) {
    const textoR4 = useTextoR4();
    const { clsCard, clsSubCard, clsInput, clsTitulo, clsSubtexto } = classes;

    const [buscaAluno, setBuscaAluno] = useState<string>('');
    const [filtroPinAluno, setFiltroPinAluno] = useState<string>('todos');
    const [editResponsavelId, setEditResponsavelId] = useState<number | null>(null);
    const [editRespNomeConta, setEditRespNomeConta] = useState<string>('');
    const [editRespTelefoneConta, setEditRespTelefoneConta] = useState<string>('');
    const [salvandoRespConta, setSalvandoRespConta] = useState<boolean>(false);
    const [confirmandoExcluirContaId, setConfirmandoExcluirContaId] = useState<
        number | null
    >(null);
    const [excluindoContaId, setExcluindoContaId] = useState<number | null>(null);

    const [editAlunoId, setEditAlunoId] = useState<number | null>(null);
    const [editAlunoNome, setEditAlunoNome] = useState<string>('');
    const [editAlunoResponsavel, setEditAlunoResponsavel] = useState<string>('');
    const [editAlunoTelefone, setEditAlunoTelefone] = useState<string>('');
    const [editAlunoColegio, setEditAlunoColegio] = useState<string>('');
    const [editAlunoSerie, setEditAlunoSerie] = useState<string>(
        SERIES_ESCOLARES[0]
    );
    const [salvandoAlunoAdmin, setSalvandoAlunoAdmin] = useState<boolean>(false);
    const [confirmandoExcluirAlunoId, setConfirmandoExcluirAlunoId] = useState<
        number | null
    >(null);
    const [excluindoAlunoId, setExcluindoAlunoId] = useState<number | null>(null);
    const [resetandoPin, setResetandoPin] = useState<boolean>(false);

    const [feedbackAluno, setFeedbackAluno] = useState<{
        tipo: 'sucesso' | 'erro';
        texto: string;
    } | null>(null);

    async function resetarPinCliente(telefoneAlvo: string, responsavelId?: number) {
        if (!telefoneAlvo.trim() && !responsavelId) return;
        setResetandoPin(true);
        setFeedbackAluno(null);
        try {
            const res = await fetch('/api/admin/alunos/reset-pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telefone: telefoneAlvo,
                    responsavelId: responsavelId || 0,
                }),
            });
            const json = await res.json();
            if (res.ok) {
                setFeedbackAluno({
                    tipo: 'sucesso',
                    texto: json.mensagem || 'PIN resetado com sucesso.',
                });
                await onRecarregarDadosAction();
            } else {
                setFeedbackAluno({
                    tipo: 'erro',
                    texto: json.error || 'Não foi possível resetar o PIN.',
                });
            }
        } finally {
            setResetandoPin(false);
        }
    }

    function iniciarEdicaoContaResponsavel(resp: ResponsavelContaAdmin) {
        setEditResponsavelId(resp.id);
        setEditRespNomeConta(resp.nome || '');
        setEditRespTelefoneConta(
            formatarTelefone(resp.telefone || resp.telefone_formatado || '')
        );
        setFeedbackAluno(null);
    }

    async function salvarEdicaoContaResponsavel(
        e: React.FormEvent,
        resolverConflito = false
    ) {
        e.preventDefault();
        if (!editResponsavelId) return;
        setSalvandoRespConta(true);
        setFeedbackAluno(null);

        try {
            const res = await fetch('/api/admin/alunos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    acao: 'editar_responsavel',
                    responsavel_id: editResponsavelId,
                    nome: editRespNomeConta,
                    telefone: editRespTelefoneConta,
                    resolver_conflito: resolverConflito,
                }),
            });
            const json = await res.json();
            if (!res.ok) {
                setFeedbackAluno({
                    tipo: 'erro',
                    texto: json.error || 'Erro ao atualizar conta do responsável.',
                });
                return;
            }
            setEditResponsavelId(null);
            setFeedbackAluno({
                tipo: 'sucesso',
                texto: json.mensagem || 'Conta do responsável atualizada.',
            });
            await onRecarregarDadosAction();
        } finally {
            setSalvandoRespConta(false);
        }
    }

    async function marcarConflitoResolvido(resp: ResponsavelContaAdmin) {
        setSalvandoRespConta(true);
        setFeedbackAluno(null);
        try {
            const res = await fetch('/api/admin/alunos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    acao: 'editar_responsavel',
                    responsavel_id: resp.id,
                    nome: resp.nome,
                    telefone: resp.telefone,
                    resolver_conflito: true,
                }),
            });
            const json = await res.json();
            if (res.ok) {
                setFeedbackAluno({
                    tipo: 'sucesso',
                    texto: 'Alerta de conflito marcado como revisado.',
                });
                await onRecarregarDadosAction();
            } else {
                setFeedbackAluno({
                    tipo: 'erro',
                    texto: json.error || 'Não foi possível concluir a revisão.',
                });
            }
        } finally {
            setSalvandoRespConta(false);
        }
    }

    async function excluirContaResponsavelAdmin(responsavelId: number) {
        setExcluindoContaId(responsavelId);
        setFeedbackAluno(null);
        try {
            const res = await fetch(
                `/api/admin/alunos?responsavelId=${responsavelId}`,
                { method: 'DELETE' }
            );
            const json = await res.json();
            if (!res.ok) {
                setFeedbackAluno({
                    tipo: 'erro',
                    texto: json.error || 'Erro ao excluir conta do responsável.',
                });
                return;
            }
            setConfirmandoExcluirContaId(null);
            setFeedbackAluno({
                tipo: 'sucesso',
                texto: json.mensagem || 'Conta excluída com sucesso.',
            });
            await onRecarregarDadosAction();
        } finally {
            setExcluindoContaId(null);
        }
    }

    function iniciarEdicaoAlunoAdmin(al: AlunoAdmin) {
        setEditAlunoId(al.id);
        setEditAlunoNome(al.nome_aluno);
        setEditAlunoResponsavel(al.responsavel_nome || '');
        setEditAlunoTelefone(
            formatarTelefone(al.telefone || al.telefone_formatado || '')
        );
        setEditAlunoColegio(al.colegio_nome || '');
        setEditAlunoSerie(
            SERIES_ESCOLARES.includes(al.serie) ? al.serie : SERIES_ESCOLARES[0]
        );
        setFeedbackAluno(null);
    }

    async function salvarEdicaoAlunoAdmin(e: React.FormEvent) {
        e.preventDefault();
        if (!editAlunoId) return;
        setSalvandoAlunoAdmin(true);
        setFeedbackAluno(null);

        try {
            const res = await fetch('/api/admin/alunos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editAlunoId,
                    nome_aluno: editAlunoNome,
                    responsavel_nome: editAlunoResponsavel,
                    telefone: editAlunoTelefone,
                    colegio_nome: editAlunoColegio,
                    serie: editAlunoSerie,
                    atualizar_irmaos: true,
                }),
            });
            const json = await res.json();
            if (!res.ok) {
                setFeedbackAluno({
                    tipo: 'erro',
                    texto: json.error || 'Erro ao salvar dados do aluno.',
                });
                return;
            }
            setEditAlunoId(null);
            setFeedbackAluno({
                tipo: 'sucesso',
                texto: json.mensagem || 'Dados atualizados com sucesso.',
            });
            await onRecarregarDadosAction();
        } finally {
            setSalvandoAlunoAdmin(false);
        }
    }

    async function excluirAlunoAdmin(id: number) {
        setExcluindoAlunoId(id);
        setFeedbackAluno(null);
        try {
            const res = await fetch(`/api/admin/alunos?id=${id}`, {
                method: 'DELETE',
            });
            const json = await res.json();
            if (!res.ok) {
                setFeedbackAluno({
                    tipo: 'erro',
                    texto: json.error || 'Erro ao excluir aluno.',
                });
                return;
            }
            setConfirmandoExcluirAlunoId(null);
            setFeedbackAluno({
                tipo: 'sucesso',
                texto: json.mensagem || 'Aluno excluído com sucesso.',
            });
            await onRecarregarDadosAction();
        } finally {
            setExcluindoAlunoId(null);
        }
    }

    const termoBuscaAluno = buscaAluno.trim().toLowerCase();
    const digitosBuscaAluno = buscaAluno.replace(/\D/g, '');

    const responsaveisFiltrados = responsaveis.filter((resp) => {
        if (filtroPinAluno === 'com_pin' && !resp.tem_pin) return false;
        if (filtroPinAluno === 'sem_pin' && resp.tem_pin) return false;
        if (filtroPinAluno === 'conflito' && !resp.conflito_migracao) return false;

        if (!termoBuscaAluno) return true;

        const bateConta =
            resp.nome.toLowerCase().includes(termoBuscaAluno) ||
            resp.telefone_formatado.toLowerCase().includes(termoBuscaAluno);

        const bateDigitos =
            digitosBuscaAluno.length > 0 &&
            resp.telefone.replace(/\D/g, '').includes(digitosBuscaAluno);

        const bateFilho = resp.filhos.some(
            (f) =>
                f.nome_aluno.toLowerCase().includes(termoBuscaAluno) ||
                f.colegio_nome.toLowerCase().includes(termoBuscaAluno) ||
                f.serie.toLowerCase().includes(termoBuscaAluno)
        );

        return bateConta || bateDigitos || bateFilho;
    });

    return (
        <section className="space-y-5">
            <div className={`border rounded-2xl p-5 space-y-4 ${clsCard}`}>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-7">
                        <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>{textoR4("Buscar por Responsável, Número de WhatsApp, Aluno ou Colégio")}</label>
                        <div className="flex items-center gap-2">
                            <Search
                                className={`w-4 h-4 shrink-0 ${clsSubtexto}`}
                            />
                            <input
                                type="text"
                                value={buscaAluno}
                                onChange={(e) => setBuscaAluno(e.target.value)}
                                placeholder={textoR4("Digite nome do responsável, aluno ou telefone...")}
                                className={`min-w-0 flex-1 pl-3 border rounded-xl pr-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                            />
                        </div>
                    </div>

                    <div className="md:col-span-3">
                        <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>{textoR4("Situação do PIN")}</label>
                        <select
                            value={filtroPinAluno}
                            onChange={(e) => setFiltroPinAluno(e.target.value)}
                            className={`w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                        >
                            <option value="todos">{textoR4("Todas as contas")}</option>
                            <option value="com_pin">{textoR4("Com PIN ativo")}</option>
                            <option value="sem_pin">{textoR4("Sem PIN (1º acesso)")}</option>
                            <option value="conflito">{textoR4("Com alerta de revisão")}</option>
                        </select>
                    </div>

                    <div className="md:col-span-2 flex items-center justify-between md:justify-end gap-2 pb-1">
                        <span className={`text-xs font-bold ${clsTitulo}`}>
                            {responsaveisFiltrados.length}{' ' + textoR4("conta(s)")}</span>
                        {(buscaAluno || filtroPinAluno !== 'todos') && (
                            <button
                                type="button"
                                onClick={() => {
                                    setBuscaAluno('');
                                    setFiltroPinAluno('todos');
                                }}
                                className="text-xs text-[#1496A1] hover:underline cursor-pointer"
                            >{textoR4("Limpar")}</button>
                        )}
                    </div>
                </div>

                {feedbackAluno && (
                    <div
                        className={`rounded-xl border px-4 py-3 text-xs flex items-center justify-between gap-2 ${
                            feedbackAluno.tipo === 'sucesso'
                                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                                : 'bg-[#BE1E23]/15 border-[#BE1E23]/40 text-rose-400'
                        }`}
                    >
                        <span>{feedbackAluno.texto}</span>
                        <button
                            type="button"
                            onClick={() => setFeedbackAluno(null)}
                            className="cursor-pointer"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
            </div>

            {responsaveisFiltrados.length === 0 ? (
                <div
                    className={`border rounded-2xl p-10 text-center text-sm ${clsCard} ${clsSubtexto}`}
                >{textoR4("Nenhuma conta de responsável ou aluno encontrada para esta busca.")}</div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {responsaveisFiltrados.map((resp) => {
                        const editandoConta = editResponsavelId === resp.id;
                        const pedindoExclusaoConta =
                            confirmandoExcluirContaId === resp.id;
                        const whatsappDigitos = (resp.telefone || '').replace(/\D/g, '');

                        return (
                            <div
                                key={resp.id}
                                className={`border rounded-2xl p-5 space-y-4 ${
                                    resp.conflito_migracao ? 'border-amber-500/50' : ''
                                } ${clsCard}`}
                            >
                                {editandoConta ? (
                                    <form
                                        onSubmit={(e) =>
                                            void salvarEdicaoContaResponsavel(e, false)
                                        }
                                        className={`border border-[#0E7C86] rounded-xl p-3.5 space-y-3 ${clsSubCard}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold uppercase text-[#1496A1]">{textoR4("Editando Conta do Responsável")}</span>
                                            <button
                                                type="button"
                                                onClick={() => setEditResponsavelId(null)}
                                                className={`cursor-pointer ${clsSubtexto}`}
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                            <div>
                                                <label
                                                    className={`block text-[11px] mb-1 ${clsSubtexto}`}
                                                >{textoR4("Nome do Responsável *")}</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={editRespNomeConta}
                                                    onChange={(e) =>
                                                        setEditRespNomeConta(e.target.value)
                                                    }
                                                    className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                                />
                                            </div>
                                            <div>
                                                <label
                                                    className={`block text-[11px] mb-1 ${clsSubtexto}`}
                                                >{textoR4("WhatsApp Único (com DDD) *")}</label>
                                                <input
                                                    type="tel"
                                                    required
                                                    value={editRespTelefoneConta}
                                                    onChange={(e) =>
                                                        setEditRespTelefoneConta(
                                                            formatarTelefone(e.target.value)
                                                        )
                                                    }
                                                    className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setEditResponsavelId(null)}
                                                className={`px-3 py-1.5 rounded-xl border text-xs cursor-pointer ${clsCard}`}
                                            >{textoR4("Cancelar")}</button>
                                            <button
                                                type="submit"
                                                disabled={salvandoRespConta}
                                                className="px-3.5 py-1.5 rounded-xl r4-acao text-xs font-semibold  inline-flex items-center gap-1.5 cursor-pointer"
                                            >
                                                <Save className="w-3.5 h-3.5" />
                                                {salvandoRespConta
                                                    ? textoR4("Salvando...")
                                                    : textoR4("Salvar Conta")}
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <Users className="w-4 h-4 text-[#1496A1]" />
                                                <h3 className={`text-base font-bold ${clsTitulo}`}>
                                                    {resp.nome || 'Responsável'}
                                                </h3>
                                            </div>
                                            <p className="text-xs text-[#1496A1] font-semibold mt-0.5">{textoR4("WhatsApp:")}{' '}
                                                {formatarTelefone(
                                                    resp.telefone || resp.telefone_formatado
                                                ) || 'Não cadastrado'}
                                            </p>
                                        </div>

                                        <div className="flex flex-col items-end gap-1">
                                            <span
                                                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                                                    resp.pin_bloqueado
                                                        ? 'bg-[#BE1E23]/15 border-[#BE1E23]/40 text-rose-400'
                                                        : resp.tem_pin
                                                            ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                                                            : `${clsSubCard} ${clsSubtexto}`
                                                }`}
                                            >
                                                {resp.pin_bloqueado
                                                    ? textoR4("PIN Bloqueado")
                                                    : resp.tem_pin
                                                        ? textoR4("PIN Ativo")
                                                        : textoR4("Sem PIN")}
                                            </span>
                                            <span className={`text-[11px] ${clsSubtexto}`}>
                                                {resp.filhos.length}{' ' + textoR4("filho(s) •")}{' '}
                                                {resp.total_aulas}{' ' + textoR4("aula(s)")}</span>
                                        </div>
                                    </div>
                                )}

                                {resp.conflito_migracao && (
                                    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300 flex flex-wrap items-center justify-between gap-2">
                                        <span>
                                            <strong>{textoR4("Revisão recomendada:")}</strong>{' '}
                                            {resp.conflito_detalhes ||
                                                'Registros antigos agrupados neste número.'}
                                        </span>
                                        <button
                                            type="button"
                                            disabled={salvandoRespConta}
                                            onClick={() => void marcarConflitoResolvido(resp)}
                                            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[11px] font-semibold text-amber-200 inline-flex items-center gap-1 cursor-pointer"
                                        >
                                            <CheckCircle2 className="w-3.5 h-3.5" />{textoR4("Marcar Revisado")}</button>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <p
                                        className={`text-[11px] font-semibold uppercase tracking-wide ${clsSubtexto}`}
                                    >{textoR4("Filhos vinculados (")}{resp.filhos.length})
                                    </p>

                                    {resp.filhos.length === 0 ? (
                                        <p
                                            className={`text-xs italic border rounded-xl p-3 ${clsSubCard} ${clsSubtexto}`}
                                        >{textoR4("Nenhum filho ativo vinculado a esta conta.")}</p>
                                    ) : (
                                        resp.filhos.map((al) => {
                                            const editandoEste = editAlunoId === al.id;
                                            const pedindoExclusao =
                                                confirmandoExcluirAlunoId === al.id;

                                            if (editandoEste) {
                                                return (
                                                    <form
                                                        key={al.id}
                                                        onSubmit={(e) =>
                                                            void salvarEdicaoAlunoAdmin(e)
                                                        }
                                                        className={`border border-[#0E7C86] rounded-xl p-3.5 space-y-3 ${clsSubCard}`}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[11px] font-bold uppercase text-[#1496A1]">{textoR4("Editando Filho(a)")}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditAlunoId(null)}
                                                                className={`cursor-pointer ${clsSubtexto}`}
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </div>

                                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                                            <div>
                                                                <label
                                                                    className={`block text-[11px] mb-1 ${clsSubtexto}`}
                                                                >{textoR4("Nome do Aluno(a) *")}</label>
                                                                <input
                                                                    type="text"
                                                                    required
                                                                    value={editAlunoNome}
                                                                    onChange={(e) =>
                                                                        setEditAlunoNome(
                                                                            e.target.value
                                                                        )
                                                                    }
                                                                    className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                                                />
                                                            </div>

                                                            <div>
                                                                <label
                                                                    className={`block text-[11px] mb-1 ${clsSubtexto}`}
                                                                >{textoR4("Colégio")}</label>
                                                                <input
                                                                    type="text"
                                                                    value={editAlunoColegio}
                                                                    onChange={(e) =>
                                                                        setEditAlunoColegio(
                                                                            e.target.value
                                                                        )
                                                                    }
                                                                    className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                                                />
                                                            </div>

                                                            <div>
                                                                <label
                                                                    className={`block text-[11px] mb-1 ${clsSubtexto}`}
                                                                >{textoR4("Série / Ano")}</label>
                                                                <select
                                                                    value={editAlunoSerie}
                                                                    onChange={(e) =>
                                                                        setEditAlunoSerie(
                                                                            e.target.value
                                                                        )
                                                                    }
                                                                    className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                                                >
                                                                    {SERIES_ESCOLARES.map((s) => (
                                                                        <option key={s} value={s}>
                                                                            {s}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        </div>

                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditAlunoId(null)}
                                                                className={`px-3 py-1.5 rounded-xl border text-xs cursor-pointer ${clsCard}`}
                                                            >{textoR4("Cancelar")}</button>
                                                            <button
                                                                type="submit"
                                                                disabled={salvandoAlunoAdmin}
                                                                className="px-3.5 py-1.5 rounded-xl r4-acao text-xs font-semibold  inline-flex items-center gap-1.5 cursor-pointer"
                                                            >
                                                                <Save className="w-3.5 h-3.5" />
                                                                {salvandoAlunoAdmin
                                                                    ? textoR4("Salvando...")
                                                                    : textoR4("Salvar Filho")}
                                                            </button>
                                                        </div>
                                                    </form>
                                                );
                                            }

                                            return (
                                                <div
                                                    key={al.id}
                                                    className={`border rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 ${clsSubCard}`}
                                                >
                                                    <div>
                                                        <p className={`text-sm font-bold ${clsTitulo}`}>
                                                            {al.nome_aluno}
                                                        </p>
                                                        <p className={`text-xs ${clsSubtexto}`}>
                                                            {[al.colegio_nome, al.serie]
                                                                    .filter(Boolean)
                                                                    .join(' • ') ||
                                                                'Colégio/Série não informados'}{' '}
                                                            • {al.total_aulas}{' ' + textoR4("aula(s)")}</p>
                                                    </div>

                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                iniciarEdicaoAlunoAdmin(al)
                                                            }
                                                            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 cursor-pointer ${clsCard} ${clsTitulo} hover:border-[#0E7C86]`}
                                                        >
                                                            <Edit3 className="w-3 h-3 text-[#1496A1]" />{textoR4("Editar")}</button>

                                                        {pedindoExclusao ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    disabled={excluindoAlunoId === al.id}
                                                                    onClick={() =>
                                                                        setConfirmandoExcluirAlunoId(
                                                                            null
                                                                        )
                                                                    }
                                                                    className={`px-2 py-1.5 rounded-lg border text-xs cursor-pointer ${clsCard}`}
                                                                >{textoR4("Não")}</button>
                                                                <button
                                                                    type="button"
                                                                    disabled={excluindoAlunoId === al.id}
                                                                    onClick={() =>
                                                                        void excluirAlunoAdmin(al.id)
                                                                    }
                                                                    className="px-2.5 py-1.5 rounded-lg bg-[#BE1E23] hover:bg-rose-700 text-xs font-semibold text-white cursor-pointer"
                                                                >
                                                                    {excluindoAlunoId === al.id
                                                                        ? '...'
                                                                        : textoR4("Confirmar")}
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setConfirmandoExcluirAlunoId(
                                                                        al.id
                                                                    )
                                                                }
                                                                className="px-2.5 py-1.5 rounded-lg bg-[#BE1E23]/15 hover:bg-[#BE1E23]/25 border border-[#BE1E23]/40 text-rose-400 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                                                            >
                                                                <Trash2 className="w-3 h-3" />{textoR4("Remover")}</button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                iniciarEdicaoContaResponsavel(resp)
                                            }
                                            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition ${clsSubCard} ${clsTitulo} hover:border-[#0E7C86]`}
                                        >
                                            <Edit3 className="w-3.5 h-3.5 text-[#1496A1]" />{textoR4("Editar Conta / Número")}</button>

                                        <button
                                            type="button"
                                            disabled={resetandoPin}
                                            onClick={() =>
                                                void resetarPinCliente(resp.telefone, resp.id)
                                            }
                                            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition ${clsSubCard} ${clsSubtexto} hover:text-[#1496A1]`}
                                        >
                                            <KeyRound className="w-3.5 h-3.5" />{textoR4("Resetar PIN")}</button>

                                        {whatsappDigitos && (
                                            <a
                                                href={`https://wa.me/55${whatsappDigitos}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-500 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-emerald-500/25"
                                            >
                                                <MessageCircle className="w-3.5 h-3.5" />{textoR4("WhatsApp")}</a>
                                        )}
                                    </div>

                                    {pedindoExclusaoConta ? (
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                disabled={excluindoContaId === resp.id}
                                                onClick={() =>
                                                    setConfirmandoExcluirContaId(null)
                                                }
                                                className={`px-2.5 py-1.5 rounded-xl border text-xs cursor-pointer ${clsSubCard}`}
                                            >{textoR4("Não")}</button>
                                            <button
                                                type="button"
                                                disabled={excluindoContaId === resp.id}
                                                onClick={() =>
                                                    void excluirContaResponsavelAdmin(resp.id)
                                                }
                                                className="px-3 py-1.5 rounded-xl bg-[#BE1E23] hover:bg-rose-700 text-xs font-semibold text-white cursor-pointer"
                                            >
                                                {excluindoContaId === resp.id
                                                    ? textoR4("Excluindo...")
                                                    : textoR4("Confirmar Exclusão")}
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setConfirmandoExcluirContaId(resp.id)
                                            }
                                            className="px-3 py-1.5 rounded-xl bg-[#BE1E23]/15 hover:bg-[#BE1E23]/25 border border-[#BE1E23]/40 text-rose-400 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />{textoR4("Excluir Conta")}</button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}