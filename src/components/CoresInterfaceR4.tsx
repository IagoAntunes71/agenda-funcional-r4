'use client';

import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { PALETA_R4, textoNoBotao, validarPaleta, type CoresR4, type PaletaR4 } from '@/lib/cores-r4';

const Contexto = createContext({ paleta: PALETA_R4, pronto: false, publicar: (_paleta: PaletaR4) => { void _paleta; } });

export function ProvedorCoresR4({ children }: { children: ReactNode }) {
    const [paleta, publicar] = useState(PALETA_R4);
    const [pronto, setPronto] = useState(false);
    useEffect(() => {
        let controller: AbortController | undefined;
        function carregar() {
            controller?.abort();
            const pedido = new AbortController();
            controller = pedido;
            fetch('/api/cores-interface', { signal: pedido.signal })
                .then(async (res) => {
                    if (!res.ok) return;
                    const cores = validarPaleta((await res.json()).paleta);
                    if (!pedido.signal.aborted && cores) {
                        publicar(cores);
                        setPronto(true);
                    }
                }).catch(() => undefined);
        }
        carregar();
        window.addEventListener('focus', carregar);
        return () => { controller?.abort(); window.removeEventListener('focus', carregar); };
    }, []);
    return <Contexto.Provider value={{ paleta, pronto, publicar }}>{children}</Contexto.Provider>;
}

export function useCoresR4() {
    return useContext(Contexto);
}

export function variaveisCoresR4(cores: CoresR4): CSSProperties {
    return {
        '--r4-principal': cores.principal, '--r4-botao': cores.botao, '--r4-botao-texto': textoNoBotao(cores.botao),
        '--r4-base': cores.fundo, '--r4-painel': cores.painel, '--r4-leitura': cores.texto,
        '--r4-destaque': cores.destaque, '--r4-confirmado': cores.confirmado, '--r4-cancelado': cores.cancelado,
        '--r4-bloqueio': cores.bloqueio,
    } as CSSProperties;
}
