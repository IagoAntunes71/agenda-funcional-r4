'use client';

import { useEffect, useState } from 'react';

async function inscricaoEquipe() {
    if (!('serviceWorker' in navigator)) return null;
    const registro = await navigator.serviceWorker.getRegistration('/admin');
    if (registro && new URL(registro.scope).pathname === '/admin') {
        return await registro.pushManager?.getSubscription();
    }
    return null;
}

async function chamadaPush(dados: object) {
    const res = await fetch('/api/admin/push', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
    });
    const resposta = await res.json();
    if (!res.ok) throw new Error(resposta.error || 'Não foi possível configurar as notificações.');
    return resposta;
}

export async function desativarPushEquipe() {
    const inscricao = await inscricaoEquipe();
    if (!inscricao) return;
    try {
        await chamadaPush({ acao: 'desativar', endpoint: inscricao.endpoint });
    } finally {
        await inscricao.unsubscribe();
    }
}

export default function NotificacoesEquipeR4() {
    const [ativo, setAtivo] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [mensagem, setMensagem] = useState('');
    const [disponivel, setDisponivel] = useState(false);

    useEffect(() => {
        setDisponivel('Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator);
        let vigente = true;
        void inscricaoEquipe().then(async (sub) => {
            if (sub) {
                const status = await chamadaPush({ acao: 'status', endpoint: sub.endpoint });
                if (vigente) setAtivo(status.ativo);
            }
        }).catch(() => {});
        return () => { vigente = false; };
    }, []);

    async function executar(acao: 'ativar' | 'desativar' | 'teste') {
        setOcupado(true);
        setMensagem('');
        try {
            if (acao === 'desativar') {
                await desativarPushEquipe();
                setAtivo(false);
                setMensagem('Notificações desativadas neste aparelho.');
                return;
            }
            if (acao === 'teste') {
                const sub = await inscricaoEquipe();
                if (!sub) throw new Error('Ative primeiro as notificações neste aparelho.');
                await chamadaPush({ acao, endpoint: sub.endpoint });
                setMensagem('Teste aceito pelo serviço de notificações. Confira o celular.');
                return;
            }
            const permissao = await Notification.requestPermission();
            if (permissao !== 'granted') throw new Error('Permita as notificações nas configurações do aparelho.');
            const registro = await navigator.serviceWorker.getRegistration('/admin');
            if (!registro?.active || new URL(registro.scope).pathname !== '/admin') {
                throw new Error('Feche e reabra o R4 Equipe instalado antes de ativar.');
            }
            const res = await fetch('/api/admin/push', { cache: 'no-store' });
            const { chave, error } = await res.json();
            if (!res.ok) throw new Error(error);
            const chaveBinaria = Uint8Array.from(atob(chave.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
            let sub = await registro.pushManager.getSubscription();
            const chaveAtual = sub?.options.applicationServerKey;
            if (sub && chaveAtual && new Uint8Array(chaveAtual).some((b, i) => b !== chaveBinaria[i])) {
                await desativarPushEquipe();
                sub = null;
            }
            sub ??= await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBinaria });
            await chamadaPush({ acao, ...sub.toJSON() });
            setAtivo(true);
            setMensagem('Notificações ativadas neste aparelho.');
        } catch (erro) {
            if (acao === 'teste' && !await inscricaoEquipe().catch(() => null)) setAtivo(false);
            setMensagem(erro instanceof Error ? erro.message : 'Erro ao configurar notificações.');
        } finally {
            setOcupado(false);
        }
    }

    return <details className="mx-4 my-3 rounded-xl border border-[var(--r4-borda,#64748b)] p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Notificações da agenda</summary>
        {disponivel ? <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="r4-acao rounded-lg px-3 py-2" disabled={ocupado}
                onClick={() => void executar(ativo ? 'desativar' : 'ativar')}>
                {ativo ? 'Desativar neste aparelho' : 'Ativar notificações'}
            </button>
            {ativo && <button type="button" className="rounded-lg border px-3 py-2" disabled={ocupado}
                onClick={() => void executar('teste')}>Enviar teste</button>}
        </div> : <p className="mt-2">No iPhone, abra o R4 Equipe pelo ícone instalado na Tela de Início. Em outros aparelhos, use um navegador com suporte a notificações.</p>}
        {mensagem && <p role="status" className="mt-2">{mensagem}</p>}
    </details>;
}
