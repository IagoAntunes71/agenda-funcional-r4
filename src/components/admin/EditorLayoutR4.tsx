'use client';

import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { limitarOffsetLayout, PAGINA_LAYOUT_ADMIN, type LayoutAdmin, type PosicaoLayout, type CampoTextoLayout, type TextoLayout } from '@/lib/layout-admin';
import type { TemaR4 } from '@/lib/cores-r4';
import { PainelPropriedadesLayoutR4 } from './PropriedadesLayoutR4';
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

export function useEditorLayoutR4(visivel: boolean, podeEditar: boolean, tema: TemaR4) {
    const [layoutsSalvos, setLayoutsSalvos] = useState<Partial<Record<TemaR4, LayoutAdmin>>>({});
    const salvo = layoutsSalvos[tema];
    const [rascunho, setRascunho] = useState<LayoutAdmin | null>(null);
    const [novoTexto, setNovoTexto] = useState(false);
    const [posicionarTexto, setPosicionarTexto] = useState<string | TextoLayout | null>(null);
    const [novoCard, setNovoCard] = useState(false);
    const [campoTexto, setCampoTexto] = useState<CampoTextoLayout | undefined>();
    const [selecionado, setSelecionado] = useState<HTMLElement | null>(null);
    const [destino, setDestino] = useState<string | undefined>();
    const [modo, setModo] = useState<'ordem' | 'pixels'>('ordem');
    const [ocupado, setOcupado] = useState(false);
    const pronto = salvo !== undefined;
    const [retorno, setRetorno] = useState<{ tema: TemaR4; texto: string }>();
    const mensagem = retorno?.tema === tema ? retorno.texto : '';
    const nomeTema = tema === 'claro' ? 'Claro' : 'Escuro';
    const setMensagem = (texto: string) => setRetorno({ tema, texto });
    const [consulta, setConsulta] = useState(0);
    const gesto = useRef<{ item: HTMLElement; x: number; y: number; ox: number; oy: number; pixels: boolean; moveu: boolean } | null>(null);
    const ativo = podeEditar && rascunho !== null && visivel;
    const layout = ativo ? rascunho : salvo ?? {};

    useEffect(() => {
        if (!visivel) return;
        const pedido = new AbortController();
        fetch(endpoint + '&tema=' + tema, { cache: 'no-store', signal: pedido.signal })
            .then(async (res) => {
                if (!res.ok) throw new Error();
                const dados = await res.json();
                if (!pedido.signal.aborted) { setLayoutsSalvos((atual) => ({ ...atual, [tema]: dados.layout })); }
            })
            .catch(() => { if (!pedido.signal.aborted) setRetorno({ tema, texto: 'Não foi possível carregar o layout.' }); });
        return () => pedido.abort();
    }, [visivel, consulta, tema]);

    function atualizarItem(id: string, campos: Partial<PosicaoLayout>) {
        setRascunho((atual) => atual && ({ ...atual, [id]: { ...(atual[id] ?? padrao), ...campos } }));
    }

    function atualizarTexto(id: string, campo: CampoTextoLayout, campos: Partial<TextoLayout>) {
        setRascunho((atual) => {
            if (!atual) return atual;
            const posicao = atual[id] ?? padrao;
            return { ...atual, [id]: { ...posicao, textos: {
                ...posicao.textos, [campo]: { ...posicao.textos?.[campo], ...campos },
            } } };
        });
    }

    function remover(id: string, rotulo: string) {
        if (!window.confirm('Remover “' + rotulo + '” da Visão geral?')) return;
        setRascunho((atual) => {
            if (!atual) return atual;
            if (!atual[id]?.card && !atual[id]?.textoLivre) return { ...atual, [id]: { ...(atual[id] ?? padrao), oculto: true } };
            const restante = { ...atual };
            delete restante[id];
            return restante;
        });
        setSelecionado(null);
        setCampoTexto(undefined);
    }

    function selecionar(elemento: HTMLElement, campo?: CampoTextoLayout) {
        setSelecionado(elemento);
        setCampoTexto(campo);
        setNovoCard(false);
        setNovoTexto(false);
    }

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
        setNovoCard(false);
        setNovoTexto(false);
        setPosicionarTexto(null);
        setCampoTexto(undefined);
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
                body: JSON.stringify({ pagina: PAGINA_LAYOUT_ADMIN, tema, layout: novo }),
            });
            const dados = await res.json();
            if (!res.ok) throw new Error(dados.error || 'Não foi possível salvar o layout.');
            setLayoutsSalvos((atual) => ({ ...atual, [tema]: dados.layout }));
            fechar();
            setMensagem(Object.keys(novo).length ? 'Layout salvo no tema ' + nomeTema.toLowerCase() + '.' : 'Padrão restaurado no tema ' + nomeTema.toLowerCase() + '.');
        } catch (erro) {
            setMensagem(erro instanceof Error ? erro.message : 'Não foi possível salvar o layout.');
        } finally { setOcupado(false); }
    }

    function colocarTexto(e: React.MouseEvent<HTMLElement>) {
        if (!ativo || !posicionarTexto || ocupado) return;
        const alvo = (e.target as Element).closest<HTMLElement>(seletor);
        if (alvo?.dataset.r4LayoutId?.startsWith('texto_')) return;
        e.preventDefault();
        e.stopPropagation();
        const caixa = (alvo ?? e.currentTarget).getBoundingClientRect();
        const ponto = {
            alvo: alvo?.dataset.r4LayoutId || 'painel',
            x: Math.max(0, Math.min(100, (e.clientX - caixa.left) / Math.max(1, caixa.width) * 100)),
            y: Math.max(0, Math.min(100, (e.clientY - caixa.top) / Math.max(1, caixa.height) * 100)),
        };
        if (typeof posicionarTexto === 'string') atualizarItem(posicionarTexto, { textoLivre: ponto });
        else atualizarItem('texto_' + crypto.randomUUID(), {
            ...padrao, textoLivre: ponto, textos: { descricao: posicionarTexto },
        });
        setSelecionado(null);
        setCampoTexto(undefined);
        setPosicionarTexto(null);
    }

    function item(id: string, grupo: string, rotulo: string) {
        function alvoDoGesto(e: PointerEvent<HTMLElement>) {
            const alvo = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(`[data-r4-layout-grupo="${grupo}"]`);
            return alvo && alvo !== e.currentTarget && alvo.parentElement === e.currentTarget.parentElement ? alvo : undefined;
        }
        const pos: PosicaoLayout = layout[id] ?? padrao;
        function pertence(e: PointerEvent<HTMLElement>) {
            return (e.target as Element).closest(seletor) === e.currentTarget;
        }
        return {
            'data-r4-layout-id': id, 'data-r4-texto-livre': Boolean(pos.textoLivre) || undefined, 'data-r4-layout-oculto': pos.oculto || undefined,
            'data-r4-layout-largura': pos.largura, 'data-r4-layout-espaco': pos.espacamento,
            'data-r4-layout-superficie': pos.superficie, 'data-r4-layout-tem-texto': Boolean(pos.corTexto) || undefined,
            'data-r4-layout-tem-icone': Boolean(pos.corIcone) || undefined, 'data-r4-layout-grupo': grupo, 'data-r4-layout-rotulo': rotulo,
            'data-r4-layout-editando': ativo || undefined,
            'data-r4-layout-selecionado': ativo && selecionado?.dataset.r4LayoutId === id || undefined,
            'data-r4-layout-destino': ativo && destino === id || undefined,
            style: {
                order: pos.order ?? 1000,
                '--r4-texto-x': pos.textoLivre ? pos.textoLivre.x + '%' : undefined,
                '--r4-texto-y': pos.textoLivre ? pos.textoLivre.y + '%' : undefined,
                '--r4-item-fundo': pos.fundo || 'var(--r4-painel)',
                '--r4-item-texto': pos.corTexto || 'currentColor',
                '--r4-item-icone': pos.corIcone || 'currentColor',
                '--r4-translate': pos.offsetX || pos.offsetY ? pos.offsetX + 'px ' + pos.offsetY + 'px' : 'none',
            } as CSSProperties,
            tabIndex: ativo ? 0 : undefined,
            onFocus: ativo ? (e: React.FocusEvent<HTMLElement>) => {
                if (e.currentTarget === e.target) selecionar(e.currentTarget);
            } : undefined,
            onClickCapture: ativo ? (e: React.MouseEvent<HTMLElement>) => {
                const origem = e.target as Element;
                if (origem.closest('[data-r4-layout-inline]')) return;
                const alvo = origem.closest<HTMLElement>(seletor);
                const texto = origem.closest<HTMLElement>('[data-r4-layout-campo]');
                if (alvo) {
                    e.preventDefault(); e.stopPropagation();
                    selecionar(alvo, texto?.dataset.r4LayoutCampo as CampoTextoLayout | undefined);
                }
            } : undefined,
            onDragStart: ativo ? (e: React.DragEvent<HTMLElement>) => e.preventDefault() : undefined,
            onPointerDown: ativo ? (e: PointerEvent<HTMLElement>) => {
                if (ocupado || posicionarTexto || e.button !== 0 || !e.isPrimary || !pertence(e) || (e.target as Element).closest('[data-r4-layout-campo]')) return;
                const pixels = (modo === 'pixels' || e.shiftKey) && desktop();
                selecionar(e.currentTarget);
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
        item, ativo, pronto, ocupado, mensagem, nomeTema, selecionado, modo, setModo, layout, mover,
        novoCard, setNovoCard, novoTexto, setNovoTexto, posicionarTexto, setPosicionarTexto, colocarTexto, campoTexto, setCampoTexto, atualizarItem, atualizarTexto, remover,
        adicionar(id: string, posicao: PosicaoLayout) {
            atualizarItem(id, posicao);
            setNovoCard(false);
        },
        iniciar: () => { if (salvo && podeEditar) { setRascunho(salvo); setMensagem(''); } },
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
            <span className="font-semibold">Editando tema {editor.nomeTema.toLowerCase()}</span>
            <button type="button" disabled={editor.ocupado} onClick={() => { editor.setNovoTexto(false); editor.setNovoCard(true); }}>+ Adicionar Card</button>
            <button type="button" disabled={editor.ocupado} onClick={() => {
                editor.setNovoCard(false); editor.setPosicionarTexto(null); editor.setNovoTexto(true);
            }}>+ Adicionar Texto</button>
            <button type="button" className={css.salvar} disabled={editor.ocupado} onClick={() => void editor.gravar(editor.layout)}>Salvar Layout</button>
            <button type="button" disabled={editor.ocupado} onClick={editor.fechar}>Cancelar</button>
            <button type="button" disabled={editor.ocupado} onClick={() => {
                if (window.confirm('Restaurar o layout padrão do tema ' + editor.nomeTema.toLowerCase() + '?')) void editor.gravar({});
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
    return <>
    <PainelPropriedadesLayoutR4 editor={editor} id={id} />
    <div className={css.barra} role="region" aria-label="Editor de layout">
        <button type="button" aria-pressed={editor.modo === 'ordem'} onClick={() => editor.setModo('ordem')}>Reordenar</button>
        <button type="button" className={css.desktop} aria-pressed={editor.modo === 'pixels'} onClick={() => editor.setModo('pixels')}>Mover em pixels</button>
        {editor.posicionarTexto && <span role="status">Clique dentro de um card ou em uma área livre para posicionar o texto.
            <button type="button" onClick={() => editor.setPosicionarTexto(null)}>Cancelar posição</button></span>}
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
    </div></>;
}
