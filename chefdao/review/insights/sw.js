// Insights 的 service worker：只做一件事——收到推送后取最新通知内容并弹出（点开跳到对应页面）
const API = 'https://stats.cumusic.work';
const sha16 = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
self.addEventListener('install', () => self.skipWaiting());
// 页面本身（同站的 html / js / css）先上网取，5 秒没回或断网就用上次存的，断网也能打开看缓存数据
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open('ins-page-v2'), key = u.origin + u.pathname;   // 不管 ?v= 后缀，每个文件只存一份
    try {
      const res = await Promise.race([fetch(r), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 5000))]);
      if (res.ok) c.put(key, res.clone());
      return res;
    } catch (err) { const hit = await c.match(key); if (hit) return hit; throw err; }
  })());
});
self.addEventListener('activate', e => e.waitUntil(caches.delete('ins-page-v1').then(() => self.clients.claim())));
self.addEventListener('push', e => e.waitUntil((async () => {
  let n = { title: 'CU MUSIC', body: '有新动态', url: '/chefdao/review/insights/' };
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (sub) { const j = await (await fetch(API + '/push/last?e=' + await sha16(sub.endpoint), { cache: 'no-store' })).json(); if (j.ok && j.title) n = { title: j.title, body: j.body || '', url: j.url || n.url, silent: !!j.silent }; }
  } catch (err) {}
  await self.registration.showNotification(n.title, { body: n.body, icon: '/chefdao/assets/insights-192.png', badge: '/chefdao/assets/insights-32.png', data: { url: n.url }, silent: n.silent, tag: 'cu-' + Date.now() });
})()));
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.openWindow(e.notification.data && e.notification.data.url || '/chefdao/review/insights/')); });
