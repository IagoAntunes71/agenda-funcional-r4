export const TOPICOS_EVOLUCAO = [
    '📚 Conteúdo Trabalhado',
    '✅ Desempenho',
    '🎯 Pontos de Atenção',
    '📌 Recomendação',
    '📄 Entrega de Material',
] as const;

export const TEXTO_SEM_MATERIAL = 'Não houve entrega de material complementar.';

export function montarEvolucao(topicos: string[]) {
    return TOPICOS_EVOLUCAO.map((titulo, indice) => `*${titulo}*\n${topicos[indice]?.trim() ?? ''}`).join('\n\n');
}

export function lerEvolucao(texto: string) {
    const blocos = texto.split(/\n\n(?=\*(?:📚|✅|🎯|📌|📄))/u);
    if (blocos.length === TOPICOS_EVOLUCAO.length && blocos.every((bloco, indice) =>
        bloco.startsWith(`*${TOPICOS_EVOLUCAO[indice]}*\n`))) {
        return blocos.map((bloco) => bloco.slice(bloco.indexOf('\n') + 1));
    }
    return [texto, '', '', '', TEXTO_SEM_MATERIAL];
}
