export const SERIES_ESCOLARES: string[] = [
    '1º Ano - Ensino Fundamental',
    '2º Ano - Ensino Fundamental',
    '3º Ano - Ensino Fundamental',
    '4º Ano - Ensino Fundamental',
    '5º Ano - Ensino Fundamental',
    '6º Ano - Ensino Fundamental',
    '7º Ano - Ensino Fundamental',
    '8º Ano - Ensino Fundamental',
    '9º Ano - Ensino Fundamental',
    '1ª Série - Ensino Médio',
    '2ª Série - Ensino Médio',
    '3ª Série - Ensino Médio',
    'Pré-Vestibular / ENEM',
    'Outra Série / Curso',
];

export function normalizarTelefone(bruto: string): string {
    let digitos = String(bruto || '').replace(/\D/g, '');
    if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) {
        digitos = digitos.slice(2);
    }
    return digitos;
}

export function formatarTelefone(bruto: string): string {
    const d = normalizarTelefone(bruto);
    if (d.length === 11) {
        return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    }
    if (d.length === 10) {
        return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    }
    return d;
}