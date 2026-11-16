import { verificarAdminAutenticado } from '@/lib/admin-auth';
import PainelAdmin from '@/components/admin/PainelAdmin';

export const dynamic = 'force-dynamic';

export default async function PaginaAdmin() {
    const autenticado = await verificarAdminAutenticado();
    return <PainelAdmin autenticadoInicial={autenticado} />;
}