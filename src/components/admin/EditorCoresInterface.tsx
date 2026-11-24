'use client';

import { useState, type FormEvent } from 'react';
import { useCoresR4 } from '@/components/CoresInterfaceR4';
import { CAMPOS_CORES, PALETA_R4, problemasContraste, textoNoBotao, type CoresR4, type PaletaR4, type TemaR4 } from '@/lib/cores-r4';
import type { TemaClasses } from './types';

export default function EditorCoresInterface({ classes }: { classes: TemaClasses }) {
    const { paleta, pronto, publicar } = useCoresR4();
    const [rascunho, setRascunho] = useState<PaletaR4 | null>(null);
    const [tema, setTema] = useState<TemaR4>('claro');
    const [salvando, setSalvando] = useState(false);
    const [aviso, setAviso] = useState('');
    const [erro, setErro] = useState('');
    const cores = rascunho || paleta;
    const problemas = (['claro', 'escuro'] as const).flatMap((modo) =>
        problemasContraste(cores[modo]).map((problema) => `Tema ${modo} · ${problema}`));

    async function salvar(e: FormEvent) {
        e.preventDefault();
        setSalvando(true);
        setErro('');
        setAviso('');
        try {
            const res = await fetch('/api/cores-interface', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paleta: cores }),
            });
            const dados = await res.json();
            if (!res.ok) throw new Error(dados.error || 'Não foi possível publicar.');
            publicar(dados.paleta);
            setRascunho(null);
            setAviso('Cores publicadas para toda a equipe.');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível publicar.');
        } finally {
            setSalvando(false);
        }
    }

    return <form onSubmit={salvar} className={`rounded-xl border p-4 space-y-4 ${classes.clsCard}`}>
        <h2 className="font-bold">Cores do Sistema</h2>
        <div className="flex gap-2">
            {(['claro', 'escuro'] as const).map((modo) => <button key={modo} type="button"
                aria-pressed={modo === tema} onClick={() => setTema(modo)}
                className={`rounded-lg border px-3 py-2 text-sm aria-pressed:font-bold ${classes.clsSubCard}`}>
                {modo === 'claro' ? 'Tema claro' : 'Tema escuro'}
            </button>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(CAMPOS_CORES).map(([chave, label]) => {
                const campo = chave as keyof CoresR4;
                return <label key={campo} className={`flex justify-between items-center gap-2 rounded-lg border p-2 text-sm ${classes.clsSubCard}`}>
                    <span>{label}</span>
                    <span className="flex items-center gap-2 text-xs">
                        {cores[tema][campo]}
                        <input type="color" value={cores[tema][campo]} disabled={!pronto || salvando}
                            aria-label={`${label}, tema ${tema}`}
                            onChange={(e) => setRascunho({ ...cores, [tema]: { ...cores[tema], [campo]: e.target.value } })} />
                    </span>
                </label>;
            })}
        </div>
        <div className="grid gap-3 sm:grid-cols-2" aria-label="Prévia das cores">
            {(['claro', 'escuro'] as const).map((modo) => {
                const p = cores[modo];
                return <div key={modo} className="rounded-xl border p-3" style={{ color: p.texto, background: p.fundo, borderColor: p.destaque }}>
                    <strong className="text-sm">{modo === 'claro' ? 'Prévia clara' : 'Prévia escura'}</strong>
                    <div className="mt-2 space-y-2 rounded-lg p-3" style={{ background: p.painel, borderLeft: `3px solid ${p.destaque}` }}>
                        <div className="font-bold" style={{ color: p.principal }}>Mapa do Dia</div>
                        <div className="flex flex-wrap gap-3 text-xs font-semibold">
                            <span style={{ color: p.confirmado }}>● Confirmado</span>
                            <span style={{ color: p.cancelado }}>● Cancelado</span>
                            <span style={{ color: p.bloqueio }}>● Bloqueio</span>
                        </div>
                        <span className="inline-block rounded-lg px-3 py-1.5 text-sm font-bold"
                            style={{ background: p.botao, color: textoNoBotao(p.botao) }}>Agendar aula</span>
                    </div>
                </div>;
            })}
        </div>
        {problemas.length > 0 && <p role="status" className="text-sm font-semibold">Contraste insuficiente: {problemas.join(' / ')}.</p>}
        {!pronto && <p className="text-sm">Aguardando a paleta publicada. Se necessário, recarregue a página.</p>}
        <div className="flex flex-wrap gap-3">
            <button type="button" className={`rounded-lg border px-3 py-2 text-sm ${classes.clsSubCard}`} disabled={!pronto || salvando}
                onClick={() => { setRascunho(PALETA_R4); setAviso('Padrão R4 carregado na prévia. Publique para aplicar.'); }}>Restaurar padrão R4</button>
            <button type="submit" disabled={!pronto || !rascunho || salvando || problemas.length > 0}
                className="r4-acao rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-50">{salvando ? 'Publicando…' : 'Publicar cores'}</button>
        </div>
        {aviso && <p role="status" className="text-sm">{aviso}</p>}
        {erro && <p role="alert" className="text-sm">{erro}</p>}
    </form>;
}
