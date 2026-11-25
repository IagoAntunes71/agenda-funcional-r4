import { notFound, redirect } from 'next/navigation';
import { lerSessaoAdmin } from '@/lib/admin-auth';
import { MODULOS_ADMIN, podeAcessarModulo } from '@/lib/admin-navegacao';
import PainelAdmin from '@/components/admin/PainelAdmin';

export const dynamic = 'force-dynamic';

export default async function PaginaModulo({ params }: { params: Promise<{ modulo: string }> }) {
    const { modulo } = await params;
    const pagina = MODULOS_ADMIN.find((item) => item === modulo);
    if (!pagina) notFound();
    const sessao = await lerSessaoAdmin();
    if (!sessao || !podeAcessarModulo(sessao.role, pagina)) redirect('/admin');
    return <PainelAdmin sessaoInicial={sessao} pagina={pagina} />;
}
