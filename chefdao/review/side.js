// 侧边栏：只在你自己的设备上出现（带看板钥匙）。列出所有项目和单曲，点一下切换，不用回看板找
// 宽屏（≥1520px）固定在左边，窄屏是抽屉；开关状态记在本机
(() => {
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
  const KEY = ls.get('insights:key'); if (!KEY || document.getElementById('cuSide')) return;
  const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:8787' : 'https://stats.cumusic.work';
  const W = 272, PIN = matchMedia('(min-width:1520px)');
  const STAGE = ['待付款', '准备中', '编辑中', '混音中', '待审听', '已交付', '人声制作中', '修改中', '交付结算'];
  const HOT = { 4: '#9fb7e8', 7: '#e8c98a', 8: '#e8c98a' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const here = location.pathname + location.hash;
  const isHere = url => { try { const u = new URL(url); return u.pathname + u.hash === here || (!u.hash && u.pathname === location.pathname); } catch (e) { return false; } };
  // 同一个页面只改了 # 后面的码，浏览器不会重新载入：手动刷新一次
  const go = url => { const u = new URL(url, location.href); if (u.pathname === location.pathname && u.origin === location.origin) { location.hash = u.hash; location.reload(); } else location.href = u.href; };

  const css = document.createElement('style');
  css.textContent = `
#cuSide{position:fixed;top:0;bottom:0;left:0;z-index:70;width:${W}px;display:flex;flex-direction:column;background:#141416;border-right:1px solid rgba(236,234,230,.08);
  color:#e8e6e2;font:14px/1.45 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;transform:translateX(-100%);transition:transform .22s cubic-bezier(.3,.7,.2,1);
  padding:max(14px,env(safe-area-inset-top)) 0 env(safe-area-inset-bottom) env(safe-area-inset-left);-webkit-font-smoothing:antialiased}
html.cu-side-open #cuSide{transform:none;box-shadow:0 0 40px rgba(0,0,0,.5)}
html.cu-side-pin #cuSide{box-shadow:none}
html.cu-side-pin body{margin-left:${W}px}
html.cu-side-pin .dock,html.cu-side-pin #lock,html.cu-side-pin .lock{left:${W}px}
html.cu-side-pin .plist{left:calc(50% + ${W / 2}px + 350px)}
html.cu-side-pin .ols.side{right:calc(50% - ${W / 2}px + 350px)}
#cuSideBtn{position:fixed;top:max(12px,env(safe-area-inset-top));left:max(12px,env(safe-area-inset-left));z-index:71;width:34px;height:34px;border-radius:10px;border:0;
  background:rgba(236,234,230,.08);color:#d8d6d2;display:grid;place-items:center;cursor:pointer;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);transition:left .22s}
#cuSideBtn svg{width:18px;height:18px}
html.cu-side-pin #cuSideBtn{left:${W + 12}px}
@media(max-width:760px){#cuSideBtn{left:auto;right:max(12px,env(safe-area-inset-right))}}   /* 手机上左上角是封面，按钮放右上角 */
#cuSideMask{position:fixed;inset:0;z-index:69;background:rgba(0,0,0,.45);opacity:0;pointer-events:none;transition:opacity .2s}
html.cu-side-open:not(.cu-side-pin) #cuSideMask{opacity:1;pointer-events:auto}
#cuSide .sh{display:flex;align-items:center;gap:8px;padding:0 12px 10px 16px}
#cuSide .sh a{color:#a3a19d;text-decoration:none;font-size:13px;font-weight:600;padding:5px 10px;border-radius:8px;background:rgba(236,234,230,.06)}
#cuSide .sh a:hover{color:#e8e6e2}
#cuSide .sh b{flex:1;font-size:13px;letter-spacing:.08em;color:#74726f}
#cuSide input{margin:0 12px 8px;padding:8px 11px;border-radius:9px;border:0;background:rgba(236,234,230,.07);color:inherit;font:inherit;outline:none}
#cuSide input::placeholder{color:#74726f}
#cuSide .sl{flex:1;overflow:auto;padding:2px 8px 16px;overscroll-behavior:contain}
#cuSide .sec{margin:14px 8px 4px;font-size:11.5px;font-weight:600;letter-spacing:.08em;color:#74726f;display:flex;align-items:center;gap:6px;background:none;border:0;padding:0;cursor:pointer;font-family:inherit}
#cuSide .sec i{font-style:normal;transition:transform .15s;display:inline-block}
#cuSide .sec[aria-expanded="false"] i{transform:rotate(-90deg)}
#cuSide .it{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:9px;cursor:pointer;color:#c9c7c3;user-select:none}
#cuSide .it:hover{background:rgba(236,234,230,.05);color:#e8e6e2}
#cuSide .it.on{background:rgba(236,234,230,.1);color:#fff}
#cuSide .cv{width:30px;height:30px;border-radius:7px;flex:none;background:#26262a center/cover;display:grid;place-items:center;color:#74726f;font-size:12px}
#cuSide .tx{flex:1;min-width:0}
#cuSide .tt{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
#cuSide .ar{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#74726f}
#cuSide .st{flex:none;font-size:11px;color:#74726f}
#cuSide .tr{padding:5px 8px 5px 48px}
#cuSide .tr .tt{font-weight:400;font-size:13.5px}
#cuSide .empty{padding:20px 12px;color:#74726f;font-size:13px}`;
  document.head.appendChild(css);

  const side = document.createElement('nav'); side.id = 'cuSide'; side.setAttribute('aria-label', '项目');
  side.innerHTML = '<div class="sh"><b>CU MUSIC</b><a href="/chefdao/review/insights/">Insights</a></div><input id="cuSideQ" type="search" placeholder="搜索项目 / 歌名 / 艺人" autocomplete="off"><div class="sl" id="cuSideL"><div class="empty">载入中…</div></div>';
  const btn = document.createElement('button'); btn.id = 'cuSideBtn'; btn.setAttribute('aria-label', '项目列表');
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M9.5 4.5v15"/></svg>';
  const mask = document.createElement('div'); mask.id = 'cuSideMask';
  document.body.append(mask, side, btn);
  // 看板独立窗口里那个「‹ Insights」小标签和按钮叠在一起：有侧边栏就不要它了
  document.querySelectorAll('a[href="/chefdao/review/insights/"]').forEach(a => { if (a.style.position === 'fixed') a.remove(); });

  const root = document.documentElement;
  const want = () => ls.get('cu:side') !== '0';   // 宽屏默认打开
  const apply = open => { root.classList.toggle('cu-side-open', open); root.classList.toggle('cu-side-pin', open && PIN.matches); };
  apply(PIN.matches && want());
  btn.onclick = () => { const open = !root.classList.contains('cu-side-open'); if (PIN.matches) ls.set('cu:side', open ? '1' : '0'); apply(open); };
  mask.onclick = () => apply(false);
  PIN.addEventListener('change', () => apply(PIN.matches ? want() : false));
  addEventListener('keydown', e => { if (e.key === 'Escape' && root.classList.contains('cu-side-open') && !PIN.matches) apply(false); });

  let DATA = null, archOpen = ls.get('cu:side:arch') === '1';
  const L = side.querySelector('#cuSideL'), Q = side.querySelector('#cuSideQ');
  const tag = p => p && p.s != null ? '<span class="st"' + (HOT[p.s] ? ' style="color:' + HOT[p.s] + '"' : '') + '>' + esc(STAGE[p.s] || '') + (p.s === 7 && p.r ? ' · 第' + p.r + '轮' : '') + '</span>' : '';
  const cover = (p, t) => '<span class="cv"' + (p.cover ? ' style="background-image:url(' + API + p.cover + ')"' : '') + '>' + (p.cover ? '' : esc([...(t || '·')][0])) + '</span>';
  const projRow = p => {
    const one = p.tracks.length === 1, t0 = p.tracks[0];
    const url = one ? t0.url : p.url, on = isHere(url) || p.tracks.some(t => isHere(t.url));
    const sub = [p.artist || (t0 && t0.artist), one ? '' : p.tracks.length + ' 首'].filter(Boolean).join(' · ');
    let h = '<div class="it' + (isHere(url) ? ' on' : '') + '" data-u="' + esc(url) + '">' + cover(p, p.title) + '<span class="tx"><span class="tt">' + esc(p.title) + '</span>' + (sub ? '<span class="ar">' + esc(sub) + '</span>' : '') + '</span>' + (one ? tag(t0.prog) : '') + '</div>';
    if (!one && on) h += p.tracks.map(t => '<div class="it tr' + (isHere(t.url) ? ' on' : '') + '" data-u="' + esc(t.url) + '"><span class="tx"><span class="tt">' + esc(t.title) + '</span></span>' + tag(t.prog) + '</div>').join('');
    return h;
  };
  function draw() {
    if (!DATA) return;
    const q = Q.value.trim().toLowerCase();
    const hit = p => !q || [p.title, p.artist, ...p.tracks.map(t => t.title + ' ' + t.artist)].join(' ').toLowerCase().includes(q);
    const ps = DATA.projects.filter(p => p.tracks.length && hit(p));
    const live = ps.filter(p => !p.archived), arch = ps.filter(p => p.archived);
    const loose = (DATA.loose || []).filter(x => !q || (x.title + ' ' + x.artist).toLowerCase().includes(q));
    let h = live.map(projRow).join('');
    if (loose.length) h += '<div class="sec" style="cursor:default">未归项目</div>' + loose.map(x => '<div class="it' + (isHere(x.url) ? ' on' : '') + '" data-u="' + esc(x.url) + '">' + cover({}, x.title) + '<span class="tx"><span class="tt">' + esc(x.title) + '</span>' + (x.artist ? '<span class="ar">' + esc(x.artist) + '</span>' : '') + '</span></div>').join('');
    if (arch.length) { const o = archOpen || !!q; h += '<button class="sec" id="cuSideA" aria-expanded="' + o + '"><i>▾</i>已归档 ' + arch.length + '</button>' + (o ? arch.map(projRow).join('') : ''); }
    L.innerHTML = h || '<div class="empty">' + (q ? '没有匹配的项目' : '还没有项目') + '</div>';
    const a = L.querySelector('#cuSideA'); if (a) a.onclick = () => { archOpen = !archOpen; ls.set('cu:side:arch', archOpen ? '1' : '0'); draw(); };
    const cur = L.querySelector('.it.on'); if (cur && !q) cur.scrollIntoView({ block: 'nearest' });
  }
  L.onclick = e => { const it = e.target.closest('.it[data-u]'); if (it) { if (isHere(it.dataset.u)) { if (!PIN.matches) apply(false); return; } go(it.dataset.u); } };
  Q.oninput = draw;

  // 先用本机存的列表马上画出来，再去服务端拿新的（两分钟内打开过就不再拿，省数据库读取）
  try { const c = JSON.parse(ls.get('cu:side:lib') || 'null'); if (c && c.d) { DATA = c.d; draw(); } } catch (e) {}
  let ts = 0; try { ts = (JSON.parse(ls.get('cu:side:lib') || '{}') || {}).ts || 0; } catch (e) {}
  if (!DATA || Date.now() - ts > 120000) fetch(API + '/lib', { headers: { Authorization: 'Bearer ' + KEY }, cache: 'no-store' }).then(r => r.json()).then(j => {
    if (!j.ok) { if (!DATA) L.innerHTML = '<div class="empty">载入失败</div>'; return; }
    DATA = { projects: j.projects.map(p => ({ slug: p.slug, title: p.title, artist: p.artist || '', cover: p.cover, url: p.url, archived: !!p.archived,
      tracks: p.tracks.map(t => ({ slug: t.slug, title: t.title, artist: t.artist || '', url: t.url, prog: t.prog ? { s: t.prog.s, r: t.prog.r } : null })) })),
      loose: (j.loose || []).map(x => ({ slug: x.slug, title: x.title, artist: x.artist || '', url: x.url })) };
    ls.set('cu:side:lib', JSON.stringify({ ts: Date.now(), d: DATA })); draw();
  }).catch(() => { if (!DATA) L.innerHTML = '<div class="empty">网络异常</div>'; });
})();
