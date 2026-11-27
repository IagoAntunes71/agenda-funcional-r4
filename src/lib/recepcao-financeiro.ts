type Lancamento = {
    id: number;
    aluno_id: number | null;
    aluno: string;
    aluno_cadastro?: string | null;
    unidade: string;
    entrada: string;
    cobrar: number;
};

export function consolidarRecepcao<T extends Lancamento>(aulas: T[]) {
    const grupos = new Map<string, {
        chave: string;
        aluno: string;
        alunoId: number | null;
        aulas: T[];
        unidades: Set<string>;
        aReceber: number;
        recebido: number;
        isento: number;
    }>();
    for (const aula of aulas) {
        const alunoId = aula.aluno_id || null;
        const chave = alunoId ? `aluno:${alunoId}` : `avulsa:${aula.id}`;
        let grupo = grupos.get(chave);
        if (!grupo) {
            grupo = {
                chave, aluno: aula.aluno_cadastro || aula.aluno, alunoId,
                aulas: [], unidades: new Set(), aReceber: 0, recebido: 0, isento: 0,
            };
            grupos.set(chave, grupo);
        }
        grupo.aulas.push(aula);
        if (aula.unidade) grupo.unidades.add(aula.unidade);
        if (aula.entrada === 'pendente') grupo.aReceber += aula.cobrar;
        if (aula.entrada === 'baixado') grupo.recebido += aula.cobrar;
        if (aula.entrada === 'isento') grupo.isento += aula.cobrar;
    }
    return [...grupos.values()].sort((a, b) => a.aluno.localeCompare(b.aluno, 'pt-BR'));
}

export function gerarCsvRecepcao(matriz: (string | number | null | undefined)[][]) {
    return '\uFEFF' + matriz.map((linha) => linha.map((celula) => {
        const texto = String(celula ?? '');
        const seguro = typeof celula === 'string' && /^(\s*[=+@-]|[\t\r\n])/.test(texto) ? "'" + texto : texto;
        return '"' + seguro.replaceAll('"', '""') + '"';
    }).join(';')).join('\r\n');
}
