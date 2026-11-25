export const CAMPOS_CORES = {
    principal: 'Cor principal', botao: 'Botões principais', fundo: 'Fundo da página',
    painel: 'Painéis e cartões', texto: 'Texto', destaque: 'Destaques',
    confirmado: 'Confirmado', cancelado: 'Cancelado', bloqueio: 'Bloqueio',
} as const;

export type CoresR4 = Record<keyof typeof CAMPOS_CORES, string>;
export type TemaR4 = 'claro' | 'escuro';
export type PaletaR4 = Record<TemaR4, CoresR4>;

export const PALETA_R4: PaletaR4 = {
    claro: {
        principal: '#087983', botao: '#096d75', fundo: '#faf2ec', painel: '#fffdfa',
        texto: '#352522', destaque: '#bc3829', confirmado: '#287b65', cancelado: '#596e83', bloqueio: '#8f4f40',
    },
    escuro: {
        principal: '#86d4ce', botao: '#096d75', fundo: '#221918', painel: '#302321',
        texto: '#f8e9e3', destaque: '#ef8c76', confirmado: '#8fd1b7', cancelado: '#acb8cb', bloqueio: '#dfaa9c',
    },
};

export function validarPaleta(valor: unknown): PaletaR4 | null {
    if (!valor || typeof valor !== 'object') return null;
    const entrada = valor as Record<string, Record<string, unknown>>;
    const resultado = { claro: { ...PALETA_R4.claro }, escuro: { ...PALETA_R4.escuro } };
    for (const tema of ['claro', 'escuro'] as const) {
        for (const campo of Object.keys(CAMPOS_CORES) as (keyof CoresR4)[]) {
            const cor = entrada[tema]?.[campo];
            if (typeof cor !== 'string' || !/^#[a-f0-9]{6}$/i.test(cor)) return null;
            resultado[tema][campo] = cor.toLowerCase();
        }
    }
    return resultado;
}

function luminancia(cor: string) {
    const canais = [1, 3, 5].map((i) => {
        const valor = parseInt(cor.slice(i, i + 2), 16) / 255;
        return valor <= 0.04045 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4;
    });
    return canais[0] * 0.2126 + canais[1] * 0.7152 + canais[2] * 0.0722;
}

export function contraste(a: string, b: string) {
    const [escura, clara] = [luminancia(a), luminancia(b)].sort((x, y) => x - y);
    return (clara + 0.05) / (escura + 0.05);
}

export function textoNoBotao(cor: string) {
    return contraste(cor, '#ffffff') >= contraste(cor, '#000000') ? '#ffffff' : '#000000';
}

export function problemasContraste(cores: CoresR4) {
    const problemas: string[] = [];
    if (contraste(cores.texto, cores.fundo) < 4.5) problemas.push('Texto sobre o fundo');
    if (contraste(cores.texto, cores.painel) < 4.5) problemas.push('Texto sobre os cartões');
    for (const campo of ['principal', 'destaque', 'confirmado', 'cancelado', 'bloqueio'] as const) {
        if (contraste(cores[campo], cores.painel) < 4.5) problemas.push(CAMPOS_CORES[campo] + ' sobre os cartões');
    }
    return problemas;
}
