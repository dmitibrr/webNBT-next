/* webNBT service worker — offline-first cache of the app shell. */
const CACHE = 'webnbt-v2';
const ASSETS = [
  './',
  './index.html',
  './style/app.css',
  './NBT.js',
  './manifest.webmanifest',
  './icon.svg',
  './src/i18n.js',
  './src/icons.js',
  './src/model.js',
  './src/codec.js',
  './src/format.js',
  './src/region.js',
  './src/mcdata.js',
  './src/treeview.js',
  './src/inspector.js',
  './src/app.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});