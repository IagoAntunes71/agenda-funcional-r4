import type { Metadata } from 'next';

export function metadadosPwaR4(app: 'equipe' | 'portal'): Metadata {
    const title = app === 'equipe' ? 'R4 Equipe' : 'R4 Portal do Aluno';
    return {
        title,
        applicationName: title,
        manifest: '/pwa/' + app + '.webmanifest',
        appleWebApp: { capable: true, title, statusBarStyle: 'default' },
        icons: { apple: [{ url: '/pwa/' + app + '-180.png', sizes: '180x180' }] },
    };
}
