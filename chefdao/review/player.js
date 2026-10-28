// 审听页共用逻辑：密码解锁 → 解密音频/token → 波形播放 → 时间点评论 → 一键推送到刀大厨微信
(() => {
const S = window.SONG;
const $ = s => document.querySelector(s);
const fmt = t => { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
const esc = x => x.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const store = {
  get(k) { try { return localStorage.getItem(k) } catch (e) { return null } },
  set(k, v) { try { localStorage.setItem(k, v) } catch (e) {} },
  del(k) { try { localStorage.removeItem(k) } catch (e) {} },
};
const PW_KEY = 'review:pw:' + S.slug;
// 软刷新：上传 / 删除 / 调序之后不再露出解锁页和进场动画——淡出 → 重载 → 直接回到刚才的版本、播放位置和滚动位置，再淡入
function softReload(ver) {
  try { sessionStorage.setItem('review:quick', JSON.stringify({ s: S.slug, play: !a.paused, ver: ver || (cur && cur.ver), t: ver ? 0 : curTime(), y: scrollY })); } catch (e) {}
  document.body.style.transition = 'opacity .16s'; document.body.style.opacity = '0'; setTimeout(() => location.reload(), 170);
}
function quickRestore() {
  const q = QSTATE; if (!q) return; QSTATE = null;
  const go = async () => { try { const i = q.ver ? V.findIndex(v => v.ver === q.ver) : -1; if (i >= 0 && i !== vi) await switchTo(i); if (q.t > 0) seek(q.t); if (q.y) scrollTo(0, q.y); } catch (e) {} };
  if (a.readyState >= 1) setTimeout(go, 200); else a.addEventListener('loadedmetadata', () => setTimeout(go, 150), { once: true });
}
// 从播放列表切过来的：不出解锁页和任何进场动画，直接进播放页（之前在播就接着播）
let QUICK = false, QUICK_PLAY = false, QSTATE = null;   // QSTATE：软刷新前的版本 / 位置 / 滚动，刷新后接着回到那里
try { const q = JSON.parse(sessionStorage.getItem('review:quick') || 'null'); sessionStorage.removeItem('review:quick');
  if (q && q.s === S.slug) { QUICK = true; QUICK_PLAY = !!q.play; QSTATE = q; document.documentElement.classList.add('quick'); } } catch (e) {}
if (QUICK) document.body.style.animation = 'qfade .3s ease both';   // 软刷新 / 切歌回来：淡入
const noQuick = () => { QUICK = false; document.documentElement.classList.remove('quick'); };
const cdate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); return m ? (+m[2]) + '月' + (+m[3]) + '日' : d; };
const REFV = S.versions.find(v => v.ver === 'REF') || null;   // 你发给客户的参考曲
const V = S.versions.filter(v => v.ver !== 'REF');
// 版本名精简：「舞步 Edit @ChefDao_V2_1018」→「编辑 V2」；按文件名里的 Edit / Mix / Master 分阶段，编辑在前、混音在后
const STAGE = { edit: '编辑', mix: '混音', master: '母带' };
const stageOf = v => { if (v.stage) return v.stage === 'none' ? '' : v.stage;   // 手动改过类别的优先
  const f = String(v.file || '').replace(/@ChefDao.*$/i, '').replace(/_/g, ' ');
  if (/\bpre-?master/i.test(f)) return 'mix';
  const m = /(?<![A-Za-z])(Edit|Mix|Master)(?![A-Za-z])/i.exec(f); return m ? m[1].toLowerCase() : ''; };   // Mix1、Mix 1、Mix_1 都认
// 显示名：有阶段的按阶段内第几个数（混音 1、混音 2），没阶段的用 V 号。内部编号 V1、V2 全局唯一，评论、统计都按它认
// 按阶段排：编辑在前、混音、母带在后；同阶段保持上传先后（排序稳定）。这样同阶段的版本总是连在一起分组
{ const rank = { '': 0, edit: 1, mix: 2, master: 3 }, at = new Map(V.map((v, i) => [v, i]));
  V.sort((x, y) => rank[stageOf(x)] - rank[stageOf(y)] || (x.ord || 1e3 + at.get(x)) - (y.ord || 1e3 + at.get(y))); }
const vlab = v => { const st = stageOf(v); return STAGE[st] ? String(V.filter(x => stageOf(x) === st).indexOf(v) + 1) : v.ver; };
const vname = v => (STAGE[stageOf(v)] ? STAGE[stageOf(v)] + ' ' : '') + vlab(v);
const multiStage = new Set(V.map(stageOf)).size > 1;
let vi = V.length - 1, cur = V[vi];                       // 当前版本，默认最新
const dataKey = i => 'review:' + S.slug + ':' + V[i].ver.toLowerCase();

// CU MUSIC 双圆标志（和官网首页同一个）：下载进度 0→60% 画外圈，40→100% 画内圈
const MARK = '<svg class="cumark" viewBox="272 164 456 456" aria-hidden="true"><path class="r0" pathLength="1" d="M 592.06,203.25 A 210,210 0 1 1 407.94,203.25"/><path class="r0 r0b" pathLength="1" d="M 619.61,478.90 A 147.84,147.84 0 1 1 619.61,305.10"/>'
  + '<path class="r1" pathLength="1" d="M 592.06,203.25 A 210,210 0 1 1 407.94,203.25"/><path class="r2" pathLength="1" d="M 619.61,478.90 A 147.84,147.84 0 1 1 619.61,305.10"/></svg>';
const clamp01 = x => Math.max(0, Math.min(1, x));
const mb = n => (n / 1048576).toFixed(1);
// 官网同款节奏：外圈 0.1s 起、内圈 0.5s 起，各画 1.9s，曲线 cubic-bezier(.45,.05,.15,1)
function bez(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = t => ((ax * t + bx) * t + cx) * t, Y = t => ((ay * t + by) * t + cy) * t, dX = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => { let t = x; for (let i = 0; i < 6; i++) { const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= (X(t) - x) / d; } return Y(Math.max(0, Math.min(1, t))); };
}
const EASE = bez(.45, .05, .15, 1), TL = 2.4;
function paintMark(box, u) {
  const tt = u * TL;
  box.querySelector('.r1').style.strokeDashoffset = 1 - EASE(clamp01((tt - .1) / 1.9));
  box.querySelector('.r2').style.strokeDashoffset = 1 - EASE(clamp01((tt - .5) / 1.9));
}
// 按固定时值画；下载跟不上时平滑减速、停在下载进度前面一点等它；下载完再按原速画完。返回画完的 Promise
// 下一帧：正常用 requestAnimationFrame；页面在后台、帧不来时 60ms 后用定时器补上，解锁不会卡住
function next(cb) {
  let fired = false;
  requestAnimationFrame(t => { if (!fired) { fired = true; cb(t); } });
  setTimeout(() => { if (!fired) { fired = true; cb(performance.now()); } }, 60);
}
function runMark(box, state) {
  let u = 0, last = 0;
  return new Promise(done => {
    const step = now => {
      const dt = last ? Math.min(.05, (now - last) / 1000) : 0; last = now;
      const cap = state.done ? 1 : Math.min(.92, state.p + .12);
      const room = cap - u, base = dt / TL * (state.fast ? 2 : 1);
      u = Math.min(cap, u + base * Math.max(.06, Math.min(1, room * 5)));
      paintMark(box, u);
      if (u >= 1) return done();
      next(step);
    };
    next(step);
  });
}
document.body.innerHTML = `
<div class="lock" id="lock">
  <div class="art lmark intro">${MARK}</div>
  <h1 id="lt" class="scr" aria-label="CU MUSIC"></h1>
  <div class="by" id="by">CU MUSIC</div>
  <div class="ask" id="ask">输入密码收听</div>
  <div class="dots" id="dots"><i></i><i></i><i></i><i></i></div>
  <div class="spin"></div>
  <div class="dl" id="dl"><div class="dlt" id="dlt">音频下载中</div></div>
  <input class="pin" id="pin" type="tel" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" aria-label="密码">
</div>

<main class="app" id="app" aria-hidden="true">
  <header class="head">
    <div class="art"></div>
    <div>
      ${S.project && S.project.title !== S.title ? `<a class="pjb" href="${esc(S.project.url)}">‹ ${esc(S.project.title)}</a>` : ''}
      <h1 id="vfile">${esc(S.title)}</h1>${S.artist ? `<div class="hart">${esc(S.artist)}</div>` : ''}
      <div class="meta" id="vmeta"></div>
    </div>
  </header>
  ${(() => {   // 进度：项目页里改的阶段，这里只显示
    const g = S.prog; if (!g || !(g.s >= 0)) return '';
    const BAR = [0, 1, 2, 3, 4, 5, 3, 4], cur = BAR[g.s] ?? 0;   // 人声制作并入混音、修改中并入审听：来回修改进度条不后退
    const ST = ['待付款', '准备中', '编辑中', g.s === 6 ? '人声制作中' : '混音中', g.s === 7 ? '修改中 · 第 ' + (g.r || 1) + ' 轮' : g.s === 4 && g.r ? '待审听 · 第 ' + (g.r + 1) + ' 轮' : '待审听', '已交付'];
    return `<div class="sprog"><div class="spbar">${ST.map((n, i) => `<span class="${i < cur ? 'd' : i === cur ? 'c' : ''}"><i></i>${n}</span>`).join('')}</div>`
      + (g.s !== 5 && g.due ? `<div class="spdue">预计 ${cdate(g.due)} 交付</div>` : '') + '</div>';
  })()}
  <section class="vpick" id="seg"${V.length > 1 ? '' : ' hidden'}>${(() => {
    // 版本选择：按阶段一组一排小按钮「编辑 V1 V2 · 混音 V3」，当前版本高亮
    const groups = [];
    V.forEach((v, i) => { const st = stageOf(v); if (!groups.length || groups[groups.length - 1].st !== st) groups.push({ st, items: [] }); groups[groups.length - 1].items.push(i); });
    // 到了后面的阶段，前面阶段的版本收成一颗药丸「编辑 · 6 版」，点开才展开；当前阶段永远是展开的
    const RK = { '': 0, edit: 1, mix: 2, master: 3 }, top = Math.max(...groups.map(g => RK[g.st]));
    return groups.map(g => { const old = STAGE[g.st] && RK[g.st] < top;
      return `<div class="vg${old ? ' old' : ''}">${STAGE[g.st] ? `<span class="vgl">${STAGE[g.st]}</span>` : ''}${old ? `<button class="vsum press" aria-expanded="false">${g.items.length} 版<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>` : ''}${g.items.map(i =>
      `<button class="vrow press" data-i="${i}"><span class="vn">${esc(vlab(V[i]))}</span><span class="hasdot"></span></button>`).join('')}</div>`; }).join('') + `<button class="vtog press" id="vtog" aria-expanded="false" aria-controls="vlist">展开<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>`;
  })()}</section>
  <section class="vlist" id="vlist" hidden></section>

  <div class="own" id="own" hidden><span id="ownT">拖音频文件到页面任意位置，上传为新版本</span><button class="press" id="ownPart">＋ 段落</button><button class="press" id="ownColors">歌手颜色</button><button class="press" id="ownBpm">测 BPM</button><button class="press" id="ownShareP" hidden>分享项目</button><button class="press" id="ownShare">分享</button><button class="press" id="ownPick">选择文件</button><input type="file" id="ownFile" accept="audio/*,.m4a,.mp3,.wav,.aif,.aiff" hidden></div>
  <div class="parts" id="parts" hidden></div>
  <div class="wave" id="wave"><canvas></canvas><div class="tip">0:00</div><div class="loading" id="loading">正在加载音频…</div></div>
  <div class="times"><span id="cur">0:00</span><span class="pnow" id="pnow"></span><span id="rem">-${fmt(cur.duration)}</span></div>
  <div class="transport">
    <button class="skip press" id="back" aria-label="后退 5 秒"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 3.5v3.7h3.7"/></svg><span>5</span></button>
    <button class="playbtn press" id="play" aria-label="播放" disabled>
      <svg class="pl" viewBox="0 0 24 24"><path d="M8 5.2v13.6c0 .8.9 1.3 1.6.9l10.6-6.8c.6-.4.6-1.4 0-1.8L9.6 4.3C8.9 3.9 8 4.4 8 5.2z"/></svg>
      <svg class="pa" viewBox="0 0 24 24"><rect x="6" y="4.5" width="4.2" height="15" rx="1.3"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.3"/></svg>
    </button>
    <button class="skip press" id="fwd" aria-label="前进 5 秒"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M20 3.5v3.7h-3.7"/></svg><span>5</span></button>
  </div>
  <div class="loudrow"><button class="loud press" id="loud" aria-pressed="false">响度统一<span id="loudv"></span></button>
    <div class="ab" id="ab"><button class="press on" id="abMix">混音</button><button class="press" id="abRef">REF</button></div>
    <button class="loud press" id="cmp"${V.length < 2 ? ' hidden' : ''}>对比上一版</button><button class="loud press" id="refPick">＋ 加 REF</button><button class="loud press" id="loopBtn" aria-pressed="false">循环</button><button class="loud press" id="snapBtn" aria-pressed="false" title="点波形、设循环都落在小节线上；点段落只循环这一段">吸附</button><button class="loud press" id="mstBtn" aria-pressed="false">数据</button><input type="file" id="refFile" accept="audio/*,.m4a,.mp3,.wav,.aif,.aiff" hidden></div>
  <div class="refname" id="refName" hidden></div>
  <section class="mst" id="mst" hidden></section>
  <aside class="plist" id="plist" hidden></aside>
  <section class="fee" id="fee" hidden></section>

  <div class="sect">评论<button class="mename press" id="meName"></button><span class="r" id="tipline">听到想改的地方，直接写</span></div>
  <div class="composer">
    <span class="stamp" id="stamp"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg><span id="stampT">0:00</span></span>
    <textarea id="txt" rows="1" placeholder="留下评论…"></textarea>
    <button class="send" id="add" aria-label="添加评论"><svg viewBox="0 0 24 24"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg></button>
  </div>
  <div class="chips" id="chips"></div>

  <div class="sect">我的评论<span class="n" id="n">0</span></div>
  <div class="group" id="list"></div>
  <div class="empty" id="empty">还没有评论，播放时随时写下来</div>
  <section id="cfb" hidden><div class="sect">客户评论<button class="cgrp press" id="cgrp" aria-pressed="false">按歌手</button><span class="r" id="cfn"></span></div><div class="group" id="cfl"></div></section>

  <div class="sect">整体感觉</div>
  <textarea class="overall" id="overall" rows="3" placeholder="可选。例如：整体再亮一点，鼓再有力一点"></textarea>
</main>

<div class="dock">
  <div class="mini" id="mini">
    <button class="mpp press" id="mpp" aria-label="播放/暂停">
      <svg class="pl" viewBox="0 0 24 24"><path d="M8 5.2v13.6c0 .8.9 1.3 1.6.9l10.6-6.8c.6-.4.6-1.4 0-1.8L9.6 4.3C8.9 3.9 8 4.4 8 5.2z"/></svg>
      <svg class="pa" viewBox="0 0 24 24"><rect x="6" y="4.5" width="4.2" height="15" rx="1.3"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.3"/></svg>
    </button>
    <div class="mbody"><div class="mrow"><span class="mt" id="mt">${esc(S.title)} · ${esc(cur.ver)}</span><span class="mtime" id="mtime">0:00</span></div><div class="mbar" id="mbar"><i id="mfill"></i></div></div>
  </div>
  <button class="cta" id="cta"><svg viewBox="0 0 24 24"><path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5 21 3z"/></svg><span id="ctaT">发送给刀大厨</span><span class="badge" id="badge">0</span></button></div>
<div class="hud" id="hud"></div>
<audio id="a" preload="auto"></audio>`;

const a = $('#a');
let PUSH = '', WK = '', notes = [], locked = null;
// 刀大厨对评论的回复 / 完成标记：键 = 版本|时间点(0.1 秒)|内容
let REPLIES = new Map();
let MSGS = [];   // 评论下的对话 [{ ver, t, m, who: 'c'|'o', text, ts }]
let ONOTES = [];   // 刀大厨自己的评论（歌手端显示，来自 /cr）
const IS_OWNER = !!store.get('insights:key');
const rk = (ver, t, m) => ver + '|' + (Math.round(t * 10) / 10) + '|' + m;
const API_BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:8787' : 'https://stats.cumusic.work';

/* ───────── 加解密 ───────── */
const OPEN = 'cu-open';   // 不设密码的歌用这个公开口令加密
async function keyFor(pw, salt = S.salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw || OPEN), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: ub64(salt), iterations: S.iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}
const open = (key, u8) => crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(0, 12) }, key, u8.subarray(12));
// 先当这首歌的密码试；不对再当项目密码试，用项目密钥解出这首歌自己的密码
const PJ_KEY = S.project ? 'review:pj:' + S.project.slug : '';
async function songKey(pw) {
  let key = await keyFor(pw);
  try { await open(key, ub64(S.check)); return { key, pw }; } catch (e) {}
  const P = S.project; if (!P || !P.wrap || !P.salt) throw new Error('pw');
  const pk = await keyFor(pw, P.salt);
  await open(pk, ub64(P.check));
  const spw = new TextDecoder().decode(await open(pk, ub64(P.wrap)));
  key = await keyFor(spw); await open(key, ub64(S.check));
  store.set(PJ_KEY, pw);
  return { key, pw: spw };
}

/* ───────── 歌名：第一次输密码时先是模糊的，每输一位清楚一点；密码对了、要进入播放页的那一刻，快速闪一下乱码解出歌名 ─────────
   记住过密码的设备再打开，歌名直接清晰显示，不做这些效果 */
const scr = (() => {
  const el = document.getElementById('lt'), T = [...S.title], first = !store.get(PW_KEY);
  const HAN = '的一是不了人我在有他这中大来上国个到说们为子和你地出道也时年得就那要下以生会自着去之过家学对可她里后小么心多天而能好都然没日于起还发成事只作当想看文无开手十用主行方又如前所本见经头面公同三已老从动两长知民样现分将外但身些与高意进把法此实回二理美点月明社其声音乐曲光风夜梦雨星海',
    LAT = 'ABCDEFGHJKLMNPQRSTUVWXYZ', NUM = '0123456789';
  const pool = ch => /[㐀-鿿豈-﫿]/.test(ch) ? HAN : /[0-9]/.test(ch) ? NUM : /[A-Za-z]/.test(ch) ? LAT : '';
  const rnd = ch => { const p = pool(ch); return p ? p[Math.floor(Math.random() * p.length)] : ch; };
  el.textContent = S.title;
  const blur = px => el.style.setProperty('--b', px + 'px');
  if (first) { el.classList.add('bl'); blur(12); }
  const nudge = () => { el.classList.remove('nd'); void el.offsetWidth; el.classList.add('nd'); };
  return {
    level(n) { if (first) { blur([12, 9, 6, 4, 3][n] ?? 3); nudge(); } },
    fail() { if (first) { blur(12); nudge(); } },
    decode() {   // 约 0.3 秒：去掉模糊，每个字快闪几下定格
      if (!first) return Promise.resolve();
      el.classList.remove('bl'); el.removeAttribute('aria-label'); el.textContent = '';
      const spans = T.map(ch => { const s = document.createElement('span'); s.textContent = rnd(ch); el.appendChild(s); return s; });
      return new Promise(done => {
        let left = spans.length;
        spans.forEach((s, i) => {
          let n = 0;
          const go = () => { if (n++ < 3) { s.textContent = rnd(T[i]); setTimeout(go, 40); } else { s.textContent = T[i]; s.classList.add('ok'); if (!--left) done(); } };
          setTimeout(go, i * 45);
        });
        if (!left) done();
      });
    },
  };
})();

/* ───────── 解锁 ───────── */
const pin = $('#pin'), dots = [...document.querySelectorAll('#dots i')];
const focusPin = () => pin.focus({ preventScroll: true });
$('#dots').onclick = focusPin; $('#lock').onclick = focusPin;
// 手机键盘弹出时，iOS 不会缩小 fixed 的解锁页，密码点会被键盘挡住：跟着可见区域缩，内容整体上移
if (window.visualViewport) {
  const vv = window.visualViewport;
  const fit = () => {
    const L = document.getElementById('lock'); if (!L) return;
    const kb = vv.height < window.innerHeight - 120;
    L.classList.toggle('kb', kb);
    // 一直用像素值写高度，这样键盘升降时 CSS 过渡才能生效（auto 和 px 之间不会有动画）
    L.style.bottom = 'auto'; L.style.height = vv.height + 'px'; L.style.top = vv.offsetTop + 'px';
  };
  vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit();
}
pin.addEventListener('input', () => {
  pin.value = pin.value.replace(/\D/g, '').slice(0, 4);
  dots.forEach((d, i) => d.classList.toggle('on', i < pin.value.length));
  scr.level(pin.value.length);   // 每输一位，乱码稳定一点
  $('#ask').classList.remove('err'); $('#ask').textContent = '输入密码收听';
  if (pin.value.length === 4) tryUnlock(pin.value, true);
});
async function tryUnlock(pw, typed) {
  $('#lock').classList.add('busy'); pin.blur();
  try {
    const { key, pw: spw } = await songKey(pw);           // 密码错会在这里抛错
    store.set(PW_KEY, spw); if (PJ_KEY && pw) store.set(PJ_KEY + ':last', pw); accessPing(1);   // 同项目切到下一首时先试这个
    document.title = S.title;
    if (S.token) PUSH = new TextDecoder().decode(await open(key, ub64(S.token)));
    if (S.wkey) WK = new TextDecoder().decode(await open(key, ub64(S.wkey)));
    if (QUICK) { enterApp(true); loadAudio(key); clientFb(); ownerTools(); loadReplies(); quickRestore(); return; }
    splash();
    if (S.artist) { const by = $('#by'); by.classList.add('hi'); by.textContent = '欢迎，' + S.artist; }
    const minWait = new Promise(r => setTimeout(r, typed ? 900 : 650));
    await Promise.all([loadAudio(key), minWait]);
    await scr.decode();   // 进入前一刻才解出歌名，解完马上进
    enterApp();
    clientFb();
    ownerTools();
    loadReplies();
  } catch (e) {
    $('#lock').classList.remove('busy');
    store.del(PW_KEY);
    if (!typed && tries.length) return tryUnlock(tries.shift(), false);
    noQuick();   // 自动解锁都没成：露出解锁页让客户输密码   // 记住的密码不对（比如项目改过密码）：换下一个记住的试
    scr.fail();
    if (typed) {
      $('#ask').textContent = '密码不对，再试一次'; $('#ask').classList.add('err');
      const d = $('#dots'); d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake');
      if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
    }
    setTimeout(() => { pin.value = ''; dots.forEach(x => x.classList.remove('on')); focusPin(); }, typed ? 420 : 0);
  }
}
function splash() {
  const L = $('#lock'); L.classList.remove('busy'); L.classList.add('splash');
}
function prefetchOthers() {
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  // 离当前版本越近越先：下载（或读本地缓存）+ 解密成可以直接播的音频，切版本不用等
  const order = V.map((v, i) => i).filter(i => i !== vi).sort((x, y) => Math.abs(x - vi) - Math.abs(y - vi) || y - x).slice(0, 6);
  (async () => { for (const i of order) { try { await fetchVersion(i); } catch (e) {} } })();
}
// 项目封面：页头那块方形封面换成项目的封面图
if (S.cover) { const art = document.querySelector('#app .head .art'); if (art) art.style.backgroundImage = 'url(' + API_BASE + S.cover + ')'; }
if (S.cover) { const sc = document.createElement('script'); sc.src = '../tint.js?v=20261025d'; sc.onload = () => window.cuTint(API_BASE + S.cover); document.head.appendChild(sc); }
/* ───────── 费用：每位歌手自己选人声制作和音频编辑，点「确定」；每人各付各的，定金 / 尾款各一半。收了这个人的定金，他的选择就锁定 ───────── */
let Q = S.quote || null, feeOpen = null, feeOwner = null, feeOwnerP = null;
const yuan = n => '¥' + n.toLocaleString('en-US');
const hasFix = p => p.fix !== undefined && p.fix !== null;   // 单独报价（例如只做母带），不按菜单选
const pPrice = p => hasFix(p) ? p.fix : Q.menu.base + Q.menu.vocal[p.v][1] + Q.menu.edit[p.e][1];
function renderFee() {
  const el = $('#fee'); if (!Q) { el.hidden = true; el.innerHTML = ''; return; }
  const half = p => { const t = pPrice(p), d = Math.min(t, p.da ?? Math.round(t / 2)); return [d, t - d]; };
  const total = Q.people.reduce((s, p) => s + pPrice(p), 0), n = Q.people.length;
  const got = Q.people.reduce((s, p) => { const [d, f] = half(p); return s + (p.dep ? d : 0) + (p.fin ? f : 0); }, 0);
  const done = Q.people.filter(p => p.ok).length, paid = Q.people.filter(p => p.dep).length;
  if (feeOpen === null) feeOpen = done < n;
  const st = Q.people.every(p => p.fin) ? '已结清' : '已确认 ' + done + ' / ' + n + ' 位' + (paid ? ' · 定金已收 ' + paid + ' 位' : '');
  const opt = (k, i, j, lk) => Q.menu[k].map((o, x) => `<button class="fo${x === j ? ' on' : ''}" data-k="${k}" data-i="${i}" data-x="${x}"${lk ? ' disabled' : ''}>${esc(o[0])}${o[1] ? `<i>+${o[1]}</i>` : ''}</button>`).join('');
  // 确定了就可以付这个人的定金，不用等别人；定金收了再显示尾款
  const pay = p => { const [d, f] = half(p);
    const dc = p.dep ? 'on' : p.ok ? 'due' : '', fc = p.fin ? 'on' : p.dep ? 'due' : '';
    return `<div class="fpay"><span class="${dc}">定金 ${yuan(d)}${p.dep ? ' · 已收' : p.ok ? ' · 待付' : ''}</span><span class="${fc}">尾款 ${yuan(f)}${p.fin ? ' · 已收' : p.dep ? ' · 交付时付' : ''}</span></div>`; };
  const desc = o => o[2] ? `<div class="fd">${esc(o[2])}</div>` : '';
  el.hidden = false; el.classList.toggle('open', feeOpen);
  el.innerHTML = `<button class="fh press" id="feeH"><span>费用</span><b>${yuan(total)}</b><em>${st}</em><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button><div class="fb">`
    + Q.people.map((p, i) => hasFix(p) ? `<div class="fp ok"><div class="fn"><b>${esc(p.n)}</b><span>${yuan(pPrice(p))}</span></div>${pay(p)}
      <div class="fl">服务</div><div class="fg"><span class="fo on">${esc(p.fixn)}</span></div>${feeOwnerP ? feeOwnerP(p, i) : ''}</div>`
      : `<div class="fp${p.ok ? ' ok' : ''}"><div class="fn"><b>${esc(p.n)}</b><span>${yuan(pPrice(p))}</span></div>${pay(p)}
      <div class="fl">人声制作</div><div class="fg">${opt('vocal', i, p.v, p.dep)}</div>${desc(Q.menu.vocal[p.v])}
      <div class="fl">音频编辑</div><div class="fg">${opt('edit', i, p.e, p.dep)}</div>${desc(Q.menu.edit[p.e])}
      ${p.dep ? '' : `<button class="fok press" data-ok="${i}"${p.ok ? ' disabled' : ''}>${p.ok ? '已确定 ✓' : '确定'}</button>`}${feeOwnerP ? feeOwnerP(p, i) : ''}</div>`).join('')
    + `<div class="ft"><div><span>基础混音</span><b>${yuan(Q.menu.base)} / 人</b></div><div><span>每人定金（开工）/ 尾款（交付）</span><b>各一半</b></div><div><span>合计</span><b>${yuan(total)}</b></div>${got ? `<div><span>已收</span><b>${yuan(got)}</b></div>` : ''}</div>`
    + (Q.note ? `<div class="fnote">${esc(Q.note)}</div>` : '') + `<a class="fx" href="https://cumusic.work/chefdao/price" target="_blank" rel="noopener">价格明细 ›</a>`
    + (feeOwner ? feeOwner(total) : '') + '</div>';
}
$('#fee').addEventListener('click', async e => {
  if (e.target.closest('#feeH')) { feeOpen = !feeOpen; return renderFee(); }
  const o = e.target.closest('.fo');
  if (o && !Q.people[+o.dataset.i].dep) { const p = Q.people[+o.dataset.i]; p[o.dataset.k === 'vocal' ? 'v' : 'e'] = +o.dataset.x; p.ok = false; return renderFee(); }
  const ok = e.target.closest('[data-ok]'); if (!ok || !WK) return;
  const i = +ok.dataset.ok, p = Q.people[i]; ok.disabled = true; ok.textContent = '保存中…';
  try {
    const j = await (await fetch(API_BASE + '/qpick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: WK, slug: S.slug, i, v: p.v, e: p.e }) })).json();
    if (j.quote) Q = j.quote;
    if (j.ok) beacon(S.title + ' · ' + p.n + ' 确认费用', '<p><b>' + esc(meLabel()) + '</b> 确认了 <b>' + esc(p.n) + '</b>：' + esc(Q.menu.vocal[p.v][0]) + ' / ' + esc(Q.menu.edit[p.e][0]) + ' · ' + yuan(pPrice(p)) + '</p><p>《' + esc(S.title) + '》</p>');
  } catch (err) {}
  renderFee();
});
// 播放列表：同一个项目里的其他曲目（cypher 一首接一首），点了直接切过去（项目密码记着，不用再输）
async function loadPlaylist() {
  if (!S.project) return;
  try {
    const j = await (await fetch(API_BASE + '/pj?s=' + S.project.slug + '&tok=' + (store.get('review:tok') || ''), { cache: 'no-store' })).json();
    const T = j.ok ? j.project.tracks : []; if (T.length < 2) return;
    const el = $('#plist');
    // 本曲歌手的歌排最前（当前这首置顶），其他歌手的放后面；没标歌手就按项目顺序
    const names = String(S.artist || '').split(/[、,，\/]/).map(x => x.trim().toLowerCase()).filter(Boolean);
    const same = t => names.length && String(t.artist || '').split(/[、,，\/]/).some(x => names.includes(x.trim().toLowerCase()));
    const row = (t, i) => `<a class="pli press${t.slug === S.slug ? ' on' : ''}" href="${esc(t.url)}" data-s="${esc(t.slug)}">
      <span class="n">${String(i + 1).padStart(2, '0')}</span><span class="t">${esc(t.title)}${t.artist ? `<i>${esc(t.artist)}</i>` : ''}</span><span class="m">${fmt(t.dur)}</span></a>`;
    const idx = new Map(T.map((t, i) => [t, i])), mine = names.length ? T.filter(same) : [], rest = names.length ? T.filter(t => !same(t)) : T;
    mine.sort((x, y) => (y.slug === S.slug) - (x.slug === S.slug));
    el.innerHTML = `<button type="button" class="plh"><span>${esc(j.project.title)}</span><i>${T.length} 首<b class="plc"></b></i></button>`
      + (mine.length ? `<div class="plg">${esc(S.artist)}</div>` + mine.map(t => row(t, idx.get(t))).join('') + (rest.length ? '<div class="plg">其他</div>' : '') : '')
      + rest.map(t => row(t, idx.get(t))).join('');
    if (matchMedia('(max-width:1179px)').matches) el.classList.add('collapsed');   // 窄屏默认收起，只留一行标题；宽屏浮在右侧
    el.querySelector('.plh').onclick = () => el.classList.toggle('collapsed');
    el.hidden = false;
    el.onclick = e => {   // 同一个页面只换 # 不会刷新，手动刷新一下
      const l = e.target.closest('.pli'); if (!l) return; e.preventDefault(); if (l.classList.contains('on')) return;
      try { sessionStorage.setItem('review:quick', JSON.stringify({ s: l.dataset.s, play: !a.paused })); } catch (err) {}
      document.body.style.transition = 'opacity .14s'; document.body.style.opacity = '0';
      const u = new URL(l.href); setTimeout(() => { if (u.pathname === location.pathname) { location.hash = u.hash; location.reload(); } else location.href = u.pathname + u.hash; }, 150);
    };
  } catch (e) {}
}
function enterApp(quick) {
  setTimeout(prefetchOthers, 600);
  loadPlaylist(); renderFee();
  if (quick) {
    started = true; t0 = -1e9;   // 波形直接满格，不做长出来的动画
    $('#app').removeAttribute('aria-hidden'); $('#app').classList.add('in'); $('#lock').remove(); markSeg(); updateCta();
    requestAnimationFrame(() => requestAnimationFrame(noQuick)); return;
  }
  // FLIP：解锁页的封面平滑移动、缩放到页头封面的位置
  const L = $('#lock'), from = L.querySelector('.art'), to = $('#app .head .art');
  $('#app').removeAttribute('aria-hidden');
  [...$('#app').children].forEach((el, i) => el.style.setProperty('--i', i));
  const a1 = from.getBoundingClientRect(), a2 = to.getBoundingClientRect();
  const dx = a2.left + a2.width / 2 - (a1.left + a1.width / 2), dy = a2.top + a2.height / 2 - (a1.top + a1.height / 2);
  const k = a2.width / a1.width * (from.classList.contains('lmark') ? .62 : 1);
  to.style.opacity = 0;
  L.classList.add('leaving');
  from.style.transform = `translate(${dx}px,${dy}px) scale(${k})`;
  from.style.borderRadius = (14 / k) + 'px';
  $('#app').classList.add('in');
  if (from.classList.contains('lmark')) { to.style.transition = 'opacity .45s ease'; setTimeout(() => { to.style.opacity = ''; }, 380); }
  setTimeout(() => { to.style.opacity = ''; L.remove(); }, 700);
  markSeg(); updateCta();
}
let KEY = null;
const urls = {};
// 离线存储：加密后的音频存进浏览器缓存（文件名随机、内容不变，可以一直留着），下次打开直接读本地，不再下载
const AUDIO_CACHE = 'cu-audio-1';
const absUrl = i => new URL(V[i].audio, location.href).href;
async function cacheGet(i) {
  try { const r = await (await caches.open(AUDIO_CACHE)).match(absUrl(i)); return r ? new Uint8Array(await r.arrayBuffer()) : null; } catch (e) { return null; }
}
async function cachePut(i, u8) {
  try { await (await caches.open(AUDIO_CACHE)).put(absUrl(i), new Response(u8, { headers: { 'Content-Type': 'application/octet-stream' } })); } catch (e) {}
}
const cached = new Set();
// 格式 + 码率：由文件大小和时长算出（去掉加密的 28 字节），贴近标准档位就取整；无损格式显示 Lossless
const SIZE = {};
function fmtTag(i) {
  const v = V[i], n = SIZE[i]; if (!n || !v.duration) return '';
  const m = v.mime || 'audio/mpeg';
  if (/flac|alac|wav/.test(m)) return 'Lossless';
  const raw = n * 8 / v.duration / 1000, std = [96, 128, 160, 192, 224, 256, 320].find(k => Math.abs(raw - k) / k < .08);
  return (/mp4|aac/.test(m) ? 'AAC' : 'MP3') + ' ' + Math.round(std || raw) + 'k';
}
const READY = {};   // 已下载并解密好的版本：切过去不用等
async function fetchVersion(i, onp) {
  if (!urls[i]) urls[i] = (async () => {
    let u8 = await cacheGet(i);
    if (u8) { cached.add(i); if (onp) onp(1, u8.length, u8.length); }
    else {
    const r = await fetch(V[i].audio);
    const total = +r.headers.get('Content-Length') || 0;
    if (r.body && total && onp) {   // 边下边报进度
      const rd = r.body.getReader(), parts = []; let got = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onp(got / total, got, total); }
      u8 = new Uint8Array(got); let o = 0; for (const c of parts) { u8.set(c, o); o += c.length; }
    } else u8 = new Uint8Array(await r.arrayBuffer());
    if (!r.ok) throw new Error('HTTP ' + r.status);
    cachePut(i, u8); cached.add(i);
    }
    SIZE[i] = u8.length - 28; if (i === vi) setTimeout(showMeta, 0);
    const plain = await open(KEY, u8);
    return (READY[i] = URL.createObjectURL(new Blob([plain], { type: V[i].mime || 'audio/mpeg' })));
  })();
  try { return await urls[i]; } catch (e) { delete urls[i]; throw e; }
}
async function loadAudio(key) {
  KEY = key;
  try {
    if (a.src) return;
    if (QUICK) {   // 切歌：页面已经在了，音频在波形上显示进度，好了就能播
      const src = await fetchVersion(vi, p => { $('#loading').textContent = '正在加载音频… ' + Math.round(p * 100) + '%'; });
      a.src = src; $('#play').disabled = false; $('#loading').style.opacity = 0;
      if (QUICK_PLAY) a.play().catch(() => {});
      return;
    }
    // 解锁：暗色轮廓上的亮环按官网节奏画出来，同时下载音频；下载慢时画线跟着减速，超过 0.8 秒才显示百分比
    const L = $('#lock'), mk = L.querySelector('.lmark'), t0 = performance.now(), st = { p: 0, done: false };
    if (await cacheGet(vi) !== null) st.fast = true;   // 本地已有：标志两倍速画完，直接进
    const anim = runMark(mk, st);
    const src = await fetchVersion(vi, (p, got, total) => {
      st.p = p;
      if (performance.now() - t0 < 800) return;
      L.classList.add('dl-on'); $('#dlt').textContent = '音频下载中 ' + Math.round(p * 100) + '% · ' + mb(got) + ' / ' + mb(total) + ' MB';
    });
    st.done = true; st.p = 1;
    if (L.classList.contains('dl-on')) $('#dlt').textContent = '下载完成';
    await anim;
    a.src = src;
    $('#play').disabled = false;
    $('#loading').style.opacity = 0;
  } catch (e) { $('#loading').textContent = '音频加载失败，请刷新重试'; }
}

/* ───────── 波形 ───────── */
const box = $('#wave'), cv = box.querySelector('canvas'), ctx = cv.getContext('2d');
let P = cur.peaks, P0 = P, morphAt = -1e9;
const N = P.length;
const dur = () => (isFinite(a.duration) && a.duration) || cur.duration;
let hover = null, t0 = 0, lastT = 0, lastAt = 0, started = false;
const ease = x => 1 - Math.pow(1 - x, 3);
function curTime() {                     // 播放时用时钟插值，播放头不跳
  const t = a.currentTime, now = performance.now();
  if (t !== lastT) { lastT = t; lastAt = now; }
  return a.paused ? t : Math.min(dur(), t + (now - lastAt) / 1000);
}
function amp(f, now) {                    // f: 0..N-1，带入场动画
  const i = Math.floor(f), u = f - i, j = Math.min(N - 1, i + 1);
  const m = ease(Math.min(1, Math.max(0, (now - morphAt - f / N * 160) / 420)));
  const v = (P0[i] + (P[i] - P0[i]) * m) * (1 - u) + (P0[j] + (P[j] - P0[j]) * m) * u;
  const k = Math.min(1, Math.max(0, (now - t0 - f / N * 420) / 700));
  return v * ease(k);
}
/* ───────── 段落：波形上方标出每段是谁唱（cypher），播放时高亮当前这段。你的设备上可以加、改、删 ───────── */
/* ───────── 歌手颜色：自动配（名字决定色相，同一首歌里的歌手互相错开，不重复），或用头像取色 ───────── */
const hsl2hex = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); };
const hex2h = hex => { const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx === mn) return 0; const d = mx - mn, h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
function singerColors(names, saved) {   // 返回 { 名字: '#rrggbb' }：设过的保留，没设的按名字自动配并避开已用色相
  const out = {}, used = [];
  names.forEach(n => { if (saved && /^#[0-9a-f]{6}$/i.test(saved[n] || '')) { out[n] = saved[n]; used.push(hex2h(saved[n])); } });
  names.forEach(n => { if (out[n]) return; let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360;
    for (let i = 0; i < 36 && used.some(u => hueGap(u, h) < 34); i++) h = (h + 47) % 360;
    used.push(h); out[n] = hsl2hex(h, 46, 64); });
  return out;
}
const SINGERS = singerColors(String(S.artist || '').split(/[、,，]/).map(x => x.trim()).filter(Boolean).concat((S.parts || []).map(p => p.n)).filter((x, i, a) => x && a.indexOf(x) === i), S.singers || {});
const MULTI = Object.keys(SINGERS).filter(n => !/^(intro|verse|hook|chorus|bridge|outro|pre|drop|interlude|前奏|主歌|副歌|桥段|尾奏)/i.test(n)).length > 1;   // 只有一位歌手就不分颜色
const colorOf = n => (MULTI ? SINGERS[n] || '' : '');
/* ───────── BPM 与小节：你的设备上测一次，波形标出小节线；加段落时自动吸附到小节 ───────── */
let BPM = S.bpmInfo || null;   // { bpm, off, n }
const barLen = () => BPM ? 60 / BPM.bpm * BPM.n : 0;
const snapBar = t => { if (!BPM) return t; const L = barLen(), k = Math.round((t - BPM.off) / L); return Math.max(0, Math.round((BPM.off + k * L) * 10) / 10); };
let SNAP = store.get('review:snap') === '1';   // 吸附：点波形、设循环都落在小节线上；点段落 = 只循环播放这一段
const snapT = t => (SNAP && BPM ? Math.max(0, snapBar(t)) : t);
const barDown = t => BPM ? Math.max(0, BPM.off + Math.floor((t - BPM.off) / barLen() + 1e-6) * barLen()) : t;
const barUp = t => BPM ? BPM.off + Math.ceil((t - BPM.off) / barLen() - 1e-6) * barLen() : t;
const barNo = t => BPM ? Math.floor((t - BPM.off) / barLen() + 1e-6) + 1 : 0;
// 从音频里估 BPM：能量包络 → 起音 → 自相关；再找第一拍的位置
function estimateBpm(ch, sr) {
  const hop = 512, n = Math.floor(ch.length / hop), env = new Float32Array(n);
  for (let i = 0; i < n; i++) { let e = 0; for (let j = 0; j < hop; j++) { const v = ch[i * hop + j]; e += v * v; } env[i] = Math.sqrt(e / hop); }
  const on = new Float32Array(n); for (let i = 1; i < n; i++) on[i] = Math.max(0, env[i] - env[i - 1]);
  const fps = sr / hop, lo = Math.round(fps * 60 / 180), hi = Math.round(fps * 60 / 70);
  const ac = L => { let s = 0; for (let i = L; i < n; i++) s += on[i] * on[i - L]; return s / (n - L || 1); };
  const sc = new Float64Array(hi * 4 + 2).fill(-1), get = L => (sc[L] >= 0 ? sc[L] : (sc[L] = L < n - 1 ? ac(L) : 0));
  let best = 0, bl = 0;
  for (let L = lo; L <= hi; L++) { let s = get(L) + .5 * get(2 * L) + .25 * get(4 * L); const bpm0 = 60 * fps / L; if (bpm0 < 85 || bpm0 > 175) s *= .85; if (s > best) { best = s; bl = L; } }
  if (!bl) return null;
  const y0 = get(bl - 1), y1 = get(bl), y2 = get(bl + 1), den = y0 - 2 * y1 + y2, shift = den ? .5 * (y0 - y2) / den : 0;   // 抛物线插值，BPM 不再卡在整数帧上
  const per = bl + Math.max(-.5, Math.min(.5, shift)), bpm = Math.round(60 * fps / per * 10) / 10; let bo = 0, bs = -1;
  for (let o = 0; o < Math.round(per); o++) { let s = 0; for (let i = o; i < n; i += per) s += on[Math.round(i)] || 0; if (s > bs) { bs = s; bo = o; } }
  return { bpm, off: Math.round(bo / fps * 1000) / 1000, n: 4 };
}
// 重拍对齐：找 kick（低频）第一次稳定进入的位置，把它当作第 K 小节的第一拍（常见 9 或 17），再用后面所有 kick 微调 BPM
function findKick(ch, sr, bpm0) {
  const a = 1 - Math.exp(-2 * Math.PI * 150 / sr), hop = 256, n = Math.floor(ch.length / hop), env = new Float32Array(n); let y = 0;
  for (let i = 0; i < n; i++) { let e = 0; for (let j = 0; j < hop; j++) { y += a * (ch[i * hop + j] - y); e += y * y; } env[i] = Math.sqrt(e / hop); }
  const on = new Float32Array(n); for (let i = 1; i < n; i++) on[i] = Math.max(0, env[i] - env[i - 1]);
  const fps = sr / hop, mx = Math.max(...on) || 1;
  const bestAt = (c, w) => { let b = Math.max(0, Math.round(c - w)), v = -1; for (let i = Math.max(0, Math.round(c - w)); i <= Math.min(n - 1, Math.round(c + w)); i++) if (on[i] > v) { v = on[i]; b = i; } return [b, v]; };
  const per0 = 60 * fps / bpm0, w = Math.max(2, per0 * .12);
  const S = i => { let s = 0; for (let m = 0; m < 4; m++) s += bestAt(i + m * per0, w)[1]; return s; };
  let smax = 0; for (let i = 0; i < n - per0 * 4; i += 2) smax = Math.max(smax, S(i));
  let first = -1; for (let i = 0; i < n - per0 * 4; i++) if (S(i) >= smax * .55 && on[i] > mx * .2) { first = i; break; }
  if (first < 0) return null;
  const k0 = bestAt(first, per0 * .3)[0];
  let bb = bpm0, bs = -1;   // 用 kick 把 BPM 微调到最准：以第一个 kick 为锚，看后面 64 拍落在 kick 上的总强度
  for (let b = bpm0 - 1.5; b <= bpm0 + 1.5; b += .02) { const per = 60 * fps / b; let s = 0; for (let m = 0; m < 64; m++) { const c = k0 + m * per; if (c >= n) break; s += bestAt(c, 1.5)[1]; } if (s > bs) { bs = s; bb = b; } }
  return { bpm: Math.round(bb * 100) / 100, kickT: Math.round(k0 / fps * 1000) / 1000 };
}
const KSET = [1, 5, 9, 13, 17, 25, 33];
let PARTS = (S.parts || []).slice().sort((x, y) => x.t - y.t), partNow = -2;
const partLoop = i => { if (!SNAP) return; const e = PARTS[i + 1] ? PARTS[i + 1].t : dur(); LOOP = { a: PARTS[i].t, b: e }; loopUi(); };   // 吸附开着：点段落 = 循环这一段
let onPart = i => { seek(PARTS[i].t); partLoop(i); if (a.paused && !$('#play').disabled) $('#play').click(); };
const partAt = t => { let k = -1; PARTS.forEach((p, i) => { if (p.t <= t + .05) k = i; }); return k; };
function renderParts() {
  const el = $('#parts'); el.hidden = !PARTS.length; partNow = -2;
  try { snapUi(); } catch (e) {}   // 有了段落才显示「吸附」按钮
  el.innerHTML = PARTS.map((p, i) => { const s = Math.min(1, p.t / dur()), e = Math.min(1, (PARTS[i + 1] ? PARTS[i + 1].t : dur()) / dur());
    const c = colorOf(p.n);
    return `<button class="pt press" data-i="${i}" style="left:${(s * 100).toFixed(2)}%;width:${(Math.max(0, e - s) * 100).toFixed(2)}%${c ? ';--pc:' + c : ''}" title="${esc(fmt(p.t) + ' ' + p.n)}"><span>${esc(p.n)}</span></button>`; }).join('');
}
$('#parts').addEventListener('click', e => { const b = e.target.closest('.pt'); if (b) onPart(+b.dataset.i); });
a.addEventListener('loadedmetadata', renderParts);
renderParts();
let LOOP = { a: null, b: null };   // 循环一段：点「循环」设起点，再点设终点，再点取消；快捷键 L
function draw(now) {
  if (!started && $('#app').classList.contains('in')) { started = true; t0 = now; }
  const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const mid = h / 2, H = h / 2 - 6, tt = curTime(), px = tt / dur() * w, hx = hover === null ? null : hover * w;

  // 圆角竖条波形（苹果语音备忘录式）
  const gap = 2, bw = Math.max(2, (w - gap * 120) / 120), step = bw + gap, cols = Math.floor((w + gap) / step);
  const gPlay = ctx.createLinearGradient(0, 0, 0, h); gPlay.addColorStop(0, '#f2f0ec'); gPlay.addColorStop(1, '#c9c7c3');
  for (let c = 0; c < cols; c++) {
    const x = c * step, f = (x + bw / 2) / w * (N - 1);
    const v = started ? amp(f, now) : 0;
    const bh = Math.max(3, v * H * 2);
    const cx = x + bw / 2;
    ctx.fillStyle = cx < px ? gPlay : (hx !== null && cx < hx ? '#5c5b59' : '#363635');
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, mid - bh / 2, bw, bh, bw / 2) : ctx.rect(x, mid - bh / 2, bw, bh);
    ctx.fill();
  }
  // 小节号：波形顶部标出，间隔按宽度自动取 1 / 2 / 4 / 8 / 16 小节
  if (BPM && barLen() * w / dur() > 5) { const bp = barLen() * w / dur(), st = [1, 2, 4, 8, 16, 32].find(s => bp * s >= 34) || 32, cb = barNo(tt); ctx.font = '500 10px ui-monospace,Menlo,monospace'; ctx.textBaseline = 'top';
    for (let k = 0; BPM.off + k * barLen() < dur(); k += st) { const x = (BPM.off + k * barLen()) / dur() * w; ctx.fillStyle = cb - 1 >= k && cb - 1 < k + st ? 'rgba(236,234,230,.85)' : 'rgba(236,234,230,.38)'; ctx.fillText(String(k + 1), x + 3, 1); } }
  // 小节线：每小节一条细线，每 4 小节稍亮
  if (BPM && barLen() * w / dur() > 5) { const L = barLen(); for (let k = 0, x0 = BPM.off; x0 < dur(); k++, x0 = BPM.off + k * L) { const x = Math.round(x0 / dur() * w); ctx.fillStyle = k % 4 === 0 ? 'rgba(236,234,230,.16)' : 'rgba(236,234,230,.06)'; ctx.fillRect(x, 0, 1, h); } }
  // 循环区间
  if (LOOP.a !== null) {
    const x1 = LOOP.a / dur() * w, x2 = (LOOP.b === null ? LOOP.a : LOOP.b) / dur() * w;
    ctx.fillStyle = 'rgba(236,234,230,.13)'; ctx.fillRect(x1, 0, Math.max(2, x2 - x1), h);
    ctx.fillStyle = 'rgba(236,234,230,.75)'; ctx.fillRect(x1, 0, 1.5, h); if (LOOP.b !== null) ctx.fillRect(x2 - 1.5, 0, 1.5, h);
  }
  // 段落分界线
  ctx.fillStyle = 'rgba(236,234,230,.22)';
  PARTS.forEach(p => { if (p.t > .5) { const c = colorOf(p.n); ctx.fillStyle = c ? c + 'aa' : 'rgba(236,234,230,.22)'; ctx.fillRect(Math.round(p.t / dur() * w), 0, 1.5, h); } });
  // 评论标记
  ctx.fillStyle = 'rgba(236,234,230,.95)';
  notes.forEach(o => { const x = o.t / dur() * w; ctx.beginPath(); ctx.arc(x, h - 2.5, 2.5, 0, 7); ctx.fill(); });
  if (!IS_OWNER && ONOTES.length) { ctx.fillStyle = '#3f8a68'; ONOTES.forEach(o => { if (o.ver !== cur.ver) return; const x = o.t / dur() * w; ctx.beginPath(); ctx.arc(x, h - 2.5, 3, 0, 7); ctx.fill(); }); }
  // 播放头
  if (tt > 0 || !a.paused) { ctx.fillStyle = '#ebe9e5'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px - 1, 2, 2, h - 10, 1) : ctx.rect(px - 1, 2, 2, h - 10); ctx.fill(); }

  const pk = partAt(tt); if (pk !== partNow) { partNow = pk; $('#pnow').textContent = pk >= 0 ? PARTS[pk].n : ''; $('#parts').querySelectorAll('.pt').forEach((b, i) => b.classList.toggle('on', i === pk)); }
  $('#cur').textContent = fmt(tt); $('#mfill').style.transform = 'scaleX(' + (tt / dur()) + ')'; $('#mtime').textContent = fmt(tt); $('#rem').textContent = '-' + fmt(dur() - tt);
  if (locked === null) $('#stampT').textContent = fmt(tt);
  document.body.classList.toggle('playing', !a.paused);
  requestAnimationFrame(draw);
}
const frac = e => { const r = cv.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
const seek = t => { a.currentTime = Math.min(dur(), Math.max(0, t)); lastT = a.currentTime; lastAt = performance.now(); };
const loopBtn = $('#loopBtn');
function loopUi() {
  const on = LOOP.b !== null;
  loopBtn.textContent = on ? '循环 ' + fmt(LOOP.a) + '–' + fmt(LOOP.b) + ' ×' : LOOP.a !== null ? '设终点 · 起点 ' + fmt(LOOP.a) : '循环';
  loopBtn.setAttribute('aria-pressed', on);
}
function loopStep() {                       // 无 → 设起点 → 设终点（开始循环）→ 取消
  const t0 = Math.round(curTime() * 10) / 10;
  const t = LOOP.a === null ? (SNAP && BPM ? barDown(t0) : t0) : (SNAP && BPM ? barUp(t0) : t0);   // 吸附开着：起点落在小节开头，终点落在小节末尾
  if (LOOP.b !== null) LOOP = { a: null, b: null };
  else if (LOOP.a === null) LOOP.a = t;
  else if (t - LOOP.a >= 1) { LOOP.b = t; seek(LOOP.a); if (a.paused && !$('#play').disabled) $('#play').click(); }
  else LOOP = { a: null, b: null };         // 终点离起点不到 1 秒：当作取消
  loopUi();
}
loopBtn.onclick = loopStep;
const snapBtn = $('#snapBtn');
const snapUi = () => { snapBtn.setAttribute('aria-pressed', SNAP); snapBtn.hidden = !BPM && !PARTS.length; };
snapBtn.onclick = () => { SNAP = !SNAP; store.set('review:snap', SNAP ? '1' : '0'); snapUi(); hud(SNAP ? '吸附已开：点波形落在小节线，点段落只循环这一段' : '吸附已关'); };
snapUi();
// 播放中越过终点就回到起点；手动拖到终点之后不拉回
let loopPrev = 0;
setInterval(() => {
  const t = a.currentTime;
  if (LOOP.b !== null && !a.paused && loopPrev < LOOP.b && t >= LOOP.b && t - loopPrev < 0.6) seek(LOOP.a);
  loopPrev = a.currentTime;
}, 40);
let drag = false;
cv.addEventListener('pointerdown', e => { drag = true; cv.setPointerCapture(e.pointerId); seek(snapT(frac(e) * dur())); });
box.addEventListener('pointermove', e => {
  hover = frac(e); box.classList.add('hov');
  const tip = box.querySelector('.tip'), w = cv.clientWidth;
  const near = notes.find(o => Math.abs(o.t / dur() * w - hover * w) < 7);
  tip.textContent = near ? fmt(near.t) + ' · ' + (near.m.length > 16 ? near.m.slice(0, 16) + '…' : near.m) : fmt(hover * dur()) + (BPM ? ' · 第 ' + barNo(hover * dur()) + ' 小节' : '');
  tip.classList.toggle('note', !!near);
  tip.style.left = Math.min(w - tip.offsetWidth / 2, Math.max(tip.offsetWidth / 2, hover * w)) + 'px';
  if (drag) seek(snapT(hover * dur()));
});
const unhover = () => { hover = null; box.classList.remove('hov'); };
cv.addEventListener('pointerup', e => { drag = false; if (e.pointerType !== 'mouse') unhover(); });
cv.addEventListener('pointercancel', () => { drag = false; unhover(); });
box.addEventListener('pointerleave', () => { if (!drag) unhover(); });

const toggle = () => { if ($('#play').disabled) return; a.paused ? a.play() : a.pause(); };
$('#play').onclick = toggle;
$('#back').onclick = () => seek(a.currentTime - 5);
$('#fwd').onclick = () => seek(a.currentTime + 5);
document.addEventListener('keydown', e => {
  if (/TEXTAREA|INPUT/.test(e.target.tagName)) return;
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  if (e.code === 'ArrowLeft') seek(a.currentTime - 5);
  if (e.code === 'ArrowRight') seek(a.currentTime + 5);
  if (e.code === 'KeyL' && !e.metaKey && !e.ctrlKey) loopStep();
  if (/^Digit[1-9]$/.test(e.code) && V[+e.code.slice(5) - 1]) switchTo(+e.code.slice(5) - 1);
});

/* ───────── 评论 ───────── */
const txt = $('#txt');
function loadNotes() {
  notes = []; $('#overall').value = '';
  try { const s = JSON.parse(store.get(dataKey(vi)) || '{}'); notes = s.notes || []; $('#overall').value = s.overall || ''; } catch (e) {}
}
loadNotes();
let syncT = 0;
const save = () => { store.set(dataKey(vi), JSON.stringify({ notes, overall: $('#overall').value })); markSeg();
  clearTimeout(syncT); syncT = setTimeout(() => track(vi, true), 1500); ownerPush(vi); };
// 你自己的评论默认同步给歌手：每次改动后把这个版本的评论整批发到服务端（歌手输对密码后在评论区看到「刀大厨」）
let ownT = {};
function ownerPush(i, now) {
  if (!IS_OWNER || !window.SONG_LIVE) return;
  const ver = V[i].ver, list = (() => { try { return (JSON.parse(store.get(dataKey(i)) || '{}').notes || []).map(o => ({ t: o.t, m: o.m })); } catch (e) { return []; } })();
  clearTimeout(ownT[ver]);
  ownT[ver] = setTimeout(() => { fetch(window.SONG_LIVE.api + '/on', { method: 'POST', headers: { Authorization: 'Bearer ' + store.get('insights:key'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: S.slug, ver, notes: list }), keepalive: true }).catch(() => {}); }, now ? 0 : 900);
}
const grow = el => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };

txt.addEventListener('input', () => {
  if (txt.value && locked === null) { locked = Math.floor(curTime()); $('#stampT').textContent = fmt(locked); $('#stamp').classList.add('locked'); }
  if (!txt.value) { locked = null; $('#stamp').classList.remove('locked'); }
  $('#add').classList.toggle('on', !!txt.value.trim());
  grow(txt);
});
$('#stamp').onclick = () => { if (locked !== null) { locked = Math.floor(curTime()); $('#stampT').textContent = fmt(locked); } };
const CHIPS = ['人声偏大', '人声偏小', '人声太亮', '太闷', '低频太多', '低频不够', '鼓不够力', '音高修正', '太吵', '想要更多空间感'];
CHIPS.forEach(c => {
  const b = document.createElement('button'); b.textContent = c;
  b.onclick = () => { txt.value = txt.value ? txt.value + '，' + c : c; txt.dispatchEvent(new Event('input')); txt.focus(); };
  $('#chips').appendChild(b);
});
function add() {
  const v = txt.value.trim(); if (!v) { txt.focus(); return; }
  const o = { t: locked === null ? Math.floor(curTime()) : locked, m: v, id: Date.now() };
  notes.push(o); notes.sort((x, y) => x.t - y.t);
  txt.value = ''; locked = null; $('#stamp').classList.remove('locked'); $('#add').classList.remove('on'); grow(txt);
  render(o.id); save(); updateCta();
  clearTimeout(syncT); track(vi, true);   // 点发送（回车）就立刻同步给你，不等防抖
}
$('#add').onclick = add;
txt.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(hover:hover)').matches) { e.preventDefault(); add(); } });

const tstr = ms => { const d = new Date(ms), p = n => String(n).padStart(2, '0'); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };
// 「已处理」分隔线（参考 Samply 的 Completed）
function doneSep() { const d = document.createElement('div'); d.className = 'donesep'; d.textContent = '已处理'; return d; }
// 评论行加上「刀大厨：回复」和「✓ 已处理」
function decorate(row, r) {
  row.classList.toggle('done', !!(r && r.done));
  row.querySelectorAll('.rp,.dn,.rd').forEach(x => x.remove());
  const m = row.querySelector('.m'); if (!r) return;
  if (r.read) { const d = document.createElement('span'); d.className = 'rd'; d.textContent = '已读'; if (r.read_at) d.title = '刀大厨 ' + tstr(r.read_at) + ' 看过'; m.appendChild(d); }
  if (r.done) { const d = document.createElement('span'); d.className = 'dn'; d.textContent = '✓ 已处理'; m.appendChild(d); }
  if (r.reply) { const p = document.createElement('div'); p.className = 'rp'; p.innerHTML = '<b>刀大厨</b>'; p.appendChild(document.createTextNode(r.reply)); m.appendChild(p); }
}
async function loadReplies() {
  if (!WK) return;
  try {
    const j = await (await fetch(API_BASE + '/cr?s=' + S.slug + '&k=' + encodeURIComponent(WK), { cache: 'no-store' })).json();
    if (!j.ok) return;
    REPLIES = new Map(j.replies.map(x => [rk(x.ver, x.t, x.m), x]));
    ONOTES = j.onotes || [];
    MSGS = j.msgs || [];
    render();
  } catch (e) {}
}
// 评论下的对话：客户在这条评论下给你回复（有你的回复，或这是你写的评论时才出现输入框）；发送后你的微信会收到推送
function thread(row, ver, tm, m, canReply) {
  const key = x => x.ver === ver && x.t === Math.round(tm * 10) / 10 && x.m === m;
  const box = document.createElement('div'); box.className = 'thr';
  const draw = () => {
    const ms = MSGS.filter(key);
    box.innerHTML = ms.map(x => `<div class="tm ${x.who === 'o' ? 'o' : 'c'}"><b>${x.who === 'o' ? '刀大厨' : '我'}</b>${esc(x.text)}<i>${tstr(x.ts)}</i></div>`).join('')
      + (canReply || ms.length ? '<div class="tin"><input maxlength="300" placeholder="回复刀大厨…"><button type="button">发送</button></div>' : '');
    const inp = box.querySelector('input'); if (!inp) return;
    const send = async () => { const v = inp.value.trim(); if (!v || !WK) return; inp.disabled = true;
      try { const r = await fetch(API_BASE + '/cm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: S.slug, k: WK, ver, t: tm, m, text: v, lid }) });
        const j = await r.json(); if (!j.ok) throw 0; MSGS.push({ ver, t: Math.round(tm * 10) / 10, m, who: 'c', text: v, ts: j.ts || Date.now() }); draw(); }
      catch (e) { inp.disabled = false; hud('没发出去，检查网络再试'); } };
    box.querySelector('button').onclick = send; inp.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(); } };
  };
  draw(); row.querySelector('.m').appendChild(box);
}
function render(newId) {
  const list = $('#list'); list.innerHTML = '';
  const isDone = o => { const r = REPLIES.get(rk(cur.ver, o.t, o.m)); return !!(r && r.done); };
  const order = notes.filter(o => !isDone(o)).concat(notes.filter(isDone));
  let sep = false;
  order.forEach(o => {
    if (!sep && isDone(o)) { sep = true; list.appendChild(doneSep()); }
    const row = document.createElement('div'); row.className = 'row' + (o.id === newId ? ' new' : '');
    row.innerHTML = '<button class="t press"></button><div class="m"></div><button class="x" aria-label="删除"><svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2 2 10"/></svg></button>';
    const t = row.querySelector('.t'); t.textContent = fmt(o.t);
    t.onclick = () => { seek(o.t); if (a.paused && !$('#play').disabled) a.play(); };
    row.querySelector('.m').textContent = o.m;
    if (o.id) { const ts = document.createElement('span'); ts.className = 'ts'; ts.textContent = tstr(o.id); row.querySelector('.m').appendChild(ts); }   // 评论发表时间
    decorate(row, REPLIES.get(rk(cur.ver, o.t, o.m)));
    { const rr = REPLIES.get(rk(cur.ver, o.t, o.m)); thread(row, cur.ver, o.t, o.m, !!(rr && rr.reply)); }
    row.querySelector('.x').onclick = () => {
      row.classList.add('out');
      setTimeout(() => { notes = notes.filter(n => n !== o); render(); save(); updateCta(); }, 260);
    };
    list.appendChild(row);
  });
  const ow = IS_OWNER ? [] : ONOTES.filter(o => o.ver === cur.ver);
  if (ow.length) {
    const hd = document.createElement('div'); hd.className = 'donesep'; hd.textContent = '刀大厨的评论'; list.insertBefore(hd, list.firstChild);
    let at = hd.nextSibling;
    ow.forEach(o => {
      const row = document.createElement('div'); row.className = 'row ow';
      row.innerHTML = '<button class="t press"></button><div class="m"></div>';
      row.querySelector('.t').textContent = fmt(o.t);
      row.querySelector('.t').onclick = () => { seek(o.t); if (a.paused && !$('#play').disabled) a.play(); };
      row.querySelector('.m').textContent = o.m;
      thread(row, o.ver, o.t, o.m, true);
      list.insertBefore(row, at);
    });
  }
  $('#n').textContent = notes.length; $('#empty').hidden = notes.length > 0 || ow.length > 0;
  drawOverall();
}
// 整体评论下面：你的回复 / 已读 / 对话（键 = 版本 + 时间 0 + 「整体：」前 120 字）
function drawOverall() {
  const ta = $('#overall'), v = ta.value.trim(); let w = document.getElementById('ovthr'); if (w) w.remove();
  if (!v) return;
  const m = '整体：' + v.slice(0, 120), r = REPLIES.get(rk(cur.ver, 0, m)), has = !!(r && (r.reply || r.read || r.done)) || MSGS.some(x => x.ver === cur.ver && x.t === 0 && x.m === m);
  if (!has) return;
  w = document.createElement('div'); w.id = 'ovthr'; w.className = 'row ovrow'; w.innerHTML = '<div class="m"></div>';
  decorate(w, r); thread(w, cur.ver, 0, m, !!(r && r.reply)); ta.after(w);
}
$('#overall').addEventListener('input', () => { save(); updateCta(); grow($('#overall')); });
$('#overall').addEventListener('change', () => drawOverall());

/* ───────── 发送 ───────── */
const hud = (msg, ms = 2600) => { const h = $('#hud'); h.textContent = msg; h.classList.add('show'); clearTimeout(hud.t); hud.t = setTimeout(() => h.classList.remove('show'), ms); };
function updateCta() {
  const has = notes.length || $('#overall').value.trim();
  $('#cta').classList.toggle('show', false);   // 取消「发送给刀大厨」：评论写完自动同步，你那边直接收到通知
  $('#cta').classList.toggle('compact', $('#mini').classList.contains('show'));
  $('#badge').textContent = notes.length;
  if (!$('#cta').classList.contains('ok')) $('#ctaT').textContent = PUSH ? '发送给刀大厨' : '复制反馈';
}
function plainText() {
  const L = ['《' + S.title + '》' + cur.ver + ' 反馈', ...notes.map(o => fmt(o.t) + ' ' + o.m)];
  const ov = $('#overall').value.trim(); if (ov) L.push('整体：' + ov);
  return L.join('\n');
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); } catch (e) {
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
  }
}
function done(label) {
  const c = $('#cta'); c.classList.add('ok'); $('#ctaT').textContent = label;
  setTimeout(() => { c.classList.remove('ok'); updateCta(); }, 2600);
}
let busy = false;
$('#cta').onclick = async () => {
  if (busy) return;
  if (!PUSH) { await copy(plainText()); done('已复制'); hud('已复制，去微信粘贴发给我'); return; }
  busy = true; $('#ctaT').textContent = '发送中…';
  const ov = $('#overall').value.trim();
  const html = '<p><b>《' + esc(S.title) + '》' + esc(cur.ver) + '</b> · ' + notes.length + ' 条</p>'
    + notes.map(o => '<p><b>' + fmt(o.t) + '</b>　' + esc(o.m) + '</p>').join('')
    + (ov ? '<p><b>整体：</b>' + esc(ov) + '</p>' : '')
    + '<p><a href="' + location.href.split('#')[0] + '">打开审听页</a></p>';
  try {
    const r = await fetch('https://www.pushplus.plus/send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: PUSH, title: '《' + S.title + '》' + cur.ver + ' 反馈 · ' + notes.length + ' 条', content: html, template: 'html' }) });
    const j = await r.json(); if (j.code !== 200) throw new Error(j.msg);
    done('已发送'); hud('已发送，刀大厨会在微信收到'); track(vi, true, true);
  } catch (e) {
    await copy(plainText()); done('已复制'); hud('发送没成功，已帮你复制，请粘贴到微信发给我', 4000);
  } finally { busy = false; }
};

/* 底部迷你播放条：主播放区滚出视野时滑上来 */
$('#mpp').onclick = toggle;
const mbar = $('#mbar');
let mdrag = false;
const mseek = e => { const r = mbar.getBoundingClientRect(); seek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * dur()); };
mbar.addEventListener('pointerdown', e => { mdrag = true; mbar.setPointerCapture(e.pointerId); mseek(e); });
mbar.addEventListener('pointermove', e => { if (mdrag) mseek(e); });
mbar.addEventListener('pointerup', () => mdrag = false);
new IntersectionObserver(([en]) => {
  $('#mini').classList.toggle('show', !en.isIntersecting && $('#app').classList.contains('in') && en.boundingClientRect.top < 0);
  updateCta();
}, { threshold: 0, rootMargin: '-40px 0px 0px 0px' }).observe($('#wave'));

/* ───────── 版本切换 ───────── */
/* ───────── 展开版本：每个版本一条波形，按阶段分组（编辑 / 混音 / 母带），一屏看三个，上下滚动，点一下切换 ───────── */
let vlistBuilt = false;
function drawPeaks(cv, pk, on) {
  const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
  const gap = 2, bw = 2, n = Math.max(1, Math.floor((w + gap) / (bw + gap))), mid = h / 2; c.fillStyle = on ? '#ebe9e5' : 'rgba(236,234,230,.38)';
  for (let k = 0; k < n; k++) {
    const f = k / Math.max(1, n - 1) * (pk.length - 1), i = Math.floor(f), u = f - i, v = (pk[i] || 0) * (1 - u) + (pk[Math.min(pk.length - 1, i + 1)] || 0) * u;
    const bh = Math.max(2, v * (h - 6)); c.beginPath(); c.roundRect ? c.roundRect(k * (bw + gap), mid - bh / 2, bw, bh, 1) : c.rect(k * (bw + gap), mid - bh / 2, bw, bh); c.fill();
  }
}
function buildList() {
  const el = $('#vlist'); if (!el) return;
  const groups = []; V.forEach((v, i) => { const st = stageOf(v); if (!groups.length || groups[groups.length - 1].st !== st) groups.push({ st, items: [] }); groups[groups.length - 1].items.push(i); });
  el.innerHTML = '<div class="vscroll">' + groups.map(g => (STAGE[g.st] ? `<div class="vlh">${STAGE[g.st]}</div>` : '')
    + g.items.map(i => `<div class="vli press" role="button" tabindex="0" data-i="${i}"><span class="vlt"><b>${esc(vlab(V[i]))}</b><i>${esc(cdate(V[i].date))} · ${fmt(V[i].duration)}</i></span><canvas></canvas><button class="vcmp" aria-label="拿这一版和当前版本对比">对比</button><em class="vab"></em></div>`).join('')).join('') + '</div>';
  vlistBuilt = true; redrawList();
}
function redrawList() { document.querySelectorAll('#vlist .vli').forEach(b => drawPeaks(b.querySelector('canvas'), V[+b.dataset.i].peaks || [], +b.dataset.i === vi)); }
function markList() {
  if (!vlistBuilt) return;
  document.querySelectorAll('#vlist .vli').forEach(b => { const i = +b.dataset.i, on = i === vi; if (b.classList.contains('on') !== on) { b.classList.toggle('on', on); drawPeaks(b.querySelector('canvas'), V[i].peaks || [], on); }
    b.classList.toggle('isb', i === CMP); b.querySelector('.vab').textContent = CMP >= 0 ? (on ? 'A' : i === CMP ? 'B' : '') : ''; });
}
function setVlist(open) {
  const el = $('#vlist'), t = $('#vtog'); if (!el) return;
  el.hidden = !open; t.setAttribute('aria-expanded', open); t.classList.toggle('open', open); t.firstChild.textContent = open ? '收起' : '展开';
  store.set('review:vlist', open ? '1' : '0');
  if (open) {
    if (!vlistBuilt) buildList(); else redrawList();
    markList(); document.querySelectorAll('#vlist .vli').forEach(b => b.classList.toggle('on', +b.dataset.i === vi));
    const sc = el.querySelector('.vscroll'), cur0 = sc.querySelector('.vli.on'); if (cur0) sc.scrollTop = Math.max(0, cur0.offsetTop - sc.clientHeight / 2 + cur0.offsetHeight / 2);
  }
}
$('#vtog').onclick = () => setVlist($('#vlist').hidden);
$('#vlist').addEventListener('click', e => { const b = e.target.closest('.vli'); if (!b) return; const i = +b.dataset.i; if (e.target.closest('.vcmp')) { if (i !== vi) startCmp(i); return; } switchTo(i); });
$('#vlist').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('vli')) { e.preventDefault(); switchTo(+e.target.dataset.i); } });
addEventListener('resize', () => { if (!$('#vlist').hidden) redrawList(); });
function markSeg() {
  document.querySelectorAll('#seg .vrow').forEach(b => {
    const i = +b.dataset.i; let has = false;
    try { const d = JSON.parse(store.get(dataKey(i)) || '{}'); has = (d.notes || []).length > 0 || !!(d.overall || '').trim(); } catch (e) {}
    b.classList.toggle('has', has); b.classList.toggle('on', i === vi); b.setAttribute('aria-current', i === vi);
  });
  document.querySelectorAll('#seg .vg.old').forEach(g => {
    if (g.querySelector('.vrow.on')) g.classList.add('open');
    const s = g.querySelector('.vsum'); s.setAttribute('aria-expanded', g.classList.contains('open')); s.classList.toggle('has', !!g.querySelector('.vrow.has'));
  });
  if (typeof markList === 'function') markList();
  try { cmpFix(); } catch (e) {}   // 对比模式没初始化前（页面刚载入）不处理

}
function showMeta() {
  // 大字是歌名，小字是当前版本和日期
  const tag = fmtTag(vi);
  const latest = V.reduce((m, v) => (v.date && v.date > m ? v.date : m), '');
  $('#vmeta').innerHTML = esc(vname(cur) + ' · ' + cdate(cur.date) + (latest && latest !== cur.date ? ' · 曲目更新 ' + cdate(latest) : '')) + (tag ? '<span class="ftag' + (tag === 'Lossless' ? ' ll' : '') + '">' + esc(tag) + '</span>' : '');
  $('#mt').textContent = S.title + ' · ' + cur.ver;
}
let switching = 0;
/* ───────── 刀大厨自己看：客户评论 + 从看板跳过来的时间点 ─────────
   同一个域名下打开过看板（存了管理钥匙）的设备，才会去读客户评论；客户的设备读不到也看不到这一块 */
async function jumpTo(ver, t) {
  const i = V.findIndex(v => v.ver === ver);
  if (i >= 0 && i !== vi) await switchTo(i);
  seek(Math.max(0, t - 2));   // 提前 2 秒，听得到前后文
  if (a.paused && !$('#play').disabled) a.play();
  $('#wave').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
/* 刀大厨自己的设备（存了看板钥匙）+ 在线版本的歌：像 Samply 一样拖文件上传新版本、删版本 */
function ownerTools() {
  // 打开页面时，把这首歌各版本里已有的评论补同步一次（之后每次改动自动同步）
  V.forEach((v, i) => { try { if ((JSON.parse(store.get(dataKey(i)) || '{}').notes || []).length) ownerPush(i, true); } catch (e) {} });
  const live = window.SONG_LIVE, key = store.get('insights:key');
  if (!live || !key) return;
  const own = $('#own'); own.hidden = false;
  // 当前项目的聆听情况：和项目页同一份数据，挂在管理条下面
  (async () => {
    try {
      const lj = await fetch(live.api + '/lib', { headers: { Authorization: 'Bearer ' + key } }).then(r => r.json());
      const pj = lj.ok && lj.projects.find(x => x.tracks.some(t => t.slug === S.slug));
      const slugs = pj ? pj.tracks.map(t => t.slug) : [S.slug], title = pj && pj.tracks.length > 1 ? pj.title : S.title;
      await new Promise((ok, no) => { if (window.cuListenStats) return ok(); const sc = document.createElement('script'); sc.src = '../ownstats.js?v=20261028f'; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc); });
      window.cuListenStats({ api: live.api, key, slugs, current: S.slug, side: true, tracks: pj ? pj.tracks : [{ slug: S.slug, artist: S.artist }], title, mount: el => own.after(el) });
    } catch (e) {}
  })();
  // 点歌名直接改名（客户那边同步变）
  const h = $('#vfile'); h.classList.add('editable'); h.title = '点一下改歌名';
  h.onclick = async () => {
    const v = prompt('歌名', S.title); if (!v || !v.trim() || v.trim() === S.title) return;
    try { await post('/radm/meta', { slug: S.slug, title: v.trim() }); S.title = v.trim(); h.textContent = S.title; document.title = S.title; busy('歌名已改成《' + S.title + '》'); }
    catch (e) { busy('没改成，检查网络再试'); }
  };
  const busy = t => { $('#ownT').textContent = t; };
  const post = async (path, body) => {
    const r = await fetch(live.api + path, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ ok: false })); if (!j.ok) throw new Error(j.e || r.status); return j;
  };
  // 分享：一键复制「歌名 / 链接 / 密码」三行发给客户。「分享」发这首歌；在多首的项目里另有「分享项目」
  const share = {}, line = x => '《' + x.title + '》\n' + x.url + (x.pass ? '\n密码 ' + x.pass : '');
  const get = p => fetch(live.api + p, { headers: { Authorization: 'Bearer ' + key } }).then(r => r.json());
  get('/radm/list').then(j => { const x = j.ok && j.songs.find(y => y.slug === S.slug); if (x) share.song = line({ ...x, title: S.title, pass: x.share ?? x.pass }); }).catch(() => {});
  get('/lib').then(j => {
    const p = j.ok && j.projects.find(x => x.tracks.length > 1 && x.tracks.some(t => t.slug === S.slug));
    if (p) { share.project = line(p); $('#ownShareP').hidden = false; $('#ownShare').textContent = '分享这首'; }
  }).catch(() => {});
  const shareBtn = (id, k) => { const b = $(id), label = b.textContent; b.onclick = async () => {
    if (!share[k]) return busy('还在读取链接，稍等再点');
    await copy(share[k]); const t = b.textContent; b.textContent = '已复制'; setTimeout(() => { b.textContent = t; }, 1500);
  }; };
  shareBtn('#ownShare', 'song'); shareBtn('#ownShareP', 'project');
  // 费用单：按 Cypher 报价开一张，歌手从歌曲信息里来；客户自己选、点确定；你在这里标定金 / 尾款已收
  const CYPHER = { base: 100, vocal: [['仅混音', 0, ''], ['执行向', 100, '按你的要求做效果：升降调、Stutter、反转、电话音、失真、加宽、Ad-lib 摆位、Double 对齐等'],
      ['创意向', 160, '包含执行向，由制作方判断要不要加特殊效果、加在哪，设计人声层次和空间']],
    edit: [['不需要', 0, ''], ['音准', 100, '只修音准（叠唱不超过 2 条）'], ['节奏', 100, '只对齐节奏（叠唱不超过 2 条）'], ['标准', 160, '音准 + 节奏都修，适合演唱比较稳的素材'], ['深度', 240, '跑调、破音、气声不稳较多时的大量精修']] };
  const saveQ = async q => { try { await post('/radm/meta', { slug: S.slug, quote: q }); Q = q; feeOpen = true; renderFee(); busy(q ? '费用单已更新' : '费用单已删除'); } catch (e) { busy('没保存上，检查网络再试'); } };
  feeOwner = () => `<div class="fown"><button data-own="people">改歌手</button><button data-own="del" class="dz">删除费用单</button></div>`;
  feeOwnerP = (p, i) => `<div class="fown fownp"><button data-own="dep" data-i="${i}">${p.dep ? '撤销定金' : '定金已收'}</button><button data-own="fin" data-i="${i}">${p.fin ? '撤销尾款' : '尾款已收'}</button><button data-own="fix" data-i="${i}">单独报价</button></div>`;
  $('#fee').addEventListener('click', e => {
    const b = e.target.closest('[data-own]'); if (!b) return;
    const k = b.dataset.own, q = JSON.parse(JSON.stringify(Q));
    if (k === 'dep' || k === 'fin') { const p = q.people[+b.dataset.i]; p[k] = !p[k]; if (k === 'dep' && p.dep) p.ok = true; }
    if (k === 'fix') {   // 服务名, 总价, 定金（不填定金就是一半）；清空就恢复按菜单选
      const p = q.people[+b.dataset.i], cur0 = hasFix(p) ? [p.fixn, p.fix, p.da ?? ''].join(', ') : '';
      const v = prompt(p.n + ' 单独报价：服务名, 总价, 定金（定金不填就是一半）\n例如：仅母带, 50, 10　清空就恢复按菜单选', cur0); if (v === null) return;
      const [fn, fx, fd] = v.split(/\s*[,，]\s*/);
      if (!v.trim()) { delete p.fix; delete p.fixn; delete p.da; p.ok = false; }
      else { p.fixn = fn || '单独报价'; p.fix = +fx || 0; if (fd !== undefined && fd !== '') p.da = +fd; else delete p.da; p.ok = true; }
    }
    if (k === 'people') {
      const v = prompt('这首歌的歌手，用逗号分开', q.people.map(p => p.n).join('、')); if (v === null) return;
      const names = v.split(/\s*[,，、\/]\s*/).filter(Boolean);
      q.people = names.map(n => q.people.find(p => p.n === n) || { n, v: 0, e: 0, ok: false });
    }
    if (k === 'del' && !confirm('删除这首歌的费用单？客户的选择也会清掉')) return;
    saveQ(k === 'del' ? null : q);
  });
  const fb = document.createElement('button'); fb.className = 'press'; fb.textContent = '费用';
  fb.onclick = () => {
    if (Q) { feeOpen = true; renderFee(); $('#fee').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const v = prompt('开一张费用单（Cypher 报价，客户自己选）。歌手用逗号分开', names.join('、')); if (!v) return;
    saveQ({ menu: CYPHER, people: v.split(/\s*[,，、\/]\s*/).filter(Boolean).map(n => ({ n, v: 0, e: 0, ok: false })), note: '' });
  };
  $('#ownPart').after(fb);
  // 段落：播放到某段开头点「＋ 段落」记下这里换谁唱；点上方的名字改名，清空就删掉这段
  const names = String(S.artist || '').split('、').filter(Boolean);
  const saveParts = async () => {
    try { await post('/radm/meta', { slug: S.slug, parts: PARTS }); busy('段落已保存，客户那边同步显示'); } catch (e) { busy('段落没保存上，检查网络再试'); }
  };
  // 歌手颜色面板：自动配色、手动换色、上传微信头像取主色（只存颜色，头像不上传）
  $('#ownColors').hidden = !MULTI;
  $('#ownColors').onclick = () => {
    const names = Object.keys(SINGERS); if (!names.length) return busy('这首歌还没有歌手，先在项目里填歌手或加段落');
    const old = document.getElementById('colorsPanel'); if (old) return old.remove();
    const box = document.createElement('div'); box.id = 'colorsPanel';
    box.style.cssText = 'margin:10px 0;padding:12px 14px;border-radius:12px;background:var(--fill);display:flex;flex-direction:column;gap:10px;font-size:14px';
    const draw = () => { box.innerHTML = '<div class="cph" style="display:flex;justify-content:space-between;cursor:pointer;font-weight:600"><span>歌手颜色</span><i style="font-style:normal;color:var(--text-3);font-size:12px">' + (box.classList.contains('fold') ? '展开' : '收起') + '</i></div>' + names.map(n => `<div style="display:flex;align-items:center;gap:10px"><input type="color" data-n="${esc(n)}" value="${SINGERS[n]}" style="width:34px;height:34px;border:0;padding:0;background:none;border-radius:50%"><b style="flex:1;font-weight:600">${esc(n)}</b><label class="press" style="cursor:pointer;font-size:13px;color:var(--text-2)">头像取色<input type="file" accept="image/*" data-av="${esc(n)}" hidden></label></div>`).join('')
      + '<div style="display:flex;gap:8px"><button class="press" id="clrSave">保存</button><button class="press" id="clrAuto">重新自动配色</button></div>'; bind(); };
    const bind = () => {
      box.querySelector('.cph').onclick = () => { box.classList.toggle('fold'); draw(); };
      box.querySelectorAll('input[type=color]').forEach(i => i.oninput = () => { SINGERS[i.dataset.n] = i.value; renderParts(); });
      box.querySelectorAll('input[data-av]').forEach(f => f.onchange = async () => {
        const file = f.files[0]; if (!file) return; const n = f.dataset.av;
        try { const bmp = await createImageBitmap(file), c = document.createElement('canvas'); c.width = c.height = 32; c.getContext('2d').drawImage(bmp, 0, 0, 32, 32);
          const d = c.getContext('2d').getImageData(0, 0, 32, 32).data; let sx = 0, sy = 0, w = 0, R = 0, G = 0, B = 0, cnt = 0;
          for (let i = 0; i < d.length; i += 4) { const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
            if (mx < .15 || sat < .15) continue; const h = hex2h('#' + [d[i], d[i + 1], d[i + 2]].map(x => x.toString(16).padStart(2, '0')).join('')), wt = sat * sat * mx;
            sx += Math.cos(h * Math.PI / 180) * wt; sy += Math.sin(h * Math.PI / 180) * wt; w += wt; cnt++; }
          if (!cnt) return busy('头像里没有明显的颜色，换一张或手动选色');
          let h = (Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360;
          for (let k = 0; k < 36 && names.some(m => m !== n && hueGap(hex2h(SINGERS[m]), h) < 34); k++) h = (h + 47) % 360;   // 和别的歌手错开
          SINGERS[n] = hsl2hex(h, 52, 62); draw(); renderParts(); busy(n + ' 的颜色已取好，点保存');
        } catch (e) { busy('读不了这张头像'); }
      });
      box.querySelector('#clrSave').onclick = async () => { try { await post('/radm/meta', { slug: S.slug, singers: SINGERS }); busy('歌手颜色已保存，歌手那边同步显示'); } catch (e) { busy('没保存上，检查网络再试'); } };
      box.querySelector('#clrAuto').onclick = () => { names.forEach(n => delete S.singers?.[n]); Object.assign(SINGERS, singerColors(names, {})); draw(); renderParts(); };
    };
    box.classList.add('fold'); draw(); $('#own').after(box);   // 不常用：默认折叠
  };
  $('#ownBpm').onclick = async () => {
    const cur0 = BPM ? BPM.bpm + '  第一拍 ' + BPM.off + 's  ' + BPM.n + ' 拍/小节' : '还没测';
    const mode = prompt('BPM（' + cur0 + '）\n输入「测」自动检测当前版本；或直接输入数字，如 92；输入 0 清除', BPM ? String(BPM.bpm) : '测'); if (mode === null) return;
    try {
      let x = null;
      if (mode.trim() === '测') {
        busy('正在测 BPM…'); const buf = await decodeBuf((await plainOf(vi)).slice(0)), ch0 = buf.getChannelData(0); x = estimateBpm(ch0, buf.sampleRate);
        if (!x) return busy('没测出来，手动输入 BPM 试试');
        const kk = findKick(ch0, buf.sampleRate, x.bpm);   // 以 kick 进入的位置为重拍
        if (kk) {
          const L = 240 / kk.bpm, guessK = KSET.reduce((b, k) => Math.abs(k - (kk.kickT / L + 1)) < Math.abs(b - (kk.kickT / L + 1)) ? k : b, 9);
          const ans = prompt('测到 BPM ' + kk.bpm + '，kick 从 ' + fmt(kk.kickT) + ' 进入。\n这是第几小节的第一拍？（常见 9 或 17）', String(guessK)); if (ans === null) return;
          const K = Math.max(1, Math.round(+ans) || guessK); x = { bpm: kk.bpm, off: Math.max(0, Math.round((kk.kickT - (K - 1) * L) * 1000) / 1000), n: 4 };
        } else {
          const adj = prompt('测到 BPM ' + x.bpm + '，第一拍在 ' + x.off + ' 秒。可以改 BPM，确认就直接点好', String(x.bpm)); if (adj === null) return; x.bpm = +adj || x.bpm;
        }
      } else if (+mode > 0) { const sec = prompt('第一拍在第几秒（鼓第一下 / 节拍起点，没概念就填 0）', BPM ? String(BPM.off) : '0'); if (sec === null) return; x = { bpm: +mode, off: Math.max(0, +sec || 0), n: 4 }; }
      else x = null;
      if (x) { const nb = prompt('每小节几拍（默认 4）', String(x.n)); if (nb === null) return; x.n = [2, 3, 4, 5, 6, 7].includes(+nb) ? +nb : 4; }
      await post('/radm/meta', { slug: S.slug, bpm: x }); BPM = x; try { snapUi(); } catch (e) {} busy(x ? 'BPM ' + x.bpm + ' 已保存，波形上有小节线，加段落会吸附到小节' : 'BPM 已清除');
    } catch (e) { busy('没成功，检查网络再试'); }
  };
  $('#ownPart').onclick = () => {
    const t = snapBar(Math.round(curTime() * 10) / 10), k = PARTS.filter(p => p.t < t).length;   // 有 BPM 就吸附到最近的小节线
    const v = prompt(fmt(t) + (BPM ? '（第 ' + barNo(t) + ' 小节）' : '') + ' 开始这段是谁' + (names.length ? '（歌手：' + names.join('、') + '）' : '') + '\n也可以写歌曲分段：Intro / Verse / Hook / Bridge / Outro', names[k] || '');
    if (!v || !v.trim()) return;
    PARTS = PARTS.filter(p => Math.abs(p.t - t) > .3).concat({ t, n: v.trim() }).sort((x, y) => x.t - y.t); renderParts(); saveParts();
  };
  // 点段落：先跳过去播放（和歌手看到的一样）；同时在段落下面展开一条编辑栏——改名（歌手 / 歌曲分段）、起点前后挪一小节、用此刻当起点、删除。不再点一下就弹窗直接改
  let selPart = -1;
  const SECS = ['Intro', 'Verse', 'Hook', 'Bridge', 'Outro'];
  const step = () => BPM ? barLen() : 1;   // 有 BPM 按小节挪，没有按 1 秒
  const partBar = () => {
    let bar = document.getElementById('partbar');
    if (selPart < 0 || !PARTS[selPart]) { if (bar) bar.remove(); return; }
    const p = PARTS[selPart];
    if (!bar) { bar = document.createElement('div'); bar.id = 'partbar'; $('#parts').after(bar); }
    const chips = [...new Set([...names, ...SECS, p.n])];
    bar.innerHTML = '<div class="pbn">' + chips.map(n => `<button class="press${n === p.n ? ' on' : ''}" data-n="${esc(n)}"${colorOf(n) ? ` style="--pc:${colorOf(n)}"` : ''}>${esc(n)}</button>`).join('') + '<button class="press" data-a="new">＋ 其他</button></div>'
      + '<div class="pbt"><span>' + fmt(p.t) + (BPM ? ' · 第 ' + barNo(p.t) + ' 小节' : '') + '</span><button class="press" data-a="m">起点 −' + (BPM ? '1 小节' : '1 秒') + '</button><button class="press" data-a="p">起点 +' + (BPM ? '1 小节' : '1 秒') + '</button><button class="press" data-a="now">用此刻</button><button class="press dz" data-a="del">删除</button><button class="press" data-a="x">完成</button></div>';
    const commit = (moved) => { if (moved) { const cur0 = PARTS[selPart]; PARTS.sort((x, y) => x.t - y.t); selPart = PARTS.indexOf(cur0); } renderParts(); saveParts(); partBar(); };
    bar.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { p.n = b.dataset.n; commit(false); });
    bar.querySelector('[data-a=new]').onclick = () => { const v = prompt('这段的名字（歌手名，或 Intro / Verse / Hook / Bridge / Outro）', p.n); if (v && v.trim()) { p.n = v.trim(); commit(false); } };
    bar.querySelector('[data-a=m]').onclick = () => { p.t = Math.max(0, Math.round((p.t - step()) * 10) / 10); seek(p.t); commit(true); };
    bar.querySelector('[data-a=p]').onclick = () => { p.t = Math.min(dur() - .5, Math.round((p.t + step()) * 10) / 10); seek(p.t); commit(true); };
    bar.querySelector('[data-a=now]').onclick = () => { p.t = snapBar(Math.round(curTime() * 10) / 10); commit(true); };
    bar.querySelector('[data-a=del]').onclick = () => { PARTS.splice(selPart, 1); selPart = -1; renderParts(); saveParts(); partBar(); };
    bar.querySelector('[data-a=x]').onclick = () => { selPart = -1; partBar(); renderParts(); };
  };
  onPart = i => {
    seek(PARTS[i].t); partLoop(i); if (a.paused && !$('#play').disabled) $('#play').click();
    selPart = selPart === i ? -1 : i; partBar(); renderParts();
    document.querySelectorAll('#parts .pt').forEach((b, k) => b.classList.toggle('sel', k === selPart));
  };
  // 每个版本旁边一个「删除」
  document.querySelectorAll('.vrow').forEach(row => {
    const v = V[+row.dataset.i], x = document.createElement('span');
    x.className = 'vdel'; x.setAttribute('role', 'button'); x.setAttribute('aria-label', '删除 ' + v.ver); x.textContent = '×';
    x.onclick = async e => {
      e.stopPropagation();
      if (!confirm('删除《' + S.title + '》' + v.ver + '？客户将看不到这个版本，删了不能恢复')) return;
      try { busy('正在删除 ' + v.ver + '…'); await post('/radm/del', { slug: S.slug, ver: v.ver }); softReload(); }
      catch (err) { busy('没删掉，检查网络再试'); }
    };
    row.appendChild(x);
    const ed = document.createElement('span');
    ed.className = 'vdel vedit'; ed.setAttribute('role', 'button'); ed.setAttribute('aria-label', '改类别和序号 ' + v.ver); ed.textContent = '✎';
    ed.onclick = e => { e.stopPropagation(); editVer(v); };
    row.insertBefore(ed, x);
  });
  // 改类别和序号：类别 1 编辑 2 混音 3 母带 0 无；序号 = 在这个类别里排第几（别的版本自动顺延）
  const editVer = async v => {
    const names = { edit: 1, mix: 2, master: 3 }, cs = stageOf(v);
    const a = prompt('《' + S.title + '》' + vname(v) + ' 的类别\n1 编辑　2 混音　3 母带　0 不分类', String(names[cs] || 0)); if (a === null) return;
    const st = { 0: 'none', 1: 'edit', 2: 'mix', 3: 'master' }[a.trim()]; if (!st) { busy('类别只能填 0、1、2、3'); return; }
    const inStage = V.filter(x => x !== v && stageOf(x) === (st === 'none' ? '' : st));
    const cur = cs === (st === 'none' ? '' : st) ? V.filter(x => stageOf(x) === cs).indexOf(v) + 1 : inStage.length + 1;
    const b = prompt('在「' + (st === 'none' ? '不分类' : STAGE[st]) + '」里排第几（1 = 最前，现有 ' + inStage.length + ' 个其他版本）', String(cur)); if (b === null) return;
    const pos = Math.max(1, Math.min(inStage.length + 1, Math.round(+b) || cur));
    inStage.splice(pos - 1, 0, v);
    try { busy('正在保存…'); await post('/radm/ver', { slug: S.slug, set: inStage.map((x, i) => ({ ver: x.ver, stage: x === v ? st : undefined, ord: i + 1 })) }); softReload(); }
    catch (err) { busy('没保存上，检查网络再试'); }
  };
  if (V.length < 2) $('#seg').hidden = true;   // 只剩一版时列表本来就不显示，删除按钮放到上传条里
  if (V.length === 1) {
    const x = document.createElement('button'); x.className = 'press'; x.textContent = '删除 ' + V[0].ver;
    x.onclick = async () => { if (!confirm('删除《' + S.title + '》' + V[0].ver + '？这是唯一的版本，删了客户就听不到了')) return;
      try { await post('/radm/del', { slug: S.slug, ver: V[0].ver }); softReload(); } catch (e) { busy('没删掉，检查网络再试'); } };
    own.appendChild(x);
    const ed = document.createElement('button'); ed.className = 'press'; ed.textContent = '改类别'; ed.onclick = () => editVer(V[0]); own.appendChild(ed);
  }
  let loading = null;
  const lib = () => loading || (loading = new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = '../upload.js?v=20261024'; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc); }));
  async function up(file) {
    if (!file || own.classList.contains('busy')) return;
    try {
      await lib();
      const n = cuNameInfo(file.name);
      const next = 'V' + (V.reduce((m, v) => Math.max(m, parseInt(v.ver.slice(1)) || 0), 0) + 1);
      // 文件名里的 _V1_ 是每个阶段各自的编号：Mix V1 和 Edit V1 同号不算同一个版本，自动用下一个空号；同一阶段同号才问覆盖
      const st = cuStage(n.raw), same = V.find(v => v.ver === n.ver);
      const ver = n.ver && !(same && stageOf(same) !== st) ? n.ver : next;
      const existing = V.find(v => v.ver === ver);
      const lab = (STAGE[st] ? STAGE[st] + ' ' : '') + (existing ? vlab(existing) : String(V.filter(v => stageOf(v) === st).length + 1));
      if (existing && !confirm('「' + lab + '」已经有了，要覆盖吗？')) return;
      if (!confirm('把「' + file.name + '」上传为《' + S.title + '》' + (existing ? lab : (STAGE[st] ? STAGE[st] + ' ' + (V.filter(v => stageOf(v) === st).length + 1) : ver)) + '？')) return;
      own.classList.add('busy');
      const r = await cuUpload({ api: live.api, key, file, slug: S.slug, ver, date: n.date, step: busy,
        bar: p => own.style.setProperty('--p', Math.round(p * 100) + '%') });
      busy('《' + S.title + '》' + r.ver + ' 已上线');
      setTimeout(() => softReload(r.ver), 300);
    } catch (e) { own.classList.remove('busy'); busy(/HTTP|^[a-z]+$/.test(e.message) ? '没传成功（' + e.message + '），再试一次' : e.message); }
  }
  // 发给客户的 REF：和版本一样加密上传，客户的审听页就能直接切换对比
  const rb = document.createElement('button'); rb.className = 'press'; rb.textContent = REFV ? '换 REF（客户可见）' : '上传 REF 给客户';
  const rf = document.createElement('input'); rf.type = 'file'; rf.accept = 'audio/*,.m4a,.mp3,.wav,.aif,.aiff'; rf.hidden = true;
  rb.onclick = () => rf.click(); own.appendChild(rb); own.appendChild(rf);
  rf.onchange = async () => {
    const f = rf.files[0]; if (!f || own.classList.contains('busy')) return;
    if (!confirm('把「' + f.name + '」作为《' + S.title + '》的 REF 发给客户？')) return;
    try { await lib(); own.classList.add('busy');
      await cuUpload({ api: live.api, key, file: f, slug: S.slug, ver: 'REF', step: busy, bar: p => own.style.setProperty('--p', Math.round(p * 100) + '%') });
      busy('REF 已上线'); setTimeout(() => softReload(), 300);
    } catch (e) { own.classList.remove('busy'); busy(e.message); }
  };
  if (REFV) {
    const xb = document.createElement('button'); xb.className = 'press'; xb.textContent = '删除 REF';
    xb.onclick = async () => { if (!confirm('删除发给客户的 REF？')) return;
      try { await post('/radm/del', { slug: S.slug, ver: 'REF' }); softReload(); } catch (e) { busy('没删掉，检查网络再试'); } };
    own.appendChild(xb);
  }
  $('#ownPick').onclick = () => $('#ownFile').click();
  $('#ownFile').onchange = () => up($('#ownFile').files[0]);
  let depth = 0;
  addEventListener('dragenter', e => { if ([...(e.dataTransfer.types || [])].includes('Files')) { depth++; document.body.classList.add('dropping'); } });
  addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; document.body.classList.remove('dropping'); } });
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', e => { e.preventDefault(); depth = 0; document.body.classList.remove('dropping'); up(e.dataTransfer.files[0]); });
}
let cfbRender = null;
async function clientFb() {
  const at = new URLSearchParams(location.search).get('at');   // 看板链接 ?at=V1-24
  const m = at && /^(V\d{1,3})-(\d+(?:\.\d+)?)$/.exec(at);
  if (m) setTimeout(() => jumpTo(m[1], +m[2]), 300);
  const key = store.get('insights:key'); if (!key) return;
  const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:8787' : 'https://stats.cumusic.work';
  try {
    const j = await (await fetch(API + '/q?days=365', { headers: { Authorization: 'Bearer ' + key } })).json();
    if (!j.ok) return;
    const names = new Map((j.listeners || []).map(x => [x.lid, x.name || x.self]));   // 你写的备注名，没有就用听众自己留的名字
    const items = [];
    (j.feedback || []).filter(f => f.slug === S.slug).forEach(f => {
      let cm = []; try { cm = JSON.parse(f.comments || '[]'); } catch (e) {}
      const who = names.get(f.lid) || ('听众 ' + f.lid);
      cm.forEach(c => items.push({ ver: f.ver, t: c.t, m: c.m, who, sent: f.sent, at: f.updated }));
      if (f.overall) items.push({ ver: f.ver, t: null, m: '整体：' + f.overall, mk: '整体：' + String(f.overall).trim().slice(0, 120), who, sent: f.sent, at: f.updated });
    });
    if (!items.length) return;
    // 同一条评论客户可能在两次打开里都同步过：按 版本+时间点+内容 去重
    const seen = new Set(), list = items.sort((x, y) => x.ver.localeCompare(y.ver, 'en', { numeric: true }) || (x.t ?? 1e9) - (y.t ?? 1e9))
      .filter(x => { const k = x.ver + '|' + x.t + '|' + x.m; if (seen.has(k)) return false; seen.add(k); return true; });
    const mine = new Map();
    try {   // 已有的回复 / 完成
      const rj = await (await fetch(API + '/cr?s=' + S.slug, { headers: { Authorization: 'Bearer ' + key }, cache: 'no-store' })).json();
      if (rj.ok) { rj.replies.forEach(x => mine.set(rk(x.ver, x.t, x.m), x)); MSGS = rj.msgs || []; }
    } catch (e) {}
    // 只显示正在听的这一版的评论；切版本时重画
    const stPrev = new Map();   // 每条评论上一次的状态圈，用来做过渡动画
    cfbRender = () => {
    const box = $('#cfl'); box.innerHTML = '';
    const done = o => { const r = mine.get(rk(o.ver, o.t, o.m)); return !!(r && r.done); };
    // 默认按时间点排、处理完的沉底；点「按歌手」就按人分组，每组里再按时间点排
    const grp = store.get('review:cfbgroup') === '1', all = list.filter(o => o.ver === cur.ver);
    const here = grp ? [...all].sort((x, y) => x.who.localeCompare(y.who, 'zh') || done(x) - done(y) || (x.t ?? 1e9) - (y.t ?? 1e9))
      : all.filter(o => !done(o)).concat(all.filter(done));
    box.classList.toggle('grouped', grp); $('#cgrp').classList.toggle('on', grp); $('#cgrp').setAttribute('aria-pressed', grp);
    const rows = []; let sep = false, lastWho = null;
    here.forEach(o => {
      if (grp && o.who !== lastWho) { lastWho = o.who; const h = document.createElement('div'); h.className = 'cgh'; h.textContent = o.who + ' · ' + here.filter(x => x.who === o.who).length + ' 条'; box.appendChild(h); }
      if (!grp && !sep && done(o)) { sep = true; box.appendChild(doneSep()); }
      const row = document.createElement('div'); row.className = 'row';
      row.innerHTML = '<button class="t press"></button><div class="m"></div>';
      const tb = row.querySelector('.t');
      tb.textContent = o.t == null ? '整体' : fmt(o.t);
      if (o.t == null) tb.disabled = true; else tb.onclick = () => jumpTo(o.ver, o.t);
      row.querySelector('.m').textContent = o.m;
      const wb = document.createElement('div'); wb.className = 'cwho'; wb.textContent = o.who + (o.at ? ' · ' + tstr(o.at) : ''); row.querySelector('.m').prepend(wb);   // 谁写的 · 什么时候
      {
        const kt = o.t == null ? 0 : o.t, km = o.mk || o.m;   // 整体评论：时间记 0，文字取前 120 字做键
        const k = rk(o.ver, kt, km), acts = document.createElement('div'); acts.className = 'acts';
        acts.innerHTML = '<button class="press st" data-a="st"></button><button class="press" data-a="reply">回复</button>' + ['👍', '❤️', '🔥', '🙏', '😂'].map(e => '<button class="press emo" data-e="' + e + '">' + e + '</button>').join('');
        const sync = () => { const r = mine.get(k); decorate(row, r); { const rp = row.querySelector('.rp'); if (rp && !rp.querySelector('.mx')) { const bx = document.createElement('button'); bx.className = 'mx'; bx.textContent = '×'; bx.setAttribute('aria-label', '删除这条回复'); bx.onclick = () => save({ reply: '' }); rp.appendChild(bx); } } const sb = acts.querySelector('[data-a=st]'), pc = r && r.done ? 100 : r && r.read ? 50 : 0, pv = stPrev.has(k) ? stPrev.get(k) : pc;   // 圆圈：空心 = 未读，半圆 = 已读，实心 ✓ = 已完成；状态变了就从上一个状态补间过去
          sb.innerHTML = '<i class="ring' + (pc === 100 ? ' full' : '') + '" style="--p:' + pv + '"></i><span>' + (pc === 100 ? '已完成' : pc === 50 ? '已读' : '未读') + '</span>';
          const ring = sb.querySelector('.ring'); if (pv !== pc) { requestAnimationFrame(() => requestAnimationFrame(() => { ring.style.setProperty('--p', pc); ring.classList.add('pop'); })); }
          stPrev.set(k, pc); sb.classList.toggle('on', pc > 0); sb.classList.toggle('dn', pc === 100);
          acts.querySelector('[data-a=reply]').textContent = r && r.reply ? '改回复' : '回复'; };
        const save = async body => {
          try {
            const r = await fetch(API + '/cr', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
              body: JSON.stringify({ slug: S.slug, ver: o.ver, t: kt, m: km, ...body }) });
            const j = await r.json(); if (!j.ok) throw new Error();
            if (!j.reply && !j.done && !j.read) mine.delete(k); else mine.set(k, { ...(mine.get(k) || {}), reply: j.reply, done: j.done, read: j.read });
            cfbRender();
          } catch (e) { alert('没存上，检查网络再试'); }
        };
        acts.querySelector('[data-a=reply]').onclick = async () => {
          const v = prompt('回复这条评论（客户会在审听页看到，可以继续对话）：\n「' + o.m + '」', ''); if (!v || !v.trim()) return;
          try { const r = await fetch(API + '/cm', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: S.slug, ver: o.ver, t: kt, m: km, text: v.trim() }) });
            const j = await r.json(); if (!j.ok) throw 0; MSGS.push({ ver: o.ver, t: Math.round(kt * 10) / 10, m: km, who: 'o', text: v.trim(), ts: j.ts }); cfbRender(); } catch (e) { alert('没发出去，检查网络再试'); } };
        // 一个按钮走三步：未读 → 已读 → 已完成 → 回到未读（客户那边同步显示「已读」「已处理」）
        acts.querySelector('[data-a=st]').onclick = () => { const r = mine.get(k) || {}; save(!r.read && !r.done ? { read: true } : !r.done ? { read: true, done: true } : { read: false, done: false }); };
        // 一点就回一个表情，歌手在评论下的对话里看到
        acts.querySelectorAll('.emo').forEach(b => b.onclick = async () => { try { const r = await fetch(API + '/cm', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: S.slug, ver: o.ver, t: kt, m: km, text: b.dataset.e }) });
          const j = await r.json(); if (!j.ok) throw 0; MSGS.push({ ver: o.ver, t: Math.round(kt * 10) / 10, m: km, who: 'o', text: b.dataset.e, ts: j.ts }); if (!(mine.get(k) || {}).read) save({ read: true }); else cfbRender(); } catch (e) { alert('没发出去，检查网络再试'); } });
        const th = MSGS.filter(x => x.ver === o.ver && x.t === Math.round(kt * 10) / 10 && x.m === o.m);
        if (th.length) { const tb = document.createElement('div'); tb.className = 'thr'; tb.innerHTML = th.map(x => `<div class="tm ${x.who === 'o' ? 'o' : 'c'}"><b>${x.who === 'o' ? '我' : esc(o.who)}</b>${esc(x.text)}${x.who === 'o' ? `<button class="mx" data-ts="${x.ts}" aria-label="删除">×</button>` : ''}<i>${tstr(x.ts)}</i></div>`).join('');
          tb.querySelectorAll('.mx').forEach(bx => bx.onclick = async () => { try { const r = await fetch(API + '/cm/del', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: S.slug, ver: o.ver, t: kt, m: km, ts: +bx.dataset.ts }) });
            if (!(await r.json()).ok) throw 0; MSGS = MSGS.filter(y => !(y.ts === +bx.dataset.ts && y.who === 'o' && y.m === o.m)); cfbRender(); } catch (e) { alert('没删掉，检查网络再试'); } }); row.querySelector('.m').appendChild(tb); }
        row.querySelector('.m').after(acts);
        rows.push(sync);
      }
      box.appendChild(row);
    });
    rows.forEach(f => f());
    $('#cfn').textContent = here.length ? here.length + ' 条 · ' + [...new Set(here.map(x => x.who))].join('、') : '这一版还没有';
    $('#cfb').hidden = false;
    };
    { const hd = $('#cfb .sect'); if (store.get('review:fold:cfb') === '1') $('#cfb').classList.add('fold');
      if (!hd.dataset.f) { hd.dataset.f = '1'; hd.style.cursor = 'pointer'; hd.addEventListener('click', ev => { if (ev.target.closest('button')) return; $('#cfb').classList.toggle('fold'); store.set('review:fold:cfb', $('#cfb').classList.contains('fold') ? '1' : '0'); }); } }
    $('#cgrp').onclick = () => { store.set('review:cfbgroup', store.get('review:cfbgroup') === '1' ? '0' : '1'); cfbRender(); };
    cfbRender();
  } catch (e) {}
}
/* ───────── 响度统一 + REF ─────────
   响度统一：所有版本（含 REF）对齐到其中最小声的那个，只往下调不放大，不会爆音。
   REF：本地选一个参考曲（不上传），或你发给客户的 REF；解码进内存和混音同步播放，切换只是两路音量交叉淡变，播放不中断。
   只有打开响度统一或加了 REF，才把声音接进 Web Audio（默认路径完全不变）。 */
// 响度三档循环：关 → 对齐最小声（只往下调） → 统一到 -14 LUFS（小声的会放大，后面有防爆音）
const LMODES = ['', 'min', 'lufs'];
let LOUD = ({ '1': 'min', min: 'min', lufs: 'lufs' })[store.get('review:loud')] || '', actx = null, gainN = null, refN = null;
const LU = {}, lkey = i => 'review:lufs:' + String(V[i].audio).split('/').pop();
V.forEach((v, i) => { if (Number.isFinite(v.lufs)) LU[i] = v.lufs; else { const c = +store.get(lkey(i)); if (c < 0) LU[i] = c; } });
let REF = null, refBuf = null, refNode = null, refAt = 0, refOff = 0, AB = 'mix';
function graph() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return true; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext; actx = new AC();
    // 防爆音：阈值 0 dBFS，没超过就完全不动（对齐最小声那档只往下调，碰不到它）
    const lim = actx.createDynamicsCompressor(); lim.threshold.value = 0; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = .001; lim.release.value = .1;
    lim.connect(actx.destination);
    const src = actx.createMediaElementSource(a); gainN = actx.createGain(); src.connect(gainN); gainN.connect(lim);
    refN = actx.createGain(); refN.gain.value = 0; refN.connect(lim);
    return true;
  } catch (e) { actx = null; return false; }
}
const libLufs = () => window.cuStats ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement('script'); s.src = '../lufs.js?v=20261023'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
const decodeBuf = buf => { const C = window.OfflineAudioContext || window.webkitOfflineAudioContext, tmp = new C(2, 44100, 44100);
  return new Promise((ok, no) => { const p = tmp.decodeAudioData(buf, ok, no); if (p && p.catch) p.catch(no); }); };
async function plainOf(i) {   // 某个版本解密后的音频字节（先读本地缓存，没有再下载）
  let u8 = await cacheGet(i);
  if (!u8) { const r = await fetch(V[i].audio); u8 = new Uint8Array(await r.arrayBuffer()); if (r.ok) cachePut(i, u8); }
  return open(KEY, u8);
}
async function measure(i) {
  if (LU[i] !== undefined) return LU[i];
  try {
    await libLufs();
    LU[i] = await cuLufs(await decodeBuf(await plainOf(i)));
    store.set(lkey(i), LU[i]);
    const key = store.get('insights:key');   // 你的设备：测出来顺手存回去，客户就不用再测
    if (key && window.SONG_LIVE) fetch(SONG_LIVE.api + '/radm/lufs', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: S.slug, ver: V[i].ver, lufs: LU[i] }) }).catch(() => {});
  } catch (e) {}
  return LU[i];
}
let measuring = false;
async function measureAll() {   // 要和最小声的比，所以每个版本都得知道响度：后台依次测完
  if (measuring) return; measuring = true;
  for (let i = V.length - 1; i >= 0; i--) if (LU[i] === undefined) { await measure(i); applyGains(); }
  measuring = false;
}
function applyGains() {
  const lab = $('#loudv'), btn = $('#loud');
  btn.classList.toggle('on', LOUD); btn.setAttribute('aria-pressed', LOUD);
  $('#abMix').classList.toggle('on', AB === 'mix'); $('#abRef').classList.toggle('on', AB === 'ref');
  if (!gainN) { lab.textContent = ''; return; }
  const all = V.map((v, i) => LU[i]).concat(REF ? [REF.lufs] : []).filter(Number.isFinite);
  const target = LOUD === 'min' && all.length ? Math.min(...all) : LOUD === 'lufs' ? -14 : null;
  const db = l => target === null || !Number.isFinite(l) ? 0 : Math.max(-24, Math.min(12, target - l));
  const now = actx.currentTime, mixDb = db(LU[vi]), refDb = REF ? db(REF.lufs) : 0;
  gainN.gain.setTargetAtTime(AB === 'mix' ? Math.pow(10, mixDb / 20) : 0, now, .008);
  refN.gain.setTargetAtTime(AB === 'ref' ? Math.pow(10, refDb / 20) : 0, now, .008);
  const d = AB === 'ref' ? refDb : mixDb;
  const head = LOUD === 'min' ? ' · 对齐最小' : LOUD === 'lufs' ? ' · -14 LUFS' : '';
  lab.textContent = !LOUD ? '' : LU[vi] === undefined || (AB === 'ref' && !Number.isFinite(REF && REF.lufs)) ? head + ' · 测量中'
    : LOUD === 'min' && Math.abs(d) < .05 ? head + ' · 基准' : head + ' · ' + (d > 0 ? '+' : '') + d.toFixed(1) + ' dB';
}
// REF 播放：AudioBuffer 从混音当前位置起播；混音暂停 / 跳转 / 切版本时跟着重启，保持同步
function refStop() { if (refNode) { try { refNode.stop(); } catch (e) {} refNode.disconnect(); refNode = null; } }
function refStart() {
  refStop();
  if (!refBuf || !actx || a.paused) return;
  const off = a.currentTime; if (off >= refBuf.duration) return;
  const n = actx.createBufferSource(); n.buffer = refBuf; n.connect(refN); n.start(0, off);
  refNode = n; refAt = actx.currentTime; refOff = off;
}
a.addEventListener('playing', refStart);
a.addEventListener('pause', refStop);
a.addEventListener('seeked', () => { if (!a.paused) refStart(); });
setInterval(() => { if (refNode && !a.paused && Math.abs(refOff + actx.currentTime - refAt - a.currentTime) > .06) refStart(); }, 500);
async function setRef(buf, name, lufs) {
  if (!graph()) return;
  try {
    refBuf = await new Promise((ok, no) => { const p = actx.decodeAudioData(buf, ok, no); if (p && p.catch) p.catch(no); });
  } catch (e) { $('#refName').hidden = false; $('#refName').textContent = '这个文件读不了，换一个试试'; return; }
  REF = { name, lufs };
  if (!Number.isFinite(lufs)) { try { await libLufs(); REF.lufs = await cuLufs(refBuf); } catch (e) {} }
  $('#ab').classList.add('has'); $('#refPick').textContent = '换 REF'; refStats = null; showStats();
  $('#refName').hidden = false; $('#refName').textContent = 'REF · ' + name;
  refStart(); applyGains();
}
function setAB(x) {
  if (x === 'ref' && !REF) return;
  if (!graph()) return;
  AB = x; applyGains();
}
/* ───────── 对比版本：把另一个版本当作 B，和当前版本（A）无缝来回切 ─────────
   复用 REF 的同步播放：B 解码进内存，跟着 A 的位置播，切换只是两路音量交叉淡变，不中断。
   对比时自动对齐响度（不然更响的那个总是显得更好听），退出对比恢复原来的设置。 */
let CMP = -1, loudBefore = null;
const abLabels = () => {
  $('#abMix').textContent = CMP >= 0 ? vname(V[vi]) : '混音'; $('#abRef').textContent = CMP >= 0 ? vname(V[CMP]) : 'REF';
  $('#cmp').textContent = CMP >= 0 ? '退出对比' : '对比上一版'; $('#cmp').classList.toggle('on', CMP >= 0);
};
async function startCmp(i, keep) {
  if (i < 0 || i >= V.length || i === vi || !KEY) return;
  const btn = $('#cmp'), keepAB = keep ? AB : null; CMP = i; btn.textContent = '加载中…'; graph();
  try {
    if (loudBefore === null) { loudBefore = LOUD; if (!LOUD) { LOUD = 'min'; } }
    await Promise.all([measure(vi), measure(i)]);
    const plain = await plainOf(i); if (CMP !== i) return;
    await setRef(plain, vname(V[i]), LU[i]); if (CMP !== i) return;
    $('#refName').textContent = '对比 · ' + vname(V[vi]) + ' ↔ ' + vname(V[i]) + (loudBefore ? '' : ' · 已对齐响度') + (matchMedia('(hover:hover)').matches ? ' · 按 R 切换' : '');
    abLabels(); setAB(keepAB || 'ref'); markList();
  } catch (e) { stopCmp(); }
}
function stopCmp() {
  if (CMP < 0) return; CMP = -1; refStop(); refBuf = null; REF = null; refStats = null; AB = 'mix';
  if (loudBefore !== null) { LOUD = loudBefore; loudBefore = null; }
  if (refN && actx) refN.gain.value = 0;
  $('#refName').hidden = true; if (!REFV) $('#ab').classList.remove('has'); $('#refPick').textContent = REFV ? '换 REF' : '＋ 加 REF'; abLabels(); applyGains(); markList(); if (mstOpen) showStats();
}
$('#cmp').onclick = () => {
  if (CMP >= 0) return stopCmp();
  const prev = vi > 0 ? vi - 1 : -1; if (prev < 0) { $('#refName').hidden = false; $('#refName').textContent = '这已经是最早的一版，没有更早的可以对比'; return; }
  if (REF) { REF = null; refBuf = null; refStop(); }   // 你发的 REF 占着位置：对比期间先让出，退出后再点 REF 能重新载入
  startCmp(prev);
};
// 当前版本切走后，B 如果正好变成当前版本，就换个邻近的版本当 B
function cmpFix() { if (CMP < 0) return; if (CMP === vi) { const alt = vi > 0 ? vi - 1 : vi + 1; alt < V.length ? startCmp(alt, true) : stopCmp(); } else abLabels(); }
$('#abMix').onclick = () => setAB('mix');
$('#abRef').onclick = () => { if (REF) setAB('ref'); else if (REFV) loadShared(); };
$('#refPick').onclick = () => { graph(); $('#refFile').click(); };
$('#refFile').onchange = async () => { const f = $('#refFile').files[0]; if (!f) return; $('#refName').hidden = false; $('#refName').textContent = '读取 REF…';
  await setRef(await f.arrayBuffer(), f.name.replace(/\.[^.]+$/, '')); setAB('ref'); };
async function loadShared() {   // 你发给客户的 REF：和版本一样加密存储
  if (!REFV || REF) return;
  graph(); $('#refName').hidden = false; $('#refName').textContent = '读取 REF…';
  try { const r = await fetch(REFV.audio); const plain = await open(KEY, new Uint8Array(await r.arrayBuffer()));
    await setRef(plain, REFV.file || 'REF', REFV.lufs); setAB('ref'); } catch (e) { $('#refName').textContent = 'REF 载入失败，刷新再试'; }
}
if (REFV) { $('#ab').classList.add('has'); $('#refPick').textContent = '换 REF'; }
document.addEventListener('keydown', e => { if (e.code === 'KeyR' && !/TEXTAREA|INPUT/.test(e.target.tagName) && (REF || REFV)) { e.preventDefault(); AB === 'ref' ? setAB('mix') : (REF ? setAB('ref') : loadShared()); } });
$('#loud').onclick = () => { loudBefore = null; LOUD = LMODES[(LMODES.indexOf(LOUD) + 1) % LMODES.length]; store.set('review:loud', LOUD || '0'); if (LOUD) { graph(); measureAll(); } applyGains(); };
// 记住了开着：第一次点播放时（有用户手势）接上
$('#play').addEventListener('click', () => { if ((LOUD || REF) && graph()) { if (LOUD) measureAll(); applyGains(); } }, true);
applyGains();
/* ───────── 母带数据：响度、真峰值、动态、立体声，和 REF 并排对比 ───────── */
const MSTAT = {}, skey = i => 'review:stats:' + String(V[i].audio).split('/').pop();
let refStats = null, mstOpen = false;
async function statsOf(i) {
  if (MSTAT[i]) return MSTAT[i];
  try { const c = JSON.parse(store.get(skey(i)) || 'null'); if (c && Number.isFinite(c.i)) return (MSTAT[i] = c); } catch (e) {}
  await libLufs();
  const s = await cuStats(await decodeBuf(await plainOf(i)));
  MSTAT[i] = s; store.set(skey(i), JSON.stringify(s));
  if (LU[i] === undefined && Number.isFinite(s.i)) LU[i] = s.i;
  return s;
}
const MROW = [   // [名称, 字段, 单位, 需要留意的条件]
  ['短时最大', 'stMax', 'LUFS'], ['瞬时最大', 'mMax', 'LUFS'], ['采样峰值', 'sp', 'dBFS', v => v > -0.1], ['PLR', 'plr', 'dB'],
  ['RMS', 'rms', 'dBFS'], ['峰均比', 'crest', 'dB'], ['立体声相关', 'corr', '', v => v < .2], ['侧 / 中', 'sm', 'dB'], ['削波采样', 'clip', '', v => v > 0]];
const MPLAT = [['Spotify', -14], ['YouTube', -14], ['Apple Music', -16], ['TIDAL', -14]];
const fx = (v, d = 1) => v === null || v === undefined || !Number.isFinite(v) ? '—' : (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);
function spark(list) {   // 短时响度曲线：当前版本实线，REF 虚线
  const all = list.flatMap(x => x.s.short), lo = Math.max(-40, Math.min(...all) - 1), hi = Math.max(...all) + 1, n = Math.max(...list.map(x => x.s.short.length), 2);
  return `<svg class="mspk" viewBox="0 0 300 56" preserveAspectRatio="none">${list.map(x => `<polyline class="${x.cls}" points="${x.s.short.map((v, k) =>
    (k / (n - 1) * 300).toFixed(1) + ',' + (54 - (Math.max(lo, v) - lo) / (hi - lo) * 52).toFixed(1)).join(' ')}"/>`).join('')}</svg>`;
}
async function showStats() {
  const el = $('#mst'); if (!mstOpen) return;
  const i = vi, tok = el.dataset.tok = String(Math.random());
  if (!MSTAT[i]) el.innerHTML = `<div class="mwait">${esc(vname(V[i]))} 测量中…</div>`;
  let s, r = null;
  try { s = await statsOf(i); } catch (e) { if (el.dataset.tok === tok) el.innerHTML = '<div class="mwait">测量失败，刷新再试</div>'; return; }
  if (REF && refBuf) { try { if (!refStats) { await libLufs(); refStats = await cuStats(refBuf); } r = refStats; } catch (e) {} }
  if (el.dataset.tok !== tok || !mstOpen) return;
  const col = (o, k) => o ? fx(o[k], k === 'corr' ? 2 : k === 'clip' ? 0 : 1) : '';
  const big = (lab, k, u, warn) => `<div class="mb${warn && warn(s[k]) ? ' warn' : ''}"><span>${lab}</span><b>${col(s, k)}</b><i>${u}</i>${r ? `<em>REF ${col(r, k)}</em>` : ''}</div>`;
  el.innerHTML = `<div class="mhd"><span>${esc(vname(V[i]))}</span>${r ? '<span class="mref">' + (CMP >= 0 ? esc(vname(V[CMP])) : 'REF') + '</span>' : ''}</div>
    <div class="mbig">${big('整体响度', 'i', 'LUFS')}${big('真峰值', 'tp', 'dBTP', v => v > -1)}${big('动态 LRA', 'lra', 'LU')}</div>
    ${spark([{ s, cls: 'a' }].concat(r ? [{ s: r, cls: 'b' }] : []))}
    <div class="mtab">${MROW.map(([lab, k, u, warn]) => `<div class="${warn && warn(s[k]) ? 'warn' : ''}"><span>${lab}</span><b>${col(s, k)}<i>${u}</i></b>${r ? `<b class="r">${col(r, k)}</b>` : ''}</div>`).join('')}</div>
    <div class="msub">平台播放时的音量调整</div>
    <div class="mtab">${MPLAT.map(([n, t]) => `<div><span>${n} <i>${t}</i></span><b>${s.i > t ? '−' + fx(s.i - t) : '+' + fx(t - s.i)}<i>dB</i></b>${r ? `<b class="r">${r.i > t ? '−' + fx(r.i - t) : '+' + fx(t - r.i)}</b>` : ''}</div>`).join('')}</div>
    <div class="mft">按审听文件测${fmtTag(i) ? ' · ' + fmtTag(i) : ''}</div>`;
}
$('#mstBtn').onclick = () => { mstOpen = !mstOpen; $('#mst').hidden = !mstOpen; $('#mstBtn').classList.toggle('on', mstOpen); $('#mstBtn').setAttribute('aria-pressed', mstOpen); showStats(); };
async function switchTo(i) {
  if (i === vi || !KEY) return;
  const token = ++switching, t = a.currentTime, playing = !a.paused;
  save();
  vi = i; cur = V[i]; showStats();
  P0 = P; P = cur.peaks; morphAt = performance.now();
  loadNotes(); render(); updateCta(); showMeta(); markSeg(); renderParts(); if (cfbRender) cfbRender();
  // 已经在后台备好的版本：直接换，不出 CU 动画，接着原来的位置播
  if (READY[i]) {
    const t2 = curTime();
    a.src = READY[i];
    await new Promise(r => a.addEventListener('loadedmetadata', r, { once: true }));
    if (token !== switching) return;
    a.currentTime = Math.min(t2, dur() - .1); lastT = a.currentTime; lastAt = performance.now();
    if (playing) a.play();
    $('#loading').style.opacity = 0; applyGains(); return;
  }
  const ld = $('#loading');
  ld.innerHTML = MARK + '<div class="dlt">' + vname(cur) + '</div>'; ld.classList.add('prog'); ld.style.opacity = 1;
  try {
    const st = { p: 0, done: false, fast: await cacheGet(i) !== null }, anim = runMark(ld, st);
    const url = await fetchVersion(i, (p, got, total) => { st.p = p; if (token === switching) ld.querySelector('.dlt').textContent = vname(cur) + ' 下载中 ' + Math.round(p * 100) + '% · ' + mb(got) + ' / ' + mb(total) + ' MB'; });
    st.done = true; st.p = 1; await anim;
    if (token !== switching) return;
    a.src = url;
    await new Promise(r => a.addEventListener('loadedmetadata', r, { once: true }));
    a.currentTime = Math.min(t, dur() - .1); lastT = a.currentTime; lastAt = performance.now();
    if (playing) a.play();
    $('#loading').style.opacity = 0;
    applyGains();
  } catch (e) { $('#loading').textContent = '载入失败，请刷新重试'; }
}
$('#seg').addEventListener('click', e => { const s = e.target.closest('.vsum'); if (s) { s.parentElement.classList.toggle('open'); s.setAttribute('aria-expanded', s.parentElement.classList.contains('open')); return; }
   const b = e.target.closest('.vrow'); if (b) switchTo(+b.dataset.i); });

addEventListener('resize', markSeg);
showMeta();

render(); requestAnimationFrame(draw);

/* ───────── 不提供下载：屏蔽右键 / 长按菜单 ───────── */
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('dragstart', e => e.preventDefault());
if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: S.title, artist: 'CU MUSIC · ChefDao' });

/* ───────── 收听报告（Insights）：开始听、离开时的总结推到刀大厨微信 ─────────
   在自己设备上打开一次 #me 网址，这台设备就不再上报。 */
if (location.hash === '#me') store.set('review:me', '1');
if (location.hash === '#notme') store.del('review:me');   // 自己测试时用
const ME = store.get('review:me') === '1';
let lid = store.get('review:lid');
if (!lid) { lid = Math.random().toString(36).slice(2, 5).toUpperCase(); store.set('review:lid', lid); }
// 听众自己留名字：看板和微信通知里显示名字而不是随机编号（你自己的设备不显示这个按钮）
let myName = store.get('review:name') || '';
const meLabel = () => myName ? myName + '（' + lid + '）' : '听众 ' + lid;
const showMe = () => { $('#meName').textContent = myName ? '我是 ' + myName : '留个名字'; $('#meName').classList.toggle('set', !!myName); };
showMe();
$('#meName').onclick = () => {
  const v = prompt('你的名字或 ID', myName); if (v === null) return;
  myName = v.trim().slice(0, 30); store.set('review:name', myName); showMe();
  if (WK) fetch(API_BASE + '/lself', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: WK, slug: S.slug, lid, name: myName }) }).catch(() => {});
};
const visits = (+store.get('review:visits:' + S.slug) || 0) + 1; store.set('review:visits:' + S.slug, visits);
const ua = navigator.userAgent;
// 来源：在哪个 App 里打开的（App 内置浏览器会在 UA 里留名字）；也认链接上的 ?from=xxx
const app = /Barcelona/i.test(ua) ? 'Threads' : /Instagram/i.test(ua) ? 'Instagram' : /FBAN|FBAV|FB_IAB/i.test(ua) ? 'Facebook' : /MicroMessenger/i.test(ua) ? '微信'
  : /xhsdiscover|XiaoHongShu/i.test(ua) ? '小红书' : /aweme|BytedanceWebview|douyin/i.test(ua) ? '抖音' : /musical_ly|TikTok/i.test(ua) ? 'TikTok' : /Weibo/i.test(ua) ? '微博'
  : / QQ\//.test(ua) ? 'QQ' : /KAKAOTALK/i.test(ua) ? 'KakaoTalk' : /NAVER\(inapp/i.test(ua) ? 'NAVER' : / Line\//.test(ua) ? 'LINE' : /Twitter/i.test(ua) ? 'X' : '';
const from = (new URLSearchParams(location.search).get('from') || '').replace(/[^\w\u4e00-\u9fff-]/g, '').slice(0, 12);
const device = (/iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? '安卓' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : '设备')
  + (app ? ' · ' + app : from ? ' · ' + from : '');
const BINS = 60, stats = {};
const st = () => stats[vi] || (stats[vi] = { sec: 0, sent: 0, saved: -1, ends: 0, bins: new Array(BINS).fill(0), pinged: false, seen: 0 });
const clock = () => new Date().toTimeString().slice(0, 5);
function beacon(title, html) {
  if (!PUSH || ME || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;   // 本地预览不推微信
  const q = new URLSearchParams({ token: PUSH, title, content: html, template: 'html' });
  fetch('https://www.pushplus.plus/send?' + q, { mode: 'no-cors', keepalive: true }).catch(() => {});
}
/* 同一份数据存进 stats.cumusic.work，给 insights 看板用 */
const STATS = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:8787/e' : 'https://stats.cumusic.work/e';
const sid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
// 访问记录：不管听没听，打开页面记一次（0 打开了），输对密码再记一次（1 查看了）。你自己的设备不记
const accessPing = state => {
  if (ME || store.get('insights:key') || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  fetch(API_BASE + '/v', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
    body: JSON.stringify({ sid, lid, kind: 'song', slug: S.slug, state, device, visit: visits }) }).catch(() => {});
};
accessPing(0);
// force：评论有变化时也要同步；sent：点了「发送给刀大厨」
function track(i, force, sent) {
  i = +i; const s = stats[i] || (i === vi ? st() : null), v = V[i]; if (!WK || ME || !s) return;
  if (!force && s.saved >= 0 && s.sec - s.saved < 1) return;
  s.saved = s.sec;
  let d = {}; try { d = JSON.parse(store.get(dataKey(i)) || '{}'); } catch (e) {}
  const cm = (d.notes || []).map(o => ({ t: Math.round(o.t * 10) / 10, m: String(o.m || '').slice(0, 500) }));
  const body = JSON.stringify({ k: WK, slug: S.slug, title: S.title, sid, ver: v.ver, lid, device, visit: visits,
    sec: Math.round(s.sec * 10) / 10, dur: v.duration, ends: s.ends, bins: s.bins.map(x => Math.round(x * 10) / 10), notes: cm.length,
    cm, ov: String(d.overall || '').slice(0, 1000), sent: !!sent });
  fetch(STATS, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
}
let lastPos = null;
a.addEventListener('timeupdate', () => {
  if (a.paused || !KEY) { lastPos = null; return; }
  const t = a.currentTime;
  if (lastPos !== null) {
    const d = t - lastPos;
    if (d > 0 && d < 1.5) { const s = st(); s.sec += d; s.bins[Math.min(BINS - 1, Math.floor(t / dur() * BINS))] += d; }
  }
  lastPos = t;
});
a.addEventListener('seeking', () => { lastPos = null; });
a.addEventListener('ended', () => { st().ends++; });
a.addEventListener('play', () => {
  const s = st(); if (s.pinged) return; s.pinged = true; track(vi);
  beacon('▶ 听众 ' + lid + ' 在听《' + S.title + '》' + cur.ver,
    '<p><b>' + esc(meLabel()) + '</b> 开始听 <b>《' + esc(S.title) + '》' + esc(cur.ver) + '</b></p><p>' + clock() + ' · ' + device + ' · 第 ' + visits + ' 次打开</p>');
});
const mmss = sec => Math.floor(sec / 60) + ' 分 ' + Math.round(sec % 60) + ' 秒';
function report() {
  Object.keys(stats).forEach(i => track(i));
  const parts = [];
  Object.keys(stats).forEach(i => {
    const s = stats[i], v = V[i]; if (s.sec - s.sent < 5) return;
    s.sent = s.sec;
    const len = v.duration / BINS, d = v.duration;
    const cover = Math.round(s.bins.filter(x => x >= len * .5).length / BINS * 100);
    let top = 0; s.bins.forEach((x, j) => { if (x > s.bins[top]) top = j; });
    const reps = s.bins[top] / len;
    let lo = top, hi = top;
    while (lo > 0 && s.bins[lo - 1] >= s.bins[top] * .75) lo--;
    while (hi < BINS - 1 && s.bins[hi + 1] >= s.bins[top] * .75) hi++;
    let n = 0; try { n = (JSON.parse(store.get(dataKey(+i)) || '{}').notes || []).length; } catch (e) {}
    parts.push('<p><b>' + esc(v.ver) + '</b>：听了 ' + mmss(s.sec) + '（整首 ' + fmt(d) + '），覆盖 ' + cover + '%'
      + (s.ends ? '，完整听完 ' + s.ends + ' 次' : '')
      + (reps >= 1.8 ? '<br>反复听最多：' + fmt(lo * len) + '–' + fmt((hi + 1) * len) + '（约 ' + Math.round(reps) + ' 遍）' : '')
      + (n ? '<br>写了 ' + n + ' 条评论' : '<br>还没写评论') + '</p>');
  });
  if (!parts.length) return;
  beacon('听众 ' + lid + ' · 《' + S.title + '》收听报告',
    '<p><b>' + esc(meLabel()) + '</b> · ' + clock() + ' · ' + device + '</p>' + parts.join(''));
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') report(); else loadReplies(); });
setInterval(() => { if (!a.paused) track(vi); }, 30000);
addEventListener('pagehide', report);

/* 记住过密码就直接进 */
// 自动解锁：这首歌记住的密码 → 记住的项目密码 → 同项目上一首用过的密码，依次试
const saved = store.get(PW_KEY);
let tries = [...new Set([S.auto, saved, PJ_KEY && store.get(PJ_KEY), PJ_KEY && store.get(PJ_KEY + ':last')].filter(Boolean))];   // S.auto：申请制项目批准后服务端给的密码
if (S.open || (S.project && S.project.open && S.project.wrap && !saved)) tryUnlock('', false);   // 不设密码：直接进
else if (tries.length) tryUnlock(tries.shift(), false);
else { noQuick(); setTimeout(focusPin, 300); }
})();
