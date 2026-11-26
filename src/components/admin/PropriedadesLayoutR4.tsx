import { useState, type FormEvent } from 'react';
import { MODULOS_ADMIN } from '@/lib/admin-navegacao';
import { ESPACAMENTOS, FONTES, GRUPOS_CARDS, ICONES_CARDS, LARGURAS, PESOS, SUPERFICIES, TAMANHOS_TEXTO,
    moduloLayout, type PosicaoLayout, type TextoLayout } from '@/lib/layout-admin';
import type { useEditorLayoutR4 } from './EditorLayoutR4';
import css from './EditorLayoutR4.module.css';

type Editor = ReturnType<typeof useEditorLayoutR4>;
export const nomesModulos = {
    mapa: 'Mapa do Dia', agendamentos: 'Agendamentos', alunos: 'Alunos', textos: 'Textos e cores do Admin',
    datas: 'Datas', professores: 'Professores', unidades: 'Unidades', whatsapp: 'WhatsApp',
    configuracoes: 'Configurações', 'controle-alunos': 'Controle dos Alunos', recepcao: 'Recepção', metas: 'Metas de feedback',
    portal: 'Portal do Aluno', 'portal-textos': 'Textos do Portal', 'portal-regras': 'Regras do Portal',
};
const nomesGrupos = ['Visão geral', 'Boas-vindas e aulas da semana', 'Mapa por unidade', 'Atendimento e agenda', 'Metas de feedback'];
const cores = ['#ffffff','#0b1e3b','#0e7c86','#0f766e','#fef3c7','#f1f5f9'];

function Opcoes<T extends string>({ titulo, valor, opcoes, nomes, alterar, padrao = 'Padrão' }: {
    titulo: string; valor?: T; opcoes: readonly T[]; nomes?: readonly string[];
    alterar: (valor: T | undefined) => void; padrao?: string;
}) {
    return <label>{titulo}<select value={valor ?? ''} onChange={(e) => {
        alterar(opcoes.find((item) => item === e.target.value));
    }}>
        <option value="">{padrao}</option>
        {opcoes.map((item, i) => <option key={item} value={item}>{nomes?.[i] || item}</option>)}
    </select></label>;
}

function Cor({ titulo, valor, alterar, fallback }: { titulo: string; valor?: string; alterar: (valor?: string) => void; fallback: string }) {
    return <div className={css.cor}>
        <label>{titulo}<input type="color" value={valor || fallback} onChange={(e) => alterar(e.target.value)} /></label>
        <button type="button" onClick={() => alterar()}>Padrão</button>
        {valor && <code>{valor}</code>}
    </div>;
}

function NovoCard({ editor }: { editor: Editor }) {
    const grupos = editor.pagina === 'dashboard_visao_geral' ? GRUPOS_CARDS : GRUPOS_CARDS.slice(0, 1);
    const [tipo, setTipo] = useState<'atalho' | 'aviso'>('atalho');
    function criar(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        const grupo = GRUPOS_CARDS.find((item) => item === dados.get('grupo'));
        const modulo = dados.get('modulo');
        const titulo = String(dados.get('titulo') || '').trim();
        if (!grupo || !titulo || (tipo === 'atalho' && !moduloLayout(modulo))) return;
        const icone = ICONES_CARDS.find((item) => item === dados.get('icone'));
        editor.adicionar('custom_' + crypto.randomUUID(), {
            offsetX: 0, offsetY: 0, card: { grupo, tipo }, modulo: tipo === 'atalho' && moduloLayout(modulo) ? modulo : undefined,
            icone, textos: { titulo: { texto: titulo }, descricao: { texto: String(dados.get('descricao') || '').trim() } },
        });
    }
    return <form onSubmit={criar} className={css.campos}>
        <label>Tipo<select value={tipo} onChange={(e) => setTipo(e.target.value === 'aviso' ? 'aviso' : 'atalho')}>
            <option value="atalho">Atalho</option><option value="aviso">Texto ou aviso</option>
        </select></label>
        <label>Seção<select name="grupo">{grupos.map((grupo, i) => <option key={grupo} value={grupo}>{grupos.length === 1 ? "Página atual" : nomesGrupos[i]}</option>)}</select></label>
        <label>Título<input name="titulo" required maxLength={160} /></label>
        <label>Descrição<textarea name="descricao" maxLength={1600} rows={3} /></label>
        <label>Ícone<select name="icone"><option value="">Automático</option>{ICONES_CARDS.map((icone) => <option key={icone}>{icone}</option>)}</select></label>
        {tipo === 'atalho' && <label>Destino<select name="modulo" required><option value="">Selecione</option>
            {MODULOS_ADMIN.map((modulo) => <option key={modulo} value={modulo}>{nomesModulos[modulo]}</option>)}
        </select></label>}
        <button type="submit" disabled={editor.ocupado}>Inserir card</button>
    </form>;
}

function NovoTexto({ editor }: { editor: Editor }) {
    return <form className={css.campos} onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        const texto = String(dados.get('texto') || '').trim();
        if (!texto) return;
        editor.setPosicionarTexto({
            texto,
            fonte: FONTES.find((item) => item === dados.get('fonte')),
            tamanho: TAMANHOS_TEXTO.find((item) => item === dados.get('tamanho')),
            cor: dados.get('usarCor') ? String(dados.get('cor') || '') : undefined,
        });
        editor.setNovoTexto(false);
    }}>
        <label>Texto<textarea name="texto" rows={3} required maxLength={1600} /></label>
        <label>Fonte<select name="fonte"><option value="">Padrão</option>
            {FONTES.map((item, i) => <option key={item} value={item}>{['Fonte do painel','Humanista','Serifada','Monoespaçada'][i]}</option>)}
        </select></label>
        <label>Tamanho<select name="tamanho"><option value="">Padrão</option>
            {TAMANHOS_TEXTO.map((item, i) => <option key={item} value={item}>{['Pequeno','Médio','Grande','Extra grande'][i]}</option>)}
        </select></label>
        <div className={css.cor}><label>Cor<input name="cor" type="color" defaultValue="#0e7c86" /></label>
            <label><input name="usarCor" type="checkbox" /> Usar cor personalizada</label></div>
        <button type="submit" disabled={editor.ocupado}>Escolher posição</button>
    </form>;
}

function Propriedades({ editor, id }: { editor: Editor; id: string }) {
    const pos = editor.layout[id] ?? {};
    const rotulo = editor.selecionado?.dataset.r4LayoutRotulo ?? id;
    const permiteDestino = /^(unidade|acao|atalho)_/.test(id) || pos.card?.tipo === 'atalho';
    const campo = editor.campoTexto ?? (pos.textoLivre ? 'descricao' : undefined);
    const tipografia = campo ? pos.textos?.[campo] : undefined;
    const alterar = (valores: Partial<PosicaoLayout>) => editor.atualizarItem(id, valores);
    const alterarFonte = (valores: Partial<TextoLayout>) => { if (campo) editor.atualizarTexto(id, campo, valores); };

    return <fieldset className={css.campos} disabled={editor.ocupado}>
        <legend>{rotulo}</legend>
        {!pos.textoLivre && <>
        <div className={css.colunas}>
            <Opcoes titulo="Largura" valor={pos.largura} opcoes={LARGURAS} nomes={['1 coluna','2 colunas','3 colunas','Largura total']}
                alterar={(largura) => alterar({ largura })} />
            <Opcoes titulo="Espaçamento" valor={pos.espacamento} opcoes={ESPACAMENTOS} nomes={['Compacto','Normal','Amplo']}
                alterar={(espacamento) => alterar({ espacamento })} />
        </div>
        <Opcoes titulo="Superfície" valor={pos.superficie} opcoes={SUPERFICIES} nomes={['Branco sólido','Marca','Transparente','Cor personalizada']}
            alterar={(superficie) => alterar({ superficie })} />
        {pos.superficie === 'personalizado' && <>
            <Cor titulo="Fundo" valor={pos.fundo} fallback="#ffffff" alterar={(fundo) => alterar({ fundo })} />
            <div className={css.paleta} aria-label="Paleta de fundo">{cores.map((fundo) =>
                <button key={fundo} type="button" style={{ background: fundo }} aria-label={'Fundo ' + fundo}
                    aria-pressed={pos.fundo === fundo} onClick={() => alterar({ fundo })} />)}</div>
        </>}
        {id === 'bloco_feedback' && <>
            <Cor titulo="Início do degradê" valor={pos.corBarraInicio}
                fallback={editor.nomeTema === 'Escuro' ? '#9070ff' : '#6745ce'}
                alterar={(corBarraInicio) => alterar({ corBarraInicio })} />
            <Cor titulo="Fim do degradê" valor={pos.corBarraFim}
                fallback={editor.nomeTema === 'Escuro' ? '#ff715c' : '#d84441'}
                alterar={(corBarraFim) => alterar({ corBarraFim })} />
        </>}
        <Cor titulo="Cor geral do card" valor={pos.corTexto} fallback="#0f172a" alterar={(corTexto) => alterar({ corTexto })} />
        <Cor titulo="Cor dos ícones" valor={pos.corIcone} fallback="#0e7c86" alterar={(corIcone) => alterar({ corIcone })} />
        {permiteDestino && <Opcoes titulo="Destino do atalho" valor={pos.modulo} opcoes={MODULOS_ADMIN}
            nomes={MODULOS_ADMIN.map((modulo) => nomesModulos[modulo])} alterar={(modulo) => {
                if (!modulo && pos.card) return;
                alterar({ modulo });
                if (modulo) editor.atualizarTexto(id, 'titulo', { texto: nomesModulos[modulo] });
                else editor.atualizarTexto(id, 'titulo', { texto: undefined });
            }} />}
        {(permiteDestino || pos.card) && <Opcoes titulo="Ícone" valor={pos.icone} opcoes={ICONES_CARDS}
            alterar={(icone) => alterar({ icone })} />}
        </>}
        {pos.textoLivre && <button type="button" onClick={() => editor.setPosicionarTexto(id)}>Reposicionar texto</button>}
        {campo ? <fieldset className={css.campos}>
            <legend>Tipografia · {campo}</legend>
            <Cor titulo="Cor deste texto" valor={tipografia?.cor} fallback="#0e7c86" alterar={(cor) => alterarFonte({ cor })} />
            <Opcoes titulo="Fonte" valor={tipografia?.fonte} opcoes={FONTES} nomes={['Fonte do painel','Humanista','Serifada','Monoespaçada']}
                alterar={(fonte) => alterarFonte({ fonte })} />
            <div className={css.colunas}>
                <Opcoes titulo="Tamanho" valor={tipografia?.tamanho} opcoes={TAMANHOS_TEXTO} nomes={['Pequeno','Médio','Grande','Extra grande']}
                    alterar={(tamanho) => alterarFonte({ tamanho })} />
                <Opcoes titulo="Peso" valor={tipografia?.peso} opcoes={PESOS} nomes={['Normal','Semibold','Bold']}
                    alterar={(peso) => alterarFonte({ peso })} />
            </div>
            {!pos.textoLivre && <button type="button" onClick={() => alterarFonte({ texto: undefined })}>Restaurar texto</button>}
        </fieldset> : <small>Clique em um título, subtítulo ou rótulo para editar texto e tipografia.</small>}
        <button className={css.remover} type="button" onClick={() => editor.remover(id, rotulo)}>Remover do painel</button>
    </fieldset>;
}

export function PainelPropriedadesLayoutR4({ editor, id }: { editor: Editor; id?: string }) {
    const [aberto, setAberto] = useState(true);
    const ocultos = Object.entries(editor.layout).filter(([, pos]) => pos.oculto);
    if (!id && !editor.novoCard && !editor.novoTexto && !ocultos.length) return null;
    return <aside className={css.propriedades} aria-label="Propriedades do layout">
        <div className={css.botoes}>
            <strong>{editor.novoTexto ? 'Adicionar Texto' : editor.novoCard ? 'Adicionar Card' : 'Propriedades'}</strong>
            {(editor.novoCard || editor.novoTexto) ? <button type="button" onClick={() => { editor.setNovoCard(false); editor.setNovoTexto(false); }}>Fechar</button> :
                <button type="button" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>{aberto ? 'Recolher' : 'Expandir'}</button>}
        </div>
        {editor.novoTexto ? <NovoTexto editor={editor} /> : editor.novoCard ? <NovoCard editor={editor} /> : aberto && <>
            {id && <Propriedades editor={editor} id={id} />}
            {!!ocultos.length && <details><summary>Blocos removidos ({ocultos.length})</summary>
                {ocultos.map(([chave, pos]) => <button key={chave} type="button" disabled={editor.ocupado}
                    onClick={() => editor.atualizarItem(chave, { oculto: undefined })}>
                    Restaurar {pos.textos?.titulo?.texto || chave.replace(/_/g, ' ')}
                </button>)}
            </details>}
        </>}
    </aside>;
}
