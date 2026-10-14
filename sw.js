// Service worker: permite abrir o app sem internet e mostrar avisos.
// Ao atualizar o app, aumente o número da versão aqui e o "v=" no index.html.
const VERSAO = 'v4';
const CACHE = 'diario-saude-' + VERSAO;
const ARQUIVOS = ['./', 'index.html', 'style.css?v=4', 'db.js?v=4', 'nucleo.js?v=4', 'familia.js?v=4',
  'medicos.js?v=4', 'relatorios.js?v=4', 'app.js?v=4', 'manifest.json', 'icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)));
  self.skipWaiting();
});

// Remove caches de versões anteriores
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('diario-saude-') && k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Tenta a internet primeiro (pega sempre a versão mais nova); sem internet, usa a cópia salva.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: e.request.mode === 'navigate' }).then((r) => r || caches.match('index.html')))
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then((cs) => cs[0] ? cs[0].focus() : clients.openWindow('./')));
});
