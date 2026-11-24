'use client';

import { useEffect, useRef, useState } from 'react';
import { History, X } from 'lucide-react';
import { formatarDataBR, type AgendamentoAdmin } from './types';
import css from './DetalhesAula.module.css';

type AulaArquivada = Pick<AgendamentoAdmin, 'id' | 'nome_aluno' | 'data' | 'materia' | 'excluido_em'>;

export default function ArquivoAgendamentosR4({ escuro, onFechar, onSelecionar }: {
    escuro: boolean;
    onFechar: () => void;
    onSelecionar: (aula: AgendamentoAdmin) => void;
}) {
    const dialogo = useRef<HTMLDialogElement>(null);
    const [aulas, setAulas] = useState<AulaArquivada[]>([]);
    const [cursor, setCursor] = useState<number | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [mais, setMais] = useState(false);
    const [erro, setErro] = useState('');
    useEffect(() => {
        const elemento = dialogo.current;
        if (elemento && !elemento.open) elemento.showModal();
        return () => elemento?.close();
    }, []);
    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/admin/agendamentos?arquivo=1' + (cursor ? '&antesDe=' + cursor : ''), { signal: controller.signal })
            .then(async (res) => {
                const dados = await res.json();
                if (!res.ok) throw new Error(dados.error);
                if (controller.signal.aborted) return;
                setAulas((atual) => cursor ? [...atual, ...dados.aulas] : dados.aulas);
                setMais(dados.aulas.length === 50);
            })
            .catch((e: Error) => { if (!controller.signal.aborted) setErro(e.message); })
            .finally(() => { if (!controller.signal.aborted) setCarregando(false); });
        return () => controller.abort();
    }, [cursor]);

    function selecionar(aula: AulaArquivada) {
        onSelecionar({
            ...aula, status: 'cancelado', unidade_id: 0, unidade_nome: '', professor_id: 0, professor_nome: '',
            hora_inicio: '', horario: '', nome_responsavel: '', whatsapp_responsavel: '', colegio_aluno: '',
            serie_aluno: '', observacoes: null, sincronizado_clincare: false, criado_em_formatado: '',
        });
    }

    return <dialog ref={dialogo} className={css.dialogo} data-tema={escuro ? 'escuro' : 'claro'}
        aria-labelledby="r4-arquivo-titulo" onCancel={(e) => { e.preventDefault(); onFechar(); }}>
        <div className={css.interno}>
            <header className={css.cabecalho}>
                <span className={css.avatar}><History /></span>
                <h2 id="r4-arquivo-titulo">Aulas excluídas</h2>
                <button type="button" className={css.fechar} aria-label="Fechar arquivo" onClick={onFechar}><X /></button>
            </header>
            <div className={css.corpo}>
                {erro && <p role="alert" className={css.erro}>{erro}</p>}
                {!aulas.length && !erro && <p className={css.mudo}>{carregando ? 'Carregando…' : 'Nenhuma aula excluída.'}</p>}
                {!!aulas.length && <div className={css.lista}>
                    {aulas.map((aula) => <button type="button" className={css.linha} key={aula.id} onClick={() => selecionar(aula)}>
                        <span className={css.icone}><History /></span>
                        <span><strong>{aula.nome_aluno}</strong><small>{formatarDataBR(aula.data)} · {aula.materia}</small></span>
                    </button>)}
                </div>}
                {mais && <button type="button" className={css.secundario} disabled={carregando}
                    onClick={() => { setCarregando(true); setCursor(aulas.at(-1)?.id ?? null); }}>Carregar mais</button>}
            </div>
        </div>
    </dialog>;
}
