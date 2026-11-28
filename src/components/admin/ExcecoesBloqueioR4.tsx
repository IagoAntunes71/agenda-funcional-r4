'use client';

import { useState } from 'react';
import { formatarDataBR } from './types';

export type AulaAfetada = { id: number; aluno: string; data: string; hora: string; materia: string };

export function AulasAfetadas({ aulas }: { aulas: AulaAfetada[] }) {
    return aulas.length ? <ul className="list-disc pl-5 text-sm">{aulas.map((aula) =>
        <li key={aula.id}>{formatarDataBR(aula.data)} · {aula.hora} · {aula.aluno} · {aula.materia}</li>
    )}</ul> : <p className="text-sm">Nenhuma aula afetada.</p>;
}

type Pedido = {
    id: string; professor: string; datas: string[]; inicio: string; fim: string; motivo: string;
    descricao: string; estado: 'pendente' | 'autorizado' | 'recusado';
    decidido_nome?: string; decidido_em?: string; aulas: AulaAfetada[];
};

const acao = 'rounded-lg border px-3 py-2 text-sm font-semibold transition-all duration-150 ease-out active:scale-[0.98] hover:brightness-110 hover:shadow-md disabled:opacity-50';

export default function ExcecoesBloqueioR4({ podeDecidir, onAtualizar }: {
    podeDecidir: boolean; onAtualizar: () => Promise<void>;
}) {
    const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState('');

    async function carregar(id?: string, decisao?: 'autorizado' | 'recusado') {
        setErro('');
        setOcupado(true);
        try {
            if (id) {
                const res = await fetch('/api/admin/bloqueios', {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ acao: 'decidirExcecao', id, decisao }),
                });
                if (!res.ok) throw new Error((await res.json()).error);
                await onAtualizar();
            }
            const res = await fetch('/api/admin/bloqueios', { cache: 'no-store' });
            if (!res.ok) throw new Error('Não foi possível carregar as solicitações.');
            setPedidos((await res.json()).pedidos);
        } catch (falha) {
            setErro(falha instanceof Error ? falha.message : 'Falha de conexão.');
        } finally {
            setOcupado(false);
        }
    }

    return <details className="mt-3 rounded-xl border p-3" onToggle={(e) => {
        if (e.currentTarget.open && !ocupado) void carregar();
    }}>
        <summary className="cursor-pointer text-sm font-semibold transition-colors duration-200 ease-in-out hover:text-sky-600">Solicitações de bloqueio</summary>
        {ocupado && <p role="status">Atualizando solicitações…</p>}
        {erro && <p role="alert">{erro}</p>}
        {pedidos?.length === 0 && <p className="pt-2 text-sm">Nenhuma solicitação registrada.</p>}
        <ul className="space-y-2">{pedidos?.map((pedido) => <li key={pedido.id} className="mt-2 space-y-2 rounded-lg border p-3 text-sm">
            <strong>{pedido.professor} · {pedido.motivo}</strong>
            <p>{pedido.datas.map(formatarDataBR).join(', ')} · {pedido.inicio.slice(0, 5)}–{pedido.fim.slice(0, 5)}</p>
            {pedido.descricao && <p>{pedido.descricao}</p>}
            {pedido.estado === 'pendente' ? <>
                <p className="font-medium">Aguardando autorização · Aulas afetadas</p>
                <AulasAfetadas aulas={pedido.aulas} />
                {podeDecidir && <div className="flex flex-wrap gap-2">
                    <button type="button" className={acao} disabled={ocupado} onClick={() => void carregar(pedido.id, 'autorizado')}>Autorizar bloqueio</button>
                    <button type="button" className={acao} disabled={ocupado} onClick={() => void carregar(pedido.id, 'recusado')}>Recusar</button>
                </div>}
            </> : <p>{pedido.estado === 'autorizado' ? 'Autorizado' : 'Recusado'} por {pedido.decidido_nome}
                {pedido.decidido_em && ' · ' + new Date(pedido.decidido_em).toLocaleString('pt-BR', { timeZone: 'America/Bahia' })}</p>}
        </li>)}</ul>
    </details>;
}
