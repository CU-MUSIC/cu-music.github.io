// 助理工作台的 service worker：收到推送后取最新一条动态弹出，点开回到工作台
const API = 'https://stats.cumusic.work';
const sha16 = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => e.waitUntil((async () => {
  let n = { title: 'CU 工作台', body: '有新动态', url: '/chefdao/review/helper/' };
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (sub) { const j = await (await fetch(API + '/hp/plast?e=' + await sha16(sub.endpoint), { cache: 'no-store' })).json(); if (j.ok && j.title) n = { title: j.title, body: j.body || '', url: j.url || n.url }; }
  } catch (err) {}
  await self.registration.showNotification(n.title, { body: n.body, icon: '/chefdao/assets/insights-192.png', badge: '/chefdao/assets/insights-32.png', data: { url: n.url }, tag: 'cu-helper' });
})()));
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil((async () => {
  const url = (e.notification.data && e.notification.data.url) || '/chefdao/review/helper/';
  const ws = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const w of ws) if (w.url.includes('/chefdao/review/helper/')) { await w.focus(); w.postMessage('refresh'); return; }
  await self.clients.openWindow(url);
})()); });
