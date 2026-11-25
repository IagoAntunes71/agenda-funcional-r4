'use client';

import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { limitarOffsetLayout, PAGINA_LAYOUT_ADMIN, type LayoutAdmin } from '@/lib/layout-admin';
import css from './EditorLayoutR4.module.css';

const endpoint = '/api/admin/layout?pagina=' + PAGINA_LAYOUT_ADMIN;
const padrao = { offsetX: 0, offsetY: 0 };
const desktop = () => window.matchMedia('(min-width: 1024px)').matches;
const seletor = '[data-r4-layout-id]';

function irmaos(elemento: HTMLElement) {
    return Array.from(elemento.parentElement?.children ?? [])
        .filter((item): item is HTMLElement => item instanceof HTMLElement &&
            Boolean(item.dataset.r4LayoutId) && item.dataset.r4LayoutGrupo === elemento.dataset.r4LayoutGrupo)
        .sort((a,b) => Number(getComputedStyle(a).order) - Number(getComputedStyle(b).order));
}

export function useEditorLayoutR4(visivel: boolean, podeEditar: boolean) {
    const [salvo, setSalvo] = useState<LayoutAdmin>({});
    const [rascunho, setRascunho] = useState<LayoutAdmin | null>(null);
    const [selecionado, setSelecionado] = useState<HTMLElement | null>(null);
    const [destino, setDestino] = useState<string | undefined>();
    const [modo, setModo] = useState<'ordem' | 'pixels'>('ordem');
    const [ocupado, setOcupado] = useState(false);
    const [pronto, setPronto] = useState(false);
    const [mensagem, setMensagem] = useState('');
    const [consulta, setConsulta] = useState(0);
    const gesto = useRef<{ item: HTMLElement; x: number; y: number; ox: number; oy: number; pixels: boolean; moveu: boolean } | null>(null);
    const ativo = podeEditar && rascunho !== null && visivel;
    const layout = ativo ? rascunho : salvo;

    useEffect(() => {
        if (!visivel) return;
        const pedido = new AbortController();
        fetch(endpoint, { cache: 'no-store', signal: pedido.signal })
            .then(async (res) => {
                if (!res.ok) throw new Error();
                const dados = await res.json();
                if (!pedido.signal.aborted) { setSalvo(dados.layout); setPronto(true); }
            })
            .catch(() => { if (!pedido.signal.aborted) setMensagem('Não foi possível carregar o layout.'); });
        return () => pedido.abort();
    }, [visivel, consulta]);

    function mover(id: string, x: number, y: number) {
        setRascunho((anterior) => anterior && ({
            ...anterior, [id]: { ...anterior[id], offsetX: limitarOffsetLayout(x), offsetY: limitarOffsetLayout(y) },
        }));
    }

    function ordenar(item: HTMLElement, destino: HTMLElement) {
        const itens = irmaos(item);
        const de = itens.indexOf(item);
        const para = itens.indexOf(destino);
        if (de < 0 || para < 0 || de === para) return;
        itens.splice(de, 1);
        itens.splice(para, 0, item);
        setRascunho((atual) => {
            if (!atual) return atual;
            const ordem = { ...atual };
            itens.forEach((el, i) => {
                const id = el.dataset.r4LayoutId!;
                ordem[id] = { ...(ordem[id] ?? padrao), order: i };
            });
            return ordem;
        });
    }

    function fechar() {
        setRascunho(null);
        setSelecionado(null);
        setDestino(undefined);
        setModo('ordem');
        gesto.current = null;
    }

    async function gravar(novo: LayoutAdmin) {
        if (!ativo || ocupado) return;
        setMensagem('');
        setOcupado(true);
        try {
            const res = await fetch(endpoint, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pagina: PAGINA_LAYOUT_ADMIN, layout: novo }),
            });
            const dados = await res.json();
            if (!res.ok) throw new Error(dados.error || 'Não foi possível salvar o layout.');
            setSalvo(dados.layout);
            fechar();
            setMensagem(Object.keys(novo).length ? 'Layout salvo.' : 'Layout padrão restaurado.');
        } catch (erro) {
            setMensagem(erro instanceof Error ? erro.message : 'Não foi possível salvar o layout.');
        } finally { setOcupado(false); }
    }

    function item(id: string, grupo: string, rotulo: string) {
        function alvoDoGesto(e: PointerEvent<HTMLElement>) {
            const alvo = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(`[data-r4-layout-grupo="${grupo}"]`);
            return alvo && alvo !== e.currentTarget && alvo.parentElement === e.currentTarget.parentElement ? alvo : undefined;
        }
        const pos = layout[id] ?? padrao;
        function pertence(e: PointerEvent<HTMLElement>) {
            return (e.target as Element).closest(seletor) === e.currentTarget;
        }
        return {
            'data-r4-layout-id': id, 'data-r4-layout-grupo': grupo, 'data-r4-layout-rotulo': rotulo,
            'data-r4-layout-editando': ativo || undefined,
            'data-r4-layout-selecionado': ativo && selecionado?.dataset.r4LayoutId === id || undefined,
            'data-r4-layout-destino': ativo && destino === id || undefined,
            style: {
                order: pos.order ?? 1000,
                '--r4-translate': pos.offsetX || pos.offsetY ? pos.offsetX + 'px ' + pos.offsetY + 'px' : 'none',
            } as CSSProperties,
            tabIndex: ativo ? 0 : undefined,
            onFocus: ativo ? (e: React.FocusEvent<HTMLElement>) => {
                if (e.currentTarget === e.target) setSelecionado(e.currentTarget);
            } : undefined,
            onClickCapture: ativo ? (e: React.MouseEvent<HTMLElement>) => {
                const alvo = (e.target as Element).closest<HTMLElement>(seletor);
                if (alvo) { e.preventDefault(); e.stopPropagation(); setSelecionado(alvo); }
            } : undefined,
            onDragStart: ativo ? (e: React.DragEvent<HTMLElement>) => e.preventDefault() : undefined,
            onPointerDown: ativo ? (e: PointerEvent<HTMLElement>) => {
                if (ocupado || e.button !== 0 || !e.isPrimary || !pertence(e)) return;
                const pixels = (modo === 'pixels' || e.shiftKey) && desktop();
                setSelecionado(e.currentTarget);
                gesto.current = { item: e.currentTarget, x: e.clientX, y: e.clientY, ox: pos.offsetX, oy: pos.offsetY, pixels, moveu: false };
                e.currentTarget.setPointerCapture(e.pointerId);
            } : undefined,
            onPointerMove: ativo ? (e: PointerEvent<HTMLElement>) => {
                const atual = gesto.current;
                if (atual?.item !== e.currentTarget) return;
                const dx = e.clientX - atual.x, dy = e.clientY - atual.y;
                atual.moveu ||= Math.abs(dx) + Math.abs(dy) >= 4;
                if (!atual.moveu) return;
                if (atual.pixels) mover(id, atual.ox + dx, atual.oy + dy);
                else setDestino(alvoDoGesto(e)?.dataset.r4LayoutId);
            } : undefined,
            onPointerUp: ativo ? (e: PointerEvent<HTMLElement>) => {
                const atual = gesto.current;
                if (atual?.item !== e.currentTarget) return;
                gesto.current = null;
                setDestino(undefined);
                if (!atual.pixels && atual.moveu) {
                    const alvo = alvoDoGesto(e);
                    if (alvo) ordenar(atual.item, alvo);
                }
            } : undefined,
            onPointerCancel: ativo ? (e: PointerEvent<HTMLElement>) => {
                const atual = gesto.current;
                if (atual?.item !== e.currentTarget) return;
                gesto.current = null;
                setDestino(undefined);
                if (atual.pixels) mover(id, atual.ox, atual.oy);
            } : undefined,
        };
    }

    return {
        item, ativo, pronto, ocupado, mensagem, selecionado, modo, setModo, layout, mover,
        iniciar: () => { if (pronto && podeEditar) { setRascunho(salvo); setMensagem(''); } },
        fechar, gravar,
        tentar: () => { setMensagem(''); setConsulta((v) => v + 1); },
        trocar(direcao: number) {
            if (!selecionado?.isConnected) return;
            const itens = irmaos(selecionado);
            const destino = itens[itens.indexOf(selecionado) + direcao];
            if (destino) ordenar(selecionado, destino);
        },
    };
}

type Editor = ReturnType<typeof useEditorLayoutR4>;
export const LayoutR4Context = createContext<Editor | null>(null);
export const useLayoutR4 = () => useContext(LayoutR4Context);

export function BotoesLayoutR4({ editor }: { editor: Editor }) {
    return <div className={css.botoes}>
        {editor.ativo ? <>
            <button type="button" className={css.salvar} disabled={editor.ocupado} onClick={() => void editor.gravar(editor.layout)}>Salvar Layout</button>
            <button type="button" disabled={editor.ocupado} onClick={editor.fechar}>Cancelar</button>
            <button type="button" disabled={editor.ocupado} onClick={() => {
                if (window.confirm('Restaurar o layout padrão para todos os usuários?')) void editor.gravar({});
            }}>Resetar Padrão</button>
        </> : <button type="button" disabled={!editor.pronto && !editor.mensagem}
            onClick={editor.pronto ? editor.iniciar : editor.tentar}>{editor.pronto || !editor.mensagem ? 'Editar Layout' : 'Recarregar layout'}</button>}
        {editor.mensagem && <span role="status">{editor.mensagem}</span>}
    </div>;
}

export function BarraLayoutR4({ editor }: { editor: Editor }) {
    if (!editor.ativo) return null;
    const id = editor.selecionado?.isConnected ? editor.selecionado.dataset.r4LayoutId : undefined;
    const posicao = id ? editor.layout[id] ?? padrao : padrao;
    return <div className={css.barra} role="region" aria-label="Editor de layout">
        <button type="button" aria-pressed={editor.modo === 'ordem'} onClick={() => editor.setModo('ordem')}>Reordenar</button>
        <button type="button" className={css.desktop} aria-pressed={editor.modo === 'pixels'} onClick={() => editor.setModo('pixels')}>Mover em pixels</button>
        {id ? <>
            <strong>{editor.selecionado?.dataset.r4LayoutRotulo}</strong>
            <button type="button" disabled={editor.ocupado} onClick={() => editor.trocar(-1)}>Anterior</button>
            <button type="button" disabled={editor.ocupado} onClick={() => editor.trocar(1)}>Próximo</button>
            <div className={css.desktop}>
                {([['↑','Subir',0,-1],['↓','Descer',0,1],['←','Esquerda',-1,0],['→','Direita',1,0]] as const).map(([simbolo, rotulo, x, y]) =>
                    <button type="button" key={rotulo} aria-label={rotulo + ' 1 pixel'} disabled={editor.ocupado}
                        onClick={() => editor.mover(id, posicao.offsetX + x, posicao.offsetY + y)}>{simbolo}</button>)}
                <output aria-label="Deslocamento">X {posicao.offsetX} · Y {posicao.offsetY}</output>
            </div>
        </> : <span>Selecione ou arraste um item para editar.</span>}
    </div>;
}
