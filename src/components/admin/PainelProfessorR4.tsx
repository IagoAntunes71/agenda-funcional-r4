'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, Camera, ChevronLeft, ChevronRight, LogOut, Moon, Sun } from 'lucide-react';
import { obterMetaStatusR4 } from '@/lib/agenda-status-r4';
import { adicionarDiasISO, obterAgoraBahia } from '@/lib/horarios-reforco';
import { CORES_STATUS_R4, type OperacaoR4 } from '@/lib/operacao-r4';
import MetaFeedbackR4 from './MetaFeedbackR4';
import ModalDetalhesAulaR4 from './ModalDetalhesAulaR4';
import { formatarDataBR, obterIniciais, type AgendamentoAdmin, type AlunoAdmin, type PerfilAdmin, type ProfessorAdmin, type UnidadeAdmin } from './types';
import css from './PainelProfessorR4.module.css';

const diasSemana = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const mesExtenso = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const real = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

type Meta = { professor: string; feitos: number; total: number; vencidos: number };
type Repasses = {
    somas: { repassePrevisto: number; repasseApurado: number };
    resultados: { id: number; materia: string; data: string; repasse: number; previsao: boolean }[];
    temMais: boolean;
    total: number;
};

function useRelatorio<T>(painel: string, mes: string, revisao: number, offset = 0, habilitado = true) {
    const chave = new URLSearchParams({ painel, mes, offset: String(offset), revisao: String(revisao) }).toString();
    const [resultado, setResultado] = useState<{ chave: string; dados?: T; erro?: string } | null>(null);
    useEffect(() => {
        if (!habilitado) return;
        const pedido = new AbortController();
        async function carregar() {
            try {
                const res = await fetch('/api/admin/operacao?' + chave, { signal: pedido.signal, cache: 'no-store' });
                const dados = await res.json();
                if (!res.ok) throw new Error(dados.error || 'Falha ao consultar os dados.');
                if (!pedido.signal.aborted) setResultado({ chave, dados });
            } catch (erro) {
                if (!pedido.signal.aborted) setResultado({ chave, erro: erro instanceof Error ? erro.message : 'Falha ao consultar os dados.' });
            }
        }
        void carregar();
        return () => pedido.abort();
    }, [chave, habilitado]);
    return habilitado && resultado?.chave === chave ? resultado : null;
}

export default function PainelProfessorR4({ perfil, mes, onMes, aulas, carregando, erro, atualizar, sair,
    alternarTema, escuro, trocarFoto, abrirPerfil, unidades, professores, alunos, operacao }: {
    perfil: PerfilAdmin; mes: string; onMes: (mes: string) => void; aulas: AgendamentoAdmin[];
    carregando: boolean; erro?: string; atualizar: () => Promise<void>; sair: () => Promise<void>;
    alternarTema: () => void; escuro: boolean; trocarFoto: () => void; abrirPerfil: () => void; unidades: UnidadeAdmin[];
    professores: ProfessorAdmin[]; alunos: AlunoAdmin[]; operacao: OperacaoR4;
}) {
    const hoje = obterAgoraBahia().dataISO;
    const [dia, setDia] = useState(hoje);
    const [selecionada, setSelecionada] = useState<AgendamentoAdmin | null>(null);
    const [revisao, setRevisao] = useState(0);
    const [offset, setOffset] = useState(0);
    const metas = useRelatorio<{ metas: Meta[] }>('metas', mes, revisao);
    const repasses = useRelatorio<Repasses>('recepcao', mes, revisao, offset, operacao.exibirRepasses);
    const inicioMes = mes + '-01';
    const dataMes = new Date(inicioMes + 'T12:00:00Z');
    const inicioGrade = adicionarDiasISO(inicioMes, -((dataMes.getUTCDay() + 6) % 7));
    const aulasPorDia = new Map<string, AgendamentoAdmin[]>();
    for (const aula of aulas) {
        const grupo = aulasPorDia.get(aula.data) ?? [];
        grupo.push(aula);
        aulasPorDia.set(aula.data, grupo);
    }
    const dataAtiva = dia.startsWith(mes) ? dia : inicioMes;
    const aulasDoDia = aulasPorDia.get(dataAtiva) ?? [];
    const aulasPorId = new Map(aulas.map((aula) => [aula.id, aula]));
    const estados = [...new Set(aulas.map((aula) => obterMetaStatusR4(aula.status).valor))];
    const nomeCurto = perfil.nome.trim().split(/\s+/)[0];
    const corStatus = (estado: (typeof estados)[number]) => operacao.status[estado]?.cor || CORES_STATUS_R4[estado];

    function mudarMes(novo: string, novoDia?: string) {
        if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(novo)) return;
        onMes(novo);
        setDia(novoDia ?? (hoje.startsWith(novo) ? hoje : novo + '-01'));
        setOffset(0);
    }

    function navegar(direcao: number) {
        const data = new Date(dataMes);
        data.setUTCMonth(data.getUTCMonth() + direcao);
        mudarMes(data.toISOString().slice(0, 7));
    }

    async function atualizarTudo() {
        setRevisao((valor) => valor + 1);
        await atualizar();
    }

    return <main className={css.painel}>
        <header className={css.topo}>
            <div>
                <h1>Olá, <span>{nomeCurto}</span></h1>
                <p>Veja sua agenda e acompanhe suas aulas.</p>
            </div>
            <div className={css.perfil}>
                <button type="button" className={css.icone} onClick={alternarTema} aria-label={escuro ? 'Tema claro' : 'Tema escuro'}>
                    {escuro ? <Sun size={17} /> : <Moon size={17} />}
                </button>
                <div className={css.identidade}>
                    <button type="button" className={css.avatar} onClick={trocarFoto} aria-label="Alterar foto do perfil">
                        {perfil.foto_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={perfil.foto_url} alt="" />
                        ) : obterIniciais(perfil.nome)}
                        <Camera size={11} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={abrirPerfil} className={css.conta} aria-label="Meu perfil">
                        <strong>{perfil.nome}</strong><small>Professor · R4 Ensina</small>
                    </button>
                </div>
                <button type="button" className={css.icone} onClick={() => void sair()} aria-label="Sair do painel"><LogOut size={17} /></button>
            </div>
        </header>

        <section className={css.agenda} aria-labelledby="agenda-professor">
            <div className={css.tituloAgenda}>
                <h2 id="agenda-professor"><CalendarDays size={17} /> Minha agenda</h2>
                <button type="button" onClick={() => mudarMes(hoje.slice(0, 7), hoje)}>Hoje</button>
            </div>
            <div className={css.barra}>
                <div className={css.mes}>
                    <button type="button" onClick={() => navegar(-1)} aria-label="Mês anterior"><ChevronLeft size={17} /></button>
                    <label><span>{mesExtenso.format(dataMes)}</span>
                        <input type="month" aria-label="Selecionar mês" value={mes} min="2000-01" max="2099-12" onChange={(e) => mudarMes(e.target.value)} />
                    </label>
                    <button type="button" onClick={() => navegar(1)} aria-label="Próximo mês"><ChevronRight size={17} /></button>
                </div>
                {estados.length > 0 && <ul className={css.legenda} aria-label="Status das aulas">
                    {estados.map((s) => <li key={s}><i style={{ backgroundColor: corStatus(s) }} />{obterMetaStatusR4(s).rotulo}</li>)}
                </ul>}
            </div>
            <div className={css.calendario} aria-label="Calendário mensal">
                {diasSemana.map((semana) => <span className={css.diaSemana} key={semana}>{semana}</span>)}
                {Array.from({ length: 42 }, (_, indice) => {
                    const data = adicionarDiasISO(inicioGrade, indice);
                    const dentro = data.startsWith(mes);
                    const marcacoes = aulasPorDia.get(data) ?? [];
                    const cores = [...new Set(marcacoes.map((aula) => obterMetaStatusR4(aula.status).valor))];
                    return <button type="button" key={data} className={css.celula} data-fora={!dentro} aria-current={data === hoje ? 'date' : undefined}
                        aria-pressed={data === dataAtiva} aria-label={`${formatarDataBR(data)}${dentro && !carregando && !erro ? ', ' + marcacoes.length + ' aulas' : ''}`}
                        onClick={() => dentro ? setDia(data) : mudarMes(data.slice(0, 7), data)}>
                        <span>{Number(data.slice(-2))}</span>
                        {marcacoes.length > 0 && <small aria-hidden="true">{marcacoes.length}</small>}
                        <span className={css.marcas} aria-hidden="true">
                            {cores.map((estado) => <i key={estado} style={{ backgroundColor: corStatus(estado) }} />)}
                        </span>
                    </button>;
                })}
            </div>
            <div className={css.detalhes} aria-busy={carregando}>
                <h3>Aulas de {formatarDataBR(dataAtiva)}</h3>
                {carregando ? <p role="status">Carregando aulas…</p> : erro ?
                    <p role="alert">{erro} <button type="button" onClick={() => void atualizarTudo()}>Tentar novamente</button></p> :
                    aulasDoDia.length === 0 ? <p>Nenhuma aula neste dia.</p> :
                        <>{[
                            { rotulo: 'Agendadas', status: ['agendado', 'confirmado', 'reservado', 'pendente'] },
                            { rotulo: 'Realizadas', status: ['realizado'] },
                            { rotulo: 'Outras situações', status: [] },
                        ].map(({ rotulo, status: estadosGrupo }) => {
                            const aulasGrupo = aulasDoDia.filter((aula) => {
                                const estado = obterMetaStatusR4(aula.status).valor;
                                return estadosGrupo.length ? estadosGrupo.includes(estado)
                                    : !['agendado', 'confirmado', 'reservado', 'pendente', 'realizado'].includes(estado);
                            });
                            return aulasGrupo.length > 0 && <section key={rotulo}>
                                <h4 className="mb-2 mt-3 text-sm font-semibold">{rotulo}</h4>
                                <ul>{aulasGrupo.map((aula) => {
                            const status = obterMetaStatusR4(aula.status);
                                    return <li key={aula.id}><button type="button" className="transition-all duration-150 ease-out active:scale-[0.98] hover:-translate-y-0.5 hover:shadow-md hover:border-sky-500/40" onClick={() => setSelecionada(aula)}>
                                        <strong>{(aula.hora_inicio || aula.horario).slice(0, 5)}{aula.hora_fim && '–' + aula.hora_fim.slice(0, 5)}</strong>
                                        <span><b>{aula.nome_aluno}</b><small>{[aula.materia, aula.unidade_nome].filter(Boolean).join(' · ')}</small></span>
                                        <span className={css.indicadoresAula}>
                                            {status.valor === 'realizado' && <span className={css.feedbackAula}
                                                data-feito={aula.feedback_feito === true}>
                                                {aula.feedback_feito ? 'Feedback Feito' : 'Sem Feedback'}
                                            </span>}
                                            <span className={css.situacao}><i style={{ backgroundColor: corStatus(status.valor) }} />{status.rotulo}</span>
                                        </span>
                                    </button></li>;
                                })}</ul>
                            </section>;
                        })}</>}
            </div>
        </section>

        <div className={css.resumos} data-financeiro={operacao.exibirRepasses}>
            <section aria-labelledby="feedback-professor">
                <h2 id="feedback-professor">Meta de feedbacks</h2>
                {!metas ? <p role="status">Carregando meta…</p> : metas.erro ?
                    <p role="alert">{metas.erro} <button type="button" onClick={() => setRevisao((valor) => valor + 1)}>Tentar novamente</button></p> :
                    metas.dados?.metas[0] ? <MetaFeedbackR4 {...metas.dados.metas[0]} compacto /> : <p>Nenhuma aula realizada neste mês.</p>}
            </section>
            {operacao.exibirRepasses && <section aria-labelledby="repasse-professor">
                <h2 id="repasse-professor">Valores das minhas aulas</h2>
                {!repasses ? <p role="status">Carregando valores…</p> : repasses.erro ?
                    <p role="alert">{repasses.erro} <button type="button" onClick={() => setRevisao((valor) => valor + 1)}>Tentar novamente</button></p> :
                    repasses.dados && <>
                        <dl className={css.valores}>
                            <div><dt>Repasse apurado</dt><dd>{real.format(repasses.dados.somas.repasseApurado)}</dd></div>
                            <div><dt>Repasse previsto</dt><dd>{real.format(repasses.dados.somas.repassePrevisto)}</dd></div>
                        </dl>
                        {repasses.dados.resultados.length > 0 ? <details className={css.repasses} open={offset > 0 || undefined}>
                            <summary>Ver valores por aula ({repasses.dados.total})</summary>
                            <ul>{repasses.dados.resultados.map((item) => <li key={item.id}>
                                <span>{aulasPorId.get(item.id)?.nome_aluno || item.materia}<small>{formatarDataBR(item.data)} · {item.previsao ? 'Previsto' : 'Apurado'}</small></span>
                                <strong>{real.format(item.repasse)}</strong>
                            </li>)}</ul>
                            {(offset > 0 || repasses.dados.temMais) && <div className={css.paginacao}>
                                <button type="button" disabled={!offset} onClick={() => setOffset(offset - 50)}>Anterior</button>
                                <span>Página {offset / 50 + 1}</span>
                                <button type="button" disabled={!repasses.dados.temMais} onClick={() => setOffset(offset + 50)}>Próxima</button>
                            </div>}
                        </details> : <p>Nenhum lançamento neste mês.</p>}
                    </>}
            </section>}
        </div>
        <ModalDetalhesAulaR4 aula={selecionada} roleUsuario="professor" unidades={unidades} professores={professores}
            alunos={alunos} escuro={escuro} onFecharAction={() => setSelecionada(null)} onAtualizadoAction={atualizarTudo} />
    </main>;
}
