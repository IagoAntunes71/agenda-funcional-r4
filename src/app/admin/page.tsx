'use client';

import { useEffect, useState } from 'react';
import PainelAdmin from '@/components/admin/PainelAdmin';
import ImportadorProfessoresClinCare from '@/components/admin/ImportadorProfessoresClinCare';
import AdminColegios from '@/components/AdminColegios';
import AdminWhatsApp from '@/components/AdminWhatsApp';

export default function AdminPage() {
    const [verificandoSessao, setVerificandoSessao] = useState(true);
    const [autenticado, setAutenticado] = useState(false);

    useEffect(() => {
        let cancelado = false;

        const checarSessao = async () => {
            try {
                const res = await fetch('/api/admin/colegios', {
                    cache: 'no-store',
                });
                if (!cancelado) {
                    setAutenticado(res.ok);
                }
            } catch {
                if (!cancelado) {
                    setAutenticado(false);
                }
            } finally {
                if (!cancelado) {
                    setVerificandoSessao(false);
                }
            }
        };

        void checarSessao();

        const intervalo = window.setInterval(() => {
            if (!autenticado) {
                void checarSessao();
            }
        }, 2500);

        return () => {
            cancelado = true;
            window.clearInterval(intervalo);
        };
    }, [autenticado]);

    return (
        <main className="min-h-dvh bg-slate-950 text-slate-100 py-6 sm:py-10 px-4">
            <div className="max-w-6xl mx-auto space-y-6">
                <header className="border-b border-slate-800/80 pb-5">
                    <p className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
                        Gestão do Sistema
                    </p>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                        Painel Administrativo
                    </h1>
                </header>

                {verificandoSessao ? (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-400">
                        Verificando sessão administrativa...
                    </div>
                ) : (
                    <div className="space-y-6">
                        <PainelAdmin autenticadoInicial={autenticado} />
                        {autenticado && (
                            <>
                                <AdminWhatsApp />
                                <AdminColegios />
                                <ImportadorProfessoresClinCare />
                            </>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}