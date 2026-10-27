// 余白 iPad版 — オフラインでも開けるように、アプリ本体をキャッシュする(Googleとの通信はキャッシュしない)
const VERSION = 'yohaku-web-2.3.3';
const SHELL = ['./', './index.html', './style.css', './web.css', './app.js', './drive-core.js', './platform-web.js',
  './pdf.min.js', './pdf.worker.min.js', './pdf-lib.min.js', './sample.pdf', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 日本語PDF用の文字データ(CDN)は、一度読んだら端末に残す
  if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/pdfjs-dist@3.11.174/')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; })));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // 画面(index.html)はネット優先で更新を取り込み、圏外ならキャッシュ
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put('./index.html', c)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); }
    return r;
  })));
});
