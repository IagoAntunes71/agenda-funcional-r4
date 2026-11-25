'use client';

import { useEffect, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatarDataBR } from './types';
import css from './MetaFeedbackDashboardR4.module.css';

type Aula = { id: number; data: string; aluno: string; materia: string; feedback: string | null; vencido: boolean };
export default function DetalhesFeedbackR4({ chave, mes, feitos, total }: {
    chave: string; mes: string; feitos: number; total: number;
}) {
    const id = useId();
    const [aberto, setAberto] = useState(false);
    const [filtro, setFiltro] = useState<'faltantes' | 'feitos'>('faltantes');
    const [revisao, setRevisao] = useState(0);
    const [resultado, setResultado] = useState<{ consulta: string; aulas?: Aula[]; erro?: string }>();
    const consulta = mes + '/' + chave + '/' + revisao;
    const dados = resultado?.consulta === consulta ? resultado : undefined;
    const faltam = Math.max(0, total - feitos);

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
    return <div className={css.detalhes}>
        <button type="button" className={css.abrir} aria-expanded={aberto} aria-controls={aberto ? id : undefined}
            onClick={() => setAberto(!aberto)}>Ver feedbacks <ChevronDown size={14} /></button>
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
    </div>;
}
