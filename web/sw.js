// Service Worker: App-Shell offline verfügbar machen. KI-Anfragen gehen immer ins Netz.
const VERSION = 'fi-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/ui.js', './js/db.js', './js/model.js', './js/ai.js', './js/images.js', './js/native.js', './js/exporter.js',
  './js/views/dashboard.js', './js/views/bikes.js', './js/views/bikeForm.js', './js/views/bikeDetail.js',
  './js/views/parts.js', './js/views/partForm.js', './js/views/settings.js', './js/views/print.js',
  './vendor/anthropic.mjs', './vendor/qrcode.mjs',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Netzwerk zuerst (damit Updates sofort ankommen), Cache als Fallback offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
