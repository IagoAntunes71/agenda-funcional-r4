import { SERIES_ESCOLARES } from './cliente-helpers';

export const FORMATO_ALUNOS_CLINCARE = 'r4-clincare-alunos-v1';

export type ResponsavelClinCare = {
    nome: string;
    telefone: string;
    cpf: string;
    email: string;
    principal: boolean;
};

export type AlunoClinCare = {
    clin_care_aluno_id: string;
    nome_aluno: string;
    colegio_nome?: string;
    serie?: string;
    nascimento: string;
    endereco: string;
    responsaveis: ResponsavelClinCare[];
};

const colegiosEquivalentes = [
    { nome: 'Antônio Vieira', chaves: ['antonio vieira', 'cav', 'cav antonio vieira', 'colegio antonio vieira'] },
    { nome: 'São Paulo', chaves: ['sao paulo', 'csp', 'csp sao paulo', 'colegio sao paulo'] },
    { nome: 'Bernoulli', chaves: ['bernoulli', 'berno', 'colegio bernoulli'] },
];

function chaveEscolar(valor: string) {
    return valor.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function padronizarColegioClinCare(valor: string) {
    const chave = chaveEscolar(valor);
    return colegiosEquivalentes.find(({ chaves }) => chaves.includes(chave))?.nome ?? valor.trim().replace(/\s+/g, ' ');
}

export function chavesColegioClinCare(nome: string) {
    const chave = chaveEscolar(nome);
    return colegiosEquivalentes.find(({ chaves }) => chaves.includes(chave))?.chaves ?? [chave];
}

export function inferirSerieClinCare(valor: string) {
    const chave = chaveEscolar(valor);
    const oficial = SERIES_ESCOLARES.find((serie) => chaveEscolar(serie) === chave);
    if (oficial) return oficial;
    const numero = /(?:^|\s)([1-9])\s*(?:[ºª°o]|\.)?\s*(?:ano|serie)\b/.exec(chave)?.[1];
    if (!numero) return '';
    const ano = Number(numero);
    if (chave.includes('medio') && ano > 3) return '';
    return SERIES_ESCOLARES[ano <= 3 && !chave.includes('fundamental') ? ano + 8 : ano - 1];
}

export function inferirColegioClinCare(nomeAluno: string) {
    const partes = nomeAluno.split(/\s+[-–—]\s+/);
    const colegio = partes.length >= 3 && /\b(ano|s[eé]rie)\b/i.test(partes.at(-2) || '') ? partes.at(-1)?.trim() || '' : '';
    return /^(sem (col[eé]gio|escola)|n[aã]o informado|outros?|particular|[-–—])$/i.test(colegio) ? '' : colegio.slice(0, 180);
}

export function validarAlunoClinCare(aluno: unknown): aluno is AlunoClinCare {
    if (!aluno || typeof aluno !== 'object') return false;
    const item = aluno as Partial<AlunoClinCare>;
    const nascimento = item.nascimento;
    if (typeof nascimento !== 'string' || (nascimento && (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento) ||
        !Number.isFinite(Date.parse(nascimento)) || new Date(nascimento).toISOString().slice(0,10) !== nascimento))) return false;
    return typeof item.clin_care_aluno_id === 'string' &&
        /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(item.clin_care_aluno_id) &&
        typeof item.nome_aluno === 'string' && item.nome_aluno.trim().length >= 2 && item.nome_aluno.length <= 180 &&
        (item.colegio_nome === undefined || (typeof item.colegio_nome === 'string' && item.colegio_nome.length <= 180)) &&
        (item.serie === undefined || (typeof item.serie === 'string' && item.serie.length <= 180)) &&
        typeof item.endereco === 'string' && item.endereco.length <= 1000 &&
        Array.isArray(item.responsaveis) && item.responsaveis.length <= 50 && item.responsaveis.every((r) =>
            r && typeof r.nome === 'string' && r.nome.trim().length >= 2 && r.nome.length <= 180 &&
            typeof r.telefone === 'string' && r.telefone.length <= 40 &&
            typeof r.cpf === 'string' && (r.cpf === '' || /^\d{11}$/.test(r.cpf)) &&
            typeof r.email === 'string' && r.email.length <= 254 && typeof r.principal === 'boolean');
}
