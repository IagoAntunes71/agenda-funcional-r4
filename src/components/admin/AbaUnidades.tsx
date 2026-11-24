'use client';
import { useTextoR4 } from '@/components/TextosInterfaceR4';


import { useEffect, useState } from 'react';
import { Building2, Save } from 'lucide-react';
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
    const textoR4 = useTextoR4();
    const { clsCard, clsSubCard, clsInput, clsTitulo, clsSubtexto } = classes;

    const [edicaoUnidades, setEdicaoUnidades] = useState<Record<number, string>>({});
    const [salvandoId, setSalvandoId] = useState<number | null>(null);

    useEffect(() => {
        const mapa: Record<number, string> = {};
        for (const u of unidades) {
            mapa[u.id] = u.clin_care_id;
        }
        setEdicaoUnidades(mapa);
    }, [unidades]);

    async function salvarUnidade(u: UnidadeAdmin) {
        setSalvandoId(u.id);
        try {
            await fetch('/api/admin/unidades', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: u.id,
                    clin_care_id: edicaoUnidades[u.id] ?? u.clin_care_id,
                    ativa: u.ativa,
                }),
            });
            await onRecarregarDadosAction();
        } finally {
            setSalvandoId(null);
        }
    }

    return (
        <div className="space-y-6">
            <section className={`border rounded-2xl p-6 space-y-4 max-w-4xl ${clsCard}`}>
                <h3
                    className={`text-sm font-bold flex items-center gap-2 ${clsTitulo}`}
                >
                    <Building2 className="w-4 h-4 text-[#1496A1]" />{textoR4("Vínculo de Unidades com o Clin Care")}</h3>
                <p className={`text-xs ${clsSubtexto}`}>{textoR4("Para as unidades") + ' '}<strong>{textoR4("Online")}</strong> e <strong>{textoR4("Imbuí")}</strong>{textoR4(", mantenha") + ' '}<code>{textoR4("id-online")}</code> e <code>{textoR4("id-imbui")}</code>{' ' + textoR4("(ou informe o UUID caso elas também possuam agenda no Clin Care).")}</p>

                <div className="space-y-3">
                    {unidades.map((u) => (
                        <div
                            key={u.id}
                            className={`flex flex-wrap items-center justify-between gap-3 border rounded-xl p-4 ${clsSubCard}`}
                        >
                            <div>
                                <p className={`font-bold text-sm ${clsTitulo}`}>{u.nome}</p>
                                <p className={`text-xs ${clsSubtexto}`}>{textoR4("ID de Unidade no Clin Care")}</p>
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={edicaoUnidades[u.id] ?? u.clin_care_id}
                                    onChange={(e) =>
                                        setEdicaoUnidades((prev) => ({
                                            ...prev,
                                            [u.id]: e.target.value,
                                        }))
                                    }
                                    className={`w-48 border rounded-xl px-3 py-2 text-sm focus:outline-none ${clsInput}`}
                                />
                                <button
                                    type="button"
                                    disabled={salvandoId === u.id}
                                    onClick={() => void salvarUnidade(u)}
                                    className="px-3.5 py-2 rounded-xl bg-[#0E7C86] hover:bg-[#118E99] text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                    <Save className="w-3.5 h-3.5" />
                                    {salvandoId === u.id ? textoR4("Salvando...") : textoR4("Salvar")}
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