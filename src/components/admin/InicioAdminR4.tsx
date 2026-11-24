import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, CalendarDays, ExternalLink } from 'lucide-react';
import { enderecoAdmin, enderecoMapa, type PaginaAdmin } from '@/lib/admin-navegacao';
import { obterAgoraBahia } from '@/lib/horarios-reforco';
import { formatarDataBR, obterIniciais, type PerfilAdmin, type UnidadeAdmin } from './types';
import css from './InicioAdmin.module.css';

export type ResumoSemana = {
    inicio: string;
    fim: string;
    total: number;
    marcadas: number;
    realizadas: number;
    desmarcadas: number;
};

const perfis = { admin: 'Administrador', atendimento: 'Atendimento', professor: 'Professor' };
const operacao = new Set(['mapa', 'agendamentos', 'alunos']);

export default function InicioAdminR4({ perfil, unidades, resumo, modulos, escuro }: {
    perfil: PerfilAdmin;
    unidades: UnidadeAdmin[];
    resumo: ResumoSemana | null;
    modulos: { id: PaginaAdmin; rotulo: string; subtitulo: string; icone: ReactNode }[];
    escuro: boolean;
}) {
    const hoje = obterAgoraBahia().dataISO;
    const unidadesAtivas = unidades.filter((unidade) => unidade.ativa);
    const grupos = [
        { titulo: perfil.role === 'professor' ? 'Minha agenda' : 'Atendimento e agenda', modulos: modulos.filter((item) => operacao.has(item.id)) },
        { titulo: 'Gestão do R4', modulos: modulos.filter((item) => !operacao.has(item.id)) },
    ];
    const numeros = [
        { titulo: 'Total', valor: resumo?.total, cor: '' },
        { titulo: 'Agendadas e confirmadas', valor: resumo?.marcadas, cor: 'teal' },
        { titulo: 'Realizadas', valor: resumo?.realizadas, cor: 'verde' },
        { titulo: 'Desmarcadas e canceladas', valor: resumo?.desmarcadas, cor: 'coral' },
    ];

    return <div className={css.inicio} data-tema={escuro ? 'escuro' : 'claro'}>
        <div className={css.visao}>
            <section className={css.perfil}>
                <div className={css.identidade}>
                    <span className={css.avatar}>{obterIniciais(perfil.nome)}</span>
                    <div><small>{perfis[perfil.role]}</small><h2>Olá, {perfil.nome}</h2></div>
                </div>
                <Link href={enderecoMapa(hoje)} className={css.destaque}>
                    <CalendarDays /> {perfil.role === 'professor' ? 'Abrir minha agenda' : 'Abrir Mapa do Dia'} <ArrowRight />
                </Link>
            </section>
            <section className={css.resumo} aria-labelledby="r4-resumo-semana">
                <div className={css.cabecalho}><h2 id="r4-resumo-semana">Aulas da semana</h2>
                    {resumo && <small>{formatarDataBR(resumo.inicio).slice(0, 5)} a {formatarDataBR(resumo.fim).slice(0, 5)}</small>}
                </div>
                <dl className={css.numeros}>{numeros.map((item) => <div key={item.titulo} data-cor={item.cor}>
                    <dt>{item.titulo}</dt><dd>{item.valor ?? '—'}</dd>
                </div>)}</dl>
            </section>
        </div>

        {perfil.role !== 'professor' && unidadesAtivas.length > 0 && <section className={css.secao} aria-labelledby="r4-unidades-atalhos">
            <div className={css.cabecalho}>
                <h2 id="r4-unidades-atalhos">Mapa por unidade</h2>
                <small>Os atalhos abrem em novas abas</small>
            </div>
            <div className={css.unidades}>{unidadesAtivas.map((unidade) => (
                <Link key={unidade.id} href={enderecoMapa(hoje, unidade.id)} target="_blank" rel="noopener"
                    aria-label={`Abrir mapa de ${unidade.nome} em nova aba`}>
                    <Building2 /> {unidade.nome} <ExternalLink />
                </Link>
            ))}</div>
        </section>}

        {grupos.filter((grupo) => grupo.modulos.length > 0).map((grupo) => <section className={css.secao} key={grupo.titulo}>
            <div className={css.cabecalho}><h2>{grupo.titulo}</h2></div>
            <div className={css.modulos}>{grupo.modulos.map((item) => <Link key={item.id} className={css.modulo} href={enderecoAdmin(item.id)}>
                <span className={css.icone}>{item.icone}</span><ArrowRight className={css.seta} />
                <strong>{item.id === 'mapa' && perfil.role === 'professor' ? 'Minha agenda' : item.rotulo}</strong>
                <small>{item.subtitulo}</small>
            </Link>)}</div>
        </section>)}
    </div>;
}
