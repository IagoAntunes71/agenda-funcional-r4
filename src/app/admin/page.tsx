import { Suspense } from 'react';
import { verificarAdminAutenticado } from '@/lib/admin-auth';
import PainelAdmin from '@/components/admin/PainelAdmin';
import ImportadorProfessoresClinCare from '@/components/admin/ImportadorProfessoresClinCare';
import AdminColegios from '@/components/AdminColegios';
import AdminWhatsApp from '@/components/AdminWhatsApp';

async function ConteudoAdmin() {
    const autenticado = await verificarAdminAutenticado();
    return (
        <div className="space-y-6">
            <PainelAdmin autenticadoInicial={autenticado} />
            {autenticado && <ImportadorProfessoresClinCare />}
        </div>
    );
}

export default function AdminPage() {
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

                <Suspense
                    fallback={
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-400">
                            Verificando sessão administrativa...
                        </div>
                    }
                >
                    <ConteudoAdmin />
                    <AdminColegios />
                    <AdminWhatsApp />
                </Suspense>
            </div>
        </main>
    );
}