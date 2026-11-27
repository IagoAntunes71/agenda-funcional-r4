'use client';
import { useOperacaoR4 } from './OperacaoPainelR4';
import { podeOperacao } from '@/lib/operacao-r4';
import { useTextoR4 } from '@/components/TextosInterfaceR4';


import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, Bell, BookOpen, Building2, Calendar, ChevronRight, Clock3, GraduationCap, History, MessageSquare, Send, Paperclip, Pencil, Trash2, X } from 'lucide-react';
import type { RoleSistema } from '@/lib/admin-auth';
import { LISTA_STATUS_AULA_R4, normalizarStatusAulaR4 } from '@/lib/agenda-status-r4';
import { filtrarMateriasVisiveis, formatarTelefone } from '@/lib/cliente-helpers';
import { materiaBase, materiasBase, rotuloMateriaAula } from '@/lib/materia-aula';
import { horaParaMinutos } from '@/lib/horarios-reforco';
import { formatarDataBR, obterIniciais, type AgendamentoAdmin, type AlunoAdmin, type ProfessorAdmin, type UnidadeAdmin } from './types';
import css from './DetalhesAula.module.css';

type Tela = 'detalhes' | 'editar' | 'agenda' | 'observacoes' | 'anexos' | 'historico' | 'excluir' | 'feedback';
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
    excluir: 'Excluir agendamento', feedback: 'Feedback da aula',
};
const nomesCampos: Record<string, string> = {
    professor_id: 'Professor', unidade_id: 'Unidade', aluno_id: 'Aluno', materia: 'Matéria',
    data: 'Data', hora_inicio: 'Início', hora_fim: 'Término', duracao_minutos: 'Duração',
    observacoes: 'Observações', feedback_professor: 'Feedback', status: 'Status',
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
        materia: materiaBase(aula.materia), data: aula.data, hora_inicio: aula.hora_inicio?.slice(0, 5) || '08:00',
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

const estadosLembrete: Record<string, string> = {
    em_envio: 'Enviando ao CRM', enviado_ao_crm: 'Enviado ao CRM', entregue: 'Entregue',
    erro: 'Falha no envio', obsoleto: 'Aula alterada antes do envio',
};

interface LembreteAula {
    destino: string | null;
    versao: string;
    disponivel: boolean;
    ultimo?: { estado: string; erro?: string | null };
}

function Detalhes({ inicial, roleUsuario, unidades, professores, alunos, escuro, iniciarNoHistorico, onFecharAction, onAtualizadoAction }: Props & { inicial: AgendamentoAdmin }) {
    const textoR4 = useTextoR4();
    const [aula, setAula] = useState(inicial);
    const [tela, setTela] = useState<Tela>(iniciarNoHistorico && roleUsuario !== 'professor' ? 'historico' : 'detalhes');
    const [form, setForm] = useState(() => montarFormulario(inicial));
    const [observacoes, setObservacoes] = useState(inicial.observacoes || '');
    const [podeEditarFeedback, setPodeEditarFeedback] = useState(false);
    const [acessoAgenda, setAcessoAgenda] = useState(false);
    const [acessoAnexo, setAcessoAnexo] = useState(false);
    const [feedback, setFeedback] = useState(inicial.feedback_professor || '');
    const [anexos, setAnexos] = useState<Anexo[]>([]);
    const [historico, setHistorico] = useState<Evento[]>([]);
    const [lembrete, setLembrete] = useState<LembreteAula | null>(null);
    const [aviso, setAviso] = useState('');
    const [erro, setErro] = useState('');
    const [enviandoWhatsApp, setEnviandoWhatsApp] = useState<'enviarLembrete' | 'enviarConfirmacao' | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [carregando, setCarregando] = useState(true);
    const dialogo = useRef<HTMLDialogElement>(null);
    const url = '/api/admin/agendamentos?id=' + inicial.id;
    const { cfg } = useOperacaoR4();
    const professor = roleUsuario === 'professor';
    const podeEditar = !aula.excluido_em && podeOperacao(cfg, roleUsuario, 'agenda') && (!professor || acessoAgenda);
    const podeAnexar = !aula.excluido_em && podeOperacao(cfg, roleUsuario, 'anexos') && (!professor || acessoAnexo);
    const status = normalizarStatusAulaR4(aula.status);
    const destino = professores.find((p) => p.id === form.professor_id);
    const materias = materiasBase([...(destino ? filtrarMateriasVisiveis(destino.materias) : []), form.materia]);
    const professoresUnidade = professores.filter((p) => (p.unidade_id === form.unidade_id || p.unidade_id === unidades.find((u) => u.id === form.unidade_id)?.unidade_presencial_id) && (p.ativo || p.id === aula.professor_id));

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
                setPodeEditarFeedback(dados.podeEditarFeedback === true);
                setAcessoAgenda(dados.podeEditarAgenda === true);
                setAcessoAnexo(dados.podeAnexar === true);
                setFeedback(dados.aula.feedback_professor || '');
                setHistorico(dados.historico);
                setLembrete(dados.lembrete);
                setAnexos(dados.anexos);
            })
            .catch((e: Error) => { if (!controlador.signal.aborted) setErro(e.message || 'Falha ao carregar a aula.'); })
            .finally(() => { if (!controlador.signal.aborted) setCarregando(false); });
        return () => controlador.abort();
    }, [url, inicial]);

    async function enviarWhatsApp(acao: 'enviarLembrete' | 'enviarConfirmacao') {
        if (!lembrete?.destino || ocupado) return;
        setEnviandoWhatsApp(acao);
        setOcupado(true);
        setErro('');
        setAviso('');
        try {
            const resposta = await fetch('/api/admin/agendamentos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ acao, id: aula.id, destino: lembrete.destino, versao: lembrete.versao }),
            });
            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.error);
            if (acao === 'enviarLembrete') {
                setLembrete({ ...lembrete, ultimo: { estado: dados.estado } });
            } else {
                setAviso('Pedido de confirmação enviado ao CRM. A aula será confirmada quando o responsável responder.');
            }
        } catch (falha) {
            setErro(falha instanceof Error ? falha.message : 'Não foi possível enviar a mensagem.');
        } finally {
            setEnviandoWhatsApp(null);
            setOcupado(false);
        }
    }

    function abrir(destinoTela: Tela) {
        setErro('');
        if (destinoTela === 'feedback') setFeedback(aula.feedback_professor || '');
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
            if (resultado.status) setAula((anterior) => ({ ...anterior, status: resultado.status }));
            if (proxima) setTela(proxima);
            setAviso(resultado.aviso || mensagem);
            const [atualizacao] = await Promise.allSettled([
                fetch(url, { cache: 'no-store' }).then(async (res) => {
                    if (!res.ok) throw new Error();
                    const dados = await res.json();
                    setAula((anterior) => ({ ...anterior, ...dados.aula }));
                    setHistorico(dados.historico);
                setLembrete(dados.lembrete);
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
        () => abrir(['agenda', 'observacoes', 'excluir', 'feedback'].includes(tela) || (tela === 'anexos' && podeEditar) ? 'editar' : 'detalhes');
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
                        {tela === 'detalhes' && <small>{textoR4("R4 ·") + ' '}{textoR4(titulos[tela])}</small>}
                        <h2 id="r4-detalhes-titulo">{tela === 'detalhes' ? aula.nome_aluno : textoR4(titulos[tela])}</h2>
                        <p>{(tela === 'detalhes' ? [aula.serie_aluno, aula.colegio_aluno] : [aula.nome_aluno, rotuloMateriaAula(aula.materia, duracaoReal(aula))]).filter(Boolean).join(' · ')}</p>
                    </div>
                    <button type="button" className={css.fechar} aria-label={textoR4("Fechar agendamento")} onClick={onFecharAction} disabled={ocupado}><X /></button>
                </header>

                <div className={css.corpo}>
                    {erro && <p className={css.erro} role="alert">{erro}</p>}
                    {aviso && <p className={css.aviso} role="status">{aviso}</p>}
                    {tela === 'detalhes' && <>
                        <section className={css.ficha}>
                            <div className={css.profissional}>
                                <Dado icone={<GraduationCap />} cor="teal" titulo={textoR4("Professor")} valor={aula.professor_nome} />
                                <label className={css.status} data-status={status}>
                                    <span className={css.ponto} />
                                    <select aria-label={textoR4("Status da aula")} value={status} disabled={desabilitado || Boolean(aula.excluido_em)}
                                        onChange={(e) => void salvar({ status: e.target.value }, 'Status atualizado.')}>
                                        {LISTA_STATUS_AULA_R4.filter((item) => item.valor === status || (cfg.status[item.valor]?.ativo && (!professor || item.valor === 'realizado')))
                                            .map((item) => <option key={item.valor} value={item.valor}
                                                disabled={professor && item.valor !== 'realizado'}>{textoR4(item.rotulo)}</option>)}
                                    </select>
                                </label>
                            </div>
                            <div className={css.grade}>
                                <Dado icone={<Calendar />} cor="azul" titulo={textoR4("Data")} valor={formatarDataBR(aula.data)} />
                                <Dado icone={<Clock3 />} cor="teal" titulo={textoR4("Horário")} valor={
                                    (aula.hora_inicio || '—') + (aula.hora_fim ? ' – ' + aula.hora_fim : '') + ' (' + duracaoReal(aula) + ' min)'} />
                                <Dado icone={<BookOpen />} cor="violeta" titulo={textoR4("Matéria")} valor={rotuloMateriaAula(aula.materia, duracaoReal(aula))} />
                                <Dado icone={<Building2 />} cor="coral" titulo={textoR4("Unidade")} valor={aula.unidade_nome} />
                            </div>
                        </section>
                        {aula.whatsapp_link_aula && <p className={css.contato}><strong>Enviar link da aula para</strong>{' '}{aula.whatsapp_link_aula}</p>}
                        {(aula.nome_responsavel || aula.whatsapp_responsavel) && <p className={css.contato}>
                            <strong>{textoR4("Responsável")}</strong> {[aula.nome_responsavel, aula.whatsapp_responsavel].filter(Boolean).join(' · ')}
                        </p>}
                        {lembrete?.disponivel && ['agendado', 'confirmado'].includes(status) && (
                            <section className={css.ficha + ' flex flex-wrap items-center justify-between gap-3 p-3'}>
                                <div className="flex min-w-0 items-center gap-3">
                                    <span className={css.icone} aria-hidden="true"><Bell /></span>
                                    <div className="min-w-0">
                                        <strong className="block text-sm">Lembrete por WhatsApp</strong>
                                        <p className={css.mudo + ' text-xs'}>
                                            {lembrete.destino ? '+55 ' + formatarTelefone(lembrete.destino.slice(2)) : 'Cadastre um WhatsApp válido para enviar.'}
                                        </p>
                                    </div>
                                </div>
                                {lembrete.destino && (
                                    <button type="button" disabled={ocupado}
                                        className={css.secundario + ' transition-all duration-150 ease-out active:scale-[0.98] hover:brightness-110 hover:shadow-md'}
                                        onClick={() => void enviarWhatsApp('enviarLembrete')}>
                                        {enviandoWhatsApp === 'enviarLembrete' ? 'Enviando…' : 'Enviar lembrete'}
                                    </button>
                                )}
                                {lembrete.ultimo && (
                                    <p role="status" className="w-full border-t border-[var(--linha)] pt-2 text-xs text-[var(--mudo)]">
                                        {estadosLembrete[lembrete.ultimo.estado]}
                                        {lembrete.ultimo.erro && ' · ' + lembrete.ultimo.erro}
                                    </p>
                                )}
                            </section>
                        )}
                        {aula.observacoes && <section className={css.nota}><strong>{textoR4("Assuntos e observações")}</strong><p>{aula.observacoes}</p></section>}
                        <div className={css.lista}>
                            {!professor && <Linha titulo={textoR4("Histórico do atendimento")} icone={<History />} onClick={() => abrir('historico')} />}
                            {!podeEditar && (anexos.length > 0 || podeAnexar) && <Linha titulo={textoR4("Anexos da aula")} icone={<Paperclip />} onClick={() => abrir('anexos')} />}
                        </div>
                    </>}

                    {tela === 'editar' && <>
                        <div className={css.lista}>
                            {podeEditar && <>
                            <Linha titulo={textoR4("Editar agenda")} descricao={textoR4("Professor, unidade, aluno, matéria e horário")} icone={<Calendar />} onClick={() => abrir('agenda')} />
                            <Linha titulo={textoR4("Observações")} descricao={textoR4("Assuntos e anotações da aula")} icone={<BookOpen />} onClick={() => abrir('observacoes')} />
                            <Linha titulo={textoR4("Anexos")} descricao={anexos.length ? anexos.length + ' arquivo(s)' : textoR4("Materiais, arquivos e documentos")} icone={<Paperclip />} onClick={() => abrir('anexos')} />
                            </>}
                            <Linha titulo={textoR4("Feedback da aula")}
                                descricao={textoR4(podeEditarFeedback ? 'Registrar o feedback' : 'Consultar o feedback do professor')}
                                icone={<MessageSquare />} onClick={() => abrir('feedback')} />
                        </div>
                        {podeEditar && !professor && <div className={css.lista}>
                            <Linha titulo={textoR4("Excluir agendamento")} descricao={textoR4("Remover a aula da grade")} icone={<Trash2 />} perigo onClick={() => abrir('excluir')} />
                        </div>}
                    </>}

                    {tela === 'feedback' && podeEditarFeedback && <form className={css.form} onSubmit={(e) => {
                            e.preventDefault(); void salvar({ feedback_professor: feedback }, 'Feedback salvo.', 'editar');
                        }}>
                            <label>{textoR4("Feedback da aula")}<textarea value={feedback} maxLength={10000} rows={2}
                                onChange={(e) => setFeedback(e.target.value)} placeholder={textoR4("Conteúdo trabalhado e recomendações")} /></label>
                            <button className={css.secundario} type="submit" disabled={desabilitado || feedback === (aula.feedback_professor || '')}>{textoR4("Salvar feedback")}</button>
                        </form>}
                    {tela === 'feedback' && !podeEditarFeedback && <section className={css.nota}>
                        <strong>{textoR4("Feedback da aula")}</strong>
                        <p>{aula.feedback_professor || textoR4("O professor ainda não registrou um feedback.")}</p>
                    </section>}

                    {tela === 'agenda' && <form className={css.form} onSubmit={salvarAgenda}>
                        <label>{textoR4("Aluno")}<select value={form.aluno_id} onChange={(e) => setForm({ ...form, aluno_id: Number(e.target.value) })}>
                            <option value={aula.aluno_id ?? 0}>{aula.nome_aluno}{' ' + textoR4("(atual)")}</option>
                            {alunos.filter((a) => a.id !== aula.aluno_id).map((a) =>
                                <option value={a.id} key={a.id}>{a.nome_aluno}{a.colegio_nome ? ' · ' + a.colegio_nome : ''}</option>)}
                        </select></label>
                        <label>{textoR4("Unidade")}<select required value={form.unidade_id} onChange={(e) =>
                            setForm({ ...form, unidade_id: Number(e.target.value), professor_id: 0, materia: '' })}>
                            {unidades.filter((u) => u.ativa || u.id === aula.unidade_id).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                        </select></label>
                        <label>{textoR4("Professor")}<select required value={form.professor_id || ''} onChange={(e) => {
                            const p = professores.find((item) => item.id === Number(e.target.value));
                            const opcoes = p ? materiasBase(filtrarMateriasVisiveis(p.materias)) : [];
                            setForm({ ...form, professor_id: p?.id ?? 0, materia: opcoes.includes(form.materia) ? form.materia : opcoes[0] || '' });
                        }}>
                            <option value="" disabled>{textoR4("Selecione um professor")}</option>
                            {professoresUnidade.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select></label>
                        <label>{textoR4("Matéria")}<select required value={form.materia}
                            onChange={(e) => setForm({ ...form, materia: e.target.value })}>
                            <option value="" disabled>Selecione a matéria</option>
                            {materias.map((materia) => <option key={materia} value={materia}>{materia}</option>)}
                        </select></label>
                        <div className={css.campos}>
                            <label>{textoR4("Data")}<input required type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></label>
                            <label>{textoR4("Início")}<input required type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} /></label>
                            <label>{textoR4("Duração (min)")}<input required type="number" min={10} max={300} value={form.duracao_minutos}
                                onChange={(e) => setForm({ ...form, duracao_minutos: Number(e.target.value) })} /></label>
                        </div>
                        <button className={css.primario} type="submit" disabled={desabilitado}>{textoR4("Salvar alterações")}</button>
                    </form>}

                    {tela === 'observacoes' && <form className={css.form} onSubmit={(e) => {
                        e.preventDefault(); void salvar({ observacoes }, 'Observações salvas.', 'editar');
                    }}>
                        <label>{textoR4("Assuntos e anotações")}<textarea value={observacoes} rows={6} maxLength={10000}
                            onChange={(e) => setObservacoes(e.target.value)} /></label>
                        <button className={css.primario} type="submit" disabled={desabilitado}>{textoR4("Salvar observações")}</button>
                    </form>}

                    {tela === 'anexos' && <>
                        {podeAnexar && <label className={css.upload}>
                            <Paperclip />{' ' + textoR4("Adicionar arquivo") + ' '}<small>{textoR4("Até 2 MB por arquivo")}</small>
                            <input type="file" disabled={desabilitado} aria-label={textoR4("Adicionar arquivo")}
                                onChange={(e) => { adicionarArquivo(e.target.files?.[0]); e.target.value = ''; }} />
                        </label>}
                        {!anexos.length && <p className={css.mudo}>{carregando ? textoR4("Carregando anexos…") : textoR4("Nenhum arquivo anexado.")}</p>}
                        {anexos.map((anexo) => <div className={css.arquivo} key={anexo.id}>
                            <a href={url + '&anexo=' + anexo.id}>{anexo.nome}</a>
                            <small>{Math.max(1, Math.round(anexo.tamanho / 1024))}{' ' + textoR4("KB")}</small>
                            {podeAnexar && <button type="button" aria-label={'Remover ' + anexo.nome} disabled={desabilitado}
                                onClick={() => {
                                    if (window.confirm('Remover este anexo da aula?')) {
                                        void alterar({ method: 'DELETE' }, 'Anexo removido.', undefined, url + '&anexo=' + anexo.id);
                                    }
                                }}><Trash2 /></button>}
                        </div>)}
                    </>}

                    {!professor && tela === 'historico' && <>
                        <p className={css.filtroHistorico}><Calendar /> {aula.nome_aluno} · {formatarDataBR(aula.data)}</p>
                        {!historico.length && !erro && <p className={css.mudo}>{carregando ? textoR4("Carregando histórico…") : textoR4("Nenhuma ação registrada.")}</p>}
                        <ol className={css.historico}>
                            {historico.map((evento) => <li key={evento.id}>
                                <time dateTime={evento.criado_em}>{new Date(evento.criado_em).toLocaleString('pt-BR', {
                                    dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bahia',
                                })}</time>
                                <strong>{evento.acao.startsWith('Status: ') ?
                                    'Status: ' + evento.acao.slice(8).split(' → ').map((valor) =>
                                        LISTA_STATUS_AULA_R4.find((statusAula) => statusAula.valor === valor)?.rotulo || valor).join(' → ')
                                    : evento.acao}</strong><p>{textoR4("Responsável:") + ' '}{evento.responsavel}</p>
                                {evento.campos.length > 0 && <small>{evento.campos.map((campo) => nomesCampos[campo] || campo).join(' · ')}</small>}
                            </li>)}
                        </ol>
                    </>}

                    {tela === 'excluir' && <div className={css.form}>
                        <p>{textoR4("Confirma a exclusão da aula de") + ' '}<strong>{aula.nome_aluno}</strong>{textoR4("? Ela será retirada da agenda e a exclusão ficará registrada no histórico.")}</p>
                        <button className={css.perigo} type="button" disabled={desabilitado}
                            onClick={() => void alterar({ method: 'DELETE' }, 'Agendamento excluído.', 'historico')}>{textoR4("Confirmar exclusão")}</button>
                    </div>}
                </div>

                {(tela !== 'detalhes' || podeEditar || podeEditarFeedback) && <footer className={css.rodape}>
                    {tela === 'detalhes' ? <><button type="button" className={css.primario} disabled={desabilitado} onClick={() => abrir('editar')}>
                        <Pencil />{' ' + textoR4("Editar agendamento")}</button>
                        {podeEditar && !professor && lembrete?.disponivel && status === 'agendado' && (
                            <button type="button" disabled={ocupado || !lembrete.destino}
                                className={css.secundario + ' transition-all duration-150 ease-out active:scale-[0.98] hover:brightness-110 hover:shadow-md'}
                                onClick={() => void enviarWhatsApp('enviarConfirmacao')}>
                                <Send /> {enviandoWhatsApp === 'enviarConfirmacao' ? 'Enviando…' : textoR4("Enviar confirmação")}
                            </button>
                        )}
                    </> : <button type="button" className={css.secundario} disabled={ocupado}
                        onClick={aula.excluido_em ? onFecharAction : volta}><ArrowLeft /> {aula.excluido_em ? textoR4("Fechar") : textoR4("Voltar")}</button>}
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
