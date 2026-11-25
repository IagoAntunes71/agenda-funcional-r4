import { useTextoR4 } from '@/components/TextosInterfaceR4';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowRight, BadgeCheck, Building2, CalendarDays, CalendarCheck, CheckCircle2, ExternalLink, Layers3, UserRound } from 'lucide-react';
import { enderecoAdmin, enderecoMapa, podeAcessarModulo, type PaginaAdmin } from '@/lib/admin-navegacao';
import { obterAgoraBahia } from '@/lib/horarios-reforco';
import { formatarDataBR, type PerfilAdmin, type UnidadeAdmin } from './types';
import { CardsLayoutR4, IconeLayoutR4, TextoLayoutR4 } from './ConteudoLayoutR4';
import { useLayoutR4 } from './EditorLayoutR4';
import css from './InicioAdmin.module.css';

type QuantidadesSemana = { total: number; marcadas: number; realizadas: number; desmarcadas: number };
export type ResumoSemana = QuantidadesSemana & { inicio: string; fim: string; dias?: (QuantidadesSemana & { data: string })[] };

const perfis = { admin: 'Administrador', atendimento: 'Atendimento', professor: 'Professor' };
const atalhosOperacao = ['recepcao', 'agendamentos', 'alunos', 'controle-alunos'];
const diasSemana = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const segmentos = [
    { id: 'realizadas', label: 'Realizadas' }, { id: 'marcadas', label: 'Agendadas' },
    { id: 'desmarcadas', label: 'Desmarcadas' }, { id: 'outros', label: 'Outros status' },
] as const;

function GraficoSemana({ dias }: { dias: NonNullable<ResumoSemana['dias']> }) {
    const maximo = Math.max(1, ...dias.map((dia) => dia.total));
    const temOutros = dias.some(({ total, realizadas, marcadas, desmarcadas }) => total > realizadas + marcadas + desmarcadas);
    return <figure className={css.grafico}>
        <figcaption>Aulas por dia</figcaption>
        <div className={css.barras} role="group" aria-label="Distribuição das aulas de segunda a domingo">
            {dias.map((dia, i) => {
                const outros = Math.max(0, dia.total - dia.realizadas - dia.marcadas - dia.desmarcadas);
                const valores = { ...dia, outros };
                const resumo = diasSemana[i] + ' ' + formatarDataBR(dia.data) + ' · ' + dia.total + ' aulas · ' +
                    segmentos.map(({ id, label }) => label + ' ' + valores[id]).join(' · ');
                return <div className={css.dia} key={dia.data}>
                    <div className={css.trilhoDia} role="img" aria-label={resumo} title={resumo}>
                        {segmentos.map(({ id }) => valores[id] > 0 && <i key={id} data-cor={id}
                            style={{ height: (valores[id] / maximo * 100) + '%' }} />)}
                    </div>
                    <span aria-hidden="true">{diasSemana[i]}</span>
                </div>;
            })}
        </div>
        <div className={css.legenda}>{segmentos.filter(({ id }) => id !== 'outros' || temOutros).map(({ id, label }) =>
            <span key={id}><i data-cor={id} />{label}</span>)}</div>
    </figure>;
}

export default function InicioAdminR4({ perfil, unidades, resumo, modulos, escuro, children }: {
    perfil: PerfilAdmin; unidades: UnidadeAdmin[]; resumo: ResumoSemana | null;
    modulos: { id: PaginaAdmin; rotulo: string; subtitulo: string; icone: ReactNode }[];
    escuro: boolean; children?: ReactNode;
}) {
    const textoR4 = useTextoR4();
    const layout = useLayoutR4();
    const hoje = obterAgoraBahia().dataISO;
    const unidadesAtivas = unidades.filter((unidade) => unidade.ativa);
    const atalhos = atalhosOperacao.flatMap((id) => modulos.filter((item) => item.id === id));
    function destino(id: string, original: string) {
        const modulo = layout?.layout[id]?.modulo;
        return modulo ? (podeAcessarModulo(perfil.role, modulo) ? enderecoAdmin(modulo) : null) : original;
    }

    const mapa = destino('acao_mapa', enderecoMapa(hoje, perfil.role === 'professor' ? undefined : 'todas'));
    const recepcao = destino('acao_recepcao', enderecoAdmin('recepcao'));
    const numeros = [
        { id: 'total', titulo: 'Total', valor: resumo?.total, cor: 'outros', Icone: Layers3 },
        { id: 'agendadas', titulo: 'Agendadas e confirmadas', valor: resumo?.marcadas, cor: 'marcadas', Icone: CalendarCheck },
        { id: 'realizadas', titulo: 'Realizadas', valor: resumo?.realizadas, cor: 'realizadas', Icone: CheckCircle2 },
        { id: 'desmarcadas', titulo: 'Desmarcadas e canceladas', valor: resumo?.desmarcadas, cor: 'desmarcadas', Icone: ArrowDownRight },
    ];

    return <div className={css.inicio} data-tema={escuro ? 'escuro' : 'claro'}>
        <div className={css.visao} data-r4-layout-grid="visao" {...layout?.item('bloco_visao', 'secoes', 'Resumo da Visão geral')}>
            <section className={css.perfil} {...layout?.item('bloco_perfil', 'visao', 'Perfil e ações')}>
                <div className={css.identidade}>
                    <span className={css.avatar}>
                        <UserRound size={27} aria-hidden="true" />
                        {perfil.foto_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={perfil.foto_url} src={perfil.foto_url} alt="" onError={(e) => { e.currentTarget.hidden = true; }} />
                        )}
                    </span>
                    <div>
                        <small className={css.cargo}><TextoLayoutR4 id="bloco_perfil" campo="rotulo" texto={textoR4(perfis[perfil.role])} /></small>
                        <h2><TextoLayoutR4 id="bloco_perfil" campo="titulo" texto={textoR4('Olá,') + ' ' + perfil.nome} /> <BadgeCheck size={18} aria-label="Perfil autenticado" /></h2>
                    </div>
                </div>
                <div className={css.acoes}>
                    {mapa && <Link href={mapa} className={css.destaque}
                        {...layout?.item('acao_mapa', 'acoes', 'Mapa do Dia')}>
                        <IconeLayoutR4 icone={layout?.layout.acao_mapa?.icone} fallback={<CalendarDays />} />
                        <TextoLayoutR4 id="acao_mapa" campo="titulo" texto={perfil.role === 'professor' ? textoR4('Abrir minha agenda') : textoR4('Abrir Mapa do Dia')} />
                        <ArrowRight />
                    </Link>}
                    {recepcao && atalhos.filter((item) => item.id === 'recepcao').map((item) => (
                        <Link key={item.id} href={recepcao} className={css.secundario}
                            {...layout?.item('acao_recepcao', 'acoes', item.rotulo)}>
                            <IconeLayoutR4 icone={layout?.layout.acao_recepcao?.icone} fallback={item.icone} />
                            <TextoLayoutR4 id="acao_recepcao" campo="titulo" texto={textoR4(item.rotulo)} />
                        </Link>
                    ))}
                </div>
            </section>

            <section className={css.resumo} aria-labelledby="r4-resumo-semana" {...layout?.item('bloco_semana', 'visao', 'Aulas da semana')}>
                <div className={css.cabecalho}><h2 id="r4-resumo-semana"><TextoLayoutR4 id="bloco_semana" campo="titulo" texto={textoR4('Aulas da semana')} /></h2>
                    {resumo && <small>{formatarDataBR(resumo.inicio).slice(0, 5)} a {formatarDataBR(resumo.fim).slice(0, 5)}</small>}
                </div>
                <div className={css.conteudoResumo}>
                    <dl className={css.numeros} data-r4-layout-grid="dois">{numeros.map(({ Icone, ...item }) => <div key={item.id} data-cor={item.cor}
                        {...layout?.item('semana_' + item.id, 'semana', textoR4(item.titulo))}>
                        <dt><Icone size={15} aria-hidden="true" /><TextoLayoutR4 id={'semana_' + item.id} campo="rotulo" texto={textoR4(item.titulo)} /></dt><dd>{item.valor ?? '—'}</dd>
                    </div>)}</dl>
                    {resumo?.dias?.length ? <GraficoSemana dias={resumo.dias} /> : null}
                </div>
            </section>
            <CardsLayoutR4 grupo="visao" perfil={perfil.role} />
        </div>

        {perfil.role !== 'professor' && (unidadesAtivas.length > 0 || Object.values(layout?.layout ?? {}).some((pos) => pos.card?.grupo === 'unidades')) && <section className={css.secao} aria-labelledby="r4-unidades-atalhos"
            {...layout?.item('bloco_unidades', 'secoes', 'Mapa por unidade')}>
            <div className={css.cabecalho}><h2 id="r4-unidades-atalhos"><TextoLayoutR4 id="bloco_unidades" campo="titulo" texto={textoR4('Mapa por unidade')} /></h2></div>
            <div className={css.grade} data-r4-layout-grid="atalhos">
                {[{ id: 'todas' as const, nome: 'Todas as unidades' }, ...unidadesAtivas].map((unidade) => {
                    const id = 'unidade_' + unidade.id;
                    const personalizado = layout?.layout[id];
                    const href = destino(id, enderecoMapa(hoje, unidade.id));
                    const nome = unidade.id === 'todas' ? textoR4(unidade.nome) : unidade.nome;
                    return href && <Link className={css.card} data-destaque={unidade.id === 'todas'} key={id} href={href}
                        target={personalizado?.modulo ? undefined : '_blank'} rel={personalizado?.modulo ? undefined : 'noopener'}
                        {...layout?.item(id, 'unidades', nome)}>
                        <span className={css.icones}><IconeLayoutR4 icone={personalizado?.icone} fallback={<Building2 size={22} />} />
                            {personalizado?.modulo ? <ArrowRight size={14} /> : <ExternalLink size={14} />}</span>
                        <strong><TextoLayoutR4 id={id} campo="titulo" texto={nome} /></strong>
                        <small><TextoLayoutR4 id={id} campo="descricao" texto={personalizado?.modulo ? 'Abrir módulo' :
                            unidade.id === 'todas' ? 'Agenda consolidada' : 'Abrir mapa do dia'} /></small>
                    </Link>;
                })}
                <CardsLayoutR4 grupo="unidades" perfil={perfil.role} />
            </div>
        </section>}

        {(atalhos.some((item) => item.id !== 'recepcao') || Object.values(layout?.layout ?? {}).some((pos) => pos.card?.grupo === 'atalhos')) &&
        <section className={css.secao} {...layout?.item('bloco_atalhos', 'secoes', 'Atendimento e agenda')}>
            <div className={css.cabecalho}><h2><TextoLayoutR4 id="bloco_atalhos" campo="titulo"
                texto={textoR4(perfil.role === 'professor' ? 'Minha agenda' : 'Atendimento e agenda')} /></h2></div>
            <div className={css.grade} data-r4-layout-grid="atalhos">{atalhos.filter((item) => item.id !== 'recepcao').map((item) => {
                const id = 'atalho_' + item.id;
                const personalizado = layout?.layout[id];
                const href = destino(id, enderecoAdmin(item.id));
                return href && <Link className={css.card} data-destaque={item.id === 'agendamentos'} key={id} href={href}
                    {...layout?.item(id, 'atalhos', item.rotulo)}>
                    <span className={css.icones}><IconeLayoutR4 icone={personalizado?.icone} fallback={item.icone} /><ArrowRight size={15} /></span>
                    <strong><TextoLayoutR4 id={id} campo="titulo" texto={textoR4(item.rotulo)} /></strong>
                    <small><TextoLayoutR4 id={id} campo="descricao" texto={personalizado?.modulo ? 'Abrir módulo' : textoR4(item.subtitulo)} /></small>
                </Link>;
            })}
                <CardsLayoutR4 grupo="atalhos" perfil={perfil.role} />
            </div>
        </section>}
        {children}
        <CardsLayoutR4 grupo="secoes" perfil={perfil.role} />
    </div>;
}
