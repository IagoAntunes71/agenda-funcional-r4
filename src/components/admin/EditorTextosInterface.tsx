'use client';

import { useState, type FormEvent } from 'react';
import { useCatalogoTextosR4 } from '@/components/TextosInterfaceR4';
import { TEXTOS_INTERFACE_ADMIN_R4, TEXTOS_INTERFACE_PORTAL_R4 } from '@/lib/textos-interface-catalogo';
import type { TemaClasses } from './types';

export default function EditorTextosInterface({ classes, portal = false }: { classes: TemaClasses; portal?: boolean }) {
    const { textos, publicar, pronto } = useCatalogoTextosR4();
    const [alteracoes, setAlteracoes] = useState<Record<string, string>>({});
    const [busca, setBusca] = useState('');
    const [pagina, setPagina] = useState(0);
    const [salvando, setSalvando] = useState(false);
    const [aviso, setAviso] = useState('');
    const [erro, setErro] = useState('');
    const atuais = portal
        ? { ...Object.fromEntries(Object.entries(textos).filter(([chave]) => chave.startsWith('portal:'))
            .map(([chave, valor]) => [chave.slice(7), valor])), ...alteracoes }
        : { ...textos, ...alteracoes };
    const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const filtrados = (portal ? TEXTOS_INTERFACE_PORTAL_R4 : TEXTOS_INTERFACE_ADMIN_R4).filter((texto) => normalizar(texto + ' ' + (atuais[texto] || '')).includes(normalizar(busca.trim())));
    const porPagina = 24;

    async function salvar(e: FormEvent) {
        e.preventDefault();
        setSalvando(true);
        setAviso('');
        setErro('');
        try {
            const res = await fetch('/api/textos-interface', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ textos: alteracoes, escopo: portal ? 'portal' : 'admin' }),
            });
            const dados = await res.json();
            if (!res.ok) throw new Error(dados.error || 'Falha ao salvar.');
            publicar(dados.textos);
            setAlteracoes({});
            setAviso('Textos publicados.');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Falha ao publicar.');
        } finally {
            setSalvando(false);
        }
    }

    return <form onSubmit={salvar} className={`rounded-xl p-4 border space-y-4 ${classes.clsCard}`}>
        <h2 className="font-bold">{portal ? 'Textos da interface do Portal do Aluno' : 'Textos da interface administrativa'}</h2>
        <p className={`text-sm ${classes.clsSubtexto}`}>Busque o texto original ou publicado. Deixe o campo vazio para restaurar o padrão.</p>
        {!pronto && <p role="status" className={classes.clsSubtexto}>Aguardando o carregamento dos textos. Se a lista não carregar, atualize a página.</p>}
        <input type="search" aria-label="Buscar textos" placeholder={portal ? "Busque um texto do portal" : "Ex.: Mapa do Dia, Agendar aula"} value={busca}
            onChange={(e) => { setBusca(e.target.value); setPagina(0); }}
            className={`w-full rounded-lg p-2 border ${classes.clsInput}`} />
        <div className="grid gap-3 lg:grid-cols-2">
            {filtrados.slice(pagina * porPagina, (pagina + 1) * porPagina).map((texto) => <label key={texto}
                className={`grid gap-2 text-xs p-2 rounded-lg border ${classes.clsSubCard}`}>
                <span>{texto}</span>
                <textarea rows={2} maxLength={2000} value={atuais[texto] ?? ''} placeholder={texto}
                    disabled={!pronto || salvando} className={`rounded-lg p-2 border ${classes.clsInput}`}
                    onChange={(e) => setAlteracoes((anterior) => ({ ...anterior, [texto]: e.target.value }))} />
            </label>)}
        </div>
        <div className="flex gap-3 flex-wrap items-center">
            <button type="button" disabled={!pagina} onClick={() => setPagina(pagina - 1)}>Anterior</button>
            <span className={classes.clsSubtexto}>{filtrados.length} resultados · Página {pagina + 1}</span>
            <button type="button" disabled={(pagina + 1) * porPagina >= filtrados.length} onClick={() => setPagina(pagina + 1)}>Próxima</button>
            <button className="ml-auto rounded-lg r4-acao font-bold px-4 py-2 disabled:opacity-50" type="submit"
                disabled={!pronto || salvando || Object.keys(alteracoes).length === 0}>{salvando ? 'Publicando…' : 'Publicar textos'}</button>
        </div>
        {aviso && <p role="status">{aviso}</p>}
        {erro && <p role="alert">{erro}</p>}
    </form>;
}
