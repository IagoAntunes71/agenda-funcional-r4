import type { useEditorLayoutR4 } from './EditorLayoutR4';
import type { CSSProperties, ReactNode } from 'react';
import { CheckCircle2, Clock3, Flag } from 'lucide-react';
import { obterIniciais } from './types';
import css from './MetaFeedbackR4.module.css';

const marcos = [
    [0, 'Péssimo'], [25, 'Precisa melhorar'], [40, 'Melhorou um pouco'],
    [55, 'Já foi mais da metade'], [70, 'Bom'], [85, 'Muito bom'], [100, 'Excelente professor'],
] as const;

export default function MetaFeedbackR4({ professor, feitos, total, vencidos, compacto = false, itemLayout, children }: {
    professor: string; feitos: number; total: number; vencidos: number; compacto?: boolean;
    children?: ReactNode;
    itemLayout?: ReturnType<ReturnType<typeof useEditorLayoutR4>['item']>;
}) {
    const percentual = total > 0 ? Math.min(100, Math.max(0, feitos / total * 100)) : 0;
    const rotulo = marcos.reduce<string>((atual, [marca, nome]) => percentual >= marca ? nome : atual, marcos[0][1]);
    const exibicao = Math.floor(percentual);
    return <article className={css.meta} data-compacto={compacto} {...itemLayout}>
        <div className={css.cabecalho}>
            <div className={css.identidade}>
                
                <h3>{professor}</h3>
                <strong className={css.numero}>{exibicao}<small>%</small></strong>
                <span className={css.faixa}>{rotulo}</span>
            </div>
            <dl className={css.indicadores}>
                <div><dt><CheckCircle2 size={15} /> Feitos</dt><dd>{feitos} <small>de {total}</small></dd></div>
                <div><dt><Flag size={15} /> Faltam</dt><dd>{Math.max(0, total - feitos)}</dd></div>
                <div><dt><Clock3 size={15} /> Vencidos</dt><dd>{vencidos}</dd></div>
            </dl>
        </div>
        <div className={css.regua} style={{ '--percentual': `${percentual}%` } as CSSProperties}>
            <div className={css.trilha} role="progressbar" aria-label={`Feedbacks de ${professor}`}
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={exibicao} aria-valuetext={`${exibicao}% · ${rotulo}`}>
                <span className={css.preenchimento} />
                <span className={css.marcador} aria-hidden="true">{obterIniciais(professor)}</span>
                {marcos.slice(1, -1).map(([marca]) => <i key={marca} style={{ left: `${marca}%` }} aria-hidden="true" />)}
            </div>
            {!compacto && <ol className={css.marcos}>
                {marcos.map(([marca, nome]) => <li key={marca} data-atingido={percentual >= marca}
                    style={{ '--marca': `${marca}%` } as CSSProperties}><strong>{marca}%</strong><span>{nome}</span></li>)}
            </ol>}
        </div>
        {children}
    </article>;
}
