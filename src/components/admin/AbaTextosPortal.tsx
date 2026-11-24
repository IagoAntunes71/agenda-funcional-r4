'use client';

import { useEffect, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { TEXTOS_PORTAL_PADRAO, TextosPortal } from '@/lib/portal-textos-padrao';
import { TemaClasses } from './types';

export default function AbaTextosPortal({
                                            textosIniciais,
                                            onTextosAtualizadosAction,
                                            classes,
                                        }: {
    textosIniciais: TextosPortal;
    onTextosAtualizadosAction: (novos: TextosPortal) => void;
    classes: TemaClasses;
}) {
    const { clsCard, clsSubCard, clsInput, clsTitulo, clsSubtexto } = classes;

    const [textosPortal, setTextosPortal] = useState<TextosPortal>(textosIniciais);
    const [salvandoTextos, setSalvandoTextos] = useState(false);
    const [feedbackTextos, setFeedbackTextos] = useState<{
        tipo: 'sucesso' | 'erro';
        texto: string;
    } | null>(null);

    useEffect(() => {
        setTextosPortal(textosIniciais);
    }, [textosIniciais]);

    async function handleSalvarTextosPortal(e: React.FormEvent) {
        e.preventDefault();
        setSalvandoTextos(true);
        setFeedbackTextos(null);

        try {
            const res = await fetch('/api/admin/textos-portal', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ textos: textosPortal }),
            });
            const json = await res.json();
            if (!res.ok) {
                setFeedbackTextos({
                    tipo: 'erro',
                    texto: json.error || 'Não foi possível publicar os textos.',
                });
                return;
            }
            if (json.textos) {
                setTextosPortal(json.textos);
                onTextosAtualizadosAction(json.textos);
            }
            setFeedbackTextos({
                tipo: 'sucesso',
                texto:
                    json.mensagem ||
                    'Textos publicados! O portal já está exibindo as alterações.',
            });
        } finally {
            setSalvandoTextos(false);
        }
    }

    return (
        <form
            onSubmit={(e) => void handleSalvarTextosPortal(e)}
            className="max-w-4xl space-y-6"
        >
            <div className={`border rounded-2xl p-6 space-y-4 ${clsCard}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className={`text-base font-bold ${clsTitulo}`}>
                            Cabeçalho & Apresentação R4 Ensina
                        </h2>
                        <p className={`text-xs ${clsSubtexto}`}>
                            Qualquer palavra alterada aqui atualiza o site imediatamente
                            após salvar.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            setTextosPortal({ ...TEXTOS_PORTAL_PADRAO });
                            setFeedbackTextos(null);
                        }}
                        className={`px-3 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${clsSubCard} ${clsSubtexto} hover:text-[#1496A1]`}
                    >
                        <RotateCcw className="w-3.5 h-3.5" /> Restaurar Padrões
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                            Selo Superior (Badge)
                        </label>
                        <input
                            type="text"
                            value={textosPortal.badge_topo}
                            onChange={(e) =>
                                setTextosPortal((prev) => ({
                                    ...prev,
                                    badge_topo: e.target.value,
                                }))
                            }
                            className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                        />
                    </div>

                    <div>
                        <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                            Horário da Secretaria (Topo)
                        </label>
                        <input
                            type="text"
                            value={textosPortal.horario_secretaria}
                            onChange={(e) =>
                                setTextosPortal((prev) => ({
                                    ...prev,
                                    horario_secretaria: e.target.value,
                                }))
                            }
                            className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                        />
                    </div>
                </div>

                <div>
                    <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                        Título Principal do Portal
                    </label>
                    <input
                        type="text"
                        value={textosPortal.titulo_principal}
                        onChange={(e) =>
                            setTextosPortal((prev) => ({
                                ...prev,
                                titulo_principal: e.target.value,
                            }))
                        }
                        className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                    />
                </div>

                <div>
                    <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                        Descrição / Subtítulo de Boas-Vindas
                    </label>
                    <textarea
                        rows={3}
                        value={textosPortal.subtitulo_principal}
                        onChange={(e) =>
                            setTextosPortal((prev) => ({
                                ...prev,
                                subtitulo_principal: e.target.value,
                            }))
                        }
                        className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                    />
                </div>
            </div>

            <div className={`border rounded-2xl p-6 space-y-4 ${clsCard}`}>
                <h2 className={`text-base font-bold ${clsTitulo}`}>
                    Avisos de Cancelamento (Taxa 2h) & Regras de Atendimento
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={`border rounded-xl p-4 space-y-3 ${clsSubCard}`}>
                        <p className="text-xs font-bold text-[#1496A1]">
                            Bloco 1: Aulas da Próxima Semana
                        </p>
                        <div>
                            <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                Título do Aviso
                            </label>
                            <input
                                type="text"
                                value={textosPortal.aviso_proxima_semana_titulo}
                                onChange={(e) =>
                                    setTextosPortal((prev) => ({
                                        ...prev,
                                        aviso_proxima_semana_titulo: e.target.value,
                                    }))
                                }
                                className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                            />
                        </div>
                        <div>
                            <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                Texto do Aviso
                            </label>
                            <textarea
                                rows={4}
                                value={textosPortal.aviso_proxima_semana_texto}
                                onChange={(e) =>
                                    setTextosPortal((prev) => ({
                                        ...prev,
                                        aviso_proxima_semana_texto: e.target.value,
                                    }))
                                }
                                className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                            />
                        </div>
                    </div>

                    <div className={`border rounded-xl p-4 space-y-3 ${clsSubCard}`}>
                        <p className="text-xs font-bold text-rose-400">
                            Bloco 2: Política de Cancelamento (2h)
                        </p>
                        <div>
                            <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                Título do Aviso
                            </label>
                            <input
                                type="text"
                                value={textosPortal.aviso_cancelamento_titulo}
                                onChange={(e) =>
                                    setTextosPortal((prev) => ({
                                        ...prev,
                                        aviso_cancelamento_titulo: e.target.value,
                                    }))
                                }
                                className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                            />
                        </div>
                        <div>
                            <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                Texto do Aviso (Topo da Página)
                            </label>
                            <textarea
                                rows={4}
                                value={textosPortal.aviso_cancelamento_texto}
                                onChange={(e) =>
                                    setTextosPortal((prev) => ({
                                        ...prev,
                                        aviso_cancelamento_texto: e.target.value,
                                    }))
                                }
                                className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                            />
                        </div>
                    </div>
                </div>

                <div>
                    <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                        Alerta na Lista de &ldquo;Próximas Aulas&rdquo;
                    </label>
                    <textarea
                        rows={2}
                        value={textosPortal.aviso_agenda_cancelamento}
                        onChange={(e) =>
                            setTextosPortal((prev) => ({
                                ...prev,
                                aviso_agenda_cancelamento: e.target.value,
                            }))
                        }
                        className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                    />
                </div>

                <div>
                    <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                        Lembrete na Janela de Confirmação da Aula
                    </label>
                    <input
                        type="text"
                        value={textosPortal.aviso_modal_lembrete}
                        onChange={(e) =>
                            setTextosPortal((prev) => ({
                                ...prev,
                                aviso_modal_lembrete: e.target.value,
                            }))
                        }
                        className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                    />
                </div>

                <div>
                    <label className={`block text-xs mb-1 ${clsSubtexto}`}>
                        Mensagem quando o Portal Online Estiver Fechado
                    </label>
                    <textarea
                        rows={2}
                        value={textosPortal.aviso_sistema_fechado}
                        onChange={(e) =>
                            setTextosPortal((prev) => ({
                                ...prev,
                                aviso_sistema_fechado: e.target.value,
                            }))
                        }
                        className={`w-full border rounded-xl px-3.5 py-2.5 text-sm ${clsInput}`}
                    />
                </div>

                {feedbackTextos && (
                    <div
                        className={`rounded-xl border px-4 py-3 text-xs ${
                            feedbackTextos.tipo === 'sucesso'
                                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                                : 'bg-[#BE1E23]/15 border-[#BE1E23]/40 text-rose-400'
                        }`}
                    >
                        {feedbackTextos.texto}
                    </div>
                )}

                <div className="flex justify-end pt-2">
                    <button
                        type="submit"
                        disabled={salvandoTextos}
                        className="px-6 py-3 rounded-xl r4-acao disabled:opacity-50 text-sm font-bold  inline-flex items-center gap-2 shadow-md cursor-pointer"
                    >
                        <Save className="w-4 h-4" />
                        {salvandoTextos
                            ? 'Publicando...'
                            : 'Salvar e Publicar no Portal'}
                    </button>
                </div>
            </div>
        </form>
    );
}