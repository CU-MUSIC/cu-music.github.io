// 审听外壳：只在你自己的设备（带看板钥匙）上用，客户看到的页面不变。
// 播放器页放在 iframe 里，侧边栏在外壳里：切项目 / 曲目时，正在播的那首留在后台继续放，
// 顶上出现一个小条（播放 / 暂停、回到这首、停止）；在新页面里开始播放，后台那首自动让位。
(() => {
  if (window.__cuShellOn) return; window.__cuShellOn = 1;
  const me = document.currentScript, ver = me && me.src.indexOf('?') > 0 ? me.src.slice(me.src.indexOf('?')) : '';
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } } };
  const W = 272;

  // 外壳自己整页重写：去掉原页面的样式和「正在载入」
  document.querySelectorAll('link[rel="stylesheet"], head style').forEach(n => n.remove());
  document.body.innerHTML = ''; document.title = 'CU MUSIC';
  const css = document.createElement('style');
  css.textContent = `
html,body{margin:0;height:100%;background:#0e0e0f;overflow:hidden}
#cuStage{position:fixed;inset:0;transition:left .22s}
html.cu-side-pin #cuStage{left:${W}px}
#cuStage iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#0e0e0f}
#cuStage iframe.bg{visibility:hidden;pointer-events:none}
#cuNow{position:fixed;z-index:65;top:max(10px,env(safe-area-inset-top,0px));left:50%;transform:translate(-50%,-8px);opacity:0;pointer-events:none;transition:opacity .18s,transform .18s,left .22s;
  display:flex;align-items:center;gap:6px;max-width:calc(100vw - 130px);padding:4px 5px 4px 6px;border-radius:99px;background:rgba(34,34,38,.88);border:1px solid rgba(236,234,230,.12);
  -webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);box-shadow:0 6px 22px rgba(0,0,0,.4);color:#e8e6e2;font:13px/1 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;-webkit-font-smoothing:antialiased}
#cuNow.on{opacity:1;transform:translate(-50%,0);pointer-events:auto}
html.cu-side-pin #cuNow{left:calc(50% + ${W / 2}px)}
#cuNow button{border:0;background:none;color:inherit;font:inherit;cursor:pointer;padding:0}
#cuNow .pp{flex:none;width:30px;height:30px;border-radius:50%;background:rgba(236,234,230,.12);display:grid;place-items:center}
#cuNow .pp svg{width:14px;height:14px;fill:currentColor}
#cuNow .tt{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 4px;max-width:34vw;color:#c9c7c3}
#cuNow .bk{flex:none;padding:7px 11px;border-radius:99px;background:rgba(236,234,230,.1);color:#e8e6e2;white-space:nowrap}
#cuNow .x{flex:none;width:28px;height:28px;border-radius:50%;color:#8a8886;font-size:15px}
#cuNow .pp:hover,#cuNow .bk:hover{background:rgba(236,234,230,.2)}`;
  document.head.appendChild(css);

  const stage = document.createElement('div'); stage.id = 'cuStage';
  const now = document.createElement('div'); now.id = 'cuNow';
  const ICON = { play: '<svg viewBox="0 0 16 16"><path d="M4 2.5v11l9.5-5.5z"/></svg>', pause: '<svg viewBox="0 0 16 16"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z"/></svg>' };
  now.innerHTML = '<button class="pp" aria-label="播放 / 暂停"></button><span class="tt"></span><button class="bk">回到这首</button><button class="x" aria-label="停止">✕</button>';
  document.body.append(stage, now);
  const $pp = now.querySelector('.pp'), $tt = now.querySelector('.tt');

  let view = null, bg = null, lastKey = null;
  const keyOf = u => u.pathname + u.hash;
  const doc = f => { try { return f.el.contentDocument; } catch (e) { return null; } };
  const audio = f => { const d = f && doc(f); return d && d.getElementById('a'); };
  const playing = f => { const a = audio(f); return !!(a && !a.paused && !a.ended); };
  const titleOf = f => { const d = doc(f); let t = d && d.title; if (!t || t === 'CU MUSIC') { try { t = f.el.contentWindow.SONG.title; } catch (e) { t = ''; } } return t || '正在播放'; };
  const curUrl = f => { try { const l = f.el.contentWindow.location; return l.href === 'about:blank' ? null : l; } catch (e) { return null; } };

  function destroy(f) {
    if (!f) return;
    try { const a = audio(f); if (a) a.pause(); } catch (e) {}
    f.el.remove();
    if (f === bg) bg = null;
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
    const p = l.pathname + l.search + l.hash;
    if (p !== location.pathname + location.search + location.hash) history.replaceState(null, '', p);
    tick(true);
  }
  function show(f) { f.el.classList.remove('bg'); }
  function hide(f) { f.el.classList.add('bg'); }

  function nav(url, push = true) {
    const u = new URL(url, location.href);
    if (u.origin !== location.origin) { location.href = u.href; return; }
    const key = keyOf(u);
    if (view && view.key === key) return;
    const old = view;
    if (bg && bg.key === key) { view = bg; bg = null; show(view); }
    else view = make(u);
    show(view);
    // 离开时还在播的那首留在后台；没在播的直接丢掉
    if (old) { if (playing(old)) { destroy(bg); bg = old; hide(old); } else destroy(old); }
    if (push) history.pushState(null, '', u.pathname + u.search + u.hash);
    try { view.el.contentWindow && view.el.contentWindow.focus(); } catch (e) {}
    tick(true);
  }
  window.cuNav = nav;
  addEventListener('popstate', () => nav(location.href, false));

  // 后台条 + 侧边栏的「正在播」标记
  let shown = '', pk = '';
  function tick(force) {
    if (bg && playing(view)) destroy(bg);   // 新页面里开始播了，后台那首让位
    const bp = !!bg && playing(bg), vp = playing(view);
    const k = bp ? bg.key : vp ? view.key : '';
    if (k !== pk || force) { pk = k; window.cuPlayingKey = k; if (window.cuSideDraw) window.cuSideDraw(); }
    now.classList.toggle('on', !!bg);
    if (bg) {
      const s = (bp ? 'p' : 's') + titleOf(bg);
      if (s !== shown) { shown = s; $pp.innerHTML = bp ? ICON.pause : ICON.play; $tt.textContent = titleOf(bg); $pp.setAttribute('aria-label', bp ? '暂停' : '播放'); }
    } else shown = '';
  }
  setInterval(tick, 400);
  $pp.onclick = () => {
    const a = audio(bg); if (!a) return;
    const b = doc(bg).querySelector('#play');   // 走播放器自己的按钮，它的界面状态才对得上
    if (b && !b.disabled) b.click(); else a.paused ? a.play() : a.pause();
    setTimeout(() => tick(), 60);
  };
  now.querySelector('.bk').onclick = () => { if (bg) nav(bg.url); };
  now.querySelector('.x').onclick = () => { destroy(bg); tick(true); };

  nav(location.href, false);
  // 侧边栏放在外壳里：它的 go() 会调用 cuNav，不再整页跳转
  if (ls.get('insights:key')) { const sd = document.createElement('script'); sd.src = me.src.replace(/shell\.js(\?.*)?$/, 'side.js') + ver; document.body.appendChild(sd); }
})();
