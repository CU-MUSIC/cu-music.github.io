const CACHE = 'chefdao-v1';

// 缓存策略：图片用 Cache First（缓存优先），其他资源用 Network First
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 只缓存图片（网易云 CDN + QQ音乐 CDN）
  const isImage = /\.(jpg|jpeg|png|webp)$/i.test(url.pathname)
    || url.hostname.includes('music.126.net')
    || url.hostname.includes('music.photo_new')
    || url.hostname.includes('y.qq.com');

  if (isImage) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(res => {
            // 只缓存成功的响应
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(() => cached); // 网络失败时回退到缓存
        })
      )
    );
    return;
  }

  // JS / HTML 用 Network First，保证内容最新
  if (/\.(js|html)$/.test(url.pathname) || url.pathname === '/chefdao/' || url.pathname.endsWith('/chefdao')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  }
});

// 清理旧版本缓存
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});
