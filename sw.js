/* ============================================================
   sw.js — Service Worker
   ------------------------------------------------------------
   Estrategia: stale-while-revalidate. La app abre al instante
   desde la caché y se actualiza por detrás; en el siguiente
   arranque ya está la versión nueva.

   Al publicar cambios, sube el número de CACHE para forzar
   la limpieza de la caché antigua.
   ============================================================ */

const CACHE = 'midieta-v3';

const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './data.js',
  './app.js',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
];

/* `cache: 'reload'` salta la caché HTTP del navegador: GitHub Pages sirve
   los archivos con 10 minutos de vida, y sin esto una versión nueva podía
   guardarse ya caducada y tardar en aparecer. */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ARCHIVOS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  e.respondWith(
    caches.match(req).then(cacheada => {
      const red = fetch(new Request(req.url, { cache: 'no-cache' })).then(resp => {
        if (resp && resp.status === 200) {
          const copia = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copia));
        }
        return resp;
      }).catch(() => cacheada);

      return cacheada || red;
    })
  );
});
