'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, BookOpen, Building2, Calendar, ChevronRight, Clock3, GraduationCap, History, Paperclip, Pencil, Trash2, X } from 'lucide-react';
import type { RoleSistema } from '@/lib/admin-auth';
import { LISTA_STATUS_AULA_R4, normalizarStatusAulaR4 } from '@/lib/agenda-status-r4';
import { filtrarMateriasVisiveis } from '@/lib/cliente-helpers';
import { horaParaMinutos } from '@/lib/horarios-reforco';
import { formatarDataBR, obterIniciais, type AgendamentoAdmin, type AlunoAdmin, type ProfessorAdmin, type UnidadeAdmin } from './types';
import css from './DetalhesAula.module.css';

type Tela = 'detalhes' | 'editar' | 'agenda' | 'observacoes' | 'anexos' | 'historico' | 'excluir';
type Anexo = { id: number; nome: string; tamanho: number };
type Evento = { id: string; acao: string; responsavel: string; criado_em: string; campos: string[] };
type Props = {
    aula: AgendamentoAdmin | null;
    roleUsuario: RoleSistema;
    unidades: UnidadeAdmin[];
    professores: ProfessorAdmin[];
    alunos: AlunoAdmin[];
    escuro: boolean;
    iniciarNoHistorico?: boolean;
    onFecharAction: () => void;
    onAtualizadoAction: () => Promise<void>;
};

const titulos: Record<Tela, string> = {
    detalhes: 'Detalhes do agendamento', editar: 'Editar agendamento', agenda: 'Editar agenda',
    observacoes: 'Observações', anexos: 'Anexos da aula', historico: 'Histórico do atendimento',
    excluir: 'Excluir agendamento',
};
const nomesCampos: Record<string, string> = {
    professor_id: 'Professor', unidade_id: 'Unidade', aluno_id: 'Aluno', materia: 'Matéria',
    data: 'Data', hora_inicio: 'Início', hora_fim: 'Término', duracao_minutos: 'Duração',
    observacoes: 'Observações', feedback_professor: 'Feedback', status: 'Status',
    lancado_clincare: 'Lançamento no ClinCare', clincare_reserva_status: 'Fila do ClinCare',
    notificado_whatsapp: 'Notificação por WhatsApp', excluido_em: 'Exclusão',
    aluno_nome: 'Nome do aluno', responsavel_nome: 'Responsável', aluno_telefone: 'Telefone',
    colegio_nome: 'Colégio', serie: 'Série',
};

function duracaoReal(aula: AgendamentoAdmin) {
    const diferenca = horaParaMinutos(aula.hora_fim || '') - horaParaMinutos(aula.hora_inicio);
    return diferenca > 0 ? diferenca : aula.duracao_minutos || 100;
}

function montarFormulario(aula: AgendamentoAdmin) {
    return {
        unidade_id: aula.unidade_id, professor_id: aula.professor_id, aluno_id: aula.aluno_id ?? 0,
        materia: aula.materia, data: aula.data, hora_inicio: aula.hora_inicio?.slice(0, 5) || '08:00',
        duracao_minutos: duracaoReal(aula),
    };
}

function Linha({ titulo, descricao, icone, onClick, perigo = false }: {
    titulo: string; descricao?: string; icone: ReactNode; onClick: () => void; perigo?: boolean;
}) {
    return <button type="button" className={css.linha} data-perigo={perigo} onClick={onClick}>
        <span className={css.icone}>{icone}</span>
        <span><strong>{titulo}</strong>{descricao && <small>{descricao}</small>}</span>
        <ChevronRight className={css.seta} />
    </button>;
}

export default function ModalDetalhesAulaR4(props: Props) {
    return props.aula ? <Detalhes key={props.aula.id} {...props} inicial={props.aula} /> : null;
}

function Detalhes({ inicial, roleUsuario, unidades, professores, alunos, escuro, iniciarNoHistorico, onFecharAction, onAtualizadoAction }: Props & { inicial: AgendamentoAdmin }) {
    const [aula, setAula] = useState(inicial);
    const [tela, setTela] = useState<Tela>(iniciarNoHistorico ? 'historico' : 'detalhes');
    const [form, setForm] = useState(() => montarFormulario(inicial));
    const [observacoes, setObservacoes] = useState(inicial.observacoes || '');
    const [feedback, setFeedback] = useState(inicial.feedback_professor || '');
    const [anexos, setAnexos] = useState<Anexo[]>([]);
    const [historico, setHistorico] = useState<Evento[]>([]);
    const [aviso, setAviso] = useState('');
    const [erro, setErro] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [carregando, setCarregando] = useState(true);
    const dialogo = useRef<HTMLDialogElement>(null);
    const url = '/api/admin/agendamentos?id=' + inicial.id;
    const professor = roleUsuario === 'professor';
    const podeEditar = !professor && !aula.excluido_em;
    const status = normalizarStatusAulaR4(aula.status);
    const destino = professores.find((p) => p.id === form.professor_id);
    const materias = [...new Set([...(destino ? filtrarMateriasVisiveis(destino.materias) : []), form.materia].filter(Boolean))];
    const professoresUnidade = professores.filter((p) => p.unidade_id === form.unidade_id && (p.ativo || p.id === aula.professor_id));

    useEffect(() => {
        const elemento = dialogo.current;
        if (elemento && !elemento.open) elemento.showModal();
        return () => elemento?.close();
    }, []);

    useEffect(() => {
        const controlador = new AbortController();
        fetch(url, { cache: 'no-store', signal: controlador.signal })
            .then(async (res) => {
                const dados = await res.json();
                if (!res.ok) throw new Error(dados.error);
                if (controlador.signal.aborted) return;
                setAula({ ...inicial, ...dados.aula });
                setFeedback(dados.aula.feedback_professor || '');
                setHistorico(dados.historico);
                setAnexos(dados.anexos);
            })
            .catch((e: Error) => { if (!controlador.signal.aborted) setErro(e.message || 'Falha ao carregar a aula.'); })
            .finally(() => { if (!controlador.signal.aborted) setCarregando(false); });
        return () => controlador.abort();
    }, [url, inicial]);

    function abrir(destinoTela: Tela) {
        setErro('');
        if (destinoTela === 'agenda') setForm(montarFormulario(aula));
        if (destinoTela === 'observacoes') setObservacoes(aula.observacoes || '');
        setTela(destinoTela);
    }

    async function alterar(opcoes: RequestInit, mensagem: string, proxima?: Tela, caminho = url) {
        setOcupado(true);
        setErro('');
        setAviso('');
        try {
            const resposta = await fetch(caminho, opcoes);
            const resultado = await resposta.json();
            if (!resposta.ok) throw new Error(resultado.error || 'Não foi possível salvar a alteração.');
            if (proxima) setTela(proxima);
            setAviso(resultado.aviso || mensagem);
            const [atualizacao] = await Promise.allSettled([
                fetch(url, { cache: 'no-store' }).then(async (res) => {
                    if (!res.ok) throw new Error();
                    const dados = await res.json();
                    setAula((anterior) => ({ ...anterior, ...dados.aula }));
                    setHistorico(dados.historico);
                    setAnexos(dados.anexos);
                }),
                onAtualizadoAction(),
            ]);
            if (atualizacao.status === 'rejected') setAviso('Alteração salva. Reabra a aula para atualizar os detalhes.');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Falha na conexão.');
        } finally {
            setOcupado(false);
        }
    }

    function salvar(campos: object, mensagem: string, proxima?: Tela) {
        return alterar({
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: aula.id, ...campos }),
        }, mensagem, proxima);
    }

    function salvarAgenda(e: FormEvent) {
        e.preventDefault();
        const campos = { ...form, aluno_id: form.aluno_id && form.aluno_id !== aula.aluno_id ? form.aluno_id : undefined };
        void salvar(campos, 'Agendamento atualizado.', 'detalhes');
    }

    function adicionarArquivo(arquivo: File | undefined) {
        if (!arquivo) return;
        if (arquivo.size > 2 * 1024 * 1024 || arquivo.size === 0) {
            setErro('Selecione um arquivo de até 2 MB.');
            return;
        }
        const dados = new FormData();
        dados.append('arquivo', arquivo);
        void alterar({ method: 'PUT', body: dados }, 'Anexo adicionado.');
    }

    const volta = tela === 'detalhes' || iniciarNoHistorico ? onFecharAction :
        () => abrir(['agenda', 'observacoes', 'excluir'].includes(tela) || (tela === 'anexos' && podeEditar) ? 'editar' : 'detalhes');
    const desabilitado = ocupado || carregando;

    return (
        <dialog ref={dialogo} className={css.dialogo} data-tema={escuro ? 'escuro' : 'claro'}
            data-lateral={tela === 'historico'} aria-labelledby="r4-detalhes-titulo"
            onCancel={(e) => { e.preventDefault(); if (!ocupado) volta(); }}>
            <div className={css.interno}>
                <header className={css.cabecalho}>
                    <span className={css.avatar}>{tela === 'detalhes' ? obterIniciais(aula.nome_aluno || 'R4') :
                        tela === 'historico' ? <History /> : <Pencil />}</span>
                    <div>
                        {tela === 'detalhes' && <small>R4 · {titulos[tela]}</small>}
                        <h2 id="r4-detalhes-titulo">{tela === 'detalhes' ? aula.nome_aluno : titulos[tela]}</h2>
                        <p>{(tela === 'detalhes' ? [aula.serie_aluno, aula.colegio_aluno] : [aula.nome_aluno, aula.materia]).filter(Boolean).join(' · ')}</p>
                    </div>
                    <button type="button" className={css.fechar} aria-label="Fechar agendamento" onClick={onFecharAction} disabled={ocupado}><X /></button>
                </header>

                <div className={css.corpo}>
                    {erro && <p className={css.erro} role="alert">{erro}</p>}
                    {aviso && <p className={css.aviso} role="status">{aviso}</p>}
                    {tela === 'detalhes' && <>
                        <section className={css.ficha}>
                            <div className={css.profissional}>
                                <Dado icone={<GraduationCap />} cor="teal" titulo="Professor" valor={aula.professor_nome} />
                                <label className={css.status} data-status={status}>
                                    <span className={css.ponto} />
                                    <select aria-label="Status da aula" value={status} disabled={desabilitado || Boolean(aula.excluido_em)}
                                        onChange={(e) => void salvar({ status: e.target.value }, 'Status atualizado.')}>
                                        {LISTA_STATUS_AULA_R4.filter((item) => !professor || item.valor === 'realizado' || item.valor === status)
                                            .map((item) => <option key={item.valor} value={item.valor}
                                                disabled={professor && item.valor !== 'realizado'}>{item.rotulo}</option>)}
                                    </select>
                                </label>
                            </div>
                            <div className={css.grade}>
                                <Dado icone={<Calendar />} cor="azul" titulo="Data" valor={formatarDataBR(aula.data)} />
                                <Dado icone={<Clock3 />} cor="teal" titulo="Horário" valor={
                                    (aula.hora_inicio || '—') + (aula.hora_fim ? ' – ' + aula.hora_fim : '') + ' (' + duracaoReal(aula) + ' min)'} />
                                <Dado icone={<BookOpen />} cor="violeta" titulo="Matéria" valor={aula.materia} />
                                <Dado icone={<Building2 />} cor="coral" titulo="Unidade" valor={aula.unidade_nome} />
                            </div>
                        </section>
                        {(aula.nome_responsavel || aula.whatsapp_responsavel) && <p className={css.contato}>
                            <strong>Responsável</strong> {[aula.nome_responsavel, aula.whatsapp_responsavel].filter(Boolean).join(' · ')}
                        </p>}
                        {aula.observacoes && <section className={css.nota}><strong>Assuntos e observações</strong><p>{aula.observacoes}</p></section>}
                        <div className={css.lista}>
                            <Linha titulo="Histórico do atendimento" icone={<History />} onClick={() => abrir('historico')} />
                            {!podeEditar && anexos.length > 0 && <Linha titulo="Anexos da aula" icone={<Paperclip />} onClick={() => abrir('anexos')} />}
                        </div>
                        {!aula.excluido_em && <form className={css.form} onSubmit={(e) => {
                            e.preventDefault(); void salvar({ feedback_professor: feedback }, 'Feedback salvo.');
                        }}>
                            <label>Feedback da aula<textarea value={feedback} maxLength={10000} rows={2}
                                onChange={(e) => setFeedback(e.target.value)} placeholder="Conteúdo trabalhado e recomendações" /></label>
                            <button className={css.secundario} type="submit" disabled={desabilitado || feedback === (aula.feedback_professor || '')}>Salvar feedback</button>
                        </form>}
                    </>}

                    {tela === 'editar' && <>
                        <div className={css.lista}>
                            <Linha titulo="Editar agenda" descricao="Professor, unidade, aluno, matéria e horário" icone={<Calendar />} onClick={() => abrir('agenda')} />
                            <Linha titulo="Observações" descricao="Assuntos e anotações da aula" icone={<BookOpen />} onClick={() => abrir('observacoes')} />
                            <Linha titulo="Anexos" descricao={anexos.length ? anexos.length + ' arquivo(s)' : 'Materiais, arquivos e documentos'} icone={<Paperclip />} onClick={() => abrir('anexos')} />
                        </div>
                        <div className={css.lista}>
                            <Linha titulo="Excluir agendamento" descricao="Remover a aula da grade" icone={<Trash2 />} perigo onClick={() => abrir('excluir')} />
                        </div>
                    </>}

                    {tela === 'agenda' && <form className={css.form} onSubmit={salvarAgenda}>
                        <label>Aluno<select value={form.aluno_id} onChange={(e) => setForm({ ...form, aluno_id: Number(e.target.value) })}>
                            <option value={aula.aluno_id ?? 0}>{aula.nome_aluno} (atual)</option>
                            {alunos.filter((a) => a.id !== aula.aluno_id).map((a) =>
                                <option value={a.id} key={a.id}>{a.nome_aluno}{a.colegio_nome ? ' · ' + a.colegio_nome : ''}</option>)}
                        </select></label>
                        <label>Unidade<select required value={form.unidade_id} onChange={(e) =>
                            setForm({ ...form, unidade_id: Number(e.target.value), professor_id: 0, materia: '' })}>
                            {unidades.filter((u) => u.ativa || u.id === aula.unidade_id).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                        </select></label>
                        <label>Professor<select required value={form.professor_id || ''} onChange={(e) => {
                            const p = professores.find((item) => item.id === Number(e.target.value));
                            const opcoes = p ? filtrarMateriasVisiveis(p.materias) : [];
                            setForm({ ...form, professor_id: p?.id ?? 0, materia: opcoes.includes(form.materia) ? form.materia : opcoes[0] || '' });
                        }}>
                            <option value="" disabled>Selecione um professor</option>
                            {professoresUnidade.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select></label>
                        <label>Matéria<input required list="r4-materias-edicao" value={form.materia} maxLength={150}
                            onChange={(e) => setForm({ ...form, materia: e.target.value })} /></label>
                        <datalist id="r4-materias-edicao">{materias.map((materia) => <option key={materia} value={materia} />)}</datalist>
                        <div className={css.campos}>
                            <label>Data<input required type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></label>
                            <label>Início<input required type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} /></label>
                            <label>Duração (min)<input required type="number" min={10} max={300} value={form.duracao_minutos}
                                onChange={(e) => setForm({ ...form, duracao_minutos: Number(e.target.value) })} /></label>
                        </div>
                        <button className={css.primario} type="submit" disabled={desabilitado}>Salvar alterações</button>
                    </form>}

                    {tela === 'observacoes' && <form className={css.form} onSubmit={(e) => {
                        e.preventDefault(); void salvar({ observacoes }, 'Observações salvas.', 'editar');
                    }}>
                        <label>Assuntos e anotações<textarea value={observacoes} rows={6} maxLength={10000}
                            onChange={(e) => setObservacoes(e.target.value)} /></label>
                        <button className={css.primario} type="submit" disabled={desabilitado}>Salvar observações</button>
                    </form>}

                    {tela === 'anexos' && <>
                        {podeEditar && <label className={css.upload}>
                            <Paperclip /> Adicionar arquivo <small>Até 2 MB por arquivo</small>
                            <input type="file" disabled={desabilitado} aria-label="Adicionar arquivo"
                                onChange={(e) => { adicionarArquivo(e.target.files?.[0]); e.target.value = ''; }} />
                        </label>}
                        {!anexos.length && <p className={css.mudo}>{carregando ? 'Carregando anexos…' : 'Nenhum arquivo anexado.'}</p>}
                        {anexos.map((anexo) => <div className={css.arquivo} key={anexo.id}>
                            <a href={url + '&anexo=' + anexo.id}>{anexo.nome}</a>
                            <small>{Math.max(1, Math.round(anexo.tamanho / 1024))} KB</small>
                            {podeEditar && <button type="button" aria-label={'Remover ' + anexo.nome} disabled={desabilitado}
                                onClick={() => {
                                    if (window.confirm('Remover este anexo da aula?')) {
                                        void alterar({ method: 'DELETE' }, 'Anexo removido.', undefined, url + '&anexo=' + anexo.id);
                                    }
                                }}><Trash2 /></button>}
                        </div>)}
                    </>}

                    {tela === 'historico' && <>
                        <p className={css.filtroHistorico}><Calendar /> {aula.nome_aluno} · {formatarDataBR(aula.data)}</p>
                        {!historico.length && !erro && <p className={css.mudo}>{carregando ? 'Carregando histórico…' : 'Nenhuma ação registrada.'}</p>}
                        <ol className={css.historico}>
                            {historico.map((evento) => <li key={evento.id}>
                                <time dateTime={evento.criado_em}>{new Date(evento.criado_em).toLocaleString('pt-BR', {
                                    dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bahia',
                                })}</time>
                                <strong>{evento.acao.startsWith('Status: ') ?
                                    'Status: ' + evento.acao.slice(8).split(' → ').map((valor) =>
                                        LISTA_STATUS_AULA_R4.find((statusAula) => statusAula.valor === valor)?.rotulo || valor).join(' → ')
                                    : evento.acao}</strong><p>Responsável: {evento.responsavel}</p>
                                {evento.campos.length > 0 && <small>{evento.campos.map((campo) => nomesCampos[campo] || campo).join(' · ')}</small>}
                            </li>)}
                        </ol>
                    </>}

                    {tela === 'excluir' && <div className={css.form}>
                        <p>Confirma a exclusão da aula de <strong>{aula.nome_aluno}</strong>? Ela será retirada da agenda e a exclusão ficará registrada no histórico.</p>
                        <button className={css.perigo} type="button" disabled={desabilitado}
                            onClick={() => void alterar({ method: 'DELETE' }, 'Agendamento excluído.', 'historico')}>Confirmar exclusão</button>
                    </div>}
                </div>

                {(tela !== 'detalhes' || podeEditar) && <footer className={css.rodape}>
                    {tela === 'detalhes' ? <button type="button" className={css.primario} disabled={desabilitado} onClick={() => abrir('editar')}>
                        <Pencil /> Editar agendamento
                    </button> : <button type="button" className={css.secundario} disabled={ocupado}
                        onClick={aula.excluido_em ? onFecharAction : volta}><ArrowLeft /> {aula.excluido_em ? 'Fechar' : 'Voltar'}</button>}
                </footer>}
            </div>
        </dialog>
    );
}

function Dado({ titulo, valor, cor, icone }: { titulo: string; valor: string; cor: string; icone: ReactNode }) {
    return <div className={css.dado}>
        <span className={css.icone} data-cor={cor}>{icone}</span>
        <span><small>{titulo}</small><strong>{valor || '—'}</strong></span>
    </div>;
}
