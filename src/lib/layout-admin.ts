import type { TemaR4 } from './cores-r4';
import { MODULOS_ADMIN, type ModuloAdmin } from './admin-navegacao';

export const PAGINA_LAYOUT_ADMIN = 'dashboard_visao_geral';
export const LIMITE_OFFSET_LAYOUT = 48;
export const GRUPOS_CARDS = ['secoes', 'visao', 'unidades', 'atalhos', 'metas'] as const;
export const ICONES_CARDS = ['grade', 'agenda', 'pessoas', 'escola', 'aviso'] as const;
export const SUPERFICIES = ['branco', 'marca', 'vidro', 'personalizado'] as const;
export const FONTES = ['painel', 'humanista', 'serifada', 'monoespacada'] as const;
export const TAMANHOS_TEXTO = ['pequeno', 'medio', 'grande', 'extra'] as const;
export const PESOS = ['normal', 'semibold', 'bold'] as const;
export const LARGURAS = ['1', '2', '3', 'total'] as const;
export const ESPACAMENTOS = ['compacto', 'normal', 'amplo'] as const;
export type CampoTextoLayout = 'titulo' | 'descricao' | 'rotulo' | 'feitos' | 'faltantes' | 'vencidos';
const CAMPOS_TEXTO: readonly CampoTextoLayout[] = ['titulo', 'descricao', 'rotulo', 'feitos', 'faltantes', 'vencidos'];

export type TextoLayout = {
    texto?: string;
    cor?: string;
    fonte?: typeof FONTES[number];
    tamanho?: typeof TAMANHOS_TEXTO[number];
    peso?: typeof PESOS[number];
};

export type PosicaoLayout = {
    order?: number;
    offsetX: number;
    offsetY: number;
    oculto?: boolean;
    largura?: typeof LARGURAS[number];
    espacamento?: typeof ESPACAMENTOS[number];
    superficie?: typeof SUPERFICIES[number];
    fundo?: string;
    corTexto?: string;
    corIcone?: string;
    modulo?: ModuloAdmin;
    icone?: typeof ICONES_CARDS[number];
    textoLivre?: { alvo: string; x: number; y: number };
    card?: { grupo: typeof GRUPOS_CARDS[number]; tipo: 'atalho' | 'aviso' };
    textos?: Partial<Record<CampoTextoLayout, TextoLayout>>;
};

export type LayoutAdmin = Record<string, PosicaoLayout>;

export const moduloLayout = (valor: unknown): valor is ModuloAdmin =>
    typeof valor === 'string' && (MODULOS_ADMIN as readonly string[]).includes(valor);

export function limitarOffsetLayout(valor: number) {
    return Math.max(-LIMITE_OFFSET_LAYOUT, Math.min(LIMITE_OFFSET_LAYOUT, Math.round(valor)));
}

function opcional<T extends string>(valor: unknown, lista: readonly T[]): valor is T | undefined {
    return valor === undefined || (typeof valor === 'string' && lista.some((item) => item === valor));
}

function objeto(valor: unknown): valor is Record<string, unknown> {
    return Boolean(valor && typeof valor === 'object' && !Array.isArray(valor));
}

function cor(valor: unknown) {
    return valor === undefined || (typeof valor === 'string' && /^#[\da-f]{6}$/i.test(valor));
}

export function validarLayoutAdmin(valor: unknown): LayoutAdmin | null {
    if (!objeto(valor) || Object.keys(valor).length > 800) return null;
    const layout: LayoutAdmin = {};
    for (const [id, item] of Object.entries(valor)) {
        if (!/^(bloco|semana|unidade|acao|atalho|meta|custom|texto)_[a-zA-Z0-9_%.-]{1,160}$/.test(id) || !objeto(item)) return null;
        const { order, offsetX, offsetY, oculto, largura, espacamento, superficie, fundo, corTexto, corIcone, modulo, icone, card, textos, textoLivre } = item as Partial<PosicaoLayout>;
        if (order !== undefined && (!Number.isSafeInteger(order) || order < 0 || order > 800)) return null;
        if (typeof offsetX !== 'number' || !Number.isSafeInteger(offsetX) || Math.abs(offsetX) > LIMITE_OFFSET_LAYOUT ||
            typeof offsetY !== 'number' || !Number.isSafeInteger(offsetY) || Math.abs(offsetY) > LIMITE_OFFSET_LAYOUT) return null;
        if ((oculto !== undefined && typeof oculto !== 'boolean') ||
            !opcional(largura, LARGURAS) || !opcional(espacamento, ESPACAMENTOS) || !opcional(superficie, SUPERFICIES) ||
            !opcional(icone, ICONES_CARDS) || !cor(fundo) || !cor(corTexto) || !cor(corIcone) ||
            (modulo !== undefined && !moduloLayout(modulo))) return null;
        if (id.startsWith('texto_') !== Boolean(textoLivre)) return null;
        if (textoLivre && (!objeto(textoLivre) || typeof textoLivre.alvo !== 'string' ||
            !/^(painel|(bloco|semana|unidade|acao|atalho|meta|custom)_[a-zA-Z0-9_%.-]{1,160})$/.test(textoLivre.alvo) ||
            ![textoLivre.x, textoLivre.y].every((v) => Number.isFinite(v) && v >= 0 && v <= 100))) return null;
        if (id.startsWith('custom_') !== Boolean(card)) return null;
        if (card && (!objeto(card) || !GRUPOS_CARDS.includes(card.grupo) ||
            !['atalho','aviso'].includes(card.tipo) || (card.tipo === 'atalho' && !modulo))) return null;
        const textosValidados: NonNullable<PosicaoLayout['textos']> = {};
        if (textos !== undefined) {
            if (!objeto(textos)) return null;
            for (const [campo, estilo] of Object.entries(textos)) {
                if (!CAMPOS_TEXTO.some((nome) => nome === campo) || !objeto(estilo)) return null;
                const { texto, fonte, tamanho, peso, cor: corTextoCampo } = estilo as TextoLayout;
                if ((texto !== undefined && (typeof texto !== 'string' || texto.length > (campo === 'descricao' ? 1600 : 160))) ||
                    !cor(corTextoCampo) || !opcional(fonte,FONTES) || !opcional(tamanho,TAMANHOS_TEXTO) || !opcional(peso,PESOS)) return null;
                textosValidados[campo as CampoTextoLayout] = { texto, fonte, tamanho, peso, cor: corTextoCampo };
            }
        }
        layout[id] = { order, offsetX, offsetY, oculto, largura, espacamento, superficie, fundo, corTexto, corIcone, modulo, icone,
            textoLivre: textoLivre ? { alvo: textoLivre.alvo, x: textoLivre.x, y: textoLivre.y } : undefined,
            card: card ? { grupo: card.grupo, tipo: card.tipo } : undefined, textos: textos === undefined ? undefined : textosValidados };
    }
    return layout;
}

export function temaLayoutValido(valor: unknown): valor is TemaR4 {
    return valor === 'claro' || valor === 'escuro';
}

export function adaptarLayoutAnterior(layout: LayoutAdmin, tema: TemaR4): LayoutAdmin {
    if (tema === 'claro') return layout;
    return Object.fromEntries(Object.entries(layout).map(([id, item]) => [id, {
        ...item,
        superficie: undefined, fundo: undefined, corTexto: undefined, corIcone: undefined,
        textos: item.textos && Object.fromEntries(Object.entries(item.textos).map(([campo, estilo]) =>
            [campo, { ...estilo, cor: undefined }]
        )),
    }]));
}
