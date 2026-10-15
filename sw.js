// Service worker: permite abrir o app sem internet e mostrar avisos.
// Ao atualizar o app, aumente o número da versão aqui e o "v=" no index.html.
const VERSAO = 'v8';
const CACHE = 'diario-saude-' + VERSAO;
const ARQUIVOS = ['./', 'index.html', 'style.css?v=8', 'db.js?v=8', 'nucleo.js?v=8', 'familia.js?v=8',
  'medicos.js?v=8', 'relatorios.js?v=8', 'app.js?v=8', 'manifest.json', 'icon.svg'];

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
// cache: 'no-cache' obriga o navegador a confirmar com o servidor se o arquivo mudou,
// em vez de usar uma cópia antiga do cache HTTP (isso fazia a página velha aparecer após atualizações).
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((r) => { if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: e.request.mode === 'navigate' }).then((r) => r || caches.match('index.html')))
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then((cs) => cs[0] ? cs[0].focus() : clients.openWindow('./')));
});
