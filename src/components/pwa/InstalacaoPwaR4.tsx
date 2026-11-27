'use client';

import { useEffect, useId, useRef, useState } from 'react';
import styles from './InstalacaoPwaR4.module.css';
import { ArrowRight, Check, Plus, Share, SquarePlus, X } from 'lucide-react';
import { usePathname } from 'next/navigation';

interface EventoInstalacao extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const passos = [
    { titulo: 'Compartilhar', instrucao: 'No Safari, toque no ícone de compartilhar. Se ele estiver dentro do menu, abra o menu primeiro.', Icone: Share },
    { titulo: 'Adicionar à Tela de Início', instrucao: 'Role as opções e toque em Adicionar à Tela de Início.', Icone: SquarePlus },
    { titulo: 'Confirmar instalação', instrucao: 'Se aparecer a opção Abrir como App Web, deixe-a ativada. Toque em Adicionar e abra o R4 pelo novo ícone.', Icone: Check },
];

export default function InstalacaoPwaR4({ app }: { app: 'equipe' | 'portal' }) {
    const pathname = usePathname();
    const entrada = app === 'equipe' ? '/admin' : '/portal';
    const [instalado, setInstalado] = useState(false);
    const [ios, setIos] = useState(false);
    const [evento, setEvento] = useState<EventoInstalacao | null>(null);
    const [fechado, setFechado] = useState(false);

    const dialogo = useRef<HTMLDialogElement>(null);
    const tituloId = useId();
    const [aberto, setAberto] = useState(false);
    const [passo, setPasso] = useState(0);
    const [reproduzir, setReproduzir] = useState(false);
    const mostrar = !instalado && !fechado && (ios || Boolean(evento) || pathname === '/');

    useEffect(() => {
        if (!aberto || !mostrar || !reproduzir || passo === passos.length - 1) return;
        const timer = window.setTimeout(() => setPasso(passo + 1), 3600);
        return () => window.clearTimeout(timer);
    }, [aberto, mostrar, reproduzir, passo]);

    useEffect(() => {
        const modal = dialogo.current;
        if (aberto && mostrar && !modal?.open) modal?.showModal();
    }, [aberto, mostrar]);

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

    if (!mostrar) return null;
    const nome = app === 'equipe' ? 'R4 Equipe' : 'R4 Portal do Aluno';
    const icone = '/pwa/' + app + '-192.png';
    const etapa = passos[passo];

    function abrirTutorial() {
        setPasso(0);
        setReproduzir(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        setAberto(true);
    }

    return <>
        <aside aria-label="Instalação do app"
            className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-md items-center gap-1 rounded-xl border border-teal-700/70 bg-slate-950 p-1 text-white shadow-xl">
            <button type="button" className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 text-left hover:bg-slate-800"
                onClick={abrirTutorial}>
                <img src={icone} alt="" className="size-8 rounded-lg" />
                <span className="flex-1 text-sm font-semibold">Instalar {nome}</span>
                <ArrowRight size={16} aria-hidden />
            </button>
            <button type="button" aria-label="Dispensar convite de instalação" className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-slate-800"
                onClick={() => setFechado(true)}><X size={18} aria-hidden /></button>
        </aside>
        {aberto && <dialog ref={dialogo} aria-labelledby={tituloId} onClose={() => setAberto(false)}
            className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-teal-700 bg-slate-950 p-4 text-white shadow-2xl backdrop:bg-slate-950/75 sm:p-6">
            <header className="flex items-center justify-between gap-3">
                <h2 id={tituloId} className="text-lg font-bold">Instalar {nome}</h2>
                <button type="button" aria-label="Fechar tutorial" className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-slate-800"
                    onClick={() => dialogo.current?.close()}><X size={20} aria-hidden /></button>
            </header>
            {pathname === '/' ? <a className="mt-4 inline-block font-semibold text-teal-300 underline" href={entrada}>
                Abrir a página de instalação do Portal
            </a> : ios ? <>
                <div className="mt-3 grid min-h-40 place-items-center rounded-xl bg-linear-to-br from-teal-950 to-slate-800 p-4" aria-hidden="true">
                    <div key={passo} className={`${styles.etapa} flex w-full max-w-64 flex-col items-center gap-3 text-center`}>
                        {passo === 0 && <>
                            <div className="flex items-center gap-2"><img src={icone} alt="" className="size-8 rounded-lg" />{nome}</div>
                            <div className="flex w-full items-center justify-between rounded-xl bg-slate-950 p-2 text-xs">
                                <span className="ml-2 text-slate-300">Barra do Safari</span>
                                <span className="rounded-lg bg-teal-300 p-2 text-teal-950"><Share size={20} /></span>
                            </div>
                        </>}
                        {passo === 1 && <div className="w-full rounded-xl bg-slate-950 p-3 text-left">
                            <p className="mb-2 text-xs text-slate-300">Menu de compartilhamento</p>
                            <div className="flex items-center gap-2 rounded-lg bg-teal-300 p-2 text-xs font-bold text-teal-950">
                                <SquarePlus size={18} className="shrink-0" />{etapa.titulo}
                            </div>
                        </div>}
                        {passo === 2 && <div className="flex w-full items-center gap-3 rounded-xl bg-slate-950 p-3 text-left">
                            <img src={icone} alt="" className="size-10 rounded-xl" />
                            <span className="flex-1 text-xs font-semibold">{nome}</span>
                            <span className="rounded-lg bg-teal-300 px-2 py-1 text-xs font-bold text-teal-950">Adicionar</span>
                        </div>}
                    </div>
                </div>
                <ol className="my-3 space-y-1">
                    {passos.map(({ titulo, instrucao, Icone }, indice) => (
                        <li key={titulo}>
                            <button type="button" aria-current={passo === indice ? 'step' : undefined}
                                className={`flex w-full items-start gap-3 rounded-lg border p-2 text-left text-sm ${passo === indice ? 'border-teal-500 bg-teal-950' : 'border-transparent hover:bg-slate-800'}`}
                                onClick={() => { setReproduzir(false); setPasso(indice); }}>
                                <Icone size={18} className="mt-0.5 shrink-0 text-teal-300" aria-hidden />
                                <span>{instrucao}</span>
                            </button>
                        </li>
                    ))}
                </ol>
                <button type="button" className="min-h-11 px-2 text-sm font-semibold text-teal-300"
                    onClick={() => {
                        if (reproduzir && passo < passos.length - 1) setReproduzir(false);
                        else { setPasso(0); setReproduzir(true); }
                    }}>{reproduzir && passo < passos.length - 1 ? 'Pausar demonstração' : 'Rever demonstração'}</button>
            </> : evento && <button type="button" className="mt-4 rounded-lg bg-teal-300 px-4 py-3 font-bold text-teal-950"
                onClick={async () => {
                    try { await evento.prompt(); await evento.userChoice; } finally { setEvento(null); }
                }}><Plus size={16} className="mr-2 inline" aria-hidden />Instalar app</button>}
            <button type="button" className="mt-3 w-full rounded-lg border border-slate-500 px-4 py-3 text-sm font-semibold hover:bg-slate-800"
                onClick={() => dialogo.current?.close()}>Fechar</button>
        </dialog>}
    </>;
}
