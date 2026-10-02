// Service Worker: eigene Dateien „erst Netz, dann Cache“ (Updates kommen sofort an),
// Bibliotheken und Schriften „erst Cache“. API-Aufrufe (Aladhan, Firestore) fasst er nicht an.
const V = 'waqt-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest',
  'js/main.js', 'js/fx.js', 'js/clock.js', 'js/prayer-times.js', 'js/scoring.js',
  'js/geo.js', 'js/sensors.js', 'js/rug.js', 'js/db.js'];
const LIBS = /cdn\.jsdelivr\.net|gstatic\.com\/firebasejs|fonts\.(googleapis|gstatic)\.com/;

self.addEventListener('install', e => e.waitUntil(
  caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));

const keep = (req, res) => {
  if (res && (res.ok || res.type === 'opaque')) { const c = res.clone(); caches.open(V).then(x => x.put(req, c)); }
  return res;
};

self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET') return;
  if (u.origin === location.origin) {
    e.respondWith(fetch(req).then(r => keep(req, r)).catch(() => caches.match(req)));
  } else if (LIBS.test(u.href)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => keep(req, r))));
  }
});
