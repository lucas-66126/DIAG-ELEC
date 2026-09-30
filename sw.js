/* DIAG-MAINT — service worker : réseau d'abord, cache en secours (fonctionnement hors-ligne). */
const CACHE = 'diagmaint-v1.0.0';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/styles.css',
  './js/utils.js', './js/icons.js', './js/safety.js', './js/knowledge.js', './js/model.js', './js/report.js',
  './js/store.js', './js/photos.js', './js/ui.js', './js/app.js',
  './js/views/home.js', './js/views/form.js', './js/views/diag.js', './js/views/report.js', './js/views/history.js', './js/views/settings.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
