'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Textos = Record<string, string>;
type Contexto = { textos: Textos; publicar: (textos: Textos) => void; pronto: boolean };
const Context = createContext<Contexto>({ textos: {}, publicar: () => undefined, pronto: false });

export function ProvedorTextosR4({ children }: { children: ReactNode }) {
    const [textos, setTextos] = useState<Textos>({});
    const [pronto, setPronto] = useState(false);
    useEffect(() => {
        let controller: AbortController;
        function carregar() {
        controller?.abort();
        controller = new AbortController();
        const pedido = controller;
        fetch('/api/textos-interface', { signal: pedido.signal })
            .then(async (res) => {
                if (!res.ok) return;
                const dados = await res.json();
                if (!pedido.signal.aborted) {
                    setTextos(dados.textos);
                    setPronto(true);
                }
            })
            .catch(() => undefined);
        }
        carregar();
        window.addEventListener('r4-sessao-alterada', carregar);
        return () => {
            controller?.abort();
            window.removeEventListener('r4-sessao-alterada', carregar);
        };
    }, []);
    return <Context.Provider value={{ textos, publicar: setTextos, pronto }}>{children}</Context.Provider>;
}

export function useCatalogoTextosR4() {
    return useContext(Context);
}

export function useTextoR4() {
    const { textos } = useContext(Context);
    return (original: string) => textos[original] || original;
}
