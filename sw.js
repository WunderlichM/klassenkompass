// Service Worker: speichert die App für den Offline-Betrieb.
const VERSION = 'kk-2.3.0';
const FILES = ['./', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/store.js', 'js/engine.js', 'js/ui.js', 'js/groups.js', 'js/gruppen.js', 'js/turniere.js', 'js/hallen.js', 'js/screen.js', 'js/qr.js', 'js/sound.js', 'js/backup.js', 'js/account.js', 'js/config.js',
  'js/quiz.js', 'js/scan.js', 'js/detect.js', 'js/cards.js', 'js/images.js', 'js/cloudimages.js', 'js/theme.js', 'js/hall.js', 'js/hallgear.js', 'js/hallfloor.js', 'js/hallplan.js', 'js/animals.js', 'js/lock.js', 'js/drag.js',
  'icons/favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // Seite: erst Netz (für Updates), sonst gespeicherte Fassung
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put('index.html', copy)); return res; })
      .catch(() => caches.match('index.html', { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  })));
});
