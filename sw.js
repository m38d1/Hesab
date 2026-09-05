const CACHE = 'hesabketab-v12';
const ASSETS = ['./', './index.html', './manifest.json', './icon.svg', './icon.png',
  'https://fonts.googleapis.com/css2?family=Lalezar&family=Vazirmatn:wght@100..900&display=swap'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
function cachePut(req, res) {
  if (res && res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // ناوبری/HTML: شبکه اول، کش به‌عنوان فالبک — تا نسخهٔ کهنه سرو نشود
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(
      fetch(req).then(res => { cachePut(req, res); return res; })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  // منابع ثابت: کش اول + به‌روزرسانی در پس‌زمینه
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => { cachePut(req, res); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
