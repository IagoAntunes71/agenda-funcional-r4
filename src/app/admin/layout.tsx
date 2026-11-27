import type { ReactNode } from 'react';
import InstalacaoPwaR4 from '@/components/pwa/InstalacaoPwaR4';
import { metadadosPwaR4 } from '@/lib/pwa-r4';

export const metadata = metadadosPwaR4('equipe');

export default function AdminLayout({ children }: { children: ReactNode }) {
    return <>{children}<InstalacaoPwaR4 app="equipe" /></>;
}
