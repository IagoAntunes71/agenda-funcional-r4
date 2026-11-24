'use client';

import { useEffect, useState } from 'react';
import {
    BookOpen,
    Calendar,
    CheckCircle2,
    Clock,
    GraduationCap,
    Lock,
    MessageSquareText,
    Phone,
    Save,
    User,
    X,
} from 'lucide-react';
import { RoleSistema } from '@/lib/admin-auth';
import {
    LISTA_STATUS_AULA_R4,
    StatusAulaR4,
    formatarDuracaoLabel,
    normalizarStatusAulaR4,
    obterMetaStatusR4,
} from '@/lib/agenda-status-r4';
import { AgendamentoAdmin, TemaClasses, formatarDataBR } from './types';

export default function ModalDetalhesAulaR4({
                                                aula,
                                                onFecharAction,
                                                roleUsuario,
                                                onAtualizadoAction,
                                                classes,
                                            }: {
    aula: AgendamentoAdmin | null;
    onFecharAction: () => void;
    roleUsuario: RoleSistema;
    onAtualizadoAction: () => Promise<void>;
    classes: TemaClasses;
}) {
    const { clsCard, clsSubCard, clsInput, clsTitulo, clsSubtexto } = classes;
    const ehProfessor = roleUsuario === 'professor';

    const [statusAtual, setStatusAtual] = useState<StatusAulaR4>('confirmado');
    const [feedback, setFeedback] = useState<string>('');
    const [salvandoStatus, setSalvandoStatus] = useState<boolean>(false);
    const [salvandoFeedback, setSalvandoFeedback] = useState<boolean>(false);
    const [aviso, setAviso] = useState<string | null>(null);

    useEffect(() => {
        if (aula) {
            setStatusAtual(normalizarStatusAulaR4(aula.status));
            setFeedback(aula.feedback_professor || '');
            setAviso(null);
        }
    }, [aula]);

    if (!aula) return null;

    const metaStatus = obterMetaStatusR4(statusAtual);

    async function alterarStatus(novoStatus: StatusAulaR4) {
        if (!aula) return;
        if (ehProfessor && novoStatus !== 'realizado') return;

        setSalvandoStatus(true);
        setAviso(null);
        try {
            const res = await fetch('/api/admin/agendamentos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: aula.id, status: novoStatus }),
            });
            if (res.ok) {
                setStatusAtual(novoStatus);
                setAviso('Status atualizado com sucesso!');
                await onAtualizadoAction();
            }
        } finally {
            setSalvandoStatus(false);
        }
    }

    async function salvarFeedback(e: React.FormEvent) {
        e.preventDefault();
        if (!aula) return;
        setSalvandoFeedback(true);
        setAviso(null);
        try {
            const res = await fetch('/api/admin/agendamentos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: aula.id,
                    feedback_professor: feedback,
                }),
            });
            if (res.ok) {
                setAviso('Feedback da aula salvo com sucesso!');
                await onAtualizadoAction();
            }
        } finally {
            setSalvandoFeedback(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
            <div
                className={`border rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto ${clsCard}`}
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#1496A1]">
                            {aula.unidade_nome} • {aula.materia}
                        </span>
                        <h2 className={`text-lg font-bold leading-snug ${clsTitulo}`}>
                            {aula.nome_aluno}
                            {aula.serie_aluno ? ` — ${aula.serie_aluno}` : ''}
                        </h2>
                        {aula.colegio_aluno && (
                            <p className={`text-xs ${clsSubtexto}`}>{aula.colegio_aluno}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onFecharAction}
                        className={`p-1.5 rounded-lg cursor-pointer ${clsSubtexto}`}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className={`border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs ${clsSubCard}`}>
                    <div className="flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-[#1496A1] shrink-0" />
                        <div>
                            <p className={clsSubtexto}>Professor(a)</p>
                            <p className={`font-bold ${clsTitulo}`}>{aula.professor_nome}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-[#1496A1] shrink-0" />
                        <div>
                            <p className={clsSubtexto}>Data e Horário</p>
                            <p className={`font-bold ${clsTitulo}`}>
                                {formatarDataBR(aula.data)} • {aula.horario}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-[#1496A1] shrink-0" />
                        <div>
                            <p className={clsSubtexto}>Duração</p>
                            <p className={`font-bold ${clsTitulo}`}>
                                {formatarDuracaoLabel(aula.duracao_minutos || 100)}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-[#1496A1] shrink-0" />
                        <div>
                            <p className={clsSubtexto}>Responsável</p>
                            <p className={`font-bold ${clsTitulo}`}>
                                {aula.nome_responsavel || 'Não informado'}
                            </p>
                        </div>
                    </div>

                    {aula.whatsapp_responsavel && (
                        <div className="sm:col-span-2 flex items-center gap-2">
                            <Phone className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span className={clsSubtexto}>WhatsApp:</span>
                            <span className={`font-semibold ${clsTitulo}`}>
                                {aula.whatsapp_responsavel}
                            </span>
                        </div>
                    )}
                </div>

                <div className={`border rounded-xl p-3.5 space-y-1 ${clsSubCard}`}>
                    <p className="text-xs font-bold text-[#1496A1] flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5" /> Assuntos / Conteúdo Solicitado
                    </p>
                    <p className={`text-xs leading-relaxed ${clsTitulo}`}>
                        {aula.observacoes || 'Nenhum assunto específico informado.'}
                    </p>
                </div>

                <div className={`border rounded-xl p-3.5 space-y-2.5 ${clsSubCard}`}>
                    <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold ${clsTitulo}`}>Status da Aula</span>
                        <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border inline-flex items-center gap-1.5 ${metaStatus.clsBadge}`}
                        >
                            <span className={`w-2 h-2 rounded-full ${metaStatus.corPonto}`} />
                            {metaStatus.rotulo}
                        </span>
                    </div>

                    {ehProfessor ? (
                        <div className="space-y-2">
                            {statusAtual !== 'realizado' ? (
                                <button
                                    type="button"
                                    disabled={salvandoStatus}
                                    onClick={() => void alterarStatus('realizado')}
                                    className="w-full py-2.5 px-4 rounded-xl bg-lime-600 hover:bg-lime-500 text-white text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition"
                                >
                                    <CheckCircle2 className="w-4 h-4" />
                                    {salvandoStatus
                                        ? 'Atualizando...'
                                        : 'Marcar Aula como REALIZADA'}
                                </button>
                            ) : (
                                <p className="text-xs text-lime-500 font-semibold flex items-center gap-1.5">
                                    <CheckCircle2 className="w-4 h-4" /> Aula concluída e marcada como
                                    Realizada.
                                </p>
                            )}
                            <p className={`text-[11px] flex items-center gap-1 ${clsSubtexto}`}>
                                <Lock className="w-3 h-3" /> Demais alterações de status são
                                exclusivas da equipe de atendimento.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {LISTA_STATUS_AULA_R4.map((st) => {
                                const selecionado = statusAtual === st.valor;
                                return (
                                    <button
                                        key={st.valor}
                                        type="button"
                                        disabled={salvandoStatus}
                                        onClick={() => void alterarStatus(st.valor)}
                                        className={`px-2.5 py-2 rounded-xl border text-[11px] font-semibold text-left flex items-center gap-2 transition cursor-pointer ${
                                            selecionado
                                                ? st.clsBadge
                                                : `${clsCard} ${clsSubtexto} hover:border-[#0E7C86]/60`
                                        }`}
                                    >
                                        <span
                                            className={`w-2 h-2 rounded-full shrink-0 ${st.corPonto}`}
                                        />
                                        <span className="truncate">{st.rotulo}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <form onSubmit={(e) => void salvarFeedback(e)} className="space-y-2">
                    <label className="text-xs font-bold text-[#1496A1] flex items-center gap-1.5">
                        <MessageSquareText className="w-3.5 h-3.5" /> Feedback da Aula (Professor)
                    </label>
                    <textarea
                        rows={3}
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="Descreva os conteúdos trabalhados, desempenho do aluno e recomendações..."
                        className={`w-full border rounded-xl p-3 text-xs focus:outline-none ${clsInput}`}
                    />
                    <div className="flex items-center justify-between gap-2">
                        <span className={`text-[10px] ${clsSubtexto}`}>
                            {aula.criado_por_nome
                                ? `Marcado por: ${aula.criado_por_nome}`
                                : 'Marcado via Portal do Aluno'}
                        </span>
                        <button
                            type="submit"
                            disabled={salvandoFeedback}
                            className="px-4 py-2 rounded-xl bg-[#0E7C86] hover:bg-[#118E99] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                            <Save className="w-3.5 h-3.5" />
                            {salvandoFeedback ? 'Salvando...' : 'Salvar Feedback'}
                        </button>
                    </div>
                </form>

                {aviso && (
                    <p className="text-xs text-emerald-400 bg-emerald-500/15 border border-emerald-500/35 rounded-xl px-3.5 py-2">
                        {aviso}
                    </p>
                )}
            </div>
        </div>
    );
}