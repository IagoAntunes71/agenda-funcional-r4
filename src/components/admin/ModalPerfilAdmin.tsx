'use client';

import { useEffect, useState } from 'react';
import { Camera, Eye, EyeOff, Plus, Save, Trash2, UserPlus, X } from 'lucide-react';
import { RoleSistema } from '@/lib/admin-auth';
import {
    PerfilAdmin,
    ProfessorAdmin,
    TemaClasses,
    comprimirImagemAvatar,
    obterIniciais,
} from './types';

const ROTULO_CARGO: Record<RoleSistema, { nome: string; cls: string }> = {
    admin: {
        nome: 'Administrador',
        cls: 'bg-[#0E7C86]/20 text-[#25A4AF] border-[#0E7C86]/40',
    },
    atendimento: {
        nome: 'Atendimento',
        cls: 'bg-amber-500/15 text-amber-400 border-amber-500/35',
    },
    professor: {
        nome: 'Professor(a)',
        cls: 'bg-[#C24124]/20 text-[#E07A5F] border-[#C24124]/40',
    },
};

export default function ModalPerfilAdmin({
                                             aberto,
                                             onFecharAction,
                                             abaInicial,
                                             perfilAtual,
                                             perfisAdmin,
                                             professores,
                                             feedbackInicial,
                                             onPerfilAtualizadoAction,
                                             onRecarregarPerfisAction,
                                             classes,
                                         }: {
    aberto: boolean;
    onFecharAction: () => void;
    abaInicial: 'meu' | 'equipe';
    perfilAtual: PerfilAdmin;
    perfisAdmin: PerfilAdmin[];
    professores: ProfessorAdmin[];
    feedbackInicial: { tipo: 'sucesso' | 'erro'; texto: string } | null;
    onPerfilAtualizadoAction: (novo: PerfilAdmin) => void;
    onRecarregarPerfisAction: () => Promise<void>;
    classes: TemaClasses;
}) {
    const { clsCard, clsSubCard, clsInput, clsTitulo, clsSubtexto } = classes;

    const [abaModalPerfil, setAbaModalPerfil] = useState<'meu' | 'equipe'>(abaInicial);
    const [editMeuNome, setEditMeuNome] = useState(perfilAtual.nome || '');
    const [editMeuEmail, setEditMeuEmail] = useState(perfilAtual.email || '');
    const [editMinhaNovaSenha, setEditMinhaNovaSenha] = useState('');
    const [mostrarMinhaNovaSenha, setMostrarMinhaNovaSenha] = useState(false);
    const [editMinhaFoto, setEditMinhaFoto] = useState<string | null>(
        perfilAtual.foto_url || null
    );
    const [salvandoMeuPerfil, setSalvandoMeuPerfil] = useState(false);

    const [novoNome, setNovoNome] = useState('');
    const [novoEmail, setNovoEmail] = useState('');
    const [novoSenha, setNovoSenha] = useState('');
    const [novoRole, setNovoRole] = useState<RoleSistema>('atendimento');
    const [novoProfessorId, setNovoProfessorId] = useState<number>(0);
    const [mostrarNovoSenha, setMostrarNovoSenha] = useState(false);
    const [novoFoto, setNovoFoto] = useState<string | null>(null);
    const [criandoNovo, setCriandoNovo] = useState(false);

    const [redefinirSenhaId, setRedefinirSenhaId] = useState<number | null>(null);
    const [novaSenhaEquipe, setNovaSenhaEquipe] = useState('');
    const [feedbackPerfil, setFeedbackPerfil] = useState<{
        tipo: 'sucesso' | 'erro';
        texto: string;
    } | null>(feedbackInicial);

    useEffect(() => {
        if (aberto) {
            setAbaModalPerfil(perfilAtual.role === 'admin' ? abaInicial : 'meu');
            setEditMeuNome(perfilAtual.nome || '');
            setEditMeuEmail(perfilAtual.email || '');
            setEditMinhaFoto(perfilAtual.foto_url || null);
            setEditMinhaNovaSenha('');
            setFeedbackPerfil(feedbackInicial);
        }
    }, [aberto, abaInicial, perfilAtual, feedbackInicial]);

    if (!aberto) return null;

    const professoresUnicos = Array.from(
        new Map(
            professores
                .filter((p) => p.ativo)
                .map((p) => [p.nome.trim().toLowerCase(), p])
        ).values()
    ).sort((a, b) => a.nome.localeCompare(b.nome));

    async function handleSalvarMeuPerfil(e: React.FormEvent) {
        e.preventDefault();
        setSalvandoMeuPerfil(true);
        setFeedbackPerfil(null);
        try {
            const res = await fetch('/api/admin/perfis', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: perfilAtual.id,
                    nome: editMeuNome,
                    email: editMeuEmail,
                    nova_senha: editMinhaNovaSenha || undefined,
                    foto_url: editMinhaFoto,
                }),
            });
            const json = await res.json();
            if (!res.ok) {
                setFeedbackPerfil({ tipo: 'erro', texto: json.error || 'Erro ao salvar.' });
                return;
            }
            if (json.perfilAtual) onPerfilAtualizadoAction(json.perfilAtual);
            setEditMinhaNovaSenha('');
            setFeedbackPerfil({
                tipo: 'sucesso',
                texto: json.mensagem || 'Perfil atualizado!',
            });
            await onRecarregarPerfisAction();
        } finally {
            setSalvandoMeuPerfil(false);
        }
    }

    async function handleCriarNovoPerfil(e: React.FormEvent) {
        e.preventDefault();
        setCriandoNovo(true);
        setFeedbackPerfil(null);
        try {
            const res = await fetch('/api/admin/perfis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome: novoNome,
                    email: novoEmail,
                    senha: novoSenha,
                    role: novoRole,
                    professor_id: novoRole === 'professor' ? novoProfessorId : null,
                    foto_url: novoFoto,
                }),
            });
            const json = await res.json();
            if (!res.ok) {
                setFeedbackPerfil({ tipo: 'erro', texto: json.error || 'Erro ao criar perfil.' });
                return;
            }
            setNovoNome('');
            setNovoEmail('');
            setNovoSenha('');
            setNovoProfessorId(0);
            setNovoFoto(null);
            setFeedbackPerfil({
                tipo: 'sucesso',
                texto: json.mensagem || 'Perfil criado com sucesso!',
            });
            await onRecarregarPerfisAction();
        } finally {
            setCriandoNovo(false);
        }
    }

    async function handleRedefinirSenhaEquipe(id: number) {
        if (novaSenhaEquipe.trim().length < 6) {
            setFeedbackPerfil({ tipo: 'erro', texto: 'Mínimo de 6 caracteres.' });
            return;
        }
        const res = await fetch('/api/admin/perfis', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, nova_senha: novaSenhaEquipe.trim() }),
        });
        if (res.ok) {
            setRedefinirSenhaId(null);
            setNovaSenhaEquipe('');
            setFeedbackPerfil({ tipo: 'sucesso', texto: 'Senha redefinida!' });
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
            <div
                className={`border rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto ${clsCard}`}
            >
                <div className="flex items-center justify-between">
                    <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-[#1496A1]">
                            Conta & Controle de Acesso R4
                        </span>
                        <h2 className={`text-lg font-bold ${clsTitulo}`}>
                            Perfil e Equipe do Sistema
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onFecharAction}
                        className={`p-1.5 rounded-lg cursor-pointer ${clsSubtexto}`}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {perfilAtual.role === 'admin' && (
                    <div className="flex gap-2 border-b pb-3 border-[#232B35]">
                        <button
                            type="button"
                            onClick={() => {
                                setAbaModalPerfil('meu');
                                setFeedbackPerfil(null);
                            }}
                            className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                                abaModalPerfil === 'meu'
                                    ? 'bg-[#0E7C86] text-white'
                                    : `${clsSubCard} ${clsSubtexto}`
                            }`}
                        >
                            Meu Perfil & Foto
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setAbaModalPerfil('equipe');
                                setFeedbackPerfil(null);
                            }}
                            className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                                abaModalPerfil === 'equipe'
                                    ? 'bg-[#0E7C86] text-white'
                                    : `${clsSubCard} ${clsSubtexto}`
                            }`}
                        >
                            Criar / Gerenciar Perfis ({perfisAdmin.length})
                        </button>
                    </div>
                )}

                {feedbackPerfil && (
                    <div
                        className={`rounded-xl border px-4 py-3 text-xs ${
                            feedbackPerfil.tipo === 'sucesso'
                                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                                : 'bg-[#BE1E23]/15 border-[#BE1E23]/40 text-rose-400'
                        }`}
                    >
                        {feedbackPerfil.texto}
                    </div>
                )}

                {abaModalPerfil === 'meu' ? (
                    <form onSubmit={(e) => void handleSalvarMeuPerfil(e)} className="space-y-4">
                        <div className="flex items-center gap-4">
                            <label className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-[#0E7C86] cursor-pointer group bg-[#0E7C86]/20 flex items-center justify-center shrink-0">
                                {editMinhaFoto ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={editMinhaFoto}
                                        alt="Avatar"
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <span className="text-base font-bold text-[#1496A1]">
                                        {obterIniciais(editMeuNome || perfilAtual.nome)}
                                    </span>
                                )}
                                <span className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                                    <Camera className="w-4 h-4" />
                                </span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={async (e) => {
                                        const f = e.target.files?.[0];
                                        if (f) setEditMinhaFoto(await comprimirImagemAvatar(f));
                                    }}
                                    className="hidden"
                                />
                            </label>
                            <div>
                                <p className={`text-sm font-bold ${clsTitulo}`}>Foto de Perfil</p>
                                <p className={`text-xs ${clsSubtexto}`}>
                                    Clique no círculo para alterar sua foto de exibição.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className={`block text-xs mb-1 ${clsSubtexto}`}>Nome *</label>
                                <input
                                    type="text"
                                    required
                                    value={editMeuNome}
                                    onChange={(e) => setEditMeuNome(e.target.value)}
                                    className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                                />
                            </div>
                            <div>
                                <label className={`block text-xs mb-1 ${clsSubtexto}`}>E-mail *</label>
                                <input
                                    type="email"
                                    required
                                    value={editMeuEmail}
                                    onChange={(e) => setEditMeuEmail(e.target.value)}
                                    className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                                />
                            </div>
                        </div>

                        <div>
                            <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                Nova Senha (opcional)
                            </label>
                            <div className="relative">
                                <input
                                    type={mostrarMinhaNovaSenha ? 'text' : 'password'}
                                    value={editMinhaNovaSenha}
                                    onChange={(e) => setEditMinhaNovaSenha(e.target.value)}
                                    placeholder="Deixe em branco para manter a atual"
                                    className={`w-full border rounded-xl pl-3.5 pr-10 py-2.5 text-sm ${clsInput}`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setMostrarMinhaNovaSenha((v) => !v)}
                                    className={`absolute right-3 top-3 cursor-pointer ${clsSubtexto}`}
                                >
                                    {mostrarMinhaNovaSenha ? (
                                        <EyeOff className="w-4 h-4" />
                                    ) : (
                                        <Eye className="w-4 h-4" />
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={onFecharAction}
                                className={`px-4 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${clsSubCard}`}
                            >
                                Fechar
                            </button>
                            <button
                                type="submit"
                                disabled={salvandoMeuPerfil}
                                className="px-5 py-2 rounded-xl bg-[#0E7C86] hover:bg-[#118E99] text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
                            >
                                <Save className="w-3.5 h-3.5" />
                                {salvandoMeuPerfil ? 'Salvando...' : 'Salvar Perfil'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="space-y-5">
                        <form
                            onSubmit={(e) => void handleCriarNovoPerfil(e)}
                            className={`border rounded-xl p-4 space-y-3 ${clsSubCard}`}
                        >
                            <p className="text-xs font-bold text-[#1496A1] flex items-center gap-1.5">
                                <UserPlus className="w-4 h-4" /> Cadastrar Novo Perfil de Acesso
                            </p>

                            <div className="grid grid-cols-3 gap-2">
                                {(
                                    [
                                        { id: 'atendimento', label: 'Atendimento' },
                                        { id: 'professor', label: 'Professor(a)' },
                                        { id: 'admin', label: 'Administrador' },
                                    ] as { id: RoleSistema; label: string }[]
                                ).map((cargo) => (
                                    <button
                                        key={cargo.id}
                                        type="button"
                                        onClick={() => setNovoRole(cargo.id)}
                                        className={`py-2 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                                            novoRole === cargo.id
                                                ? 'bg-[#0E7C86] border-[#0E7C86] text-white'
                                                : `${clsCard} ${clsSubtexto} hover:border-[#0E7C86]/60`
                                        }`}
                                    >
                                        {cargo.label}
                                    </button>
                                ))}
                            </div>

                            {novoRole === 'professor' && (
                                <div>
                                    <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                        Vincular ao Professor Cadastrado *
                                    </label>
                                    <select
                                        required
                                        value={novoProfessorId}
                                        onChange={(e) => {
                                            const pid = Number(e.target.value);
                                            setNovoProfessorId(pid);
                                            const prof = professoresUnicos.find((p) => p.id === pid);
                                            if (prof && !novoNome) setNovoNome(prof.nome);
                                        }}
                                        className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                    >
                                        <option value={0}>Selecione o professor(a)...</option>
                                        {professoresUnicos.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.nome} ({p.materias.join(', ')})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <input
                                    type="text"
                                    required
                                    value={novoNome}
                                    onChange={(e) => setNovoNome(e.target.value)}
                                    placeholder="Nome completo *"
                                    className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                />
                                <input
                                    type="email"
                                    required
                                    autoComplete="off"
                                    value={novoEmail}
                                    onChange={(e) => setNovoEmail(e.target.value)}
                                    placeholder="E-mail de acesso *"
                                    className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                />
                                <div className="relative">
                                    <input
                                        type={mostrarNovoSenha ? 'text' : 'password'}
                                        required
                                        autoComplete="new-password"
                                        value={novoSenha}
                                        onChange={(e) => setNovoSenha(e.target.value)}
                                        placeholder="Senha (mín. 6) *"
                                        className={`w-full border rounded-xl pl-3 pr-8 py-2 text-xs ${clsInput}`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setMostrarNovoSenha((v) => !v)}
                                        className={`absolute right-2.5 top-2 cursor-pointer ${clsSubtexto}`}
                                    >
                                        {mostrarNovoSenha ? (
                                            <EyeOff className="w-3.5 h-3.5" />
                                        ) : (
                                            <Eye className="w-3.5 h-3.5" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <label
                                    className={`text-xs inline-flex items-center gap-2 cursor-pointer ${clsSubtexto} hover:text-[#1496A1]`}
                                >
                                    <Camera className="w-4 h-4 text-[#1496A1]" />
                                    <span>{novoFoto ? 'Foto selecionada ✓' : 'Foto opcional'}</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={async (e) => {
                                            const f = e.target.files?.[0];
                                            if (f) setNovoFoto(await comprimirImagemAvatar(f));
                                        }}
                                        className="hidden"
                                    />
                                </label>

                                <button
                                    type="submit"
                                    disabled={criandoNovo}
                                    className="px-4 py-2 rounded-xl bg-[#0E7C86] hover:bg-[#118E99] text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    {criandoNovo ? 'Criando...' : 'Criar Perfil'}
                                </button>
                            </div>
                        </form>

                        <div className="space-y-2">
                            <p className={`text-xs font-bold ${clsTitulo}`}>
                                Perfis Cadastrados ({perfisAdmin.length})
                            </p>
                            {perfisAdmin.map((p) => {
                                const metaCargo = ROTULO_CARGO[p.role || 'admin'];
                                return (
                                    <div
                                        key={p.id}
                                        className={`border rounded-xl p-3 space-y-2 ${clsSubCard}`}
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-9 h-9 rounded-full overflow-hidden bg-[#0E7C86]/20 border border-[#0E7C86] flex items-center justify-center text-xs font-bold text-[#1496A1] shrink-0">
                                                    {p.foto_url ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={p.foto_url}
                                                            alt={p.nome}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        obterIniciais(p.nome)
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <p className={`text-xs font-bold truncate ${clsTitulo}`}>
                                                            {p.nome}
                                                        </p>
                                                        <span
                                                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${metaCargo.cls}`}
                                                        >
                                                            {metaCargo.nome}
                                                        </span>
                                                    </div>
                                                    <p className={`text-[11px] truncate ${clsSubtexto}`}>
                                                        {p.email}
                                                        {p.professor_nome
                                                            ? ` • Agenda: ${p.professor_nome}`
                                                            : ''}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setRedefinirSenhaId(
                                                            redefinirSenhaId === p.id ? null : p.id
                                                        );
                                                        setNovaSenhaEquipe('');
                                                    }}
                                                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${clsCard} ${clsSubtexto}`}
                                                >
                                                    Redefinir Senha
                                                </button>
                                                {p.id !== perfilAtual.id && (
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            await fetch(`/api/admin/perfis?id=${p.id}`, {
                                                                method: 'DELETE',
                                                            });
                                                            await onRecarregarPerfisAction();
                                                        }}
                                                        className="p-1.5 rounded-lg text-rose-400 hover:bg-[#BE1E23]/15 cursor-pointer"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {redefinirSenhaId === p.id && (
                                            <div className="flex items-center gap-2 pt-1">
                                                <input
                                                    type="text"
                                                    value={novaSenhaEquipe}
                                                    onChange={(e) => setNovaSenhaEquipe(e.target.value)}
                                                    placeholder="Nova senha (mín. 6 caracteres)"
                                                    className={`flex-1 border rounded-lg px-3 py-1.5 text-xs ${clsInput}`}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => void handleRedefinirSenhaEquipe(p.id)}
                                                    className="px-3 py-1.5 rounded-lg bg-[#0E7C86] text-xs font-semibold text-white cursor-pointer"
                                                >
                                                    Salvar
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}