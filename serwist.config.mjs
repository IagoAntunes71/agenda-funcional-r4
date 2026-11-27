import { serwist } from '@serwist/next/config';

export default serwist({
    swSrc: 'src/sw.ts',
    swDest: 'public/r4-sw.js',
    precachePrerendered: false,
    // O único arquivo no cache é a página offline pública.
    globPatterns: ['public/pwa/offline.htm'],
});
