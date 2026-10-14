// Service worker: permite abrir o app sem internet e mostrar avisos.
const CACHE = 'diario-saude-v3';
// Ao atualizar o app, aumente o número "v=" aqui e no index.html
const ARQUIVOS = ['./', 'index.html', 'style.css?v=3', 'db.js?v=3', 'medicos.js?v=3', 'relatorios.js?v=3', 'app.js?v=3', 'manifest.json', 'icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Tenta a internet primeiro (pega sempre a versão mais nova); sem internet, usa a cópia salva.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then((cs) => cs[0] ? cs[0].focus() : clients.openWindow('./')));
});
