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
const cdate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); return m ? (+m[2]) + '月' + (+m[3]) + '日' : d; };
const REFV = S.versions.find(v => v.ver === 'REF') || null;   // 你发给客户的参考曲
const V = S.versions.filter(v => v.ver !== 'REF');
// 版本名精简：「舞步 Edit @ChefDao_V2_1018」→「编辑 V2」；按文件名里的 Edit / Mix / Master 分阶段，编辑在前、混音在后
const STAGE = { edit: '编辑', mix: '混音', master: '母带' };
const stageOf = v => { const f = String(v.file || '').replace(/@ChefDao.*$/i, '').replace(/_/g, ' ');
  if (/\bpre-?master/i.test(f)) return 'mix';
  const m = /\b(Edit|Mix|Master)\b/i.exec(f); return m ? m[1].toLowerCase() : ''; };
const vname = v => (STAGE[stageOf(v)] ? STAGE[stageOf(v)] + ' ' : '') + v.ver;
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
  <section class="vpick" id="seg"${V.length > 1 ? '' : ' hidden'}>${(() => {
    // 版本选择：按阶段一组一排小按钮「编辑 V1 V2 · 混音 V3」，当前版本高亮
    const groups = [];
    V.forEach((v, i) => { const st = stageOf(v); if (!groups.length || groups[groups.length - 1].st !== st) groups.push({ st, items: [] }); groups[groups.length - 1].items.push(i); });
    return groups.map(g => `<div class="vg">${STAGE[g.st] ? `<span class="vgl">${STAGE[g.st]}</span>` : ''}${g.items.map(i =>
      `<button class="vrow press" data-i="${i}"><span class="vn">${esc(V[i].ver)}</span><span class="hasdot"></span></button>`).join('')}</div>`).join('');
  })()}</section>

  <div class="own" id="own" hidden><span id="ownT">拖音频文件到页面任意位置，上传为新版本</span><button class="press" id="ownPart">＋ 段落</button><button class="press" id="ownShareP" hidden>分享项目</button><button class="press" id="ownShare">分享</button><button class="press" id="ownPick">选择文件</button><input type="file" id="ownFile" accept="audio/*,.m4a,.mp3,.wav,.aif,.aiff" hidden></div>
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
    <button class="loud press" id="refPick">＋ 加 REF</button><button class="loud press" id="mstBtn" aria-pressed="false">数据</button><input type="file" id="refFile" accept="audio/*,.m4a,.mp3,.wav,.aif,.aiff" hidden></div>
  <div class="refname" id="refName" hidden></div>
  <section class="mst" id="mst" hidden></section>
  <aside class="plist" id="plist" hidden></aside>

  <div class="sect">评论<span class="r" id="tipline">听到想改的地方，直接写</span></div>
  <div class="composer">
    <span class="stamp" id="stamp"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg><span id="stampT">0:00</span></span>
    <textarea id="txt" rows="1" placeholder="留下评论…"></textarea>
    <button class="send" id="add" aria-label="添加评论"><svg viewBox="0 0 24 24"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg></button>
  </div>
  <div class="chips" id="chips"></div>

  <div class="sect">我的评论<span class="n" id="n">0</span></div>
  <div class="group" id="list"></div>
  <div class="empty" id="empty">还没有评论，播放时随时写下来</div>
  <section id="cfb" hidden><div class="sect">客户评论<span class="r" id="cfn"></span></div><div class="group" id="cfl"></div></section>

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
    const kb = vv.height < window.innerHeight * 0.82;
    L.classList.toggle('kb', kb);
    L.style.bottom = kb ? 'auto' : ''; L.style.height = kb ? vv.height + 'px' : ''; L.style.top = kb ? vv.offsetTop + 'px' : '';
  };
  vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
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
    store.set(PW_KEY, spw); if (PJ_KEY && pw) store.set(PJ_KEY + ':last', pw);   // 同项目切到下一首时先试这个
    document.title = S.title;
    if (S.token) PUSH = new TextDecoder().decode(await open(key, ub64(S.token)));
    if (S.wkey) WK = new TextDecoder().decode(await open(key, ub64(S.wkey)));
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
    if (!typed && tries.length) return tryUnlock(tries.shift(), false);   // 记住的密码不对（比如项目改过密码）：换下一个记住的试
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
// 播放列表：同一个项目里的其他曲目（cypher 一首接一首），点了直接切过去（项目密码记着，不用再输）
async function loadPlaylist() {
  if (!S.project) return;
  try {
    const j = await (await fetch(API_BASE + '/pj?s=' + S.project.slug, { cache: 'no-store' })).json();
    const T = j.ok ? j.project.tracks : []; if (T.length < 2) return;
    const el = $('#plist');
    el.innerHTML = `<div class="plh"><span>${esc(j.project.title)}</span><i>${T.length} 首</i></div>` + T.map((t, i) => `<a class="pli press${t.slug === S.slug ? ' on' : ''}" href="${esc(t.url)}">
      <span class="n">${String(i + 1).padStart(2, '0')}</span><span class="t">${esc(t.title)}${t.artist ? `<i>${esc(t.artist)}</i>` : ''}</span><span class="m">${fmt(t.dur)}</span></a>`).join('');
    el.hidden = false;
    el.onclick = e => {   // 同一个页面只换 # 不会刷新，手动刷新一下
      const l = e.target.closest('.pli'); if (!l) return; e.preventDefault(); if (l.classList.contains('on')) return;
      const u = new URL(l.href); if (u.pathname === location.pathname) { location.hash = u.hash; location.reload(); } else location.href = u.pathname + u.hash;
    };
  } catch (e) {}
}
function enterApp() {
  setTimeout(prefetchOthers, 600);
  loadPlaylist();
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
let PARTS = (S.parts || []).slice().sort((x, y) => x.t - y.t), partNow = -2;
let onPart = i => { seek(PARTS[i].t); if (a.paused && !$('#play').disabled) $('#play').click(); };
const partAt = t => { let k = -1; PARTS.forEach((p, i) => { if (p.t <= t + .05) k = i; }); return k; };
function renderParts() {
  const el = $('#parts'); el.hidden = !PARTS.length; partNow = -2;
  el.innerHTML = PARTS.map((p, i) => { const s = Math.min(1, p.t / dur()), e = Math.min(1, (PARTS[i + 1] ? PARTS[i + 1].t : dur()) / dur());
    return `<button class="pt press" data-i="${i}" style="left:${(s * 100).toFixed(2)}%;width:${(Math.max(0, e - s) * 100).toFixed(2)}%" title="${esc(fmt(p.t) + ' ' + p.n)}"><span>${esc(p.n)}</span></button>`; }).join('');
}
$('#parts').addEventListener('click', e => { const b = e.target.closest('.pt'); if (b) onPart(+b.dataset.i); });
a.addEventListener('loadedmetadata', renderParts);
renderParts();
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
  // 段落分界线
  ctx.fillStyle = 'rgba(236,234,230,.22)';
  PARTS.forEach(p => { if (p.t > .5) ctx.fillRect(Math.round(p.t / dur() * w), 0, 1, h); });
  // 评论标记
  ctx.fillStyle = 'rgba(236,234,230,.95)';
  notes.forEach(o => { const x = o.t / dur() * w; ctx.beginPath(); ctx.arc(x, h - 2.5, 2.5, 0, 7); ctx.fill(); });
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
let drag = false;
cv.addEventListener('pointerdown', e => { drag = true; cv.setPointerCapture(e.pointerId); seek(frac(e) * dur()); });
box.addEventListener('pointermove', e => {
  hover = frac(e); box.classList.add('hov');
  const tip = box.querySelector('.tip'), w = cv.clientWidth;
  const near = notes.find(o => Math.abs(o.t / dur() * w - hover * w) < 7);
  tip.textContent = near ? fmt(near.t) + ' · ' + (near.m.length > 16 ? near.m.slice(0, 16) + '…' : near.m) : fmt(hover * dur());
  tip.classList.toggle('note', !!near);
  tip.style.left = Math.min(w - tip.offsetWidth / 2, Math.max(tip.offsetWidth / 2, hover * w)) + 'px';
  if (drag) seek(hover * dur());
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
  clearTimeout(syncT); syncT = setTimeout(() => track(vi, true), 1500); };
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
}
$('#add').onclick = add;
txt.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(hover:hover)').matches) { e.preventDefault(); add(); } });

// 「已处理」分隔线（参考 Samply 的 Completed）
function doneSep() { const d = document.createElement('div'); d.className = 'donesep'; d.textContent = '已处理'; return d; }
// 评论行加上「刀大厨：回复」和「✓ 已处理」
function decorate(row, r) {
  row.classList.toggle('done', !!(r && r.done));
  row.querySelectorAll('.rp,.dn').forEach(x => x.remove());
  const m = row.querySelector('.m'); if (!r) return;
  if (r.done) { const d = document.createElement('span'); d.className = 'dn'; d.textContent = '✓ 已处理'; m.appendChild(d); }
  if (r.reply) { const p = document.createElement('div'); p.className = 'rp'; p.innerHTML = '<b>刀大厨</b>'; p.appendChild(document.createTextNode(r.reply)); m.appendChild(p); }
}
async function loadReplies() {
  if (!WK) return;
  try {
    const j = await (await fetch(API_BASE + '/cr?s=' + S.slug + '&k=' + encodeURIComponent(WK), { cache: 'no-store' })).json();
    if (!j.ok) return;
    REPLIES = new Map(j.replies.map(x => [rk(x.ver, x.t, x.m), x]));
    render();
  } catch (e) {}
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
    decorate(row, REPLIES.get(rk(cur.ver, o.t, o.m)));
    row.querySelector('.x').onclick = () => {
      row.classList.add('out');
      setTimeout(() => { notes = notes.filter(n => n !== o); render(); save(); updateCta(); }, 260);
    };
    list.appendChild(row);
  });
  $('#n').textContent = notes.length; $('#empty').hidden = notes.length > 0;
}
$('#overall').addEventListener('input', () => { save(); updateCta(); grow($('#overall')); });

/* ───────── 发送 ───────── */
const hud = (msg, ms = 2600) => { const h = $('#hud'); h.textContent = msg; h.classList.add('show'); clearTimeout(hud.t); hud.t = setTimeout(() => h.classList.remove('show'), ms); };
function updateCta() {
  const has = notes.length || $('#overall').value.trim();
  $('#cta').classList.toggle('show', !!has && $('#app').classList.contains('in'));
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
function markSeg() {
  document.querySelectorAll('#seg .vrow').forEach(b => {
    const i = +b.dataset.i; let has = false;
    try { const d = JSON.parse(store.get(dataKey(i)) || '{}'); has = (d.notes || []).length > 0 || !!(d.overall || '').trim(); } catch (e) {}
    b.classList.toggle('has', has); b.classList.toggle('on', i === vi); b.setAttribute('aria-current', i === vi);
  });

}
function showMeta() {
  // 大字是歌名，小字是当前版本和日期
  const tag = fmtTag(vi);
  $('#vmeta').innerHTML = esc(vname(cur) + ' · ' + cdate(cur.date)) + (tag ? '<span class="ftag' + (tag === 'Lossless' ? ' ll' : '') + '">' + esc(tag) + '</span>' : '');
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
  const live = window.SONG_LIVE, key = store.get('insights:key');
  if (!live || !key) return;
  const own = $('#own'); own.hidden = false;
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
  // 段落：播放到某段开头点「＋ 段落」记下这里换谁唱；点上方的名字改名，清空就删掉这段
  const names = String(S.artist || '').split('、').filter(Boolean);
  const saveParts = async () => {
    try { await post('/radm/meta', { slug: S.slug, parts: PARTS }); busy('段落已保存，客户那边同步显示'); } catch (e) { busy('段落没保存上，检查网络再试'); }
  };
  $('#ownPart').onclick = () => {
    const t = Math.round(curTime() * 10) / 10, k = PARTS.filter(p => p.t < t).length;
    const v = prompt(fmt(t) + ' 开始这段是谁' + (names.length ? '（歌手：' + names.join('、') + '）' : ''), names[k] || '');
    if (!v || !v.trim()) return;
    PARTS = PARTS.filter(p => Math.abs(p.t - t) > .3).concat({ t, n: v.trim() }).sort((x, y) => x.t - y.t); renderParts(); saveParts();
  };
  onPart = i => {
    const p = PARTS[i], v = prompt(fmt(p.t) + ' 这段的歌手（清空就删掉这段）', p.n); if (v === null) return;
    if (v.trim()) p.n = v.trim(); else PARTS.splice(i, 1);
    renderParts(); saveParts();
  };
  // 每个版本旁边一个「删除」
  document.querySelectorAll('.vrow').forEach(row => {
    const v = V[+row.dataset.i], x = document.createElement('span');
    x.className = 'vdel'; x.setAttribute('role', 'button'); x.setAttribute('aria-label', '删除 ' + v.ver); x.textContent = '×';
    x.onclick = async e => {
      e.stopPropagation();
      if (!confirm('删除《' + S.title + '》' + v.ver + '？客户将看不到这个版本，删了不能恢复')) return;
      try { busy('正在删除 ' + v.ver + '…'); await post('/radm/del', { slug: S.slug, ver: v.ver }); location.reload(); }
      catch (err) { busy('没删掉，检查网络再试'); }
    };
    row.appendChild(x);
  });
  if (V.length < 2) $('#seg').hidden = true;   // 只剩一版时列表本来就不显示，删除按钮放到上传条里
  if (V.length === 1) {
    const x = document.createElement('button'); x.className = 'press'; x.textContent = '删除 ' + V[0].ver;
    x.onclick = async () => { if (!confirm('删除《' + S.title + '》' + V[0].ver + '？这是唯一的版本，删了客户就听不到了')) return;
      try { await post('/radm/del', { slug: S.slug, ver: V[0].ver }); location.reload(); } catch (e) { busy('没删掉，检查网络再试'); } };
    own.appendChild(x);
  }
  let loading = null;
  const lib = () => loading || (loading = new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = '../upload.js?v=20261023'; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc); }));
  async function up(file) {
    if (!file || own.classList.contains('busy')) return;
    try {
      await lib();
      const n = cuNameInfo(file.name);
      const next = 'V' + (V.reduce((m, v) => Math.max(m, parseInt(v.ver.slice(1)) || 0), 0) + 1);
      const ver = n.ver || next;
      if (V.some(v => v.ver === ver) && !confirm(ver + ' 已经有了，要覆盖吗？')) return;
      if (!confirm('把「' + file.name + '」上传为《' + S.title + '》' + ver + '？')) return;
      own.classList.add('busy');
      const r = await cuUpload({ api: live.api, key, file, slug: S.slug, ver, date: n.date, step: busy,
        bar: p => own.style.setProperty('--p', Math.round(p * 100) + '%') });
      busy('《' + S.title + '》' + r.ver + ' 已上线，正在刷新…');
      setTimeout(() => location.reload(), 800);
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
      busy('REF 已上线，正在刷新…'); setTimeout(() => location.reload(), 800);
    } catch (e) { own.classList.remove('busy'); busy(e.message); }
  };
  if (REFV) {
    const xb = document.createElement('button'); xb.className = 'press'; xb.textContent = '删除 REF';
    xb.onclick = async () => { if (!confirm('删除发给客户的 REF？')) return;
      try { await post('/radm/del', { slug: S.slug, ver: 'REF' }); location.reload(); } catch (e) { busy('没删掉，检查网络再试'); } };
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
    const names = new Map((j.listeners || []).map(x => [x.lid, x.name]));
    const items = [];
    (j.feedback || []).filter(f => f.slug === S.slug).forEach(f => {
      let cm = []; try { cm = JSON.parse(f.comments || '[]'); } catch (e) {}
      const who = names.get(f.lid) || ('听众 ' + f.lid);
      cm.forEach(c => items.push({ ver: f.ver, t: c.t, m: c.m, who, sent: f.sent, at: f.updated }));
      if (f.overall) items.push({ ver: f.ver, t: null, m: '整体：' + f.overall, who, sent: f.sent, at: f.updated });
    });
    if (!items.length) return;
    // 同一条评论客户可能在两次打开里都同步过：按 版本+时间点+内容 去重
    const seen = new Set(), list = items.sort((x, y) => x.ver.localeCompare(y.ver, 'en', { numeric: true }) || (x.t ?? 1e9) - (y.t ?? 1e9))
      .filter(x => { const k = x.ver + '|' + x.t + '|' + x.m; if (seen.has(k)) return false; seen.add(k); return true; });
    const mine = new Map();
    try {   // 已有的回复 / 完成
      const rj = await (await fetch(API + '/cr?s=' + S.slug, { headers: { Authorization: 'Bearer ' + key }, cache: 'no-store' })).json();
      if (rj.ok) rj.replies.forEach(x => mine.set(rk(x.ver, x.t, x.m), x));
    } catch (e) {}
    // 只显示正在听的这一版的评论；切版本时重画
    cfbRender = () => {
    const box = $('#cfl'); box.innerHTML = '';
    const done = o => { const r = mine.get(rk(o.ver, o.t, o.m)); return !!(r && r.done); };
    const all = list.filter(o => o.ver === cur.ver), here = all.filter(o => !done(o)).concat(all.filter(done));
    const rows = []; let sep = false;
    here.forEach(o => {
      if (!sep && done(o)) { sep = true; box.appendChild(doneSep()); }
      const row = document.createElement('div'); row.className = 'row';
      row.innerHTML = '<button class="t press"></button><div class="m"></div>';
      const tb = row.querySelector('.t');
      tb.textContent = o.t == null ? '整体' : fmt(o.t);
      if (o.t == null) tb.disabled = true; else tb.onclick = () => jumpTo(o.ver, o.t);
      row.querySelector('.m').textContent = o.m;
      if (o.t != null) {
        const k = rk(o.ver, o.t, o.m), acts = document.createElement('div'); acts.className = 'acts';
        acts.innerHTML = '<button class="press" data-a="reply">回复</button><button class="press" data-a="done">✓ 完成</button>';
        const sync = () => { const r = mine.get(k); decorate(row, r); acts.querySelector('[data-a=done]').classList.toggle('on', !!(r && r.done));
          acts.querySelector('[data-a=reply]').textContent = r && r.reply ? '改回复' : '回复'; };
        const save = async body => {
          try {
            const r = await fetch(API + '/cr', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
              body: JSON.stringify({ slug: S.slug, ver: o.ver, t: o.t, m: o.m, ...body }) });
            const j = await r.json(); if (!j.ok) throw new Error();
            if (!j.reply && !j.done) mine.delete(k); else mine.set(k, { reply: j.reply, done: j.done });
            cfbRender();
          } catch (e) { alert('没存上，检查网络再试'); }
        };
        acts.querySelector('[data-a=reply]').onclick = () => { const r = mine.get(k); const v = prompt('回复这条评论（客户会在审听页看到）：\n「' + o.m + '」', (r && r.reply) || ''); if (v !== null) save({ reply: v }); };
        acts.querySelector('[data-a=done]').onclick = () => { const r = mine.get(k); save({ done: !(r && r.done) }); };
        row.querySelector('.m').after(acts);
        rows.push(sync);
      }
      box.appendChild(row);
    });
    rows.forEach(f => f());
    $('#cfn').textContent = here.length ? here.length + ' 条 · ' + [...new Set(here.map(x => x.who))].join('、') : '这一版还没有';
    $('#cfb').hidden = false;
    };
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
$('#loud').onclick = () => { LOUD = LMODES[(LMODES.indexOf(LOUD) + 1) % LMODES.length]; store.set('review:loud', LOUD || '0'); if (LOUD) { graph(); measureAll(); } applyGains(); };
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
  el.innerHTML = `<div class="mhd"><span>${esc(vname(V[i]))}</span>${r ? '<span class="mref">REF</span>' : ''}</div>
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
$('#seg').addEventListener('click', e => { const b = e.target.closest('.vrow'); if (b) switchTo(+b.dataset.i); });

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
    '<p><b>听众 ' + lid + '</b> 开始听 <b>《' + esc(S.title) + '》' + esc(cur.ver) + '</b></p><p>' + clock() + ' · ' + device + ' · 第 ' + visits + ' 次打开</p>');
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
    '<p><b>听众 ' + lid + '</b> · ' + clock() + ' · ' + device + '</p>' + parts.join(''));
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') report(); else loadReplies(); });
setInterval(() => { if (!a.paused) track(vi); }, 30000);
addEventListener('pagehide', report);

/* 记住过密码就直接进 */
// 自动解锁：这首歌记住的密码 → 记住的项目密码 → 同项目上一首用过的密码，依次试
const saved = store.get(PW_KEY);
let tries = [...new Set([saved, PJ_KEY && store.get(PJ_KEY), PJ_KEY && store.get(PJ_KEY + ':last')].filter(Boolean))];
if (S.open || (S.project && S.project.open && S.project.wrap && !saved)) tryUnlock('', false);   // 不设密码：直接进
else if (tries.length) tryUnlock(tries.shift(), false);
else setTimeout(focusPin, 300);
})();
