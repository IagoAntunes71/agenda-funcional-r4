'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { CardsLayoutR4 } from './ConteudoLayoutR4';
import MetaFeedbackR4 from './MetaFeedbackR4';
import DetalhesFeedbackR4 from './MetaFeedbackDashboardR4';
import { TextoLayoutR4 } from './ConteudoLayoutR4';
import feedbackCss from './MetaFeedbackDashboardR4.module.css';
import Link from 'next/link';
import { CORES_STATUS_R4, OPERACAO_PADRAO, PERMISSOES_R4, podeOperacao, type OperacaoR4, type PermissaoR4, type PerfilOperacao } from '@/lib/operacao-r4';
import { LISTA_STATUS_AULA_R4, obterMetaStatusR4 } from '@/lib/agenda-status-r4';
import { obterAgoraBahia } from '@/lib/horarios-reforco';
import { formatarDataBR, type UnidadeAdmin } from './types';

const caixa = 'r4-painel rounded-xl border p-4';
const campo = 'r4-painel rounded-lg border px-3 py-2 text-sm';
const acao = 'r4-acao rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-50';
const dinheiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function useOperacaoR4() {
    const [cfg, setCfg] = useState(OPERACAO_PADRAO);
    const [carregado, setCarregado] = useState(false);
    const [erro, setErro] = useState('');
    useEffect(() => {
        const pedido = new AbortController();
        fetch('/api/admin/operacao', { signal: pedido.signal }).then(async (res) => {
            if (!res.ok) throw new Error();
            const dados = await res.json();
            if (!pedido.signal.aborted) { setCfg(dados.cfg); setCarregado(true); }
        }).catch(() => { if (!pedido.signal.aborted) setErro('Não foi possível carregar as configurações.'); });
        return () => pedido.abort();
    }, []);
    return { cfg, setCfg, carregado, erro };
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
    return <section className={caixa}><h2 className="font-bold mb-3">{titulo}</h2>{children}</section>;
}

function Opcao({ texto, valor, mudar }: { texto: string; valor: boolean; mudar: (v: boolean) => void }) {
    return <label className="flex items-center gap-2 py-2 text-sm">
        <input type="checkbox" checked={valor} onChange={(e) => mudar(e.target.checked)} />{texto}
    </label>;
}

export function ConfiguracoesOperacaoR4({ somentePortal = false }: { somentePortal?: boolean }) {
    const { cfg, setCfg, carregado, erro } = useOperacaoR4();
    const [aviso, setAviso] = useState('');
    const [salvando, setSalvando] = useState(false);
    function alterar<K extends keyof OperacaoR4>(chave: K, valor: OperacaoR4[K]) {
        setCfg((anterior) => ({ ...anterior, [chave]: valor }));
    }
    async function salvar(e: FormEvent) {
        e.preventDefault();
        setSalvando(true);
        try {
            const res = await fetch('/api/admin/operacao', { method: 'PUT',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cfg, escopo: somentePortal ? 'portal' : 'agenda' }) });
            const dados = await res.json();
            if (!res.ok) throw new Error(dados.error);
            setCfg(dados.cfg);
            setAviso('Configurações salvas.');
        } catch (e) { setAviso(e instanceof Error ? e.message : 'Falha ao salvar.'); }
        finally { setSalvando(false); }
    }
    if (!carregado) return <p role="status">{erro || 'Carregando configurações…'}</p>;
    return <form onSubmit={salvar} className="space-y-4">
        {!somentePortal && <>
        <Secao titulo="Mapa e agendamento">
            <div className="flex gap-3 flex-wrap">
                {(['primeiraHora', 'ultimaHora'] as const).map((chave) => <label key={chave} className="grid gap-1 text-sm">
                    {chave === 'primeiraHora' ? 'Primeiro horário' : 'Último horário'}
                    <select className={campo} value={cfg[chave]} onChange={(e) => alterar(chave, Number(e.target.value))}>
                        {Array.from({ length: 24 }, (_, hora) => <option key={hora} value={hora}>{hora}:00</option>)}
                    </select>
                </label>)}
                <label className="grid gap-1 text-sm">Intervalo da grade
                    <select className={campo} value={cfg.intervalo} onChange={(e) => alterar('intervalo', Number(e.target.value))}>
                        {[10, 15, 20, 30, 60].map((i) => <option key={i} value={i}>{i} minutos</option>)}
                    </select>
                </label>
            </div>
            <Opcao texto="Permitir agendar acompanhamento (sem cobrança da família)" valor={cfg.acompanhamento} mudar={(v) => alterar('acompanhamento', v)} />
            <Opcao texto="Bloquear agendamento retroativo para atendentes e professores" valor={cfg.bloquearRetroativo} mudar={(v) => alterar('bloquearRetroativo', v)} />
            <Opcao texto="Unidade é um campo obrigatório" valor={cfg.unidadeObrigatoria} mudar={(v) => alterar('unidadeObrigatoria', v)} />
        </Secao>
        <Secao titulo="Status de agendamento">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {LISTA_STATUS_AULA_R4.map(({ valor, rotulo }) => {
                    const atual = cfg.status[valor];
                    const mudar = (patch: Partial<typeof atual>) => alterar('status', { ...cfg.status, [valor]: { ...atual, ...patch } });
                    return <div key={valor} className="r4-painel-secundario rounded-lg border px-3 py-1 flex gap-2 justify-between items-center text-sm">
                        <label className="inline-flex gap-2 items-center"><input type="checkbox" checked={atual.ativo}
                            disabled={valor === 'realizado'} onChange={(e) => mudar({ ativo: e.target.checked })} />{rotulo}</label>
                        <input type="color" aria-label={`Cor de ${rotulo}`} value={atual.cor || CORES_STATUS_R4[valor]} onChange={(e) => mudar({ cor: e.target.value })} />
                        {atual.cor && <button type="button" className="underline text-xs" onClick={() => mudar({ cor: null })}>Padrão</button>}
                    </div>;
                })}
            </div>
        </Secao>
        <Secao titulo="Permissões">
            <div className="grid gap-4 sm:grid-cols-2">
                {(['atendimento', 'professor'] as const).map((perfil) => <fieldset key={perfil} className="r4-painel-secundario rounded-lg border p-3">
                    <legend className="font-bold px-1">{perfil === 'atendimento' ? 'Atendentes' : 'Professores'}</legend>
                    {(Object.entries(PERMISSOES_R4) as [PermissaoR4, string][]).filter(([chave]) =>
                        perfil === 'professor' || chave !== 'feedbackRealiza').map(([chave, descricao]) =>
                        <Opcao key={chave} texto={descricao} valor={cfg.permissoes[perfil][chave]}
                            mudar={(v) => alterar('permissoes', { ...cfg.permissoes, [perfil]: { ...cfg.permissoes[perfil], [chave]: v } })} />)}
                </fieldset>)}
            </div>
        </Secao>
        <Secao titulo="Controle dos Alunos">
            <Opcao texto="Exigir plano de trabalho antes de cadastrar orientações" valor={cfg.exigirPlano} mudar={(v) => alterar('exigirPlano', v)} />
            <Opcao texto="Exibir início e fim da aula no histórico do aluno" valor={cfg.exibirHorario} mudar={(v) => alterar('exibirHorario', v)} />
            <label className="grid gap-1 text-sm max-w-sm">Prazo para registrar feedback (dias)
                <input className={campo} type="number" min={0} max={3650} placeholder="Sem limite" value={cfg.prazoFeedback ?? ''}
                    onChange={(e) => alterar('prazoFeedback', e.target.value === '' ? null : Number(e.target.value))} />
            </label>
        </Secao>
        <Secao titulo="Dados financeiros e recepção">
            <Opcao texto="Exibir o repasse mensal para cada professor" valor={cfg.exibirRepasses} mudar={(v) => alterar('exibirRepasses', v)} />
            <Opcao texto="Desmarcado com cobrança não gera repasse ao professor" valor={cfg.desmarcadoSemRepasse} mudar={(v) => alterar('desmarcadoSemRepasse', v)} />
            <Opcao texto="Permitir que atendentes cadastrem alunos" valor={cfg.recepcaoCadastra} mudar={(v) => alterar('recepcaoCadastra', v)} />
        </Secao>
        </>}
        {somentePortal && <Secao titulo="Central de automação">
            <p className="text-sm">A confirmação por WhatsApp aguarda a conexão de um número exclusivo de automação. A antecedência já é usada no portal do aluno e será usada também nas respostas recebidas pelo WhatsApp.</p>
            <label className="flex gap-2 items-center py-2 text-sm">
                <input type="checkbox" disabled /> Envio automático de mensagens · aguardando integração
            </label>
            <label className="grid gap-1 text-sm max-w-sm mt-2">Antecedência mínima para desmarcar sem cobrança (horas)
                <input className={campo} type="number" min={0} max={168} value={cfg.antecedencia} onChange={(e) => alterar('antecedencia', Number(e.target.value))} />
            </label>
            <Link className="inline-block underline mt-2 text-sm" href="/admin/whatsapp">Abrir configuração do WhatsApp</Link>
        </Secao>}
        <button className={acao} type="submit" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar configurações'}</button>
        {aviso && <p role="status">{aviso}</p>}
    </form>;
}

type Meta = { chave: string; professor: string; total: number; feitos: number; vencidos: number };
type Linha = { id: number; aluno_id?: number; plano?: string; orientacoes?: string; aluno?: string; professor?: string; unidade?: string; data: string; materia: string;
    status: string; inicio?: string; fim?: string; feedback?: string; duracao?: number; repasse?: number; cobrar?: number; previsao?: boolean; acompanhamento?: boolean };

export function RelatorioOperacaoR4({ painel, perfil, unidades = [], compacto = false }: {
    painel: 'recepcao' | 'alunos' | 'metas'; perfil: PerfilOperacao; unidades?: UnidadeAdmin[]; compacto?: boolean;
}) {
    const { cfg } = useOperacaoR4();
    const [mes, setMes] = useState(() => obterAgoraBahia().dataISO.slice(0, 7));
    const [busca, setBusca] = useState('');
    const [status, setStatus] = useState('');
    const [unidade, setUnidade] = useState('');
    const [offset, setOffset] = useState(0);
    const [atualizar, setAtualizar] = useState(0);
    const [financeiro, setFinanceiro] = useState(perfil === 'professor');
    const consulta = new URLSearchParams({ painel, mes, busca, status, unidade, offset: String(offset), atualizar: String(atualizar) }).toString();
    const [dados, setDados] = useState<{ chave: string; resultados?: Linha[]; metas?: Meta[]; temMais?: boolean; total?: number; somas?: { repassePrevisto: number; repasseApurado: number; cobrar?: number }; erro?: string } | null>(null);
    useEffect(() => {
        const pedido = new AbortController();
        const timer = setTimeout(() => {
            fetch('/api/admin/operacao?' + consulta, { signal: pedido.signal }).then(async (res) => {
                const json = await res.json();
                if (!pedido.signal.aborted) setDados({ ...json, chave: consulta, erro: json.error });
            }).catch(() => { if (!pedido.signal.aborted) setDados({ chave: consulta, erro: 'Falha na consulta.' }); });
        }, 180);
        return () => { clearTimeout(timer); pedido.abort(); };
    }, [consulta]);
    const atual = dados?.chave === consulta ? dados : null;
    if (painel === 'metas' && compacto) {
        const totais = atual?.metas?.reduce((acc, meta) => ({
            total: acc.total + meta.total, feitos: acc.feitos + meta.feitos, vencidos: acc.vencidos + meta.vencidos,
        }), { total: 0, feitos: 0, vencidos: 0 });
        const percentual = totais?.total ? Math.floor(100 * totais.feitos / totais.total) : 0;
        return <div className="grid gap-3">
            <article className={feedbackCss.card}>
                <header className={feedbackCss.identidade}>
                    <h3><TextoLayoutR4 id="bloco_feedback" campo="titulo" texto="Feedback geral" /></h3>
                    <Link href="/admin/metas" className={feedbackCss.atalho}>Ver feedbacks por professor <span aria-hidden="true">↗</span></Link>
                </header>
                {!atual && <p role="status">Carregando progresso…</p>}
                {atual?.erro && <p role="alert">{atual.erro} <button type="button" className="underline"
                    onClick={() => setAtualizar((v) => v + 1)}>Tentar novamente</button></p>}
                {totais && <>
                    <div className={feedbackCss.progresso}>
                        <span><TextoLayoutR4 id="bloco_feedback" campo="rotulo" texto="Progresso do mês atual" /></span>
                        <strong>{percentual}%</strong>
                        <progress aria-label="Progresso geral dos feedbacks" max={100} value={percentual}
                            data-faixa={percentual >= 85 ? 'alta' : percentual >= 50 ? 'media' : 'baixa'} />
                    </div>
                    <dl className={feedbackCss.numeros}>
                        <div><dt><TextoLayoutR4 id="bloco_feedback" campo="feitos" texto="Feitos" /></dt><dd>{totais.feitos}</dd></div>
                        <div><dt><TextoLayoutR4 id="bloco_feedback" campo="faltantes" texto="Faltantes" /></dt><dd>{totais.total - totais.feitos}</dd></div>
                        <div><dt><TextoLayoutR4 id="bloco_feedback" campo="vencidos" texto="Vencidos" /></dt><dd>{totais.vencidos}</dd></div>
                    </dl>
                </>}
            </article>
            <CardsLayoutR4 grupo="metas" perfil={perfil} />
        </div>;
    }
    return <div className="space-y-3">
        <div className={`${painel === 'metas' ? 'pb-1' : caixa} flex gap-2 flex-wrap items-end`}>
            <label className="grid gap-1 text-sm">Mês<input type="month" className={campo} value={mes} onChange={(e) => { setMes(e.target.value); setOffset(0); }} /></label>
            {painel !== 'metas' && perfil !== 'professor' && <>
                <label className="grid gap-1 text-sm">Buscar<input className={campo} value={busca} onChange={(e) => { setBusca(e.target.value); setOffset(0); }}
                    placeholder="Aluno, professor ou matéria" /></label>
                {painel === 'recepcao' && <label className="grid gap-1 text-sm">Status<select className={campo} value={status}
                    onChange={(e) => { setStatus(e.target.value); setOffset(0); }}>
                    <option value="">Todos</option>{LISTA_STATUS_AULA_R4.map((item) => <option key={item.valor} value={item.valor}>{item.rotulo}</option>)}
                </select></label>}
                {unidades.length > 0 && <label className="grid gap-1 text-sm">Unidade<select className={campo} value={unidade}
                    onChange={(e) => { setUnidade(e.target.value); setOffset(0); }}><option value="">Todas</option>
                    {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></label>}
            </>}
            {painel === 'recepcao' && perfil !== 'professor' && <button type="button" className={acao} onClick={() => setFinanceiro(!financeiro)}>
                {financeiro ? 'Ver aulas' : 'Agenda financeira'}
            </button>}
        </div>
        {!atual && <p role="status">Carregando…</p>}
        {atual?.erro && <p role="alert">{atual.erro} <button type="button" className="underline" onClick={() => setAtualizar((v) => v + 1)}>Tentar novamente</button></p>}
        {atual?.metas?.length === 0 && <p>Nenhuma aula realizada neste mês.</p>}
        {atual?.metas && <div className="grid gap-4">
            {atual.metas.map((meta) => <MetaFeedbackR4 key={meta.chave + ':' + mes} professor={meta.professor}
                feitos={meta.feitos} total={meta.total} vencidos={meta.vencidos} compacto={compacto}>
                {perfil === 'admin' && <DetalhesFeedbackR4 chave={meta.chave} mes={mes} feitos={meta.feitos} total={meta.total} />}
            </MetaFeedbackR4>)}
        </div>}
        {financeiro && atual?.somas && <div className={`${caixa} grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm`}>
            {atual.somas.cobrar !== undefined && <div>Total previsto e devido pelas famílias<br /><strong>{dinheiro.format(atual.somas.cobrar)}</strong></div>}
            <div>Repasse previsto<br /><strong>{dinheiro.format(atual.somas.repassePrevisto)}</strong></div>
            <div>Repasse apurado<br /><strong>{dinheiro.format(atual.somas.repasseApurado)}</strong></div>
        </div>}
        {typeof atual?.total === 'number' && <p className="text-sm">{atual.total} registros no período</p>}
        {atual?.resultados?.length === 0 && <p>Nenhum registro para os filtros selecionados.</p>}
        {atual?.resultados?.map((linha) => {
            const meta = obterMetaStatusR4(linha.status);
            return <article key={linha.id} className={caixa} style={{ borderInlineStart: `4px solid ${cfg.status[meta.valor]?.cor || CORES_STATUS_R4[meta.valor]}` }}>
                <div className="flex justify-between gap-3 flex-wrap">
                    <strong>{linha.aluno || linha.materia}</strong><span className="text-sm">{meta.rotulo} · {formatarDataBR(linha.data)}</span>
                </div>
                {linha.aluno && <p className="text-sm">{[linha.professor, linha.materia, linha.unidade, linha.acompanhamento && 'Acompanhamento'].filter(Boolean).join(' · ')}</p>}
                {linha.inicio && (painel !== 'alunos' || cfg.exibirHorario) && <p className="text-xs">{linha.inicio} {linha.fim && '– ' + linha.fim}</p>}
                {linha.feedback && <p className="mt-2 text-sm whitespace-pre-wrap">{linha.feedback}</p>}
                {painel === 'alunos' && (linha.plano || linha.orientacoes) && <details className="mt-2 text-sm">
                    <summary>Plano e orientações</summary><p className="whitespace-pre-wrap">{linha.plano}</p><p className="whitespace-pre-wrap">{linha.orientacoes}</p>
                </details>}
                {painel === 'alunos' && linha.aluno_id && podeOperacao(cfg, perfil, 'condutas') &&
                    <PlanoAluno linha={linha} aoSalvar={() => setAtualizar(atualizar + 1)} />}
                {financeiro && <p className="mt-2 font-semibold text-sm">
                    {linha.cobrar !== undefined && <>Família: {dinheiro.format(linha.cobrar)} · </>}
                    Repasse: {dinheiro.format(linha.repasse ?? 0)}{linha.previsao ? ' (previsto)' : ''}
                </p>}
            </article>;
        })}
        {!!atual && (offset > 0 || atual.temMais) && <div className="flex items-center gap-3">
            <button type="button" className={campo} disabled={!offset} onClick={() => setOffset(offset - 50)}>Anterior</button>
            <span className="text-sm">Página {1 + offset / 50}</span>
            <button type="button" className={campo} disabled={!atual.temMais} onClick={() => setOffset(offset + 50)}>Próxima</button>
        </div>}
    </div>;
}

function PlanoAluno({ linha, aoSalvar }: { linha: Linha; aoSalvar: () => void }) {
    const [plano, setPlano] = useState(linha.plano || '');
    const [orientacoes, setOrientacoes] = useState(linha.orientacoes || '');
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);
    async function salvar(e: FormEvent) {
        e.preventDefault();
        setSalvando(true);
        setErro('');
        try {
            const res = await fetch('/api/admin/operacao', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ aluno_id: linha.aluno_id, plano, orientacoes }) });
            if (!res.ok) throw new Error((await res.json()).error);
            aoSalvar();
        } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao salvar.'); }
        finally { setSalvando(false); }
    }
    return <details className="mt-2 text-sm"><summary>Editar plano e orientações</summary>
        <form className="grid gap-2 mt-2" onSubmit={salvar}>
            <label className="grid gap-1">Plano de trabalho<textarea className={campo} value={plano} maxLength={5000} onChange={(e) => setPlano(e.target.value)} /></label>
            <label className="grid gap-1">Orientações pedagógicas<textarea className={campo} value={orientacoes} maxLength={5000} onChange={(e) => setOrientacoes(e.target.value)} /></label>
            <button type="submit" className={acao} disabled={salvando}>Salvar plano e orientações</button>
            {erro && <p role="alert">{erro}</p>}
        </form>
    </details>;
}
