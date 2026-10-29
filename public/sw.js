// Service worker mínimo: permite instalar o app na tela inicial.
// Não guarda cache: cada abertura busca a versão mais recente do site.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
