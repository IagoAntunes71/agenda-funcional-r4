'use client';

import { useEffect, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatarDataBR, obterIniciais } from './types';
import { TextoLayoutR4 } from './ConteudoLayoutR4';
import type { useEditorLayoutR4 } from './EditorLayoutR4';
import css from './MetaFeedbackDashboardR4.module.css';

type Aula = { id: number; data: string; aluno: string; materia: string; feedback: string | null; vencido: boolean };
type Props = {
    chave: string; mes: string; professor: string; feitos: number; total: number; vencidos: number;
    itemLayout?: ReturnType<ReturnType<typeof useEditorLayoutR4>['item']>;
};

export default function MetaFeedbackDashboardR4({ chave, mes, professor, feitos, total, vencidos, itemLayout }: Props) {
    const id = useId();
    const layoutId = 'meta_' + encodeURIComponent(chave);
    const [aberto, setAberto] = useState(false);
    const [filtro, setFiltro] = useState<'faltantes' | 'feitos'>('faltantes');
    const [revisao, setRevisao] = useState(0);
    const [resultado, setResultado] = useState<{ consulta: string; aulas?: Aula[]; erro?: string }>();
    const consulta = mes + '/' + chave + '/' + revisao;
    const dados = resultado?.consulta === consulta ? resultado : undefined;
    const faltam = Math.max(0, total - feitos);
    const percentual = total ? Math.min(100, Math.floor(feitos * 100 / total)) : 0;
    const status = percentual >= 100 ? 'Meta concluída' : vencidos > 0 ? 'Com atrasos' : 'Em andamento';

    useEffect(() => {
        if (!aberto || dados) return;
        const pedido = new AbortController();
        const query = new URLSearchParams({ painel: 'metas', mes, chaveMeta: chave });
        fetch('/api/admin/operacao?' + query, { cache: 'no-store', signal: pedido.signal }).then(async (res) => {
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Não foi possível carregar os feedbacks.');
            if (!pedido.signal.aborted) setResultado({ consulta, aulas: json.aulas });
        }).catch((erro: Error) => {
            if (!pedido.signal.aborted) setResultado({ consulta, erro: erro.message });
        });
        return () => pedido.abort();
    }, [aberto, dados, chave, mes, consulta]);

    const aulas = dados?.aulas?.filter((aula) => Boolean(aula.feedback) === (filtro === 'feitos'));
    return <article className={css.card} {...itemLayout}>
        <header className={css.identidade}>
            <span aria-hidden="true">{obterIniciais(professor)}</span>
            <h3><TextoLayoutR4 id={layoutId} campo="titulo" texto={professor} /></h3>
            <small data-status={percentual === 100 ? 'completa' : vencidos > 0 ? 'atraso' : 'andamento'}>{status}</small>
        </header>
        <div className={css.progresso}>
            <span><TextoLayoutR4 id={layoutId} campo="rotulo" texto="Progresso do mês" /></span><strong>{percentual}%</strong>
            <progress aria-label={'Progresso de ' + professor} max={100} value={percentual}
                data-faixa={percentual >= 85 ? 'alta' : percentual >= 50 ? 'media' : 'baixa'} />
        </div>
        <dl className={css.numeros}>
            <div><dt><TextoLayoutR4 id={layoutId} campo="feitos" texto="Feitos" /></dt><dd>{feitos}</dd></div>
            <div><dt><TextoLayoutR4 id={layoutId} campo="faltantes" texto="Faltantes" /></dt><dd>{faltam}</dd></div>
            <div><dt><TextoLayoutR4 id={layoutId} campo="vencidos" texto="Vencidos" /></dt><dd>{vencidos}</dd></div>
        </dl>
        {itemLayout?.['data-r4-layout-editando']
            ? <div className={css.abrir}><TextoLayoutR4 id={layoutId} campo="descricao" texto="Ver feedbacks" /></div>
            : <button type="button" className={css.abrir} aria-expanded={aberto} aria-controls={aberto ? id : undefined}
                onClick={() => setAberto(!aberto)}><TextoLayoutR4 id={layoutId} campo="descricao" texto="Ver feedbacks" /> <ChevronDown size={14} /></button>}
        {aberto && <div id={id} className={css.detalhes}>
            <div className={css.filtros} role="group" aria-label="Filtrar feedbacks">
                <button type="button" aria-pressed={filtro === 'faltantes'} onClick={() => setFiltro('faltantes')}>Faltantes ({faltam})</button>
                <button type="button" aria-pressed={filtro === 'feitos'} onClick={() => setFiltro('feitos')}>Feitos ({feitos})</button>
            </div>
            {!dados && <p role="status">Carregando feedbacks…</p>}
            {dados?.erro && <p role="alert">{dados.erro} <button type="button" onClick={() => setRevisao(revisao + 1)}>Tentar de novo</button></p>}
            {aulas?.length === 0 && <p>Nenhum feedback nesta lista.</p>}
            {!!aulas?.length && <ul>{aulas.map((aula) => <li key={aula.id}>
                <strong>{aula.aluno}</strong><small>{formatarDataBR(aula.data)} · {aula.materia}</small>
                {aula.feedback ? <p>{aula.feedback}</p> : <small>{aula.vencido ? 'Vencido' : 'No prazo'}</small>}
            </li>)}</ul>}
        </div>}
    </article>;
}
