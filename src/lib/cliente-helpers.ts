import { materiaBase, materiasBase } from './materia-aula';
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

export const SERIES_FUNDAMENTAL_1: string[] = [
    '1º Ano - Ensino Fundamental',
    '2º Ano - Ensino Fundamental',
    '3º Ano - Ensino Fundamental',
    '4º Ano - Ensino Fundamental',
    '5º Ano - Ensino Fundamental',
];

export const SERIES_FUNDAMENTAL_2: string[] = [
    '6º Ano - Ensino Fundamental',
    '7º Ano - Ensino Fundamental',
    '8º Ano - Ensino Fundamental',
    '9º Ano - Ensino Fundamental',
];

export const SERIES_FUNDAMENTAL_COMPLETO: string[] = [
    ...SERIES_FUNDAMENTAL_1,
    ...SERIES_FUNDAMENTAL_2,
];

export const SERIES_ENSINO_MEDIO: string[] = [
    '1ª Série - Ensino Médio',
    '2ª Série - Ensino Médio',
    '3ª Série - Ensino Médio',
    'Pré-Vestibular / ENEM',
];

export type MapaMateriasSeries = Record<string, string[]>;

/**
 * Retorna true se a matéria daquele professor atende a série informada.
 * Se não houver restrição salva para a matéria (array vazio ou ausente), atende todas.
 */
export function professorAtendeMateriaNaSerie(
    materiasSeries: MapaMateriasSeries | null | undefined,
    materia: string,
    serieAluno: string | null | undefined
): boolean {
    const serieLimpa = String(serieAluno || '').trim();
    if (!serieLimpa) return true;
    if (!materiasSeries || typeof materiasSeries !== 'object') return true;

    const chaveExata = Object.keys(materiasSeries).find(
        (k) => materiaBase(k).toLowerCase() === materiaBase(materia).toLowerCase()
    );
    if (!chaveExata) return true;

    const permitidas = materiasSeries[chaveExata];
    if (!Array.isArray(permitidas) || permitidas.length === 0) return true;

    return permitidas.some(
        (s) => s.trim().toLowerCase() === serieLimpa.toLowerCase()
    );
}

export function isMateriaOcultaCliente(materia: string): boolean {
    const normalizada = String(materia || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

    return (
        normalizada.startsWith('acompanhamento') ||
        normalizada.startsWith('acompnhamento')
    );
}

export function filtrarMateriasVisiveis(
    materias: string[] | null | undefined
): string[] {
    if (!Array.isArray(materias)) return [];
    return materias.filter((m) => Boolean(m?.trim()) && !isMateriaOcultaCliente(m));
}

export function filtrarMateriasProfessorPorSerie(
    materias: string[],
    materiasSeries: MapaMateriasSeries | null | undefined,
    serieAluno: string | null | undefined
): string[] {
    return materiasBase(filtrarMateriasVisiveis(materias).filter((mat) =>
        professorAtendeMateriaNaSerie(materiasSeries, mat, serieAluno)
    ));
}

export function resumirSeriesCurto(series: string[]): string {
    if (!Array.isArray(series) || series.length === 0) return 'Todas as séries';
    if (series.length >= SERIES_ESCOLARES.length - 1) return 'Todas as séries';

    const nomesCurtos = series.map((s) =>
        s
            .replace(' - Ensino Fundamental', ' Fund.')
            .replace(' - Ensino Médio', ' Médio')
            .replace('Pré-Vestibular / ENEM', 'ENEM')
            .replace('Outra Série / Curso', 'Outros')
    );

    if (nomesCurtos.length <= 3) return nomesCurtos.join(', ');
    return `${nomesCurtos[0]} até ${nomesCurtos[nomesCurtos.length - 1]} (${nomesCurtos.length})`;
}

function limparDigitosTelefone(bruto: string): string {
    let digitos = String(bruto || '').replace(/\D/g, '');
    if (digitos.startsWith('0')) {
        digitos = digitos.replace(/^0+/, '');
    }
    if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) {
        digitos = digitos.slice(2);
    }
    return digitos;
}

/**
 * Converte celulares brasileiros de 10 dígitos (sem o 9) para o padrão
 * canônico de 11 dígitos (com o 9), preservando telefones fixos (10 dígitos).
 */
export function normalizarTelefone(bruto: string): string {
    const digitos = limparDigitosTelefone(bruto);
    if (digitos.length === 10 && ['6', '7', '8', '9'].includes(digitos[2])) {
        return `${digitos.slice(0, 2)}9${digitos.slice(2)}`;
    }
    return digitos;
}

/**
 * Retorna as variantes equivalentes de um celular (com 9 e sem 9)
 * para reconhecer cadastros antigos e novos indistintamente.
 */
export function gerarVariantesTelefone(bruto: string): string[] {
    const digitos = limparDigitosTelefone(bruto);
    if (!digitos) return [];

    if (digitos.length === 11 && digitos[2] === '9') {
        const semNove = `${digitos.slice(0, 2)}${digitos.slice(3)}`;
        return [digitos, semNove];
    }

    if (digitos.length === 10 && ['6', '7', '8', '9'].includes(digitos[2])) {
        const comNove = `${digitos.slice(0, 2)}9${digitos.slice(2)}`;
        return [comNove, digitos];
    }

    return [digitos];
}

/**
 * Formata visualmente sem injetar o 9 durante a digitação no input.
 */
export function formatarTelefone(bruto: string): string {
    const d = limparDigitosTelefone(bruto);
    if (d.length === 11) {
        return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    }
    if (d.length === 10) {
        return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    }
    return d;
}