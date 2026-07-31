/* حساب‌وکتاب — آفلاین‌ساز */
const CACHE = 'hk-cache-v1';
const SHELL = ['/', '/index.html', '/manifest.json', '/icon.svg'];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Lalezar&family=Vazirmatn:wght@300;400;500;600;700;800&display=swap';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    try {
      const res = await fetch(FONT_CSS);
      const css = await res.clone().text();
      await cache.put(FONT_CSS, res);
      const urls = [...css.matchAll(/url\(['"]?(https:\/\/fonts\.gstatic\.com[^'")]+)['"]?\)/g)].map(m => m[1]);
      await Promise.all(urls.map(u => fetch(u).then(r => r.ok && cache.put(u, r)).catch(()=>{})));
    } catch(err){}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  if (url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(e.request);
      if (hit) return hit;
      try {
        const res = await fetch(e.request);
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      } catch(err) { return new Response('', {status:504}); }
    })());
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(e.request) || await cache.match('/index.html');
      fetch(e.request).then(res => { if (res.ok) cache.put(e.request, res.clone()); }).catch(()=>{});
      return hit || fetch(e.request);
    })());
  }
});