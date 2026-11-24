
import { useTextoR4 } from '@/components/TextosInterfaceR4';
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
const atalhosOperacao = ['recepcao', 'agendamentos', 'alunos', 'controle-alunos'];

export default function InicioAdminR4({ perfil, unidades, resumo, modulos, escuro }: {
    perfil: PerfilAdmin;
    unidades: UnidadeAdmin[];
    resumo: ResumoSemana | null;
    modulos: { id: PaginaAdmin; rotulo: string; subtitulo: string; icone: ReactNode }[];
    escuro: boolean;
}) {
    const textoR4 = useTextoR4();
    const hoje = obterAgoraBahia().dataISO;
    const unidadesAtivas = unidades.filter((unidade) => unidade.ativa);
    const atalhos = atalhosOperacao.flatMap((id) => modulos.filter((item) => item.id === id));
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
                    <div><small>{textoR4(perfis[perfil.role])}</small><h2>{textoR4("Olá,") + ' '}{perfil.nome}</h2></div>
                </div>
                <div className={css.acoes}>
                <Link href={enderecoMapa(hoje, perfil.role === 'professor' ? undefined : 'todas')} className={css.destaque}>
                    <CalendarDays /> {perfil.role === 'professor' ? textoR4("Abrir minha agenda") : textoR4("Abrir Mapa do Dia")} <ArrowRight />
                </Link>
                {atalhos.filter((item) => item.id === 'recepcao').map((item) => (
                    <Link key={item.id} href={enderecoAdmin(item.id)} className={css.secundario}>{item.icone}{textoR4(item.rotulo)}</Link>
                ))}
                </div>
            </section>
            <section className={css.resumo} aria-labelledby="r4-resumo-semana">
                <div className={css.cabecalho}><h2 id="r4-resumo-semana">{textoR4("Aulas da semana")}</h2>
                    {resumo && <small>{formatarDataBR(resumo.inicio).slice(0, 5)} a {formatarDataBR(resumo.fim).slice(0, 5)}</small>}
                </div>
                <dl className={css.numeros}>{numeros.map((item) => <div key={item.titulo} data-cor={item.cor}>
                    <dt>{textoR4(item.titulo)}</dt><dd>{item.valor ?? '—'}</dd>
                </div>)}</dl>
            </section>
        </div>

        {perfil.role !== 'professor' && unidadesAtivas.length > 0 && <section className={css.secao} aria-labelledby="r4-unidades-atalhos">
            <div className={css.cabecalho}>
                <h2 id="r4-unidades-atalhos">{textoR4("Mapa por unidade")}</h2>

            </div>
            <div className={css.unidades}>
                <Link href={enderecoMapa(hoje, 'todas')} target="_blank" rel="noopener"><Building2 />{' ' + textoR4("Todas as unidades") + ' '}<ExternalLink /></Link>
                {unidadesAtivas.map((unidade) => (
                <Link key={unidade.id} href={enderecoMapa(hoje, unidade.id)} target="_blank" rel="noopener"
                    aria-label={`Abrir mapa de ${unidade.nome} em nova aba`}>
                    <Building2 /> {unidade.nome} <ExternalLink />
                </Link>
            ))}</div>
        </section>}

        {atalhos.some((item) => item.id !== 'recepcao') && <section className={css.secao}>
            <div className={css.cabecalho}><h2>{textoR4(perfil.role === 'professor' ? 'Minha agenda' : 'Atendimento e agenda')}</h2></div>
            <div className={css.atalhos}>{atalhos.filter((item) => item.id !== 'recepcao').map((item) => (
                <Link key={item.id} href={enderecoAdmin(item.id)}>{item.icone}<strong>{textoR4(item.rotulo)}</strong><ArrowRight /></Link>
            ))}</div>
        </section>}
    </div>;
}
