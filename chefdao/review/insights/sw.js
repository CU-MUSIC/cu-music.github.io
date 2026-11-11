// Insights 的 service worker：只做一件事——收到推送后取最新通知内容并弹出（点开跳到对应页面）
const API = 'https://stats.cumusic.work';
const sha16 = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
self.addEventListener('install', () => self.skipWaiting());
// 打开就用上次存的页面（不黑屏、不等网络），后台悄悄取新版存起来；带 ?r= 的「刷新」和 no-store 的版本检查才直接上网
// 项目封面（stats.cumusic.work/cv/，文件名不会变）第一次看到就存，之后都从本机读
const PAGE = 'ins-page-v3', CV = 'ins-cv-v1';
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  if (u.origin === API && u.pathname.startsWith('/cv/')) {
    e.respondWith((async () => { const c = await caches.open(CV), hit = await c.match(r.url); if (hit) return hit;
      const res = await fetch(r); if (res.ok || res.type === 'opaque') c.put(r.url, res.clone()); return res; })());
    return;
  }
  if (u.origin !== location.origin) return;
  const key = u.origin + u.pathname;   // 不管 ?v= 后缀，每个文件只存一份
  const net = async c => { const res = await fetch(r); if (res.ok) await c.put(key, res.clone()); return res; };
  if (r.cache === 'no-store' || u.searchParams.has('r')) {
    e.respondWith((async () => { const c = await caches.open(PAGE); try { return await net(c); } catch (err) { const hit = await c.match(key); if (hit) return hit; throw err; } })());
    return;
  }
  e.respondWith((async () => {
    const c = await caches.open(PAGE), hit = await c.match(key), up = net(c);
    if (hit) { e.waitUntil(up.catch(() => {})); return hit; }
    return up;
  })());
});
self.addEventListener('activate', e => e.waitUntil(Promise.all(['ins-page-v1', 'ins-page-v2'].map(k => caches.delete(k))).then(() => self.clients.claim())));
self.addEventListener('push', e => e.waitUntil((async () => {
  let n = { title: 'CU MUSIC', body: '有新动态', url: '/chefdao/review/insights/' };
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (sub) { const j = await (await fetch(API + '/push/last?e=' + await sha16(sub.endpoint), { cache: 'no-store' })).json(); if (j.ok && j.title) n = { title: j.title, body: j.body || '', url: j.url || n.url, silent: !!j.silent }; }
  } catch (err) {}
  await self.registration.showNotification(n.title, { body: n.body, icon: '/chefdao/assets/insights-192.png', badge: '/chefdao/assets/insights-32.png', data: { url: n.url }, silent: n.silent, tag: 'cu-' + Date.now() });
})()));
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.openWindow(e.notification.data && e.notification.data.url || '/chefdao/review/insights/')); });
