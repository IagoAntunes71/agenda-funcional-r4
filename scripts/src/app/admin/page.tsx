import { lerSessaoAdmin } from '@/lib/admin-auth';
import PainelAdmin from '@/components/admin/PainelAdmin';

export const dynamic = 'force-dynamic';

export default async function PaginaAdmin() {
    const sessao = await lerSessaoAdmin();
    return <PainelAdmin sessaoInicial={sessao} pagina="inicio" />;
}
