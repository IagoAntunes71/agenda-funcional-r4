export type CadastroColegioR4 = { id: number | null; nome: string; total_alunos: number };

function normalizar(nome: string) {
    return nome.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ').trim();
}

function nomeComparavel(nome: string) {
    return normalizar(nome).split(' ')
        .filter((palavra) => !['colegio', 'escola', 'instituto', 'centro', 'educacional', 'de', 'da', 'do', 'das', 'dos'].includes(palavra))
        .join(' ');
}

function distancia(a: string, b: string) {
    let anterior = Array.from({ length: b.length + 1 }, (_, indice) => indice);
    for (let i = 1; i <= a.length; i++) {
        const linha = [i];
        for (let j = 1; j <= b.length; j++) {
            linha[j] = Math.min(linha[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + Number(a[i - 1] !== b[j - 1]));
        }
        anterior = linha;
    }
    return anterior[b.length];
}

export function sugerirColegiosDuplicados(cadastros: CadastroColegioR4[]) {
    const nomes = cadastros.map((cadastro) => nomeComparavel(cadastro.nome));
    const pares: [CadastroColegioR4, CadastroColegioR4][] = [];
    for (let i = 0; i < cadastros.length; i++) {
        for (let j = i + 1; j < cadastros.length; j++) {
            const a = nomes[i], b = nomes[j];
            const tolerancia = Math.max(a.length, b.length) >= 12 ? 2 : 1;
            if ((a && a === b) || (Math.min(a.length, b.length) >= 6 &&
                Math.abs(a.length - b.length) <= tolerancia && distancia(a, b) <= tolerancia)) {
                pares.push([cadastros[i], cadastros[j]]);
            }
        }
    }
    return pares;
}
