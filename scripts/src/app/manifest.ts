import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Agenda de Reforço Escolar',
        short_name: 'Agenda Reforço',
        description: 'Agendamento automático de aulas de reforço para fins de semana e feriados.',
        start_url: '/',
        display: 'standalone',
        background_color: '#020617',
        theme_color: '#020617',
        lang: 'pt-BR',
        icons: [
            {
                src: '/favicon.ico',
                sizes: 'any',
                type: 'image/x-icon',
            },
        ],
    };
}
