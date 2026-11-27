// 私信里的两种特殊消息（只认刀大厨发出的），靠消息文字开头的标记区分，后台接口不用改：
//   〔墨〕正文      → iMessage「隐形墨水」：文字糊住、上面飘粒子，轻点或划过显示，几秒后重新盖上
//   〔刀门邀请〕链接 → 系统样式的邀请卡（居中，不带气泡尾巴）
// 用法：ChatFx.render(b, text) 返回 true 表示已经画好；认领自己刚发的消息时比对 ChatFx.raw(row)
(function () {
  var INK = '〔墨〕', INV = '〔刀门邀请〕', URL_ = 'https://cumusic.work/chefdao/price/?from=chat';
  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var css = '.m .b.ink{cursor:pointer;-webkit-user-select:none;user-select:none;touch-action:pan-y}'
    + '.inkt{display:block;filter:blur(9px);opacity:.35;transition:filter .55s ease,opacity .55s ease}'
    + '.inkc{position:absolute;left:0;top:0;width:100%;height:100%;border-radius:inherit;pointer-events:none;transition:opacity .45s ease}'
    + '.b.ink.show .inkt{filter:blur(0);opacity:1}.b.ink.show .inkc{opacity:0}'
    + '.m:has(>.b.invite){justify-content:center}'
    + '.m.m .b.invite{width:100%;max-width:320px;margin:10px 0;padding:18px 18px 0;border-radius:18px;background:var(--grp,var(--other));color:var(--text);box-shadow:0 0 0 .5px var(--ring,var(--hair)),0 8px 28px rgba(0,0,0,.16);white-space:normal;text-align:center;animation:invin .5s cubic-bezier(.2,.9,.25,1) both}'
    + '.m.m.m .b.invite::after,.m.m.m .b.invite::before{display:none}'
    + '.inv-av{display:block;width:48px;height:48px;margin:0 auto 10px;border-radius:12px;background:#fff center/cover no-repeat url(/chat/avatar.png?v=2);box-shadow:0 0 0 .5px var(--ring,var(--hair))}'
    + '.inv-t{display:block;font-size:17px;line-height:22px;font-weight:600}'
    + '.inv-s{display:block;margin-top:3px;font-size:13px;line-height:18px;color:var(--dim)}'
    + '.inv-l{display:block;margin:12px 0 14px;font-size:15px;line-height:26px}.inv-l span{display:block}'
    + '.m .b a.inv-go{display:block;margin:0 -18px;padding:13px;border-top:.5px solid var(--hair);color:#0a84ff;font-size:17px;line-height:22px;text-decoration:none}'
    + '.m .b a.inv-go:active{opacity:.55}'
    + '@keyframes invin{from{opacity:0;transform:translateY(14px) scale(.96)}}'
    + '@media (prefers-reduced-motion:reduce){.inkt,.inkc{transition:none}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function span(cls, text, parent) { var s = document.createElement('span'); s.className = cls; if (text) s.textContent = text; parent.appendChild(s); return s; }

  function invite(b) {
    b.classList.add('invite');
    span('inv-av', '', b); span('inv-t', '刀门邀请', b); span('inv-s', 'ChefDao 会员 · 系统消息', b);
    var l = span('inv-l', '', b);
    ['专属提问箱', '混音与制作人费 8 折', '加速通道 · 交付快一周', '终身有效 · 下单时选择「本单加入」'].forEach(function (t) { span('', t, l); });
    var a = document.createElement('a'); a.className = 'inv-go'; a.href = URL_; a.target = '_blank'; a.rel = 'noopener'; a.textContent = '查看加入方式'; b.appendChild(a);
  }

  // 粒子：颜色跟气泡文字一致（深浅模式都看得见）；离开屏幕或被撕掉就停
  function ink(b, text, linkify) {
    b.classList.add('ink'); b.setAttribute('aria-label', '隐形墨水消息，轻点显示');
    var t = span('inkt', '', b); linkify(t, text);
    var c = document.createElement('canvas'); c.className = 'inkc'; b.appendChild(c);
    var ctx = c.getContext('2d'), P = [], W = 0, H = 0, timer = 0, born = false, prev = 0;
    function seed() {
      var w = b.offsetWidth, h = b.offsetHeight, r = Math.min(devicePixelRatio || 1, 2);
      if (!w || (w === W && h === H)) return;
      W = w; H = h; c.width = w * r; c.height = h * r; ctx.setTransform(r, 0, 0, r, 0, 0); P = [];
      for (var i = 0, n = Math.min(900, Math.round(w * h / 22)); i < n; i++) P.push({ x: 3 + Math.random() * (w - 6), y: 3 + Math.random() * (h - 6), vx: (Math.random() - .5) * 9, vy: (Math.random() - .5) * 7, s: Math.random() < .18 ? 2 : 1.2, p: Math.random() * 6.28, f: 2 + Math.random() * 4 });
    }
    function draw(now) {
      if (!b.isConnected) { if (born) return; return requestAnimationFrame(draw); }
      born = true; seed();
      var dt = Math.min((now - prev) / 1000, .05) || 0; prev = now;
      var rc = b.getBoundingClientRect();
      if (rc.bottom > 0 && rc.top < innerHeight) {
        ctx.clearRect(0, 0, W, H); ctx.fillStyle = getComputedStyle(b).color;
        P.forEach(function (q) {
          q.x += q.vx * dt; q.y += q.vy * dt;
          if (q.x < 3 || q.x > W - 3) q.vx = -q.vx; if (q.y < 3 || q.y > H - 3) q.vy = -q.vy;
          ctx.globalAlpha = .18 + .72 * Math.abs(Math.sin(q.p + now / 1000 * q.f / 2));
          ctx.fillRect(q.x, q.y, q.s, q.s);
        });
      }
      if (!still) requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
    function show() { b.classList.add('show'); clearTimeout(timer); timer = setTimeout(function () { b.classList.remove('show'); }, 6000); }
    b.addEventListener('click', function (e) { if (!b.classList.contains('show')) e.preventDefault(); show(); }, true);
    b.addEventListener('pointermove', function (e) { if (e.buttons || e.pointerType === 'touch') show(); });
  }

  window.ChatFx = {
    INK: INK, INVITE: INV + URL_,
    render: function (b, text, linkify) {
      text = String(text);
      if (text.indexOf(INV) === 0) invite(b);
      else if (text.indexOf(INK) === 0 && text.length > INK.length) ink(b, text.slice(INK.length), linkify);
      else return false;
      b.dataset.raw = text; return true;
    },
    raw: function (row) { var b = row.firstChild; return b.dataset.raw || b.textContent; },
    preview: function (t) { t = String(t || ''); return t.indexOf(INV) === 0 ? '[刀门邀请]' : t.indexOf(INK) === 0 ? '[隐形墨水] ' + t.slice(INK.length) : t; }
  };
})();
