/* 5 Sigma Class Hub · offline support for the installed app (GitHub Pages, Netlify, Vercel).
   The page itself is fetched from the network first, so a new deploy shows up at once;
   versioned files (app.js?v=…, app.css?v=…, fonts, icons) come from the cache. */
const VERSION = '939121d05b';
const CACHE = 'langit5s-' + VERSION;
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './app.css?v=' + VERSION, './app.js?v=' + VERSION,
  './assets/fonts/adventor-400.woff', './assets/fonts/adventor-700.woff',
  './assets/fonts/inter-400.woff', './assets/fonts/inter-500.woff', './assets/fonts/inter-600.woff', './assets/fonts/inter-700.woff',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('langit5s-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put('./index.html', copy));
      return res;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
