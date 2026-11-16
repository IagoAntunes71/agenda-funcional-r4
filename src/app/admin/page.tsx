'use client';

import React, { useEffect, useState } from 'react';
import PainelAdmin from '@/components/admin/PainelAdmin';
import ImportadorProfessoresClinCare from '@/components/admin/ImportadorProfessoresClinCare';
import AdminColegios from '@/components/AdminColegios';
import AdminWhatsApp from '@/components/AdminWhatsApp';

class BlocoSeguro extends React.Component<
    { nome: string; children: React.ReactNode },
    { erro: string | null }
> {
    constructor(props: { nome: string; children: React.ReactNode }) {
        super(props);
        this.state = { erro: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { erro: error?.message || 'Erro inesperado ao renderizar bloco.' };
    }

    render() {
        if (this.state.erro) {
            return (
                <div className="bg-rose-950/60 border border-rose-500/40 rounded-2xl p-4 text-xs text-rose-200">
                    <strong>Erro no módulo {this.props.nome}:</strong> {this.state.erro}
                </div>
            );
        }
        return this.props.children;
    }
}

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

        if (autenticado) return;

        const intervalo = window.setInterval(() => {
            void checarSessao();
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
                        <BlocoSeguro nome="Painel Principal">
                            <PainelAdmin autenticadoInicial={autenticado} />
                        </BlocoSeguro>

                        {autenticado && (
                            <>
                                <BlocoSeguro nome="Notificações WhatsApp">
                                    <AdminWhatsApp />
                                </BlocoSeguro>

                                <BlocoSeguro nome="Colégios">
                                    <AdminColegios />
                                </BlocoSeguro>

                                <BlocoSeguro nome="Importador clin.care">
                                    <ImportadorProfessoresClinCare />
                                </BlocoSeguro>
                            </>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}