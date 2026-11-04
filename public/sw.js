/* Ostock service worker.
 * 16 · The app opens with no signal: the page and its code are kept on the phone.
 *      Pages always try the network first (so a new version shows at once) and fall back to the saved copy.
 * 19 · Notifications: shows pushes from the server and opens the right page when tapped.
 * Data (Supabase) is never cached here; the app keeps its own last copy. */
const SHELL = 'ostock-shell-v1';
const ASSETS = 'ostock-assets-v1';
const FONTS = 'ostock-fonts-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon-192.png', '/favicon.svg']).catch(() => undefined)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = [SHELL, ASSETS, FONTS];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Pages: network first, saved copy when offline.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) { const c = await caches.open(SHELL); c.put('/', res.clone()); }
        return res;
      } catch {
        return (await caches.match('/')) || (await caches.match(req)) || new Response('<h1>No signal</h1><p>Open Ostock once with network so it can work offline.</p>', { headers: { 'Content-Type': 'text/html' } });
      }
    })());
    return;
  }
  // The app's code and pictures (file names change with every version): saved once, used from the phone after.
  if (url.origin === self.location.origin && (url.pathname.startsWith('/assets/') || /\.(png|svg|webmanifest|ico)$/.test(url.pathname))) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) { const c = await caches.open(url.pathname.startsWith('/assets/') ? ASSETS : SHELL); c.put(req, res.clone()); }
      return res;
    })());
    return;
  }
  // Fonts: saved copy straight away, refreshed in the background.
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const c = await caches.open(FONTS);
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })());
  }
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Ostock', {
    body: d.body || '', icon: '/icon-192.png', badge: '/favicon-96.png', tag: d.tag || undefined, renotify: !!d.tag,
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) { await c.focus(); if ('navigate' in c) c.navigate(url).catch(() => undefined); return; } }
    await self.clients.openWindow(url);
  })());
});
