// Insights 的 service worker：只做一件事——收到推送后取最新通知内容并弹出（点开跳到对应页面）
const API = 'https://stats.cumusic.work';
const sha16 = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => e.waitUntil((async () => {
  let n = { title: 'CU MUSIC', body: '有新动态', url: '/chefdao/review/insights/' };
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (sub) { const j = await (await fetch(API + '/push/last?e=' + await sha16(sub.endpoint), { cache: 'no-store' })).json(); if (j.ok && j.title) n = { title: j.title, body: j.body || '', url: j.url || n.url }; }
  } catch (err) {}
  await self.registration.showNotification(n.title, { body: n.body, icon: '/chefdao/assets/cu-180.png', badge: '/chefdao/assets/cu-32.png', data: { url: n.url }, tag: 'cu-' + Date.now() });
})()));
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.openWindow(e.notification.data && e.notification.data.url || '/chefdao/review/insights/')); });
