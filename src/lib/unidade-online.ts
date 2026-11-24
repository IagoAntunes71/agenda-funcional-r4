export function unidadeOnline(nome: string | null | undefined, clinCareId: string | null | undefined) {
    return nome?.trim().toLowerCase() === 'online' || clinCareId?.trim().toLowerCase() === 'id-online';
}
