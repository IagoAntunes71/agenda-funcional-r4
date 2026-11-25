'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CalendarDays, ClipboardList, Contact, GraduationCap, Search, UserRound, UserRoundX } from 'lucide-react';
import { formatarTelefone, normalizarTelefone, SERIES_ESCOLARES } from '@/lib/cliente-helpers';
import { FORMATO_ALUNOS_CLINCARE, inferirColegioClinCare, inferirSerieClinCare, padronizarColegioClinCare, validarAlunoClinCare, type AlunoClinCare } from '@/lib/importacao-alunos-clincare';
import { obterMetaStatusR4 } from '@/lib/agenda-status-r4';
import { adicionarDiasISO, obterAgoraBahia } from '@/lib/horarios-reforco';
import { comprimirImagemAvatar, formatarDataBR, obterIniciais } from './types';
import css from './FichaAlunosR4.module.css';

type Aluno = {
    id: number; nome_aluno: string; colegio_nome: string; serie: string; ativo: boolean; clin_care_aluno_id: string | null;
    responsavel_id: number | null; responsavel_nome: string; telefone: string; tem_pin: boolean; nascimento: string | null;
};
type Contato = { id: number; nome: string; parentesco: string; telefone: string; email: string; cpf: string; observacoes: string; principal_clincare?: boolean };
type Ficha = Aluno & { foto_ficha: string; cpf: string; sexo: string; email: string; endereco: string; plano: string; orientacoes: string };
type Aula = { id: number; data: string; inicio: string; fim: string; materia: string; professor: string; unidade: string; status: string; feedback: string | null };
type Base = { alunos: Aluno[]; podeEditar: boolean; podeCriar: boolean; podeImportar: boolean };
type Importado = { clin_care_aluno_id: string; nome_aluno: string; telefone: string; responsavel_nome: string; colegio_nome: string; serie: string; ficha?: AlunoClinCare };
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

function lerCsv(texto: string): Importado[] {
    const conteudo = texto.replace(/^\uFEFF/, '');
    const sep = conteudo.split(/\r?\n/, 1)[0].includes(';') ? ';' : ',';
    const linhas: string[][] = [];
    let linha: string[] = [];
    let campo = '';
    let aspas = false;
    for (let i = 0; i < conteudo.length; i++) {
        const caractere = conteudo[i];
        if (caractere === '"') {
            if (aspas && conteudo[i + 1] === '"') { campo += '"'; i++; }
            else aspas = !aspas;
        } else if (!aspas && (caractere === '\n' || caractere === '\r' || caractere === sep)) {
            linha.push(campo.trim());
            campo = '';
            if (caractere !== sep) {
                if (linha.some(Boolean)) linhas.push(linha);
                linha = [];
                if (caractere === '\r' && conteudo[i + 1] === '\n') i++;
            }
        } else campo += caractere;
    }
    if (aspas) throw new Error('Há um campo com aspas abertas no CSV.');
    linha.push(campo.trim());
    if (linha.some(Boolean)) linhas.push(linha);
    const cab = linhas.shift()?.map(limpar) || [];
    if (!cab.includes('id') || !cab.includes('nome')) throw new Error('O CSV precisa ter as colunas id e nome.');
    const ids = new Set<string>();
    return linhas.map((colunas, i) => {
        const campo = (nome: string) => colunas[cab.indexOf(nome)] || '';
        const id = campo('id');
        const nome = campo('nome');
        if (!id || nome.length < 2 || ids.has(id)) throw new Error('Confira o ID e o nome da linha ' + (i + 2) + '.');
        ids.add(id);
        return { clin_care_aluno_id: id, nome_aluno: nome, telefone: campo('whatsapp'),
            responsavel_nome: campo('responsavel'), colegio_nome: padronizarColegioClinCare(campo('colegio') || inferirColegioClinCare(nome)), serie: inferirSerieClinCare(campo('serie') || nome) };
    });
}

function Importacao({ alunos, atualizar, fechar }: { alunos: Aluno[]; atualizar: () => void; fechar: () => void }) {
    const [linhas, setLinhas] = useState<Importado[]>([]);
    const [series, setSeries] = useState<Record<string,string>>({});
    const [colegios, setColegios] = useState<Record<string,string>>({});
    const [escolhas, setEscolhas] = useState<Record<string, string>>({});
    const [estado, setEstado] = useState<Record<string, string>>({});
    const [erro, setErro] = useState('');
    const [avisoArquivo, setAvisoArquivo] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [confirmar, setConfirmar] = useState(false);
    const [pagina, setPagina] = useState(0);
    const propostas = linhas.map((item) => {
        const existente = alunos.find((a) => a.clin_care_aluno_id === item.clin_care_aluno_id);
        const telefone = normalizarTelefone(item.telefone);
        const exatos = alunos.filter((a) => limpar(a.nome_aluno) === limpar(item.nome_aluno) && telefone && normalizarTelefone(a.telefone) === telefone);
        const possiveis = alunos.filter((a) => !a.clin_care_aluno_id && (limpar(a.nome_aluno) === limpar(item.nome_aluno) ||
            (telefone && normalizarTelefone(a.telefone) === telefone)));
        const sugestao = escolhas[item.clin_care_aluno_id] ?? (existente ? String(existente.id) : exatos.length === 1 && !exatos[0].clin_care_aluno_id ?
            String(exatos[0].id) : possiveis.length || exatos.length ? '' : 'novo');
        return { item, existente, possiveis, sugestao };
    });

    async function aplicar() {
        setOcupado(true);
        const destinos = new Set<string>();
        try {
            for (const { item, sugestao } of propostas) {
                const chave = item.clin_care_aluno_id;
                if (!sugestao || estado[chave] === 'Salvo') continue;
                if (sugestao !== 'novo' && destinos.has(sugestao)) {
                    setEstado((atual) => ({ ...atual, [chave]: 'Outro registro usa o mesmo aluno. Revise o vínculo.' }));
                    continue;
                }
                if (sugestao !== 'novo') destinos.add(sugestao);
                try {
                    await salvar({ ...item, ...item.ficha, colegio_nome: colegios[chave] ?? item.colegio_nome, serie: series[chave] ?? item.serie, acao: item.ficha ? 'importar_ficha' : 'importar', id: Number(sugestao) || undefined, novo: sugestao === 'novo' });
                    setEstado((atual) => ({ ...atual, [chave]: 'Salvo' }));
                } catch (e) { setEstado((atual) => ({ ...atual, [chave]: (e as Error).message })); }
            }
        } finally { setOcupado(false); }
    }

    return <section className={css.painel}>
        <button type="button" onClick={() => { atualizar(); fechar(); }} disabled={ocupado}>← Alunos</button>
        <h2>Importar alunos do Clin Care</h2>
        <p>Selecione o JSON gerado pela rotina local ou use um CSV com os cabeçalhos <code>id;nome;whatsapp;responsavel;colegio;serie</code>. Use o ID permanente do Clin Care.</p>
        <a download="modelo-alunos-clin-care.csv" href="data:text/csv;charset=utf-8,id%3Bnome%3Bwhatsapp%3Bresponsavel%3Bcolegio%3Bserie%0A">Baixar modelo CSV</a>
        <input type="file" accept=".csv,.json,text/csv,application/json" disabled={ocupado} onChange={async (e) => {
            const arquivo = e.target.files?.[0];
            if (!arquivo) return;
            setErro(''); setAvisoArquivo(''); setLinhas([]); setColegios({}); setSeries({}); setEscolhas({}); setEstado({}); setConfirmar(false); setPagina(0);
            try {
                if (arquivo.size > 20_000_000) throw new Error('Use um arquivo de até 20 MB.');
                const conteudo = await arquivo.text();
                if (!arquivo.name.toLowerCase().endsWith('.json')) {
                    setLinhas(lerCsv(conteudo));
                    return;
                }
                const dados = JSON.parse(conteudo);
                if (dados?.formato !== FORMATO_ALUNOS_CLINCARE || !Array.isArray(dados.alunos) ||
                    !dados.alunos.every(validarAlunoClinCare)) throw new Error('O JSON contém fichas inválidas.');
                const fichas = dados.alunos as AlunoClinCare[];
                if (new Set(fichas.map((item) => item.clin_care_aluno_id)).size !== fichas.length) throw new Error('O JSON tem IDs repetidos.');
                setLinhas(fichas.map((ficha) => {
                    const principal = ficha.responsaveis.find((item) => item.principal) ?? (ficha.responsaveis.length === 1 ? ficha.responsaveis[0] : undefined);
                    return { clin_care_aluno_id: ficha.clin_care_aluno_id, nome_aluno: ficha.nome_aluno,
                        telefone: principal?.telefone || '', responsavel_nome: principal?.nome || '',
                        colegio_nome: padronizarColegioClinCare(ficha.colegio_nome ?? inferirColegioClinCare(ficha.nome_aluno)),
                        serie: inferirSerieClinCare(ficha.serie || ficha.nome_aluno), ficha };
                }));
                const pendencias = Array.isArray(dados.pendencias) ? dados.pendencias.length : 0;
                setAvisoArquivo([dados.parcial ? 'Coleta parcial ou com cobertura não confirmada.' : '',
                    pendencias ? pendencias + ' pendências registradas no JSON.' : ''].filter(Boolean).join(' '));
            } catch (e) { setErro((e as Error).message); }
        }} />
        {erro && <p role="alert">{erro}</p>}
        {avisoArquivo && <p role="status">{avisoArquivo}</p>}
        {linhas.length > 0 && <>
            <p>{linhas.length} alunos no arquivo · {Object.values(estado).filter((v) => v === 'Salvo').length} salvos</p>
            {propostas.slice(pagina * 30, pagina * 30 + 30).map(({ item, existente, possiveis, sugestao }) => <article className={css.linha} key={item.clin_care_aluno_id}>
                <div><strong>{item.nome_aluno}</strong><p>{[item.responsavel_nome, item.telefone, item.colegio_nome, item.serie].filter(Boolean).join(' · ')}</p>
                    {item.ficha && <small>{item.ficha.responsaveis.length} contatos · {item.ficha.responsaveis.filter((r) => r.cpf).length} CPFs</small>}
                </div>
                <label>Colégio <input value={colegios[item.clin_care_aluno_id] ?? item.colegio_nome} maxLength={180}
                    placeholder="Não informado" disabled={ocupado || estado[item.clin_care_aluno_id] === 'Salvo'} onChange={(e) => {
                        setColegios((atual) => ({ ...atual, [item.clin_care_aluno_id]: e.target.value }));
                        setConfirmar(false);
                    }} /></label>
                <label>Série <select value={series[item.clin_care_aluno_id] ?? item.serie}
                    disabled={ocupado || estado[item.clin_care_aluno_id] === 'Salvo'} onChange={(e) => {
                        setSeries((atual) => ({ ...atual, [item.clin_care_aluno_id]: e.target.value }));
                        setConfirmar(false);
                    }}>
                    <option value="">Manter ou deixar em branco</option>
                    {SERIES_ESCOLARES.map((serie) => <option key={serie}>{serie}</option>)}
                </select></label>
                {existente ? <span>Completar ficha existente</span> : <select aria-label={'Destino de ' + item.nome_aluno} value={sugestao}
                    disabled={ocupado || estado[item.clin_care_aluno_id] === 'Salvo'} onChange={(e) => {
                        setEscolhas((atual) => ({ ...atual, [item.clin_care_aluno_id]: e.target.value }));
                        setConfirmar(false);
                    }}>
                    <option value="">Revisar depois</option><option value="novo">Criar novo aluno</option>
                    {possiveis.map((a) => <option key={a.id} value={a.id}>Vincular a {a.nome_aluno} #{a.id} · {a.telefone || 'Sem telefone'}</option>)}
                </select>}
                {estado[item.clin_care_aluno_id] && <span role="status">{estado[item.clin_care_aluno_id]}</span>}
            </article>)}
            <div className={css.acoes}>
                <button type="button" disabled={!pagina} onClick={() => setPagina(pagina - 1)}>Anterior</button>
                <button type="button" disabled={(pagina + 1) * 30 >= linhas.length} onClick={() => setPagina(pagina + 1)}>Próxima</button>
            </div>
            <label className={css.confirmar}><input type="checkbox" checked={confirmar} disabled={ocupado} onChange={(e) => setConfirmar(e.target.checked)} /> Revisei os vínculos, os colégios e as séries de todas as páginas</label>
            <button className="r4-acao" type="button" disabled={!confirmar || ocupado} onClick={() => void aplicar()}>{ocupado ? 'Importando…' : 'Aplicar importação'}</button>
        </>}
    </section>;
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
            <summary>{item.nome}{item.parentesco && ' · ' + item.parentesco}{item.principal_clincare && ' · Principal no Clin Care'}</summary>
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
    const id = Number(params.get('aluno')) || 0;
    const secao = secoes.find((item) => item.id === params.get('secao'))?.id;
    const [revisao, setRevisao] = useState(0);
    const [modo, setModo] = useState('alunos');
    const [busca, setBusca] = useState('');
    const [inativos, setInativos] = useState(false);
    const [pagina, setPagina] = useState(0);
    const base = useConsulta<Base>('/api/admin/ficha-aluno', revisao);
    const dados = useConsulta<{ aluno: Ficha; podeEditarControle: boolean; contatos: Contato[] }>(id ? '/api/admin/ficha-aluno?id=' + id + (secao === 'contatos' ? '&contatos=1' : '') : '', revisao);
    const alunos = base?.dados?.alunos || [];
    const resultado = alunos.filter((a) => (inativos || a.ativo) &&
        (limpar([a.nome_aluno,a.responsavel_nome,a.telefone,a.colegio_nome,a.serie].join(' ')).includes(limpar(busca)) ||
        (/\d{4}/.test(busca.replace(/\D/g,'')) && a.telefone.replace(/\D/g,'').includes(busca.replace(/\D/g,'')))));
    const aluno = dados?.dados?.aluno;
    const atualizar = () => { setRevisao((r) => r + 1); void atualizarPainel(); };
    const erro = base?.erro || dados?.erro;
    if (base?.erro && !id) return <div className={css.ficha}><p role="alert">{base.erro} <button type="button" onClick={atualizar}>Atualizar</button></p>{contas}</div>;
    return <div className={css.ficha}>
        {id > 0 ? <>
            <nav className={css.acoes} aria-label="Localização">
                <Link href={caminho()} onClick={() => setModo('alunos')}><ArrowLeft size={15} /> Alunos</Link>
                {aluno && <Link href={caminho(id)}>{aluno.nome_aluno}</Link>}
                {secao && <span>{secoes.find((s) => s.id === secao)?.nome}</span>}
            </nav>
            {erro ? <p role="alert">{erro} <button onClick={atualizar}>Atualizar</button></p> : !aluno ? <p role="status">Carregando ficha…</p> : <>
                <header className={css.cabecalho}>
                    <span className={css.avatar}>{aluno.foto_ficha ?
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={aluno.foto_ficha} alt="" /> : obterIniciais(aluno.nome_aluno)}</span>
                    <div><h2>{aluno.nome_aluno}</h2><p>{[aluno.serie, aluno.colegio_nome].filter(Boolean).join(' · ') || 'Dados escolares pendentes'}</p></div>
                    <div className={css.contato}><strong>{aluno.responsavel_nome || 'Sem responsável'}</strong><p>{formatarTelefone(aluno.telefone)}</p><small>{!aluno.ativo ? 'Inativo' : aluno.responsavel_id && aluno.tem_pin ? 'Portal ativo' : 'Sem acesso ao portal'}</small></div>
                </header>
                {!secao && <div className={css.atalhos}>{secoes.map(({ id: destino, nome, descricao, Icone }) => <Link key={destino} href={caminho(id,destino)}>
                    <Icone size={20} /><strong>{nome}</strong><small>{descricao}</small>
                </Link>)}</div>}
                {secao === 'perfil' && <section className={css.painel}><h2>Perfil do aluno</h2>
                    <Formulario acao="perfil" id={id} atualizado={atualizar} texto={base?.dados?.podeEditar ? 'Salvar perfil' : ''}>
                        {base?.dados?.podeEditar && <label>Foto<input type="file" name="foto" accept="image/jpeg,image/png,image/webp" /></label>}
                        <DadosEscolares aluno={aluno} bloqueado={!base?.dados?.podeEditar} />
                        <Campo nome="Nascimento" name="nascimento" valor={aluno.nascimento} tipo="date" bloqueado={!base?.dados?.podeEditar} />
                        <label>Sexo<select name="sexo" defaultValue={aluno.sexo} disabled={!base?.dados?.podeEditar}><option value="">Não informado</option><option>Feminino</option><option>Masculino</option><option>Outro</option></select></label>
                        <Campo nome="CPF" name="cpf" valor={aluno.cpf} bloqueado={!base?.dados?.podeEditar} />
                    </Formulario>
                </section>}
                {secao === 'contatos' && <section className={css.painel}><h2>Contatos</h2>
                    <Formulario acao="contatos" id={id} atualizado={atualizar} texto={base?.dados?.podeEditar ? 'Salvar contatos' : ''}>
                        <Campo nome="E-mail de contato" name="email" valor={aluno.email} tipo="email" bloqueado={!base?.dados?.podeEditar} />
                        <label>Endereço<textarea name="endereco" defaultValue={aluno.endereco} maxLength={1000} disabled={!base?.dados?.podeEditar} /></label>
                        <h3>Responsável principal</h3>
                        <Campo nome="Nome do responsável" name="responsavel_nome" valor={aluno.responsavel_nome} bloqueado={Boolean(aluno.responsavel_id) || !base?.dados?.podeEditar} />
                        <Campo nome="WhatsApp do responsável" name="telefone" tipo="tel" valor={formatarTelefone(aluno.telefone)} bloqueado={Boolean(aluno.responsavel_id) || !base?.dados?.podeEditar} />
                    </Formulario>
                    {aluno.responsavel_id && <Link href={caminho()} onClick={() => setModo('portal')}>Gerenciar conta e PIN no Portal</Link>}
                    {!aluno.responsavel_id && base?.dados?.podeImportar && <details>
                        <summary>Vincular responsável ao Portal</summary>
                        <Formulario acao="vincular" id={id} atualizado={atualizar} texto="Vincular responsável">
                            <Campo nome="WhatsApp da conta" name="telefone" valor={formatarTelefone(aluno.telefone)} tipo="tel" />
                            <label className={css.confirmar}><input required name="confirmado" type="checkbox" /> Confirmei o WhatsApp e que o responsável pode acessar este aluno</label>
                        </Formulario>
                    </details>}
                    <ContatosAdicionais id={id} contatos={dados?.dados?.contatos || []} atualizar={atualizar} pode={Boolean(base?.dados?.podeEditar)} />
                </section>}
                {secao === 'situacao' && <Situacao aluno={aluno} atualizar={atualizar} pode={Boolean(base?.dados?.podeImportar)} />}
                {(secao === 'calendario' || secao === 'controle') && <Calendario key={id + secao} id={id} controle={secao === 'controle'} ficha={aluno}
                    podeEditarControle={Boolean(dados?.dados?.podeEditarControle)} />}
            </>}
        </> : <>
            <nav className={css.acoes} aria-label="Cadastros">
                <button aria-pressed={modo === 'alunos'} onClick={() => setModo('alunos')}>Alunos</button>
                <button aria-pressed={modo === 'portal'} onClick={() => setModo('portal')}>Contas do Portal</button>
                {base?.dados?.podeCriar && <button className="r4-acao" onClick={() => setModo('novo')}>Novo aluno</button>}
                {base?.dados?.podeImportar && <button onClick={() => setModo('importar')}>Importar Clin Care</button>}
            </nav>
            {modo === 'portal' ? contas : modo === 'importar' ? <Importacao alunos={alunos} atualizar={atualizar} fechar={() => setModo('alunos')} /> :
                modo === 'novo' ? <section className={css.painel}><h2>Novo aluno</h2><Formulario acao="criar" atualizado={() => { atualizar(); setModo('alunos'); }}>
                    <DadosEscolares /><Campo nome="Responsável" name="responsavel_nome" /><Campo nome="WhatsApp do responsável" name="telefone" tipo="tel" />
                </Formulario></section> : !base ? <p role="status">Carregando alunos…</p> : <>
                    <div className={css.busca}>
                        <label><Search size={16} /><input type="search" aria-label="Buscar alunos" placeholder="Aluno, responsável, WhatsApp ou colégio" value={busca}
                            onChange={(e) => { setBusca(e.target.value); setPagina(0); }} /></label>
                        <label><input type="checkbox" checked={inativos} onChange={(e) => { setInativos(e.target.checked); setPagina(0); }} /> Exibir inativos</label>
                        <span>{resultado.length} alunos</span>
                    </div>
                    {resultado.length === 0 && <p>Nenhum aluno encontrado.</p>}
                    <div className={css.cartoes}>{resultado.slice(pagina * 24,pagina * 24 + 24).map((a) => <article key={a.id}>
                        <div className={css.acoes}><span className={css.avatar}>{obterIniciais(a.nome_aluno)}</span>
                            <Link href={caminho(a.id,'calendario')} aria-label={'Calendário de ' + a.nome_aluno}><CalendarDays size={17} /></Link></div>
                        <Link className={css.nome} href={caminho(a.id)}>{a.nome_aluno}</Link>
                        <p>{[a.serie,a.colegio_nome].filter(Boolean).join(' · ') || 'Dados escolares pendentes'}</p>
                        <small>{a.responsavel_nome || 'Sem responsável'}{a.telefone && ' · ' + formatarTelefone(a.telefone)}</small>
                        <small>{!a.ativo ? 'Inativo' : a.responsavel_id && a.tem_pin ? 'Portal ativo' : 'Sem acesso ao portal'}</small>
                    </article>)}</div>
                    {resultado.length > 24 && <div className={css.acoes}><button disabled={!pagina} onClick={() => setPagina(pagina - 1)}>Anterior</button>
                        <span>Página {pagina + 1}</span><button disabled={(pagina + 1) * 24 >= resultado.length} onClick={() => setPagina(pagina + 1)}>Próxima</button></div>}
                </>}
        </>}
    </div>;
}
