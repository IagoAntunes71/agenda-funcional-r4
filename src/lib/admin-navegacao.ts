import type { RoleSistema } from './admin-auth';

export const MODULOS_ADMIN = ['mapa', 'agendamentos', 'alunos', 'textos', 'datas', 'professores', 'unidades', 'whatsapp', 'configuracoes', 'controle-alunos', 'recepcao', 'metas'] as const;
export type ModuloAdmin = (typeof MODULOS_ADMIN)[number];
export type PaginaAdmin = 'inicio' | ModuloAdmin;

export function podeAcessarModulo(role: RoleSistema, pagina: PaginaAdmin) {
    if (pagina === 'inicio' || role === 'admin') return true;
    if (role === 'professor') return ['mapa', 'alunos', 'controle-alunos', 'recepcao', 'metas'].includes(pagina);
    return pagina === 'mapa' || pagina === 'agendamentos' || pagina === 'alunos' || pagina === 'professores' || pagina === 'controle-alunos' || pagina === 'recepcao';
}

export function enderecoAdmin(pagina: PaginaAdmin) {
    return pagina === 'inicio' ? '/admin' : '/admin/' + pagina;
}

export function enderecoMapa(data: string, unidade?: number | 'todas') {
    const parametros = new URLSearchParams({ data });
    if (unidade) parametros.set('unidade', String(unidade));
    return '/admin/mapa?' + parametros.toString();
}
