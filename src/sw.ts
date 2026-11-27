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
