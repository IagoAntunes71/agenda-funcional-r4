export function unidadeOnline(nome: string | null | undefined) {
    return /^online(?:\s|$)/i.test(nome?.trim() ?? '');
}
