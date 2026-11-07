// Офлайн-кэш приложения. При каждом обновлении файлов увеличивайте номер версии,
// тогда телефон скачает новую версию. Данные (localStorage) это не затрагивает.
const CACHE = 'pitanie-v1';
const FILES = [
  './', './index.html', './style.css', './data.js', './logic.js', './app.js',
  './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
