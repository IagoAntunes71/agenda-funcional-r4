import type { RoleSistema } from './admin-auth';

export const MODULOS_ADMIN = ['mapa', 'agendamentos', 'alunos', 'textos', 'datas', 'professores', 'unidades', 'whatsapp'] as const;
export type ModuloAdmin = (typeof MODULOS_ADMIN)[number];
export type PaginaAdmin = 'inicio' | ModuloAdmin;

export function podeAcessarModulo(role: RoleSistema, pagina: PaginaAdmin) {
    if (pagina === 'inicio' || role === 'admin') return true;
    if (role === 'professor') return pagina === 'mapa';
    return pagina === 'mapa' || pagina === 'agendamentos' || pagina === 'alunos' || pagina === 'professores';
}

export function enderecoAdmin(pagina: PaginaAdmin) {
    return pagina === 'inicio' ? '/admin' : '/admin/' + pagina;
}

export function enderecoMapa(data: string, unidade?: number | 'todas') {
    const parametros = new URLSearchParams({ data });
    if (unidade) parametros.set('unidade', String(unidade));
    return '/admin/mapa?' + parametros.toString();
}
