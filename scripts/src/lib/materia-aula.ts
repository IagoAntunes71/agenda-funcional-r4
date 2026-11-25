export function materiaBase(materia: string | null | undefined) {
    return (materia || '').trim().replace(/(?:\s+)(?:50|100)(?:\s*(?:min\.?|['’]))?$/i, '').trim();
}

export function materiasBase(materias: string[] | null | undefined) {
    return [...new Set((materias || []).map(materiaBase).filter(Boolean))];
}

export function rotuloMateriaAula(materia: string | null | undefined, duracao: number) {
    const base = materiaBase(materia);
    return base ? `${base} ${duracao >= 100 ? 100 : 50}` : '';
}
