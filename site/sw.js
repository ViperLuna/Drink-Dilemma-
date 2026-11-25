// Network-first so updates always arrive; cache is the offline fallback.
const CACHE = 'drink-dilemma-v6';
const ASSETS = ['./', 'index.html', 'style.css', 'game.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'sounds/rainbow-1.mp3', 'sounds/rainbow-2.mp3', 'sounds/rainbow-3.mp3', 'sounds/plop-1.mp3', 'sounds/plop-2.mp3', 'sounds/plop-3.mp3', 'sounds/tap-1.mp3', 'sounds/tap-2.mp3', 'sounds/tap-3.mp3', 'sounds/break-1.mp3', 'sounds/break-2.mp3', 'sounds/break-3.mp3', 'sounds/mop-1.mp3'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
