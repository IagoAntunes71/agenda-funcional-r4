'use client';

import { useLayoutR4 } from './EditorLayoutR4';
import { TextoLayoutR4 } from './ConteudoLayoutR4';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CalendarDays, ClipboardList, Contact, GraduationCap, UserRound, UserRoundX } from 'lucide-react';
import { formatarTelefone, normalizarTelefone, SERIES_ESCOLARES } from '@/lib/cliente-helpers';
import { obterMetaStatusR4 } from '@/lib/agenda-status-r4';
import { adicionarDiasISO, obterAgoraBahia } from '@/lib/horarios-reforco';
import { comprimirImagemAvatar, formatarDataBR, obterIniciais } from './types';
import ListaAlunosR4, { type Aluno } from './ListaAlunosR4';
import css from './FichaAlunosR4.module.css';

type Contato = { id: number; nome: string; parentesco: string; telefone: string; email: string; cpf: string; observacoes: string };
type Ficha = Aluno & { foto_ficha: string; cpf: string; sexo: string; email: string; endereco: string; plano: string; orientacoes: string };
type Aula = { id: number; data: string; inicio: string; fim: string; materia: string; professor: string; unidade: string; status: string; feedback: string | null };
type Base = { alunos: Aluno[]; podeEditar: boolean; podeCriar: boolean; podeAdministrar: boolean };
const secoes = [
    { id: 'perfil', nome: 'Perfil', descricao: 'Dados pessoais e escolares', Icone: UserRound },
    { id: 'contatos', nome: 'Contatos', descricao: 'Responsável e acesso ao portal', Icone: Contact },
    { id: 'calendario', nome: 'Calendário', descricao: 'Aulas do aluno', Icone: CalendarDays },
    { id: 'controle', nome: 'Controle', descricao: 'Feedbacks e orientações', Icone: ClipboardList },
    { id: 'situacao', nome: 'Situação', descricao: 'Inativar ou reativar', Icone: UserRoundX },
];
const caminho = (id?: number, secao?: string) => '/admin/alunos' + (id ? '?aluno=' + id + (secao ? '&secao=' + secao : '') : '');
const limpar = (v: string) => (v || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase().replace(/\s+/g,' ');

async function ler<T>(url: string, opcoes?: RequestInit): Promise<T> {
    const res = await fetch(url, { cache: 'no-store', ...opcoes });
    const dados = await res.json();
    if (!res.ok) throw new Error(dados.error || 'Não foi possível concluir a operação.');
    return dados;
}

function useConsulta<T>(url: string, revisao: number) {
    const chave = url + '#' + revisao;
    const [resultado, setResultado] = useState<{ chave: string; dados?: T; erro?: string }>();
    useEffect(() => {
        if (!url) return;
        const pedido = new AbortController();
        ler<T>(url, { signal: pedido.signal }).then((dados) => {
            if (!pedido.signal.aborted) setResultado({ chave, dados });
        }).catch((e: Error) => {
            if (!pedido.signal.aborted) setResultado({ chave, erro: e.message });
        });
        return () => pedido.abort();
    }, [url, chave]);
    return resultado?.chave === chave ? resultado : undefined;
}

function salvar(dados: object) {
    return ler<{ id?: number; existente?: boolean }>('/api/admin/ficha-aluno', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
    });
}


function Campo({ nome, name, valor, tipo = 'text', bloqueado = false }: { nome: string; name: string; valor?: string | null; tipo?: string; bloqueado?: boolean }) {
    return <label>{nome}<input type={tipo} name={name} defaultValue={valor || ''} disabled={bloqueado} maxLength={254} required={name === 'nome_aluno'} /></label>;
}

function DadosEscolares({ aluno, bloqueado }: { aluno?: Aluno; bloqueado?: boolean }) {
    return <>
        <Campo nome="Nome completo" name="nome_aluno" valor={aluno?.nome_aluno} bloqueado={bloqueado} />
        <Campo nome="Colégio" name="colegio_nome" valor={aluno?.colegio_nome} bloqueado={bloqueado} />
        <label>Série<input name="serie" list="series-ficha-r4" defaultValue={aluno?.serie || ''} disabled={bloqueado} /></label>
        <datalist id="series-ficha-r4">{SERIES_ESCOLARES.map((serie) => <option key={serie} value={serie} />)}</datalist>
    </>;
}

function Formulario({ acao, id, children, atualizado, texto = 'Salvar' }: {
    acao: string; id?: number; children: ReactNode; atualizado: (id?: number) => void; texto?: string;
}) {
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState('');
    async function enviar(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const campos = Object.fromEntries(new FormData(e.currentTarget));
        setOcupado(true); setErro('');
        try {
            const foto = campos.foto;
            delete campos.foto;
            if (foto instanceof File && foto.size) {
                if (!['image/jpeg','image/png','image/webp'].includes(foto.type) || foto.size > 5_000_000) {
                    throw new Error('Use uma imagem JPEG, PNG ou WebP de até 5 MB.');
                }
                campos.foto_ficha = await comprimirImagemAvatar(foto);
            }
            atualizado((await salvar({ ...campos, id, acao })).id);
        }
        catch (e) { setErro((e as Error).message); }
        finally { setOcupado(false); }
    }
    return <form className={css.formulario} onSubmit={enviar}>{children}
        {texto && <button className="r4-acao" disabled={ocupado}>{ocupado ? 'Salvando…' : texto}</button>}
        {erro && <p role="alert">{erro}</p>}
    </form>;
}

function Calendario({ id, controle, ficha, podeEditarControle }: { id: number; controle: boolean; ficha: Ficha; podeEditarControle: boolean }) {
    const hoje = obterAgoraBahia().dataISO;
    const [data, setData] = useState(hoje);
    const [visao, setVisao] = useState('semana');
    const [de, setDe] = useState(adicionarDiasISO(hoje,-30));
    const [ate, setAte] = useState(hoje);
    const [status, setStatus] = useState('');
    const [feedback, setFeedback] = useState('');
    const [materia, setMateria] = useState('');
    const [aviso, setAviso] = useState('');
    const [salvandoPlano, setSalvandoPlano] = useState(false);
    const [revisao, setRevisao] = useState(0);
    const mes = data.slice(0,7) + '-01';
    const semana = adicionarDiasISO(data, -new Date(data + 'T12:00:00Z').getUTCDay());
    const fimMes = new Date(Date.UTC(Number(data.slice(0,4)), Number(data.slice(5,7)), 0)).toISOString().slice(0,10);
    const inicio = controle ? de : visao === 'dia' ? data : visao === 'semana' ? semana : mes;
    const fim = controle ? ate : visao === 'dia' ? data : visao === 'semana' ? adicionarDiasISO(semana,6) : fimMes;
    const retorno = useConsulta<{ aulas: Aula[] }>(inicio && fim ? '/api/admin/ficha-aluno?id=' + id + '&inicio=' + inicio + '&fim=' + fim : '', revisao);
    const aulas = retorno?.dados?.aulas || [];
    const filtradas = aulas.filter((aula) => {
        const actual = obterMetaStatusR4(aula.status).valor;
        return (!status || status === actual) && (!materia || aula.materia === materia) &&
            (!feedback || Boolean(aula.feedback?.trim()) === (feedback === 'sim'));
    });
    const dias = visao === 'mes'
        ? Array.from({ length: Number(fimMes.slice(-2)) }, (_, i) => adicionarDiasISO(mes,i))
        : Array.from({ length: visao === 'semana' ? 7 : 1 }, (_, i) => adicionarDiasISO(inicio,i));
    const statusDisponiveis = [...new Set(aulas.map((aula) => obterMetaStatusR4(aula.status).valor))];

    function mover(passo: number) {
        if (visao === 'dia' || visao === 'semana') {
            const novo = adicionarDiasISO(data, passo * (visao === 'dia' ? 1 : 7));
            if (/^20/.test(novo)) setData(novo);
            return;
        }
        const valor = new Date(mes + 'T12:00:00Z');
        valor.setUTCMonth(valor.getUTCMonth() + passo);
        if (valor.getUTCFullYear() >= 2000 && valor.getUTCFullYear() <= 2099) setData(valor.toISOString().slice(0,10));
    }
    async function salvarPlano(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const dados = Object.fromEntries(new FormData(e.currentTarget));
        setSalvandoPlano(true); setAviso('');
        try {
            await ler('/api/admin/operacao', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...dados, aluno_id: id }) });
            setAviso('Plano salvo.');
        } catch (e) { setAviso((e as Error).message); }
        finally { setSalvandoPlano(false); }
    }
    function aulaLinha(aula: Aula) {
        return <article className={css.aula} key={aula.id}>
            <strong>{aula.materia}</strong>
            <small>{[formatarDataBR(aula.data), aula.inicio && [aula.inicio,aula.fim].filter(Boolean).join('–'), aula.professor, aula.unidade].filter(Boolean).join(' · ')}</small>
            <span>{obterMetaStatusR4(aula.status).rotulo}</span>
            {controle && <p>{aula.feedback?.trim() || 'Sem feedback registrado.'}</p>}
        </article>;
    }
    return <section className={css.painel}>
        <h2>{controle ? 'Controle pedagógico' : 'Calendário de aulas'}</h2>
        {controle ? <>
            <div className={css.acoes}>
                <label>De<input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></label>
                <label>Até<input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
                <label>Matéria<select value={materia} onChange={(e) => setMateria(e.target.value)}><option value="">Todas</option>
                    {[...new Set(aulas.map((a) => a.materia))].map((item) => <option key={item}>{item}</option>)}
                </select></label>
                <label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos</option>
                    {statusDisponiveis.map((item) => <option key={item} value={item}>{obterMetaStatusR4(item).rotulo}</option>)}
                </select></label>
                <label>Feedback<select value={feedback} onChange={(e) => setFeedback(e.target.value)}><option value="">Todos</option><option value="sim">Com feedback</option><option value="nao">Sem feedback</option></select></label>
            </div>
            <div className={css.numeros}><span><strong>{filtradas.length}</strong> Aulas</span><span><strong>{filtradas.filter((a) => obterMetaStatusR4(a.status).valor === 'realizado').length}</strong> Realizadas</span><span><strong>{filtradas.filter((a) => /^(cancelado|desmarcado)/.test(obterMetaStatusR4(a.status).valor)).length}</strong> Canceladas ou desmarcadas</span></div>
            <form className={css.formulario} onSubmit={salvarPlano}>
                <label>Plano de trabalho<textarea name="plano" defaultValue={ficha.plano} maxLength={5000} readOnly={!podeEditarControle} /></label>
                <label>Orientações pedagógicas<textarea name="orientacoes" defaultValue={ficha.orientacoes} maxLength={5000} readOnly={!podeEditarControle} /></label>
                {podeEditarControle && <button className="r4-acao" disabled={salvandoPlano}>Salvar controle</button>}
                {aviso && <p role="status">{aviso}</p>}
            </form>
        </> : <div className={css.acoes}>
            <button type="button" onClick={() => mover(-1)} aria-label="Período anterior">←</button>
            <input type="date" aria-label="Data do calendário" value={data} onChange={(e) => /^20\d{2}-\d{2}-\d{2}$/.test(e.target.value) && setData(e.target.value)} />
            <button type="button" onClick={() => mover(1)} aria-label="Próximo período">→</button>
            <button type="button" onClick={() => setData(hoje)}>Hoje</button>
            <select aria-label="Visualização" value={visao} onChange={(e) => setVisao(e.target.value)}><option value="dia">Dia</option><option value="semana">Semana</option><option value="mes">Mês</option><option value="lista">Lista do mês</option></select>
        </div>}
        {!inicio || !fim ? <p>Selecione o período.</p> : !retorno ? <p role="status">Carregando aulas…</p> : retorno.erro ?
            <p role="alert">{retorno.erro} <button type="button" onClick={() => setRevisao(revisao + 1)}>Atualizar</button></p> :
            controle || visao === 'lista' ? (filtradas.length ? [...filtradas].reverse().map(aulaLinha) : <p>Nenhuma aula neste período.</p>) :
            <div className={css.calendario} data-dia={visao === 'dia'}>
                {visao === 'mes' && Array.from({ length: new Date(mes + 'T12:00:00Z').getUTCDay() }, (_, indice) => <div key={'vazio' + indice} />)}
                {dias.map((dia) => <section key={dia}><h3>{new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(dia + 'T12:00:00Z'))} · {formatarDataBR(dia).slice(0,5)}</h3>
                    {aulas.filter((a) => a.data === dia).map(aulaLinha)}
                </section>)}
            </div>}
    </section>;
}

function ContatosAdicionais({ id, contatos, atualizar, pode }: { id: number; contatos: Contato[]; atualizar: () => void; pode: boolean }) {
    function campos(contato?: Contato) {
        return <>
            {contato && <input type="hidden" name="contato_id" value={contato.id} />}
            <label>Nome completo<input name="nome" required maxLength={180} defaultValue={contato?.nome} /></label>
            <Campo nome="Parentesco" name="parentesco" valor={contato?.parentesco} />
            <Campo nome="Telefone" name="telefone" tipo="tel" valor={formatarTelefone(contato?.telefone || '')} />
            <Campo nome="E-mail" name="email" tipo="email" valor={contato?.email} />
            <Campo nome="CPF" name="cpf" valor={contato?.cpf} />
            <label>Observações<textarea name="observacoes" maxLength={1000} defaultValue={contato?.observacoes} /></label>
        </>;
    }
    return <div className={css.painel}>
        <h3>Responsáveis e contatos da ficha</h3>
        <p>Contatos adicionais para a equipe. O acesso ao Portal é gerenciado pelo vínculo principal.</p>
        {contatos.map((item) => <details key={item.id}>
            <summary>{item.nome}{item.parentesco && ' · ' + item.parentesco}</summary>
            <p>{[formatarTelefone(item.telefone),item.email,item.cpf,item.observacoes].filter(Boolean).join(' · ')}</p>
            {pode && <>
                <Formulario acao="contato_extra" id={id} atualizado={atualizar}>{campos(item)}</Formulario>
                <Formulario acao="remover_contato" id={id} atualizado={atualizar} texto="Remover contato">
                    <input type="hidden" name="contato_id" value={item.id} />
                    <label className={css.confirmar}><input name="confirmado" type="checkbox" required /> Confirmar remoção</label>
                </Formulario>
            </>}
        </details>)}
        {pode && <details><summary>Novo responsável ou contato</summary>
            <Formulario acao="contato_extra" id={id} atualizado={atualizar}>{campos()}</Formulario>
        </details>}
    </div>;
}

function ExcluirAluno({ aluno, aoExcluir }: { aluno: Ficha; aoExcluir: () => void }) {
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState('');
    async function excluir() {
        if (ocupado || !window.confirm(`Excluir definitivamente a ficha de ${aluno.nome_aluno} do R4 e do Portal? As aulas já registradas ficarão no histórico. Esta ação é irreversível.`)) return;
        setOcupado(true);
        setErro('');
        try {
            await ler('/api/admin/alunos?id=' + aluno.id, { method: 'DELETE' });
            aoExcluir();
        } catch (falha) {
            setErro(falha instanceof Error ? falha.message : 'Não foi possível excluir o aluno.');
        } finally { setOcupado(false); }
    }
    return <div className="mt-4 border-t pt-3">
        <button type="button" disabled={ocupado} onClick={() => void excluir()}
            className="rounded-lg border border-rose-600 px-3 py-2 font-semibold text-rose-600">
            {ocupado ? 'Excluindo…' : 'Excluir aluno definitivamente'}
        </button>
        {erro && <p role="alert">{erro}</p>}
    </div>;
}

function Situacao({ aluno, atualizar, pode }: { aluno: Ficha; atualizar: () => void; pode: boolean }) {
    const [confirmado, setConfirmado] = useState(false);
    return <section className={css.painel}><h2>{aluno.ativo ? 'Inativar aluno' : 'Reativar aluno'}</h2>
        <p>{aluno.ativo ? 'O aluno sairá da seleção de novos agendamentos e da lista de filhos ativos do portal. Aulas existentes e histórico serão preservados.' : 'O aluno voltará às listas de alunos ativos.'}</p>
        {pode && <Formulario acao="situacao" id={aluno.id} atualizado={atualizar} texto={confirmado ? 'Confirmar alteração' : ''}>
            <input type="hidden" name="ativo" value={String(!aluno.ativo)} />
            <label className={css.confirmar}><input type="checkbox" name="confirmado" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} /> Confirmo a alteração para {aluno.nome_aluno}</label>
        </Formulario>}
    </section>;
}

export default function FichaAlunosR4({ contas, atualizarPainel }: { contas: ReactNode; atualizarPainel: () => Promise<void> }) {
    const params = useSearchParams();
    const router = useRouter();
    const id = Number(params.get('aluno')) || 0;
    const layout = useLayoutR4();
    const secao = secoes.find((item) => item.id === params.get('secao'))?.id;
    const [revisao, setRevisao] = useState(0);
    const [modo, setModo] = useState('alunos');
    const base = useConsulta<Base>('/api/admin/ficha-aluno', revisao);
    const dados = useConsulta<{ aluno: Ficha; podeEditarControle: boolean; contatos: Contato[] }>(id ? '/api/admin/ficha-aluno?id=' + id + (secao === 'contatos' ? '&contatos=1' : '') : '', revisao);
    const alunos = base?.dados?.alunos || [];
    const aluno = dados?.dados?.aluno;
    const atualizar = () => { setRevisao((r) => r + 1); void atualizarPainel(); };
    const erro = base?.erro || dados?.erro;
    const aposExcluir = () => { router.replace(caminho()); setModo('alunos'); atualizar(); };
    if (base?.erro && !id) return <div className={css.ficha}><p role="alert">{base.erro} <button type="button" onClick={atualizar}>Atualizar</button></p>{contas}</div>;
    return <div className={css.ficha}>
        {id > 0 ? <>
            <nav className={css.acoes} aria-label="Localização">
                <Link href={caminho()} onClick={() => setModo('alunos')}><ArrowLeft size={15} /> Alunos</Link>
                {aluno && <Link href={caminho(id)}>{aluno.nome_aluno}</Link>}
                {secao && <span>{secoes.find((s) => s.id === secao)?.nome}</span>}
            </nav>
            {erro ? <p role="alert">{erro} <button onClick={atualizar}>Atualizar</button></p> : !aluno ? <p role="status">Carregando ficha…</p> : <>
                <header className={css.cabecalho} {...layout?.item("ficha_cabecalho", "ficha", "Cabeçalho da ficha")}>
                    <span className={css.avatar}>{aluno.foto_ficha ?
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={aluno.foto_ficha} alt="" /> : obterIniciais(aluno.nome_aluno)}</span>
                    <div><h2>{aluno.nome_aluno}</h2><p>{[aluno.serie, aluno.colegio_nome].filter(Boolean).join(' · ') || 'Dados escolares pendentes'}</p></div>
                    <div className={css.contato}><strong>{aluno.responsavel_nome || 'Sem responsável'}</strong><p>{formatarTelefone(aluno.telefone)}</p><small>{!aluno.ativo ? 'Inativo' : aluno.responsavel_id && aluno.tem_pin ? 'Portal ativo' : 'Sem acesso ao portal'}</small></div>
                </header>
                {!secao && <div className={css.atalhos}>{secoes.map(({ id: destino, nome, descricao, Icone }) => <Link key={destino} href={caminho(id,destino)} {...layout?.item("ficha_aba_" + destino, "ficha_abas", nome)}>
                    <Icone size={20} /><strong><TextoLayoutR4 id={"ficha_aba_" + destino} campo="titulo" texto={nome} /></strong><small>{descricao}</small>
                </Link>)}</div>}
                {secao === 'perfil' && <section className={css.painel} {...layout?.item("secao_perfil", "ficha", "Perfil do aluno")}>
                    <h2><TextoLayoutR4 id="secao_perfil" campo="titulo" texto="Perfil do aluno" /></h2>
                    <Formulario acao="perfil" id={id} atualizado={atualizar} texto={base?.dados?.podeEditar ? 'Salvar perfil' : ''}>
                        {base?.dados?.podeEditar && <label>Foto<input type="file" name="foto" accept="image/jpeg,image/png,image/webp" /></label>}
                        <DadosEscolares aluno={aluno} bloqueado={!base?.dados?.podeEditar} />
                        <Campo nome="Nascimento" name="nascimento" valor={aluno.nascimento} tipo="date" bloqueado={!base?.dados?.podeEditar} />
                        <label>Sexo<select name="sexo" defaultValue={aluno.sexo} disabled={!base?.dados?.podeEditar}><option value="">Não informado</option><option>Feminino</option><option>Masculino</option><option>Outro</option></select></label>
                        <Campo nome="CPF" name="cpf" valor={aluno.cpf} bloqueado={!base?.dados?.podeEditar} />
                    </Formulario>
                </section>}
                {secao === 'contatos' && <section className={css.painel} {...layout?.item("secao_contatos", "ficha", "Contatos")}>
                    <h2><TextoLayoutR4 id="secao_contatos" campo="titulo" texto="Contatos" /></h2>
                    <Formulario acao="contatos" id={id} atualizado={atualizar} texto={base?.dados?.podeEditar ? 'Salvar contatos' : ''}>
                        <Campo nome="E-mail de contato" name="email" valor={aluno.email} tipo="email" bloqueado={!base?.dados?.podeEditar} />
                        <label>Endereço<textarea name="endereco" defaultValue={aluno.endereco} maxLength={1000} disabled={!base?.dados?.podeEditar} /></label>
                        <h3>Responsável principal</h3>
                        <Campo nome="Nome do responsável" name="responsavel_nome" valor={aluno.responsavel_nome} bloqueado={Boolean(aluno.responsavel_id) || !base?.dados?.podeEditar} />
                        <Campo nome="WhatsApp do responsável" name="telefone" tipo="tel" valor={formatarTelefone(aluno.telefone)} bloqueado={Boolean(aluno.responsavel_id) || !base?.dados?.podeEditar} />
                    </Formulario>
                    {aluno.responsavel_id && <Link href={caminho()} onClick={() => setModo('portal')}>Gerenciar conta e PIN no Portal</Link>}
                    {!aluno.responsavel_id && base?.dados?.podeAdministrar && <details>
                        <summary>Vincular responsável ao Portal</summary>
                        <Formulario acao="vincular" id={id} atualizado={atualizar} texto="Vincular responsável">
                            <Campo nome="WhatsApp da conta" name="telefone" valor={formatarTelefone(aluno.telefone)} tipo="tel" />
                            <label className={css.confirmar}><input required name="confirmado" type="checkbox" /> Confirmei o WhatsApp e que o responsável pode acessar este aluno</label>
                        </Formulario>
                    </details>}
                    {base?.dados?.podeEditar && <ExcluirAluno aluno={aluno} aoExcluir={aposExcluir} />}
                    <ContatosAdicionais id={id} contatos={dados?.dados?.contatos || []} atualizar={atualizar} pode={Boolean(base?.dados?.podeEditar)} />
                </section>}
                {secao === 'situacao' && <section {...layout?.item("secao_situacao", "ficha", "Situação")}>
                    <Situacao aluno={aluno} atualizar={atualizar} pode={Boolean(base?.dados?.podeAdministrar)} />
                    {base?.dados?.podeEditar && <ExcluirAluno aluno={aluno} aoExcluir={aposExcluir} />}
                </section>}
                {(secao === 'calendario' || secao === 'controle') && <section
                    {...layout?.item("secao_" + secao, "ficha", secao === 'calendario' ? "Calendário" : "Controle")}><Calendario key={id + secao} id={id} controle={secao === 'controle'} ficha={aluno}
                    podeEditarControle={Boolean(dados?.dados?.podeEditarControle)} /></section>}
            </>}
        </> : <>
            <ListaAlunosR4 alunos={alunos} modo={modo} setModo={setModo} podeCriar={Boolean(base?.dados?.podeCriar)}
                carregando={!base} revisao={revisao} />
            {modo === 'portal' ? <section {...layout?.item("contas_portal", "listagem", "Contas do Portal")}>{contas}</section> :
                modo === 'novo' ? <section className={css.painel}><h2>Novo aluno</h2><Formulario acao="criar" atualizado={() => { atualizar(); setModo('alunos'); }}>
                    <DadosEscolares /><Campo nome="Responsável" name="responsavel_nome" /><Campo nome="WhatsApp do responsável" name="telefone" tipo="tel" />
                </Formulario></section> : null}
        </>}
    </div>;
}
