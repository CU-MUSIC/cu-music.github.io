// 私信后台的 service worker：只管推送。收到空推送 → 取这台设备最近一条通知 → 弹出；点开直接进那个会话
const API = 'https://stats.cumusic.work';
const sha16 = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => e.waitUntil((async () => {
  let n = { title: '私信', body: '有新消息', url: '/chat/admin/' };
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (sub) { const j = await (await fetch(API + '/push/last?e=' + await sha16(sub.endpoint), { cache: 'no-store' })).json(); if (j.ok && j.title) n = { title: j.title, body: j.body || '', url: j.url || n.url }; }
  } catch (err) {}
  await self.registration.showNotification(n.title, { body: n.body, icon: '/chat/admin/icon-192.png?v=3', data: { url: n.url }, tag: 'chat-' + Date.now() });
})()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/chat/admin/';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) if (c.url.includes('/chat/admin/')) { await c.focus(); c.navigate && c.navigate(url).catch(() => {}); return; }
    await self.clients.openWindow(url);
  })());
});
