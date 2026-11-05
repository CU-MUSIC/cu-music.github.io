// 审听外壳：所有审听页都用。客户那边只多一件事：同项目切歌时后台预载好的下一首直接换上、不刷新页面。
// 你自己的设备（带看板钥匙）另外有侧边栏和底部播放条。
// 播放器页放在 iframe 里，侧边栏在外壳里：切项目 / 曲目时，正在播的那首留在后台继续放。
// 底部常驻播放条（参考 Samply）：封面、歌名、后退 / 播放 / 前进、波形拖动、时间；后台在播时多一个「回到这首」。
// 在新页面里开始播放，后台那首自动让位。播放条的数据来自播放器页的 window.cuP（player.js）。
(() => {
  if (window.__cuShellOn) return; window.__cuShellOn = 1;
  const me = document.currentScript, ver = me && me.src.indexOf('?') > 0 ? me.src.slice(me.src.indexOf('?')) : '';
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } } };
  const W = 272;
  const OWNER = !!ls.get('insights:key'); window.__cuShellBar = OWNER;   // 客户也用外壳（切歌不刷新），但没有底部播放条和侧边栏
  const fmt = t => { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

  // 外壳自己整页重写：去掉原页面的样式和「正在载入」
  document.querySelectorAll('link[rel="stylesheet"], head style').forEach(n => n.remove());
  document.body.innerHTML = ''; document.title = 'CU MUSIC';
  const css = document.createElement('style');
  css.textContent = `
html,body{margin:0;height:100%;background:#0e0e0f;overflow:hidden}
#cuStage{position:fixed;inset:0;transition:left .22s}
html.cu-side-pin #cuStage{left:${W}px}
html.cu-bar #cuStage{bottom:calc(80px + env(safe-area-inset-bottom,0px))}
#cuStage iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#0e0e0f}
#cuStage iframe.bg{visibility:hidden;pointer-events:none}
#cuBar{position:fixed;z-index:65;left:max(12px,env(safe-area-inset-left,0px));right:max(12px,env(safe-area-inset-right,0px));bottom:calc(10px + env(safe-area-inset-bottom,0px));height:62px;
  display:flex;align-items:center;gap:14px;padding:0 14px 0 9px;border-radius:16px;background:#1b1b1e;border:1px solid rgba(236,234,230,.07);box-shadow:0 8px 30px rgba(0,0,0,.45);
  color:#e8e6e2;font:13px/1.3 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;-webkit-font-smoothing:antialiased;transform:translateY(calc(100% + 20px));transition:transform .26s cubic-bezier(.3,.7,.2,1),left .22s}
html.cu-bar #cuBar{transform:none}
html.cu-side-pin #cuBar{left:${W + 12}px}
#cuBar button{border:0;background:none;color:inherit;font:inherit;cursor:pointer;padding:0;flex:none}
#cuBar .cv{flex:none;width:44px;height:44px;border-radius:8px;background:#2a2a2e center/cover;display:grid;place-items:center;color:#5c5a58}
#cuBar .cv svg{width:22px;height:22px}
#cuBar .tx{flex:0 1 220px;min-width:0;display:flex;flex-direction:column;gap:2px;text-align:left}
#cuBar .tx small{font-size:11px;color:#8a8886;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#cuBar .tx b.ly{font-size:15px;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.3}
#cuBar .tx b.swap{animation:cuSwap .42s cubic-bezier(.2,.8,.2,1)}
@keyframes cuSwap{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
#cuBar{overflow:hidden}
#cuBar.hint::after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.12) 45%,rgba(255,255,255,.22) 50%,rgba(255,255,255,.12) 55%,transparent 70%);background-size:250% 100%;background-position:120% 0;animation:cuShine 5s ease-in-out 1.2s infinite}
@keyframes cuShine{0%{background-position:120% 0}28%,100%{background-position:-20% 0}}
@media (prefers-reduced-motion:reduce){#cuBar.hint::after{animation:none}}
#cuBar .tx b{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#cuBar .tr{display:flex;align-items:center;gap:6px}
#cuBar .sk{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:#c9c7c3}
#cuBar .sk:hover{background:rgba(236,234,230,.08);color:#fff}
#cuBar .sk svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
#cuBar .pp{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:#ebe9e5;color:#111}
#cuBar .pp:disabled{opacity:.4;cursor:default}
#cuBar .pp svg{width:16px;height:16px;fill:currentColor}
#cuBar .t{flex:none;font-size:12px;color:#8a8886;font-variant-numeric:tabular-nums;min-width:34px;text-align:center}
#cuBar .wv{flex:1;min-width:60px;height:34px;position:relative;cursor:pointer;touch-action:none}
#cuBar .wv canvas{position:absolute;inset:0;width:100%;height:100%}
#cuBar .bk{padding:7px 12px;border-radius:99px;background:rgba(236,234,230,.1);white-space:nowrap;font-size:12.5px}
#cuBar .bk:hover{background:rgba(236,234,230,.18)}
#cuBar .x{width:28px;height:28px;border-radius:50%;color:#8a8886;font-size:15px}
#cuBar .x:hover{color:#e8e6e2}
#cuBar .pg{display:none;position:absolute;left:14px;right:14px;bottom:5px;height:2px;border-radius:2px;background:rgba(236,234,230,.12);overflow:hidden}
#cuBar .pg i{display:block;height:100%;width:0;background:#ebe9e5}
@media(max-width:760px){
  #cuBar{gap:10px}
  #cuBar .sk,#cuBar .t,#cuBar .wv{display:none}
  #cuBar .tx{flex:1}
  #cuBar .pg{display:block}
}`;
  document.head.appendChild(css);

  const stage = document.createElement('div'); stage.id = 'cuStage';
  const bar = document.createElement('div'); bar.id = 'cuBar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', '播放');
  const MARK = '<svg viewBox="272 164 456 456" fill="none" stroke="currentColor" stroke-width="34" stroke-linecap="round"><path d="M 592.06,203.25 A 210,210 0 1 1 407.94,203.25"/><path d="M 619.61,478.90 A 147.84,147.84 0 1 1 619.61,305.10"/></svg>';
  const ICON = { play: '<svg viewBox="0 0 16 16"><path d="M4.5 2.6v10.8c0 .6.7 1 1.2.7l8.3-5.4c.5-.3.5-1.1 0-1.4L5.7 1.9c-.5-.3-1.2.1-1.2.7z"/></svg>', pause: '<svg viewBox="0 0 16 16"><rect x="3.5" y="2.5" width="3.2" height="11" rx="1"/><rect x="9.3" y="2.5" width="3.2" height="11" rx="1"/></svg>' };
  bar.innerHTML = `<button class="cv" aria-label="打开这首">${MARK}</button>
    <button class="tx" aria-label="打开这首"><small></small><b></b></button>
    <div class="tr"><button class="sk" data-k="-5" aria-label="后退 5 秒"><svg viewBox="0 0 24 24"><path d="M5.2 8A8 8 0 1 1 4 12.6"/><path d="M4.6 3.8v4.6h4.6"/><text x="12.4" y="15.7" text-anchor="middle" font-size="8.6" font-weight="700" fill="currentColor" stroke="none">5</text></svg></button>
    <button class="pp" aria-label="播放">${ICON.play}</button>
    <button class="sk" data-k="5" aria-label="前进 5 秒"><svg viewBox="0 0 24 24"><path d="M18.8 8A8 8 0 1 0 20 12.6"/><path d="M19.4 3.8v4.6h-4.6"/><text x="11.6" y="15.7" text-anchor="middle" font-size="8.6" font-weight="700" fill="currentColor" stroke="none">5</text></svg></button></div>
    <span class="t" id="cuT0">0:00</span><div class="wv"><canvas></canvas></div><span class="t" id="cuT1">0:00</span>
    <button class="bk" hidden>回到这首</button><button class="x" hidden aria-label="停止后台播放">✕</button><div class="pg"><i></i></div>`;
  document.body.append(stage, bar);
  const $ = q => bar.querySelector(q);
  const $pp = $('.pp'), $cv = $('.cv'), $sm = $('.tx small'), $tt = $('.tx b'), $t0 = $('#cuT0'), $t1 = $('#cuT1'), $wv = $('.wv'), cvs = $('.wv canvas'), $bk = $('.bk'), $x = $('.x'), $pg = $('.pg i');

  let view = null, bg = null;
  const keyOf = u => u.pathname + u.hash;
  const doc = f => { try { return f.el.contentDocument; } catch (e) { return null; } };
  const api = f => { try { return f && f.el.contentWindow.cuP || null; } catch (e) { return null; } };
  const audio = f => { const p = api(f); if (p) return p.a; const d = f && doc(f); return d && d.getElementById('a'); };
  const playing = f => { const a = audio(f); return !!(a && !a.paused && !a.ended); };
  const curUrl = f => { try { const l = f.el.contentWindow.location; return l.href === 'about:blank' ? null : l; } catch (e) { return null; } };

  function destroy(f) {
    if (!f) return;
    try { const a = audio(f); if (a) a.pause(); } catch (e) {}
    f.el.remove();
    if (f === bg) bg = null;
    if (f === pre) pre = null;
  }
  function make(u) {
    const el = document.createElement('iframe'); el.src = u.href; el.setAttribute('allow', 'autoplay; fullscreen');
    const f = { el, key: keyOf(u), url: u.href };
    el.addEventListener('load', () => {
      const l = curUrl(f); if (!l) return;
      f.key = l.pathname + l.hash; f.url = l.href;
      if (f === view) { sync(); try { el.contentWindow.focus(); } catch (e) {} }
    });
    stage.appendChild(el);
    return f;
  }
  // 地址栏跟着当前看的这首走（刷新、分享都对得上）
  function sync() {
    const l = view && curUrl(view); if (!l) return;
    const p = l.pathname + l.search.replace(/[?&]pre=1\b/, '').replace(/^&/, '?') + l.hash;
    if (p !== location.pathname + location.search + location.hash) history.replaceState(null, '', p);
    try { const t = view.el.contentDocument.title; if (t) document.title = t; } catch (e) {}
    tick(true);
  }

  // 预载：后台先把下一首开好（?pre=1：不记访问、不出声），切过去时直接换上
  let pre = null;
  window.cuPreload = url => {
    const u = new URL(url, location.href); if (u.origin !== location.origin) return;
    const key = keyOf(u); if ((view && view.key === key) || (bg && bg.key === key) || (pre && pre.key === key)) return;
    if (pre) destroy(pre);
    u.search = (u.search ? u.search + '&' : '?') + 'pre=1';
    pre = make(u); pre.key = key; pre.el.classList.add('bg');
  };
  // o.replace：切歌（上一首 / 下一首 / 播放列表）——旧的那首直接关掉，不留后台；o.play / o.fs：换上后接着放 / 接着全屏
  function nav(url, push = true, o = {}) {
    const u = new URL(url, location.href);
    if (u.origin !== location.origin) { location.href = u.href; return; }
    const key = keyOf(u);
    if (view && view.key === key) return;
    const old = view;
    if (pre && pre.key === key) {
      view = pre; pre = null;
      try { sessionStorage.removeItem('review:quick'); } catch (e) {}
      const w = view.el.contentWindow, act = { play: !!o.play, fs: !!o.fs };
      try { const p = w.cuP; if (p && p.activate) p.activate(act); else w.__cuAct = act; } catch (e) {}
      setTimeout(sync, 0);
    }
    else if (bg && bg.key === key) { view = bg; bg = null; }
    else view = make(u);
    view.el.classList.remove('bg');
    // 离开时还在播的那首留在后台；没在播的直接丢掉；切歌时直接关掉
    if (old) { if (!o.replace && playing(old)) { destroy(bg); bg = old; old.el.classList.add('bg'); } else destroy(old); }
    if (push) history.pushState(null, '', u.pathname + u.search + u.hash);
    try { view.el.contentWindow && view.el.contentWindow.focus(); } catch (e) {}
    tick(true);
  }
  window.cuNav = nav;
  if (!OWNER) bar.style.display = 'none';
  addEventListener('popstate', () => nav(location.href, false));

  // 播放条跟着谁：后台有在播（或暂停着）的就跟后台那首，否则跟当前页面
  const target = () => bg || view;   // 预载的那首不算
  let pk = '', sig = '', drag = null, wsig = '';
  function tick(force) {
    try { const t = view && view.el.contentDocument.title; if (t && t !== document.title) document.title = t; } catch (e) {}   // 标签页标题跟着当前这首
    if (bg && playing(view)) destroy(bg);   // 新页面里开始播了，后台那首让位
    const k = bg && playing(bg) ? bg.key : playing(view) ? view.key : '';
    if (k !== pk || force) { pk = k; window.cuPlayingKey = k; if (window.cuSideDraw) window.cuSideDraw(); }
    const f = target(), p = api(f);
    document.documentElement.classList.toggle('cu-bar', OWNER && !!p);
    if (!p) { sig = ''; return; }
    const S = p.song, on = playing(f), apiBase = (() => { try { return f.el.contentWindow.SONG_LIVE.api; } catch (e) { return ''; } })();
    const s = [S.slug, p.ver(), on, p.ready(), !!bg, S.cover].join('|');
    if (s !== sig || force) {
      sig = s;
      $tt.textContent = S.title || '';
      $sm.textContent = [S.project && S.project.title !== S.title ? S.project.title : (S.artist || ''), p.ver()].filter(Boolean).join(' · ');
      if (S.cover && apiBase) { $cv.style.backgroundImage = 'url(' + apiBase + S.cover + ')'; $cv.innerHTML = ''; } else { $cv.style.backgroundImage = ''; $cv.innerHTML = MARK; }
      $pp.innerHTML = on ? ICON.pause : ICON.play; $pp.setAttribute('aria-label', on ? '暂停' : '播放'); $pp.disabled = !p.ready();
      $bk.hidden = $x.hidden = !bg;
    }
    // 小字那行：正在唱的歌词（有歌词时），否则项目名 · 版本
    // 有歌词：小字歌名 · 版本，大字正在唱的那句（前奏 / 间奏显示 ♪）；没歌词照旧
    const hasL = !!(p.full && p.hasLyr && p.hasLyr()), ln = (p.line && p.line()) || '';
    const small = hasL ? [S.title, p.ver()].filter(Boolean).join(' · ') : [S.project && S.project.title !== S.title ? S.project.title : (S.artist || ''), p.ver()].filter(Boolean).join(' · ');
    const big = hasL ? (ln || '♪') : (S.title || '');
    if ($sm.textContent !== small) $sm.textContent = small;
    if ($tt.textContent !== big) { $tt.textContent = big; $tt.classList.toggle('ly', hasL); if (hasL) { $tt.classList.remove('swap'); void $tt.offsetWidth; $tt.classList.add('swap'); } }
    bar.classList.toggle('hint', hasL && !ls.get('review:lyfsSeen'));
  }
  setInterval(tick, 400);

  // 波形：已播的部分亮、没播的暗；拖动时按手指位置预览
  function draw() {
    requestAnimationFrame(draw);
    const p = api(target()); if (!p || !document.documentElement.classList.contains('cu-bar')) return;
    const d = p.dur() || 0, t = drag ? drag.t : p.time(), fr = d ? Math.min(1, t / d) : 0;
    $pg.style.width = (fr * 100) + '%';
    const w = cvs.clientWidth, h = cvs.clientHeight;
    const s = [w, h, Math.round(fr * w), p.song.slug, p.ver()].join('|');
    if (s === wsig) return; wsig = s;
    $t0.textContent = fmt(t); $t1.textContent = fmt(d);
    if (!w || !h) return;
    const dpr = devicePixelRatio || 1; if (cvs.width !== Math.round(w * dpr)) { cvs.width = Math.round(w * dpr); cvs.height = Math.round(h * dpr); }
    const c = cvs.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    const pk = p.peaks(), gap = 2, bw = 2, n = Math.max(1, Math.floor((w + gap) / (bw + gap))), mid = h / 2, px = fr * w;
    for (let k = 0; k < n; k++) {
      const x = k * (bw + gap), q = pk.length ? k / Math.max(1, n - 1) * (pk.length - 1) : 0, i = Math.floor(q), u = q - i;
      const v = pk.length ? (pk[i] || 0) * (1 - u) + (pk[Math.min(pk.length - 1, i + 1)] || 0) * u : .15;
      const bh = Math.max(2, v * (h - 4));
      c.fillStyle = x < px ? '#ebe9e5' : 'rgba(236,234,230,.3)';
      c.beginPath(); c.roundRect ? c.roundRect(x, mid - bh / 2, bw, bh, 1) : c.rect(x, mid - bh / 2, bw, bh); c.fill();
    }
  }
  requestAnimationFrame(draw);
  const at = e => { const p = api(target()), r = $wv.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * ((p && p.dur()) || 0); };
  $wv.addEventListener('pointerdown', e => { const p = api(target()); if (!p || !p.ready()) return; $wv.setPointerCapture(e.pointerId); drag = { t: at(e) }; });
  $wv.addEventListener('pointermove', e => { if (drag) drag.t = at(e); });
  $wv.addEventListener('pointerup', e => { if (!drag) return; const p = api(target()); if (p) p.seek(at(e)); drag = null; });
  $wv.addEventListener('pointercancel', () => { drag = null; });

  const toggle = () => { const p = api(target()); if (p && p.ready()) { p.toggle(); setTimeout(tick, 50); } };
  $pp.onclick = toggle;
  bar.querySelectorAll('.sk').forEach(b => b.onclick = () => { const p = api(target()); if (p && p.ready()) p.seek(p.a.currentTime + +b.dataset.k); });
  const back = () => { if (bg) nav(bg.url); };
  // 点封面 / 歌名：后台有在播的就回到那首；否则打开这首的全屏歌词
  const open = () => { if (bg) return back(); const p = api(view); if (p && p.full) p.full(); };
  $bk.onclick = back; $cv.onclick = open; $('.tx').onclick = open;
  $x.onclick = () => { destroy(bg); tick(true); };
  // 焦点在外壳里（刚点过侧边栏）时，空格也能播放 / 暂停
  addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT|BUTTON/.test((e.target && e.target.tagName) || '')) { e.preventDefault(); toggle(); } });

  nav(location.href, false);
  // 侧边栏放在外壳里：它的 go() 会调用 cuNav，不再整页跳转
  if (ls.get('insights:key')) { const sd = document.createElement('script'); sd.src = me.src.replace(/shell\.js(\?.*)?$/, 'side.js') + ver; document.body.appendChild(sd); }
})();
