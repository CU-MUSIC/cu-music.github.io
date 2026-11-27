// 私信里的两种特殊消息（只认刀大厨发出的），靠消息文字开头的标记区分，后台接口不用改：
//   〔墨〕正文      → iMessage「隐形墨水」：文字糊住、上面飘粒子，轻点或划过显示，几秒后重新盖上
//   〔刀门邀请〕链接 → 系统样式的邀请卡（居中，不带气泡尾巴），点开是页内刀门介绍层
// 介绍层的权益、¥99、8 折条款、关闭日期要跟价目页刀门区块一起改
// 用法：ChatFx.render(b, text) 返回 true 表示已经画好；认领自己刚发的消息时比对 ChatFx.raw(row)
(function () {
  var INK = '〔墨〕', INV = '〔刀门邀请〕', URL_ = 'https://cumusic.work/chefdao/price/?from=chat';
  var CLOSE = new Date('2027-01-01T00:00:00'), FEE = '¥99';
  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var css = '.m .b.ink{cursor:pointer;-webkit-user-select:none;user-select:none;touch-action:pan-y}'
    + '.inkt{display:block;filter:blur(9px);opacity:.35;transition:filter .55s ease,opacity .55s ease}'
    + '.inkc{position:absolute;left:0;top:0;width:100%;height:100%;border-radius:inherit;pointer-events:none;transition:opacity .45s ease}'
    + '.b.ink.show .inkt{filter:blur(0);opacity:1}.b.ink.show .inkc{opacity:0}'
    + '.m:has(>.b.invite){justify-content:center}'
    + '.m.m .b.invite{width:100%;max-width:320px;margin:10px 0;padding:18px 18px 0;border-radius:18px;background:var(--grp,var(--other));color:var(--text);box-shadow:0 0 0 .5px var(--ring,var(--hair)),0 8px 28px rgba(0,0,0,.16);white-space:normal;text-align:center;animation:invin .5s cubic-bezier(.2,.9,.25,1) both}'
    + '.m.m.m .b.invite::after,.m.m.m .b.invite::before{display:none}'
    + '.inv-av{display:block;width:48px;height:48px;margin:0 auto 10px;border-radius:12px;background:#0e0e0f center/cover no-repeat url(/chat/avatar.png?v=3);box-shadow:0 0 0 .5px var(--ring,var(--hair))}'
    + '.inv-t{display:block;font-size:17px;line-height:22px;font-weight:600}'
    + '.inv-s{display:block;margin-top:3px;font-size:13px;line-height:18px;color:var(--dim)}'
    + '.inv-l{display:block;margin:12px 0 14px;font-size:15px;line-height:26px}.inv-l span{display:block}'
    + '.m .b a.inv-go{display:block;margin:0 -18px;padding:13px;border-top:.5px solid var(--hair);color:#0a84ff;font-size:17px;line-height:22px;text-decoration:none}'
    + '.m .b a.inv-go:active{opacity:.55}'
    + '.m .b.invite{cursor:pointer}'
    + '.dm{position:fixed;inset:0;z-index:999;display:flex;align-items:flex-end;justify-content:center;visibility:hidden;transition:visibility 0s .42s}'
    + '.dm.on{visibility:visible;transition:none}'
    + '.dm-bg{position:absolute;inset:0;background:rgba(0,0,0,.6);opacity:0;transition:opacity .35s ease}.dm.on .dm-bg{opacity:1}'
    + '.dm-p{position:relative;display:flex;flex-direction:column;width:100%;max-width:480px;height:calc(100% - 20px);border-radius:24px 24px 0 0;overflow:hidden;background:#000;color:#fff;box-shadow:0 0 0 .5px rgba(255,255,255,.16),0 -12px 40px rgba(0,0,0,.5);transform:translateY(103%);transition:transform .42s cubic-bezier(.32,.72,0,1);text-align:left;outline:0}'
    + '.dm.on .dm-p{transform:none}'
    + '@media (min-width:640px){.dm{align-items:center}.dm-p{border-radius:24px;height:calc(100% - 64px);max-height:860px}}'
    + '.dm-x{position:absolute;right:14px;top:14px;z-index:2;width:32px;height:32px;border:0;border-radius:50%;padding:0;background:rgba(255,255,255,.12);color:#fff;font:300 20px/32px -apple-system,sans-serif;cursor:pointer}'
    + '.dm-s{flex:1;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}'
    + '.dm-s section{padding:56px 32px;border-top:.5px solid rgba(255,255,255,.14)}'
    + '.dm-s section.dm-c{display:flex;flex-direction:column;min-height:100%;box-sizing:border-box;border:0;padding:30px 32px 32px}'
    + '.dm-logo{display:block}.dm-mid{margin:auto 0;padding:48px 0}'
    + '.dm-ey{font-size:12px;letter-spacing:.42em;color:#7d7d7d}'
    + '.dm-c h2{margin:20px 0 0;font-size:80px;line-height:90px;font-weight:600;letter-spacing:.02em}'
    + '.dm-c i{display:block;width:56px;height:1px;margin:30px 0 32px;background:#6fb592}'
    + '.dm-sl{font-size:18px;line-height:34px;color:#bdbdbd}'
    + '.dm-by{font-size:13px;letter-spacing:.12em;color:#6a6a6a}'
    + '.dm-lb{margin-bottom:32px;font-size:13px;letter-spacing:.3em;color:#7d7d7d}'
    + '.dm-s section p{margin:0 0 20px;font-size:16px;line-height:32px;color:#9d9d9d}.dm-s section p.dm-lead{color:#dcdcdc}.dm-s section p:last-child{margin-bottom:0}'
    + '.dm-s h4{margin:32px 0;font-size:23px;line-height:34px;font-weight:600}'
    + '.dm-r{margin-bottom:36px;padding-left:24px;border-left:3px solid rgba(255,255,255,.34)}.dm-r:last-of-type{margin-bottom:0}.dm-r:first-of-type{border-left-color:#fff}.dm-r:nth-of-type(2),.dm-r:nth-of-type(3){border-left-color:rgba(255,255,255,.55)}'
    + '.dm-r h3{margin:0 0 8px;font-size:19px;line-height:28px;font-weight:600}'
    + '.dm-s section .dm-r p{font-size:15px;line-height:28px}'
    + '.dm-j{display:flex;align-items:flex-start;gap:26px}'
    + '.dm-j em{font:200 64px/64px -apple-system,sans-serif;color:#ececec}'
    + '.dm-j strong{display:block;font-size:30px;line-height:40px;font-weight:400}'
    + '.dm-j span{display:block;margin-top:8px;font-size:15px;line-height:27px;color:#8d8d8d}'
    + '.dm-f{padding:12px 20px calc(12px + env(safe-area-inset-bottom));border-top:.5px solid rgba(255,255,255,.14)}'
    + '.dm-f a{display:block;padding:14px;border-radius:14px;background:#fff;color:#000;font-size:17px;line-height:22px;font-weight:600;text-align:center;text-decoration:none}.dm-f a:active{opacity:.7}'
    + '.dm-s section>*{opacity:0;transform:translateY(16px);transition:opacity .5s ease,transform .6s cubic-bezier(.2,.9,.25,1)}'
    + '.dm.on .dm-s section.in>*{opacity:1;transform:none}.dm-s section.in>:nth-child(2){transition-delay:.07s}.dm-s section.in>:nth-child(3){transition-delay:.14s}.dm-s section.in>:nth-child(4){transition-delay:.2s}.dm-s section.in>:nth-child(n+5){transition-delay:.26s}'
    + '@media (prefers-reduced-motion:reduce){.dm,.dm-bg,.dm-p,.dm-s section>*{transition:none}.dm-s section>*{transform:none}}'
    + '@keyframes invin{from{opacity:0;transform:translateY(14px) scale(.96)}}'
    + '@media (prefers-reduced-motion:reduce){.inkt,.inkc{transition:none}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function span(cls, text, parent) { var s = document.createElement('span'); s.className = cls; if (text) s.textContent = text; parent.appendChild(s); return s; }

  // 页内刀门介绍层：黑底海报版式（绿色只做点缀），文案取自刀门海报与价目页刀门区块
  var dm = null, from = null;
  function sheetHTML(closed) {
    var rows = [
      ['专属提问箱', '录音、混音、母带、职业方向的问题，在提问箱里提出。'],
      ['加速通道', '标准 10–12 工作日，创始会员 6–9 工作日，最快一周交付。同一单里只要有一位创始会员，整单都走加速。'],
      ['混音终身 8 折', '混音标准交付价与制作人费终身 8 折（不含录音；加急附加费不在折扣范围）。自 2027 年 1 月 1 日起，每单会员折扣合计最多减 ¥300。'],
      ['持续输出', '前沿录音混音技术、工程思路、实战经验，定期更新。'],
      ['每周作品点评', '每周一次，不间断。练习作品、demo、已发布单曲、商业项目均可交流。']
    ].map(function (r) { return '<div class="dm-r"><h3>' + r[0] + '</h3><p>' + r[1] + '</p></div>'; }).join('');
    var join = closed
      ? '<div class="dm-lb">入会通道</div><div class="dm-j"><div><strong>已关闭</strong><span>刀门不再接受新成员。<br>已加入的创始会员，全部权益终身有效。</span></div></div>'
      : '<div class="dm-lb">加入方式</div><div class="dm-j"><em>01</em><div><strong>' + FEE + ' / 人</strong><span>下单时选择「本单加入」<br>终身有效<br>2027 年 1 月 1 日关闭入会通道</span></div></div>';
    return '<div class="dm-bg" data-x></div><div class="dm-p" role="dialog" aria-modal="true" aria-label="刀门介绍" tabindex="-1">'
      + '<button type="button" class="dm-x" data-x aria-label="关闭">×</button><div class="dm-s">'
      + '<section class="dm-c"><svg class="dm-logo" width="54" height="34" viewBox="0 0 54 34" fill="none" stroke-width="1.2" aria-hidden="true"><circle cx="17" cy="17" r="16" stroke="#fff"/><circle cx="37" cy="17" r="16" stroke="#6fb592"/></svg>'
      + '<div class="dm-mid"><div class="dm-ey">C / U MUSIC</div><h2>刀门</h2><i></i><div class="dm-sl">认真做音乐的人，<br>彼此成就的地方。</div></div>'
      + '<div class="dm-by">刀大厨 ChefDao</div></section>'
      + '<section><div class="dm-lb">关于刀门</div><p class="dm-lead">感谢一直支持刀大厨的朋友们。</p>'
      + '<p>每天都会收到不少私信提问——录音、混音、母带、职业方向。精力有限，很多问题其实需要更系统的解答，而不是碎片化的几句话。</p>'
      + '<h4>刀门，就是为此而设。</h4><p>它不是一个粉丝群，而是认真做音乐的人彼此成就的地方。问题会被认真对待，时间也能花在真正需要的人身上。</p></section>'
      + '<section><div class="dm-lb">创始会员权益</div>' + rows + '</section>'
      + '<section>' + join + '</section>'
      + '<section><p class="dm-lead">正在做作品、想突破混音瓶颈，或需要专业方向建议，刀门提供长期而稳定的陪伴与指导。</p><div class="dm-by">刀大厨 ChefDao</div></section>'
      + '</div><div class="dm-f"><a href="' + URL_ + '#svc-daomen" target="_blank" rel="noopener">网站查看详情</a></div></div>';
  }
  // 滚到哪一段，哪一段淡入上移
  function reveal() {
    var S = dm.querySelectorAll('.dm-s section');
    if (!window.IntersectionObserver) { [].forEach.call(S, function (x) { x.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { root: dm.querySelector('.dm-s'), rootMargin: '0px 0px -40px 0px' });
    [].forEach.call(S, function (x) { io.observe(x); });
  }
  function hide() {
    if (!dm || !dm.classList.contains('on')) return;
    dm.classList.remove('on'); if (from && from.focus) from.focus({ preventScroll: true });
  }
  // 手机返回手势只收起介绍层，不离开私信页
  function close() { if (history.state && history.state.dm) history.back(); else hide(); }
  function open() {
    if (dm && dm.classList.contains('on')) return;
    if (!dm) {
      dm = document.createElement('div'); dm.className = 'dm'; document.body.appendChild(dm);
      dm.addEventListener('click', function (e) { if (e.target.hasAttribute('data-x')) close(); });
      addEventListener('popstate', hide);
      addEventListener('keydown', function (e) { if (e.key === 'Escape' && dm.classList.contains('on')) close(); });
    }
    from = document.activeElement; if (from && from.blur) from.blur();
    dm.innerHTML = sheetHTML(new Date() >= CLOSE);
    history.pushState({ dm: 1 }, '');
    dm.offsetWidth; dm.classList.add('on'); reveal();
    dm.querySelector('.dm-p').focus({ preventScroll: true });
  }

  function invite(b) {
    b.classList.add('invite');
    span('inv-av', '', b); span('inv-t', '刀门邀请', b); span('inv-s', 'ChefDao 会员 · 系统消息', b);
    var l = span('inv-l', '', b);
    ['专属提问箱', '混音与制作人费 8 折', '加速通道 · 交付快一周', '终身有效 · 下单时选择「本单加入」'].forEach(function (t) { span('', t, l); });
    var a = document.createElement('a'); a.className = 'inv-go'; a.href = URL_; a.setAttribute('role', 'button'); a.textContent = '查看详情'; b.appendChild(a);
    var down = 0;   // 长按是点表情回应，不打开介绍层
    b.addEventListener('pointerdown', function () { down = Date.now(); });
    b.addEventListener('click', function (e) { e.preventDefault(); if (!down || Date.now() - down < 400) open(); down = 0; });
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
