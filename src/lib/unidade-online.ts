export function unidadeOnline(nome: string | null | undefined) {
    return nome?.trim().toLowerCase() === 'online';
}
