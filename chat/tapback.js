// 长按消息 → 表情回应（iMessage 的 Tapback）+ 拷贝。咨询页和私信后台共用
// 用法：var tb = Tapback({ log, canReact(row), send(id, rx) → Promise });  tb.apply([[id, rx], ...])  每次轮询后同步
(function () {
  var EM = ['❤️', '👍', '👎', '😂', '‼️', '❓'];
  var css = '' +
    '.b{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}' +
    '.m.hasrx{margin-top:16px}' +
    '.rx{position:absolute;top:-17px;z-index:1;min-width:30px;height:30px;padding:0 6px;border-radius:15px;display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1;' +
      'background:var(--rx-their);box-shadow:0 0 0 2.5px var(--bg);font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif}' +
    '.rx.mine{right:-14px;background:var(--me-2)}' +
    '.rx.their{left:-14px}' +
    '.tb-ov{position:fixed;inset:0;z-index:20;background:var(--tb-dim);-webkit-backdrop-filter:blur(14px) saturate(140%);backdrop-filter:blur(14px) saturate(140%);opacity:0;transition:opacity .22s ease}' +
    '.tb-ov.on{opacity:1}' +
    '.tb-row{position:fixed;z-index:21;margin:0!important;pointer-events:none;transition:transform .32s cubic-bezier(.22,1.2,.36,1)}' +
    '.tb-bar{position:fixed;z-index:22;display:flex;gap:2px;padding:5px;border-radius:26px;background:var(--menu);box-shadow:0 8px 30px rgba(0,0,0,.28)}' +
    '.tb-bar button{width:42px;height:42px;padding:0;border:0;border-radius:50%;background:none;font-size:23px;line-height:1;cursor:pointer;font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;transition:transform .18s cubic-bezier(.22,1.2,.36,1)}' +
    '.tb-bar button:active{transform:scale(1.25)}' +
    '.tb-bar button.on{background:var(--me-2)}' +
    '.tb-menu{position:fixed;z-index:22;min-width:180px;border-radius:13px;overflow:hidden;background:var(--menu);box-shadow:0 8px 30px rgba(0,0,0,.28)}' +
    '.tb-menu button{display:flex;justify-content:space-between;align-items:center;width:100%;padding:11px 16px;border:0;background:none;color:var(--text);font:inherit;font-size:17px;text-align:left;cursor:pointer}' +
    '.tb-menu button:active{background:var(--hair)}' +
    '@media (prefers-reduced-motion:reduce){.tb-ov,.tb-row{transition:none}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  window.Tapback = function (opt) {
    var log = opt.log, still = matchMedia('(prefers-reduced-motion: reduce)').matches, cur = null;
    function badge(row, rx, pop) {
      var b = row.querySelector('.b'); if (!b) return;
      var old = b.querySelector('.rx');
      if (!rx) { if (old) old.remove(); row.classList.remove('hasrx'); return; }
      if (old && old.textContent === rx) return;
      if (!old) { old = document.createElement('span'); b.appendChild(old); }
      old.className = 'rx ' + (opt.canReact(row) ? 'mine' : 'their'); old.textContent = rx; row.classList.add('hasrx');
      if (pop && !still) old.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.18)', offset: .6 }, { transform: 'scale(1)' }], { duration: 360, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
    function rowRx(row) { var x = row.querySelector('.rx'); return x ? x.textContent : ''; }
    function close() {
      if (!cur) return; var c = cur; cur = null;
      c.ov.classList.remove('on'); c.parts.forEach(function (p) { p.style.opacity = '0'; p.style.transition = 'opacity .18s'; });
      setTimeout(function () { c.ov.remove(); c.parts.forEach(function (p) { p.remove(); }); }, 220);
    }
    function open(row) {
      if (cur || !row.dataset.id) return;
      var b = row.querySelector('.b'), rr = row.getBoundingClientRect(), r = b.getBoundingClientRect(), left = opt.canReact(row);
      if (navigator.vibrate) navigator.vibrate(8);
      var ov = document.createElement('div'); ov.className = 'tb-ov'; document.body.appendChild(ov);
      var cl = row.cloneNode(true); cl.classList.add('tb-row'); cl.style.left = rr.left + 'px'; cl.style.top = rr.top + 'px'; cl.style.width = rr.width + 'px'; document.body.appendChild(cl);
      var parts = [cl], W = innerWidth, H = innerHeight;
      if (left) {   // 只有对方发的消息能点表情
        var bar = document.createElement('div'); bar.className = 'tb-bar'; var now = rowRx(row);
        EM.forEach(function (e) {
          var btn = document.createElement('button'); btn.type = 'button'; btn.textContent = e; if (e === now) btn.className = 'on';
          btn.onclick = function (ev) {
            ev.stopPropagation(); var rx = e === now ? '' : e;
            badge(row, rx, true); close();
            opt.send(row.dataset.id, rx).catch(function () { badge(row, now, false); });
          };
          bar.appendChild(btn);
        });
        document.body.appendChild(bar); parts.push(bar);
        var bw = bar.offsetWidth, top = r.top - 60; if (top < 12) top = r.bottom + 10;
        bar.style.top = top + 'px'; bar.style.left = Math.max(10, Math.min(r.left - 6, W - bw - 10)) + 'px';
        if (!still) bar.animate([{ transform: 'scale(.3) translateY(20px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.22,1.25,.36,1)' });
        bar.style.transformOrigin = '20px 100%';
      }
      var menu = document.createElement('div'); menu.className = 'tb-menu';
      var cp = document.createElement('button'); cp.type = 'button'; cp.innerHTML = '<span>拷贝</span><span style="opacity:.6">⧉</span>';
      var text = (b.firstChild && b.firstChild.nodeType === 3) ? b.firstChild.textContent : b.textContent;
      cp.onclick = function (ev) { ev.stopPropagation(); try { navigator.clipboard.writeText(text); } catch (e) {} close(); };
      menu.appendChild(cp); document.body.appendChild(menu); parts.push(menu);
      var mh = menu.offsetHeight, mw = menu.offsetWidth, mt = r.bottom + 10; if (mt + mh > H - 12) mt = Math.max(12, r.top - mh - 10 - (left ? 0 : 0));
      menu.style.top = mt + 'px'; menu.style.left = (left ? Math.max(10, r.left) : Math.max(10, r.right - mw)) + 'px';
      if (!still) menu.animate([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.22,1.15,.36,1)' });
      menu.style.transformOrigin = left ? '0 0' : '100% 0';
      requestAnimationFrame(function () { ov.classList.add('on'); if (!still) cl.style.transform = 'scale(1.03)'; });
      ov.onclick = close;
      cur = { ov: ov, parts: parts };
    }
    // 手势：手机长按 0.45 秒（手指一动就取消），电脑右键或双击
    var timer = 0, sx = 0, sy = 0, target = null;
    function rowOf(e) { var b = e.target.closest && e.target.closest('.b'); return b && b.parentNode && b.parentNode.classList.contains('m') ? b.parentNode : null; }
    log.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return; var row = rowOf(e); if (!row) return;
      target = row; sx = e.clientX; sy = e.clientY; clearTimeout(timer);
      timer = setTimeout(function () { if (target) open(target); target = null; }, 450);
    });
    log.addEventListener('pointermove', function (e) { if (target && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) { clearTimeout(timer); target = null; } });
    ['pointerup', 'pointercancel', 'scroll'].forEach(function (t) { log.addEventListener(t, function () { clearTimeout(timer); target = null; }, { passive: true }); });
    log.addEventListener('contextmenu', function (e) { var row = rowOf(e); if (row) { e.preventDefault(); open(row); } });
    log.addEventListener('dblclick', function (e) { var row = rowOf(e); if (row) open(row); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    return {
      apply: function (pairs) {   // 服务端的回应列表：[[id, rx]]；没在列表里的清掉
        var map = {}; (pairs || []).forEach(function (p) { map[p[0]] = p[1]; });
        [].forEach.call(log.querySelectorAll('.m[data-id]'), function (row) { var want = map[row.dataset.id] || '', has = rowRx(row); if (want !== has) badge(row, want, !!want); });
      }
    };
  };
})();
