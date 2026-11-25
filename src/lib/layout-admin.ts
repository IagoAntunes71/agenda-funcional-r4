export const PAGINA_LAYOUT_ADMIN = 'dashboard_visao_geral';
export const LIMITE_OFFSET_LAYOUT = 48;
export type PosicaoLayout = { order?: number; offsetX: number; offsetY: number };
export type LayoutAdmin = Record<string, PosicaoLayout>;

export function limitarOffsetLayout(valor: number) {
    return Math.max(-LIMITE_OFFSET_LAYOUT, Math.min(LIMITE_OFFSET_LAYOUT, Math.round(valor)));
}

export function validarLayoutAdmin(valor: unknown): LayoutAdmin | null {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
    const itens = Object.entries(valor);
    if (itens.length > 800) return null;
    const layout: LayoutAdmin = {};
    for (const [id, item] of itens) {
        if (!/^(bloco|semana|unidade|acao|atalho|meta)_[a-zA-Z0-9_%.-]{1,160}$/.test(id) ||
            !item || typeof item !== 'object' || Array.isArray(item)) return null;
        const { order, offsetX, offsetY } = item as Partial<PosicaoLayout>;
        if (order !== undefined && (!Number.isSafeInteger(order) || order < 0 || order > 800)) return null;
        if (typeof offsetX !== 'number' || !Number.isSafeInteger(offsetX) || Math.abs(offsetX) > LIMITE_OFFSET_LAYOUT ||
            typeof offsetY !== 'number' || !Number.isSafeInteger(offsetY) || Math.abs(offsetY) > LIMITE_OFFSET_LAYOUT) return null;
        layout[id] = { order, offsetX, offsetY };
    }
    return layout;
}
