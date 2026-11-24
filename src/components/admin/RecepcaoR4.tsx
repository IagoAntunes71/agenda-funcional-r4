'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { BookOpen, Calendar, ChevronDown, Clock3, Download, MapPin, Plus, SlidersHorizontal, Users } from 'lucide-react';
import { LISTA_STATUS_AULA_R4, obterMetaStatusR4, type StatusAulaR4 } from '@/lib/agenda-status-r4';
import { CORES_STATUS_R4, podeOperacao, type PerfilOperacao } from '@/lib/operacao-r4';
import { adicionarDiasISO, obterAgoraBahia } from '@/lib/horarios-reforco';
import { formatarDataBR, obterIniciais, type AgendamentoAdmin, type AlunoAdmin, type ProfessorAdmin, type TemaClasses, type UnidadeAdmin } from './types';
import { useOperacaoR4 } from './OperacaoPainelR4';
import ModalDetalhesAulaR4 from './ModalDetalhesAulaR4';
import ModalNovoAgendamentoR4 from './ModalNovoAgendamentoR4';
import css from './RecepcaoR4.module.css';

type Aula = { id: number; aluno: string; aluno_id: number; professor: string; professor_id: number; unidade: string; unidade_id: number; materia: string; data: string; inicio: string; fim: string; serie: string; colegio: string; status: StatusAulaR4; cobrar: number; repasse: number; entrada: string; saida: string; categoria: string; convenio: string; evento: string; duracao: number; acompanhamento: boolean; previsao: boolean };
type Resposta = { resultados: Aula[]; total: number; temMais: boolean; resumo: Record<string, number>; erro?: string;
    bloqueios: { data: string; inicio: string; fim: string; professor: string; unidade: string; motivo: string }[] };
const financeiro = { pendente: 'Pendente', baixado: 'Baixado', isento: 'Isento' };
const opcoesFinanceiras = Object.entries(financeiro);
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dinheiro = (valor: number) => brl.format(valor);
const filtrosTexto = [
    ['materia', 'Matéria / serviço'], ['categoria', 'Categoria'], ['professor', 'Professor'],
    ['aluno', 'Aluno'], ['convenio', 'Convênio / parceria'], ['evento', 'Evento'],
] as const;

function filtrosPadrao() {
    const de = obterAgoraBahia().dataISO;
    return { de, ate: adicionarDiasISO(de, 10), unidade: '', status: '', professorAtivo: 'sim',
        alunoAtivo: 'sim', materia: '', categoria: '', professor: '', aluno: '', convenio: '', evento: '',
        entrada: '', saida: '', acompanhamento: '', feedback: '', dia: '', periodo: '', bloqueios: '' };
}

export default function RecepcaoR4({ unidades, professores, alunos, perfil, escuro, classes, atualizarAgenda }: {
    unidades: UnidadeAdmin[]; professores: ProfessorAdmin[]; alunos: AlunoAdmin[];
    perfil: PerfilOperacao; escuro: boolean; classes: TemaClasses; atualizarAgenda: () => Promise<void>;
}) {
    const { cfg } = useOperacaoR4();
    const podeEditar = podeOperacao(cfg, perfil, 'agenda');
    const [filtros, setFiltros] = useState(filtrosPadrao);
    const [offset, setOffset] = useState(0);
    const [revisao, setRevisao] = useState(0);
    const [visao, setVisao] = useState<'aulas' | 'financeiro'>('aulas');
    const [selecionadas, setSelecionadas] = useState<number[]>([]);
    const [editor, setEditor] = useState<AgendamentoAdmin | null>(null);
    const [novo, setNovo] = useState(false);
    const [campo, setCampo] = useState('');
    const [valor, setValor] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [mensagem, setMensagem] = useState('');
    const consulta = new URLSearchParams({ ...filtros, painel: 'recepcao', offset: String(offset), revisao: String(revisao) }).toString();
    const [resposta, setResposta] = useState<{ chave: string; dados: Resposta } | null>(null);
    const dados = resposta?.chave === consulta ? resposta.dados : null;
    const aulas = dados?.resultados || [];
    const resumo = dados?.resumo;
    const selecionadasPagina = aulas.filter((item) => selecionadas.includes(item.id)).length;

    useEffect(() => {
        const pedido = new AbortController();
        const tempo = setTimeout(async () => {
            try {
                const res = await fetch('/api/admin/operacao?' + consulta, { signal: pedido.signal });
                const corpo = await res.json();
                if (!pedido.signal.aborted) setResposta({ chave: consulta, dados: res.ok ? corpo : { erro: corpo.error } });
            } catch {
                if (!pedido.signal.aborted) setResposta({ chave: consulta, dados: { erro: 'Falha ao consultar a recepção.' } as Resposta });
            }
        }, 180);
        return () => { pedido.abort(); clearTimeout(tempo); };
    }, [consulta]);

    function filtrar(chave: keyof typeof filtros, valor: string) {
        setFiltros((atual) => ({ ...atual, [chave]: valor }));
        setSelecionadas([]);
        setOffset(0);
    }

    function selecionar(id: number) {
        setSelecionadas((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
    }

    function editar(aula: Aula) {
        setEditor({
            id: aula.id, aluno_id: aula.aluno_id, nome_aluno: aula.aluno, professor_id: aula.professor_id, professor_nome: aula.professor,
            unidade_id: aula.unidade_id, unidade_nome: aula.unidade, materia: aula.materia, data: aula.data,
            hora_inicio: aula.inicio, hora_fim: aula.fim, horario: aula.inicio, duracao_minutos: aula.duracao,
            status: aula.status, serie_aluno: aula.serie, colegio_aluno: aula.colegio, nome_responsavel: '',
            whatsapp_responsavel: '', observacoes: null, sincronizado_clincare: false, criado_em_formatado: '',
        });
    }

    async function atualizar() {
        setRevisao((v) => v + 1);
        await atualizarAgenda();
    }

    async function mudarStatus(aula: Aula, status: string) {
        setOcupado(true);
        try {
            const res = await fetch('/api/admin/agendamentos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: aula.id, status }) });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);
            setMensagem(json.aviso || 'Status atualizado.');
            await atualizar();
        } catch (e) {
            setMensagem(e instanceof Error ? e.message : 'Falha ao atualizar o status.');
        } finally { setOcupado(false); }
    }

    async function registrar(e: FormEvent) {
        e.preventDefault();
        setOcupado(true);
        try {
            const res = await fetch('/api/admin/operacao', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: selecionadas, campo, valor }) });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);
            setMensagem(`${json.total} aula(s) atualizada(s).`);
            setCampo('');
            setValor('');
            setSelecionadas([]);
            await atualizar();
        } catch (e) {
            setMensagem(e instanceof Error ? e.message : 'Falha ao salvar.');
        } finally { setOcupado(false); }
    }

    async function selecionarTudo() {
        if (selecionadas.length && selecionadas.length === dados?.total) {
            setSelecionadas([]);
            return;
        }
        setOcupado(true);
        try {
            const res = await fetch('/api/admin/operacao?' + consulta + '&exportar=1');
            const corpo = await res.json();
            if (!res.ok) throw new Error(corpo.error);
            setSelecionadas((corpo.resultados as Aula[]).map((aula) => aula.id));
        } catch (e) {
            setMensagem(e instanceof Error ? e.message : 'Falha ao selecionar as aulas.');
        } finally { setOcupado(false); }
    }

    async function exportar() {
        setOcupado(true);
        try {
            const res = await fetch('/api/admin/operacao?' + consulta + '&exportar=1');
            const corpo = await res.json();
            if (!res.ok) throw new Error(corpo.error);
            const registros = (corpo.resultados as Aula[]).filter((item) => !selecionadas.length || selecionadas.includes(item.id));
            const matriz = [['Data','Início','Fim','Aluno','Professor','Matéria','Unidade','Status','Família','Repasse','Entrada','Saída'],
                ...registros.map((a) => [a.data,a.inicio,a.fim,a.aluno,a.professor,a.materia,a.unidade,obterMetaStatusR4(a.status).rotulo,a.cobrar,a.repasse,a.entrada,a.saida])];
            const linhas = matriz.map((linha) => linha.map((celula) => {
                const texto = String(celula ?? '');
                const seguro = /^\s*[=+@-]/.test(texto) ? "'" + texto : texto;
                return '"' + seguro.replaceAll('"', '""') + '"';
            }).join(';')).join('\r\n');
            const url = URL.createObjectURL(new Blob(['\uFEFF', linhas], { type: 'text/csv;charset=utf-8' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = 'recepcao-r4.csv';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) { setMensagem(e instanceof Error ? e.message : 'Falha ao exportar.'); }
        finally { setOcupado(false); }
    }

    function seletor(chave: keyof typeof filtros, rotulo: string, opcoes: [string, string][]) {
        return <label key={chave}>{rotulo}<select value={filtros[chave]} onChange={(e) => filtrar(chave, e.target.value)}>
            <option value="">Todos</option>{opcoes.map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
        </select></label>;
    }

    return <div className={css.recepcao}>
        <aside className={css.filtros}>
            <div className={css.topoFiltros}><h2><SlidersHorizontal size={16} /> Filtros</h2><button type="button" onClick={() => { setFiltros(filtrosPadrao()); setOffset(0); setSelecionadas([]); }}>Limpar</button></div>
            <div className={css.datas}>{(['de', 'ate'] as const).map((chave) => <label key={chave}>{chave === 'de' ? 'De' : 'Até'}
                <input type="date" value={filtros[chave]} onChange={(e) => filtrar(chave, e.target.value)} />
            </label>)}</div>
            {seletor('unidade', 'Unidade', unidades.map((u) => [String(u.id), u.nome]))}
            {seletor('status', 'Status da aula', LISTA_STATUS_AULA_R4.map((s) => [s.valor, s.rotulo]))}
            {filtrosTexto.filter(([chave]) => ['professor', 'aluno', 'materia'].includes(chave)).map(([chave, rotulo]) =>
                <label key={chave}>{rotulo}
                    <input value={filtros[chave]} onChange={(e) => filtrar(chave, e.target.value)} placeholder={'Buscar ' + rotulo.toLowerCase()} />
                </label>)}
            <details className={css.grupoFiltros} open={visao === 'financeiro' ? true : undefined}>
                <summary>Financeiro <ChevronDown size={14} /></summary>
                {seletor('entrada', 'Status de entrada', opcoesFinanceiras)}
                {seletor('saida', 'Status de saída', opcoesFinanceiras)}
            </details>
            <details className={css.grupoFiltros}>
                <summary>Mais filtros <ChevronDown size={14} /></summary>
                {filtrosTexto.filter(([chave]) => ['categoria', 'convenio', 'evento'].includes(chave)).map(([chave, rotulo]) =>
                    <label key={chave}>{rotulo}<input value={filtros[chave]} onChange={(e) => filtrar(chave, e.target.value)} /></label>)}
                {seletor('professorAtivo', 'Cadastro do professor', [['sim', 'Somente ativos']])}
                {seletor('alunoAtivo', 'Cadastro do aluno', [['sim', 'Somente ativos']])}
                {seletor('acompanhamento', 'Acompanhamento', [['sim', 'Somente acompanhamento'], ['nao', 'Somente aulas regulares']])}
                {seletor('feedback', 'Feedback', [['sim', 'Com feedback'], ['nao', 'Sem feedback']])}
                {seletor('dia', 'Dia da semana', ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'].map((dia, i) => [String(i), dia]))}
                {seletor('periodo', 'Período do dia', [['manha', 'Manhã'], ['tarde', 'Tarde'], ['noite', 'Noite']])}
            </details>
            <label className={css.check}><input type="checkbox" checked={filtros.bloqueios === '1'} onChange={(e) => filtrar('bloqueios', e.target.checked ? '1' : '')} /> Exibir bloqueios</label>
        </aside>

        <main className={css.centro}>
            <div className={css.cabecalhoLista}>
                <h2>{visao === 'aulas' ? 'Lista de aulas' : 'Agenda financeira'}</h2>
                {dados && !dados.erro && <span>{dados.total} {dados.total === 1 ? 'aula' : 'aulas'}</span>}
            </div>
            <div className={css.barraPrincipal}>
                <div className={css.visoes} role="group" aria-label="Exibição">
                    <button type="button" aria-pressed={visao === 'aulas'} onClick={() => setVisao('aulas')}>Aulas</button>
                    <button type="button" aria-pressed={visao === 'financeiro'} onClick={() => setVisao('financeiro')}>Financeiro</button>
                </div>
                <div className={css.acoesPrincipais}>
                <button type="button" disabled={ocupado} onClick={() => void exportar()}><Download size={15} /> CSV</button>
                {podeEditar && <button type="button" className="r4-acao" onClick={() => setNovo(true)}><Plus size={15} /> Nova aula</button>}
                </div>
            </div>
            <div className={css.ferramentas}>
                <button type="button" disabled={!podeEditar || selecionadas.length !== 1 || !aulas.some((a) => a.id === selecionadas[0])}
                    onClick={() => { const item = aulas.find((a) => a.id === selecionadas[0]); if (item) editar(item); }}>Editar agenda</button>
                <select aria-label="Ação da seleção" disabled={!podeEditar || !selecionadas.length} value={campo} onChange={(e) => { setCampo(e.target.value); setValor(''); }}>
                    <option value="">Ações da seleção</option><option value="entrada">Registrar entrada</option><option value="saida">Registrar saída</option>
                    <option value="categoria">Definir categoria</option><option value="convenio">Definir convênio</option><option value="evento">Definir evento</option>
                </select>
                <label className={css.check}><input type="checkbox" checked={!!aulas.length && selecionadasPagina === aulas.length} disabled={!aulas.length}
                    onChange={(e) => setSelecionadas((ids) => e.target.checked ? [...new Set([...ids, ...aulas.map((a) => a.id)])] :
                        ids.filter((id) => !aulas.some((a) => a.id === id)))} /> Selecionar página · {selecionadas.length}/{dados?.total ?? 0}</label>
                <button type="button" disabled={ocupado || !dados?.total} onClick={() => void selecionarTudo()}>
                    {selecionadas.length && selecionadas.length === dados?.total ? 'Limpar seleção' : 'Selecionar todos os resultados'}
                </button>
            </div>
            {campo && <form className={css.ferramentas} onSubmit={registrar}>
                {['entrada', 'saida'].includes(campo)
                    ? <select required aria-label="Status do lançamento" value={valor} onChange={(e) => setValor(e.target.value)}>
                        <option value="">Escolha o status</option>{opcoesFinanceiras.map(([v, rotulo]) => <option key={v} value={v}>{rotulo}</option>)}</select>
                    : <input aria-label="Classificação" value={valor} maxLength={100} placeholder="Deixe vazio para limpar" onChange={(e) => setValor(e.target.value)} />}
                <button type="submit" disabled={ocupado || !selecionadas.length} className="r4-acao">Aplicar</button>
            </form>}
            {mensagem && <p role="status" className={css.mensagem}>{mensagem}</p>}
            {!dados && <p className={css.mensagem}>Carregando aulas…</p>}
            {dados?.erro && <p role="alert" className={css.mensagem}>{dados.erro}</p>}
            {dados && !dados.erro && !aulas.length && <p className={css.mensagem}>Nenhuma aula com esses filtros.</p>}
            {aulas.map((aula) => {
                const status = obterMetaStatusR4(aula.status);
                const cor = cfg.status[status.valor]?.cor || CORES_STATUS_R4[status.valor];
                return <article key={aula.id} className={css.aula} style={{ ['--cor-aula' as string]: cor }}>
                    <div className={css.dadosAluno}>
                        <div className={css.dataAula}>
                            <input type="checkbox" aria-label={`Selecionar aula de ${aula.aluno}`} checked={selecionadas.includes(aula.id)} onChange={() => selecionar(aula.id)} />
                            <Calendar size={13} /> {formatarDataBR(aula.data)} <span className={css.horario}><Clock3 size={13} />{aula.inicio}{aula.fim ? '–' + aula.fim : ''}</span>
                        </div>
                        <button type="button" className={css.aluno} onClick={() => editar(aula)}>
                            <span className={css.avatar}>{obterIniciais(aula.aluno)}</span>
                            <span><strong>{aula.aluno}</strong><small>{[aula.serie, aula.colegio].filter(Boolean).join(' · ')}</small></span>
                        </button>
                    </div>
                    <div className={css.dadosAula}>
                        <div className={css.status} data-editavel={podeEditar}>
                            <span className={css.ponto} />
                            <span>{status.rotulo}</span>
                            {podeEditar && <ChevronDown size={14} className={css.chevron} aria-hidden="true" />}
                            {podeEditar ? <select aria-label={`Status de ${aula.aluno}`} disabled={ocupado} value={status.valor}
                                onChange={(e) => void mudarStatus(aula, e.target.value)}>
                                {LISTA_STATUS_AULA_R4.filter((item) => cfg.status[item.valor]?.ativo || item.valor === status.valor)
                                    .map((item) => <option value={item.valor} key={item.valor}>{item.rotulo}</option>)}
                            </select> : null}
                        </div>
                        <div className={css.conteudoAula}>
                            <span><Users size={13} /> {aula.professor || 'Sem professor'}</span>
                            <div className={css.metadados}>
                                <span><BookOpen size={13} />{aula.materia}</span>
                                {aula.unidade && <span><MapPin size={13} />{aula.unidade}</span>}
                            </div>
                            {(aula.acompanhamento || aula.categoria || aula.convenio || aula.evento) &&
                                <small>{[aula.acompanhamento && 'Acompanhamento', aula.categoria, aula.convenio, aula.evento].filter(Boolean).join(' · ')}</small>}
                            {visao === 'financeiro' && <small>Família {dinheiro(aula.cobrar)} · Repasse {dinheiro(aula.repasse)} · Entrada {financeiro[aula.entrada as keyof typeof financeiro]} · Saída {financeiro[aula.saida as keyof typeof financeiro]}</small>}
                        </div>
                    </div>
                </article>;
            })}
            {dados?.bloqueios?.map((b, i) => <article key={i} className={css.bloqueio}>
                <strong>{b.motivo}</strong> · {formatarDataBR(b.data)} · {b.inicio.slice(0, 5)}–{b.fim.slice(0, 5)} · {b.professor} · {b.unidade}
            </article>)}
            {!!dados && (offset > 0 || dados.temMais) && <div className={css.ferramentas}>
                <button type="button" disabled={!offset} onClick={() => setOffset(offset - 50)}>Anterior</button>
                <span>Página {1 + offset / 50}</span>
                <button type="button" disabled={!dados.temMais} onClick={() => setOffset(offset + 50)}>Próxima</button>
            </div>}
        </main>

        <aside className={css.resumo}>
            <h2>Resumo do período</h2>
            <dl className={css.valores}>
                <div><dt>A receber</dt><dd>{dados && !dados.erro ? dinheiro(resumo?.receber ?? 0) : '—'}</dd></div>
                <div><dt>A pagar</dt><dd>{dados && !dados.erro ? dinheiro(resumo?.pagar ?? 0) : '—'}</dd></div>
            </dl>
            <dl className={css.indicadores}>{[
                ['Repasses das aulas', dinheiro(resumo?.repasses ?? 0)],
                ['Diferença', dinheiro((resumo?.receber ?? 0) - (resumo?.pagar ?? 0))],
                ['Agendamentos', dados?.total ?? 0], ['Tempo total', `${Math.floor((resumo?.minutos ?? 0) / 60)} h ${(resumo?.minutos ?? 0) % 60} min`],
                ['Professores', resumo?.professores ?? 0], ['Matérias', resumo?.materias ?? 0],
                ['Convênios', resumo?.convenios ?? 0], ['Alunos', resumo?.alunos ?? 0],
            ].map(([rotulo, valor]) => <div key={rotulo}><dt>{rotulo}</dt><dd>{dados && !dados.erro ? valor : '—'}</dd></div>)}</dl>
        </aside>

        <ModalDetalhesAulaR4 aula={editor} roleUsuario={perfil} unidades={unidades} professores={professores} alunos={alunos}
            escuro={escuro} onFecharAction={() => setEditor(null)} onAtualizadoAction={atualizar} />
        <ModalNovoAgendamentoR4 aberto={novo} modoInicial="aula" roleUsuario={perfil} professorTravadoId={null}
            unidadeInicialId={Number(filtros.unidade) || unidades[0]?.id || 0} professorInicialId={0}
            dataInicial={filtros.de || obterAgoraBahia().dataISO} horaInicial="08:00" professores={professores} alunos={alunos}
            unidades={unidades} classes={classes} onFecharAction={() => setNovo(false)} onSucessoAction={atualizar} />
    </div>;
}
