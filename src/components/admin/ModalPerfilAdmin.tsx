'use client';

import { useEffect, useState } from 'react';
import { Camera, Eye, EyeOff, Plus, Save, Trash2, UserPlus, X } from 'lucide-react';
import {
    PerfilAdmin,
    TemaClasses,
    comprimirImagemAvatar,
    obterIniciais,
} from './types';

export default function ModalPerfilAdmin({
                                             aberto,
                                             onFechar,
                                             abaInicial,
                                             perfilAtual,
                                             perfisAdmin,
                                             feedbackInicial,
                                             onPerfilAtualizado,
                                             onRecarregarPerfis,
                                             classes,
                                         }: {
    aberto: boolean;
    onFechar: () => void;
    abaInicial: 'meu' | 'equipe';
    perfilAtual: PerfilAdmin;
    perfisAdmin: PerfilAdmin[];
    feedbackInicial: { tipo: 'sucesso' | 'erro'; texto: string } | null;
    onPerfilAtualizado: (novo: PerfilAdmin) => void;
    onRecarregarPerfis: () => Promise<void>;
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

    const [novoAdminNome, setNovoAdminNome] = useState('');
    const [novoAdminEmail, setNovoAdminEmail] = useState('');
    const [novoAdminSenha, setNovoAdminSenha] = useState('');
    const [mostrarNovoAdminSenha, setMostrarNovoAdminSenha] = useState(false);
    const [novoAdminFoto, setNovoAdminFoto] = useState<string | null>(null);
    const [criandoNovoAdmin, setCriandoNovoAdmin] = useState(false);
    const [redefinirSenhaId, setRedefinirSenhaId] = useState<number | null>(null);
    const [novaSenhaEquipe, setNovaSenhaEquipe] = useState('');
    const [feedbackPerfil, setFeedbackPerfil] = useState<{
        tipo: 'sucesso' | 'erro';
        texto: string;
    } | null>(feedbackInicial);

    useEffect(() => {
        if (aberto) {
            setAbaModalPerfil(abaInicial);
            setEditMeuNome(perfilAtual.nome || '');
            setEditMeuEmail(perfilAtual.email || '');
            setEditMinhaFoto(perfilAtual.foto_url || null);
            setEditMinhaNovaSenha('');
            setFeedbackPerfil(feedbackInicial);
        }
    }, [aberto, abaInicial, perfilAtual, feedbackInicial]);

    if (!aberto) return null;

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
                setFeedbackPerfil({
                    tipo: 'erro',
                    texto: json.error || 'Erro ao salvar perfil.',
                });
                return;
            }

            if (json.perfilAtual) {
                onPerfilAtualizado(json.perfilAtual);
            }
            setEditMinhaNovaSenha('');
            setFeedbackPerfil({
                tipo: 'sucesso',
                texto: json.mensagem || 'Perfil atualizado com sucesso!',
            });
            await onRecarregarPerfis();
        } finally {
            setSalvandoMeuPerfil(false);
        }
    }

    async function handleCriarNovoAdmin(e: React.FormEvent) {
        e.preventDefault();
        setCriandoNovoAdmin(true);
        setFeedbackPerfil(null);

        try {
            const res = await fetch('/api/admin/perfis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome: novoAdminNome,
                    email: novoAdminEmail,
                    senha: novoAdminSenha,
                    foto_url: novoAdminFoto,
                }),
            });
            const json = await res.json();
            if (!res.ok) {
                setFeedbackPerfil({
                    tipo: 'erro',
                    texto: json.error || 'Erro ao criar administrador.',
                });
                return;
            }

            setNovoAdminNome('');
            setNovoAdminEmail('');
            setNovoAdminSenha('');
            setNovoAdminFoto(null);
            setFeedbackPerfil({
                tipo: 'sucesso',
                texto: json.mensagem || 'Novo administrador cadastrado!',
            });
            await onRecarregarPerfis();
        } finally {
            setCriandoNovoAdmin(false);
        }
    }

    async function handleRedefinirSenhaEquipe(id: number) {
        if (novaSenhaEquipe.trim().length < 6) {
            setFeedbackPerfil({
                tipo: 'erro',
                texto: 'A nova senha deve ter no mínimo 6 caracteres.',
            });
            return;
        }

        const res = await fetch('/api/admin/perfis', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id,
                nova_senha: novaSenhaEquipe.trim(),
            }),
        });
        const json = await res.json();
        if (!res.ok) {
            setFeedbackPerfil({
                tipo: 'erro',
                texto: json.error || 'Falha ao redefinir senha.',
            });
            return;
        }

        setRedefinirSenhaId(null);
        setNovaSenhaEquipe('');
        setFeedbackPerfil({
            tipo: 'sucesso',
            texto: 'Senha do perfil redefinida com sucesso!',
        });
    }

    async function alternarStatusAdmin(id: number, ativo: boolean) {
        await fetch('/api/admin/perfis', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ativo }),
        });
        await onRecarregarPerfis();
    }

    async function excluirPerfilAdmin(id: number) {
        await fetch(`/api/admin/perfis?id=${id}`, { method: 'DELETE' });
        await onRecarregarPerfis();
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
            <div
                className={`border rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto ${clsCard}`}
            >
                <div className="flex items-center justify-between">
                    <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-[#1496A1]">
                            Conta & Administradores R4
                        </span>
                        <h2 className={`text-lg font-bold ${clsTitulo}`}>
                            Perfil e Controle de Acesso
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onFechar}
                        className={`p-1.5 rounded-lg cursor-pointer ${clsSubtexto}`}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

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
                    <form
                        onSubmit={(e) => void handleSalvarMeuPerfil(e)}
                        className="space-y-4"
                    >
                        <div className="flex items-center gap-4">
                            <label className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-[#0E7C86] cursor-pointer group bg-[#0E7C86]/20 flex items-center justify-center shrink-0">
                                {editMinhaFoto ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={editMinhaFoto}
                                        alt="Avatar"
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <span className="text-lg font-bold text-[#1496A1]">
                                        {obterIniciais(editMeuNome || perfilAtual.nome)}
                                    </span>
                                )}
                                <span className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                                    <Camera className="w-5 h-5" />
                                </span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={async (e) => {
                                        const f = e.target.files?.[0];
                                        if (f) {
                                            const b64 = await comprimirImagemAvatar(f);
                                            setEditMinhaFoto(b64);
                                        }
                                    }}
                                    className="hidden"
                                />
                            </label>

                            <div className="space-y-1">
                                <p className={`text-sm font-bold ${clsTitulo}`}>
                                    Foto de Perfil
                                </p>
                                <p className={`text-xs ${clsSubtexto}`}>
                                    Clique no círculo ao lado para escolher uma foto do seu
                                    computador ou celular.
                                </p>
                                {editMinhaFoto && (
                                    <button
                                        type="button"
                                        onClick={() => setEditMinhaFoto(null)}
                                        className="text-xs text-rose-400 hover:underline cursor-pointer"
                                    >
                                        Remover foto
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                    Seu Nome Completo *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={editMeuNome}
                                    onChange={(e) => setEditMeuNome(e.target.value)}
                                    placeholder="Ex: Coordenação R4"
                                    className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                                />
                            </div>

                            <div>
                                <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                    Seu E-mail de Login *
                                </label>
                                <input
                                    type="email"
                                    required
                                    autoComplete="off"
                                    value={editMeuEmail}
                                    onChange={(e) => setEditMeuEmail(e.target.value)}
                                    placeholder="nome@r4ensina.com.br"
                                    className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                                />
                            </div>
                        </div>

                        <div>
                            <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                                {perfilAtual.id === 0
                                    ? 'Defina sua Senha Pessoal (mín. 6 caracteres) *'
                                    : 'Nova Senha (deixe em branco para manter a atual)'}
                            </label>
                            <div className="relative">
                                <input
                                    type={mostrarMinhaNovaSenha ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    required={perfilAtual.id === 0}
                                    value={editMinhaNovaSenha}
                                    onChange={(e) => setEditMinhaNovaSenha(e.target.value)}
                                    placeholder="Digite a senha desejada"
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
                                onClick={onFechar}
                                className={`px-4 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${clsSubCard}`}
                            >
                                Fechar
                            </button>
                            <button
                                type="submit"
                                disabled={salvandoMeuPerfil}
                                className="px-5 py-2.5 rounded-xl bg-[#0E7C86] hover:bg-[#118E99] text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
                            >
                                <Save className="w-3.5 h-3.5" />
                                {salvandoMeuPerfil ? 'Salvando...' : 'Salvar Meu Perfil'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="space-y-5">
                        <form
                            onSubmit={(e) => void handleCriarNovoAdmin(e)}
                            className={`border rounded-xl p-4 space-y-3 ${clsSubCard}`}
                        >
                            <p className="text-xs font-bold text-[#1496A1] flex items-center gap-1.5">
                                <UserPlus className="w-4 h-4" /> Cadastrar Novo Perfil
                                Administrativo
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <input
                                    type="text"
                                    required
                                    value={novoAdminNome}
                                    onChange={(e) => setNovoAdminNome(e.target.value)}
                                    placeholder="Nome completo *"
                                    className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                />
                                <input
                                    type="email"
                                    required
                                    autoComplete="off"
                                    value={novoAdminEmail}
                                    onChange={(e) => setNovoAdminEmail(e.target.value)}
                                    placeholder="E-mail de acesso *"
                                    className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                />
                                <div className="relative">
                                    <input
                                        type={mostrarNovoAdminSenha ? 'text' : 'password'}
                                        required
                                        autoComplete="new-password"
                                        value={novoAdminSenha}
                                        onChange={(e) => setNovoAdminSenha(e.target.value)}
                                        placeholder="Senha (mín. 6) *"
                                        className={`w-full border rounded-xl pl-3 pr-8 py-2 text-xs ${clsInput}`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setMostrarNovoAdminSenha((v) => !v)}
                                        className={`absolute right-2.5 top-2 cursor-pointer ${clsSubtexto}`}
                                    >
                                        {mostrarNovoAdminSenha ? (
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
                                    <span>
                                        {novoAdminFoto
                                            ? 'Foto selecionada ✓'
                                            : 'Adicionar foto opcional'}
                                    </span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={async (e) => {
                                            const f = e.target.files?.[0];
                                            if (f) {
                                                const b64 = await comprimirImagemAvatar(f);
                                                setNovoAdminFoto(b64);
                                            }
                                        }}
                                        className="hidden"
                                    />
                                </label>

                                <button
                                    type="submit"
                                    disabled={criandoNovoAdmin}
                                    className="px-4 py-2 rounded-xl bg-[#0E7C86] hover:bg-[#118E99] text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    {criandoNovoAdmin ? 'Criando...' : 'Criar Perfil'}
                                </button>
                            </div>
                        </form>

                        <div className="space-y-2">
                            <p className={`text-xs font-bold ${clsTitulo}`}>
                                Perfis Cadastrados ({perfisAdmin.length})
                            </p>
                            {perfisAdmin.length === 0 ? (
                                <p className={`text-xs ${clsSubtexto}`}>
                                    Nenhum perfil individual cadastrado ainda.
                                </p>
                            ) : (
                                perfisAdmin.map((p) => (
                                    <div
                                        key={p.id}
                                        className={`border rounded-xl p-3 space-y-2.5 ${clsSubCard}`}
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
                                                    <p
                                                        className={`text-xs font-bold truncate ${clsTitulo}`}
                                                    >
                                                        {p.nome}{' '}
                                                        {p.id === perfilAtual.id && (
                                                            <span className="text-[10px] text-[#1496A1]">
                                                                (Você)
                                                            </span>
                                                        )}
                                                    </p>
                                                    <p className={`text-[11px] truncate ${clsSubtexto}`}>
                                                        {p.email}
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
                                                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${clsCard} ${clsSubtexto} hover:text-[#1496A1]`}
                                                >
                                                    Redefinir Senha
                                                </button>

                                                {p.id !== perfilAtual.id && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                void alternarStatusAdmin(
                                                                    p.id,
                                                                    !p.ativo
                                                                )
                                                            }
                                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                                                                p.ativo
                                                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/35'
                                                                    : 'bg-stone-500/20 text-stone-400'
                                                            }`}
                                                        >
                                                            {p.ativo ? 'Ativo' : 'Desativado'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                void excluirPerfilAdmin(p.id)
                                                            }
                                                            className="p-1.5 rounded-lg text-rose-400 hover:bg-[#BE1E23]/15 cursor-pointer"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {redefinirSenhaId === p.id && (
                                            <div className="flex items-center gap-2 pt-1">
                                                <input
                                                    type="text"
                                                    autoComplete="new-password"
                                                    value={novaSenhaEquipe}
                                                    onChange={(e) =>
                                                        setNovaSenhaEquipe(e.target.value)
                                                    }
                                                    placeholder="Nova senha (mín. 6 caracteres)"
                                                    className={`flex-1 border rounded-lg px-3 py-1.5 text-xs ${clsInput}`}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void handleRedefinirSenhaEquipe(p.id)
                                                    }
                                                    className="px-3 py-1.5 rounded-lg bg-[#0E7C86] text-xs font-semibold text-white cursor-pointer"
                                                >
                                                    Salvar Senha
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}