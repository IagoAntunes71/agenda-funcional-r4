'use client';
import { useLayoutR4 } from './EditorLayoutR4';
import { useTextoR4 } from '@/components/TextosInterfaceR4';


import { useState } from 'react';
import { Building2 } from 'lucide-react';
import MatrizProfessoresUnidades from './MatrizProfessoresUnidades';
import { TemaClasses, UnidadeAdmin } from './types';

export default function AbaUnidades({
                                        unidades,
                                        classes,
                                        onRecarregarDadosAction,
                                    }: {
    unidades: UnidadeAdmin[];
    classes: TemaClasses;
    onRecarregarDadosAction: () => Promise<void>;
}) {
    const layout = useLayoutR4();
    const textoR4 = useTextoR4();
    const { clsCard, clsSubCard, clsTitulo } = classes;

    const [salvandoId, setSalvandoId] = useState<number | null>(null);

    async function salvarUnidade(u: UnidadeAdmin) {
        setSalvandoId(u.id);
        try {
            await fetch('/api/admin/unidades', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: u.id,
                    ativa: u.ativa === false,
                }),
            });
            await onRecarregarDadosAction();
        } finally {
            setSalvandoId(null);
        }
    }

    return (
        <div className="space-y-6">
            <section {...layout?.item("unidades_vinculo", "unidades", "Unidades")} className={`border rounded-2xl p-6 space-y-4 max-w-4xl ${clsCard}`}>
                <h3
                    className={`text-sm font-bold flex items-center gap-2 ${clsTitulo}`}
                >
                    <Building2 className="w-4 h-4 text-[#1496A1]" />{textoR4("Unidades de atendimento")}</h3>

                <div className="space-y-3">
                    {unidades.map((u) => (
                        <div
                            key={u.id}
                            className={`flex flex-wrap items-center justify-between gap-3 border rounded-xl p-4 ${clsSubCard}`}
                        >
                            <div>
                                <p className={`font-bold text-sm ${clsTitulo}`}>{u.nome}</p>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={salvandoId === u.id}
                                    onClick={() => void salvarUnidade(u)}
                                    className="px-3.5 py-2 rounded-xl r4-acao text-xs font-semibold  inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                    {salvandoId === u.id ? textoR4("Salvando...") : u.ativa === false ? "Ativar" : "Pausar"}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <MatrizProfessoresUnidades
                classes={classes}
                onAlteradoAction={onRecarregarDadosAction}
            />
        </div>
    );
}