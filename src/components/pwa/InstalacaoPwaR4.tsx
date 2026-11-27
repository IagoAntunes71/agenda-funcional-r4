'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

interface EventoInstalacao extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstalacaoPwaR4({ app }: { app: 'equipe' | 'portal' }) {
    const pathname = usePathname();
    const entrada = app === 'equipe' ? '/admin' : '/portal';
    const [instalado, setInstalado] = useState(false);
    const [ios, setIos] = useState(false);
    const [evento, setEvento] = useState<EventoInstalacao | null>(null);
    const [fechado, setFechado] = useState(false);

    useEffect(() => {
        const modo = window.matchMedia('(display-mode: standalone)');
        const atualizar = () => setInstalado(modo.matches ||
            (navigator as Navigator & { standalone?: boolean }).standalone === true);
        atualizar();
        setIos(/iPhone|iPad|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
        const capturar = (e: Event) => {
            e.preventDefault();
            setEvento(e as EventoInstalacao);
        };
        const aoInstalar = () => { setInstalado(true); setEvento(null); };
        modo.addEventListener('change', atualizar);
        window.addEventListener('beforeinstallprompt', capturar);
        window.addEventListener('appinstalled', aoInstalar);
        if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator &&
            (pathname === entrada || pathname.startsWith(entrada + '/'))) {
            void navigator.serviceWorker.register('/r4-sw.js', {
                scope: entrada, updateViaCache: 'none',
            }).catch((erro) => console.warn('Falha ao registrar o app R4:', erro));
        }
        return () => {
            modo.removeEventListener('change', atualizar);
            window.removeEventListener('beforeinstallprompt', capturar);
            window.removeEventListener('appinstalled', aoInstalar);
        };
    }, [entrada, pathname]);

    if (instalado || fechado || (!ios && !evento && pathname !== '/')) return null;
    const nome = app === 'equipe' ? 'R4 Equipe' : 'R4 Portal do Aluno';

    return <details className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-20 max-w-[calc(100%-1.5rem)] rounded-xl border border-[var(--r4-borda,#475569)] bg-[var(--r4-painel,#fff)] px-3 py-2 text-sm text-[var(--r4-texto,#0f172a)] shadow-md">
        <summary className="cursor-pointer font-semibold">Instalar {nome}</summary>
        <div className="mt-2 max-w-xs space-y-2">
            {pathname === '/' ? <a className="underline" href={entrada}>Abrir a página de instalação do Portal</a> :
                ios ? <p>No Safari, toque em <strong>Compartilhar</strong>, escolha <strong>Adicionar à Tela de Início</strong> e abra o R4 pelo novo ícone.</p> :
                evento && <button type="button" className="rounded-lg bg-sky-800 px-3 py-2 text-white" onClick={async () => {
                    try { await evento.prompt(); await evento.userChoice; } finally { setEvento(null); }
                }}>Instalar app</button>}
            <button type="button" className="block underline" onClick={() => setFechado(true)}>Agora não</button>
        </div>
    </details>;
}
