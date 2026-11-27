// Cahaya service worker: app shell + fonts cached so the app opens offline.
const VERSION = 'cahaya-v12';
const KEEP = ['cahaya-audio', 'cahaya-adzan'];
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
const AUDIO_HOSTS = ['cdn.islamic.network', 'download.quranicaudio.com', 'everyayah.com', 'www.islamcan.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && !KEEP.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Notification tap: open or focus the app.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  }));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Quran data is stored in IndexedDB by the app; do not duplicate it in the cache.
  if (url.hostname === 'cdn.jsdelivr.net') return;

  // Downloaded murattal and adzan audio: serve from the offline cache when present.
  if (AUDIO_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open('cahaya-audio').then(c => c.match(req.url))
        .then(hit => hit || caches.open('cahaya-adzan').then(c => c.match(req.url)))
        .then(hit => hit || fetch(req))
    );
    return;
  }

  // Pages: network first, fall back to cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put('index.html', copy)); return res; })
        .catch(() => caches.match('index.html'))
    );
    return;
  }

  // Google Fonts and own files: cache first, refresh in background.
  if (url.origin === location.origin || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req).then(res => {
          if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
});
