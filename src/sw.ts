/// <reference lib="webworker" />

import { NetworkOnly, Serwist } from 'serwist';
import type { PrecacheEntry } from 'serwist';

declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: PrecacheEntry[] };

const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    clientsClaim: true,
    runtimeCaching: [{
        matcher: ({ request, url, sameOrigin }) => {
            const scope = new URL(self.registration.scope).pathname;
            return request.mode === 'navigate' && sameOrigin &&
                (url.pathname === scope || url.pathname.startsWith(scope + '/'));
        },
        handler: new NetworkOnly(),
    }],
    fallbacks: { entries: [{
        url: '/pwa/offline.htm',
        matcher: ({ request }) => request.mode === 'navigate',
    }] },
});
serwist.addEventListeners();

if (new URL(self.registration.scope).pathname === '/admin') {
    self.addEventListener('push', (event) => {
        let dados: { title?: string; body?: string; tag?: string } = {};
        try { dados = event.data?.json() ?? {}; } catch { /* mantém o aviso padrão */ }
        event.waitUntil(self.registration.showNotification(typeof dados.title === 'string' ? dados.title : 'R4 Equipe', {
            body: typeof dados.body === 'string' ? dados.body : 'Confira sua agenda.',
            tag: typeof dados.tag === 'string' ? dados.tag : 'r4-agenda',
            icon: '/pwa/equipe-192.png',
        }));
    });
    self.addEventListener('notificationclick', (event) => {
        event.notification.close();
        const destino = new URL('/admin', self.location.origin).href;
        event.waitUntil((async () => {
            const janelas = await self.clients.matchAll({ type: 'window' });
            const janela = janelas.find((item) => new URL(item.url).pathname === '/admin');
            if (janela) await janela.focus();
            else await self.clients.openWindow(destino);
        })());
    });
}
