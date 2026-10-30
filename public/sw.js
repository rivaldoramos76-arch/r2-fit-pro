// Service worker mínimo: permite instalar o app na tela inicial e receber lembretes.
// Não guarda cache: cada abertura busca a versão mais recente do site.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})

// Lembrete enviado pelo servidor (Web Push): { titulo, corpo, url, tag }
self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { corpo: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.titulo || 'R2 Fit Pro', {
    body: d.corpo || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: d.tag || 'r2-lembrete',
    renotify: true,
    data: { url: d.url || '/dashboard' },
  }))
})

// Toque na notificação: abre o app (ou foca a janela aberta) na página do lembrete
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const destino = new URL((e.notification.data && e.notification.data.url) || '/dashboard', self.location.origin).href
  e.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const j of janelas) {
      if (new URL(j.url).origin === self.location.origin) {
        await j.focus()
        if ('navigate' in j) await j.navigate(destino).catch(() => {})
        return
      }
    }
    await self.clients.openWindow(destino)
  })())
})
