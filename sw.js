// Service Worker: eigene Dateien „erst Netz, dann Cache“ (Updates kommen sofort an),
// Bibliotheken „erst Cache“. API-Aufrufe (Aladhan, Firestore) und Videos fasst er nicht an
// (Videos kommen als Teilantworten, die sich nicht cachen lassen; offline bleibt das Poster).
const V = 'jnnh-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest',
  'js/main.js', 'js/fx.js', 'js/clock.js', 'js/prayer-times.js', 'js/scoring.js', 'js/geo.js', 'js/sensors.js', 'js/rug.js', 'js/db.js',
  'assets/fonts/anybody-var.woff2', 'assets/fonts/kufi-arabic-var.woff2',
  'assets/fonts/anybody-outline.woff2', 'assets/fonts/poppins-200.woff2', 'assets/fonts/poppins-300.woff2', 'assets/fonts/poppins-400.woff2', 'assets/fonts/poppins-600.woff2',
  'assets/img/ink.webp', 'assets/img/paper.webp', 'assets/img/grain.webp', 'assets/img/L-J.webp', 'assets/img/L-N.webp', 'assets/img/L-H.webp',
  'assets/img/icon-192.png', 'assets/video/night.jpg', 'assets/video/mosque.jpg', 'assets/video/sunset.jpg', 'assets/video/clouds.jpg'];
const LIBS = /cdn\.jsdelivr\.net|gstatic\.com\/firebasejs/;

self.addEventListener('install', e => e.waitUntil(
  caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));

const keep = (req, res) => {
  if (res && res.status === 200 || res.type === 'opaque') { const c = res.clone(); caches.open(V).then(x => x.put(req, c)); }
  return res;
};

self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || /\.(mp4|webm)$/.test(u.pathname)) return;
  if (u.origin === location.origin) {
    e.respondWith(fetch(req).then(r => keep(req, r)).catch(() => caches.match(req)));
  } else if (LIBS.test(u.href)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => keep(req, r))));
  }
});
