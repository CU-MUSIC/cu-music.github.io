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
const V = S.versions;
let vi = V.length - 1, cur = V[vi];                       // 当前版本，默认最新
const dataKey = i => 'review:' + S.slug + ':' + V[i].ver.toLowerCase();

document.body.innerHTML = `
<div class="lock" id="lock">
  <div class="art"></div>
  <h1>${esc(S.title)}</h1>
  <div class="by" id="by">CU MUSIC · ChefDao 审听</div>
  <div class="ask" id="ask">输入密码收听</div>
  <div class="dots" id="dots"><i></i><i></i><i></i><i></i></div>
  <div class="spin"></div>
  <input class="pin" id="pin" type="tel" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" aria-label="密码">
</div>

<main class="app" id="app" aria-hidden="true">
  <header class="head">
    <div class="art"></div>
    <div>
      <div class="eyebrow">${esc(S.title)}</div>
      <h1 id="vfile">${esc(cur.file)}</h1>
      <div class="meta" id="vmeta"></div>
    </div>
  </header>
  <section class="vers open" id="seg"${V.length > 1 ? '' : ' hidden'}>
    <div class="vhead"><span class="n1">1</span><span class="t1" id="vt1"></span>
      <button class="stack press" id="stack" aria-label="展开/收起版本"><svg viewBox="0 0 24 24"><path d="M12 3 3 7.5l9 4.5 9-4.5L12 3z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/></svg></button>
      <span class="d1" id="vd1"></span></div>
    <div class="vwrap"><div><div class="vlist">${V.map((v, i) => [v, i]).reverse().map(([v, i]) =>
      `<button class="vrow" data-i="${i}"><span class="vb"><span class="vn">${esc(v.file)}</span><span class="vd">${esc(cdate(v.date))}${i === V.length - 1 ? ' · 最新' : ''}</span></span><span class="hasdot"></span><span class="vt"><b>${esc(v.ver.toLowerCase())}</b></span><span class="vdur">${fmt(v.duration)}</span></button>`).join('')}</div></div></div>
  </section>

  <div class="wave" id="wave"><canvas></canvas><div class="tip">0:00</div><div class="loading" id="loading">正在加载音频…</div></div>
  <div class="times"><span id="cur">0:00</span><span id="rem">-${fmt(cur.duration)}</span></div>
  <div class="transport">
    <button class="skip press" id="back" aria-label="后退 5 秒"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 3.5v3.7h3.7"/></svg><span>5</span></button>
    <button class="playbtn press" id="play" aria-label="播放" disabled>
      <svg class="pl" viewBox="0 0 24 24"><path d="M8 5.2v13.6c0 .8.9 1.3 1.6.9l10.6-6.8c.6-.4.6-1.4 0-1.8L9.6 4.3C8.9 3.9 8 4.4 8 5.2z"/></svg>
      <svg class="pa" viewBox="0 0 24 24"><rect x="6" y="4.5" width="4.2" height="15" rx="1.3"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.3"/></svg>
    </button>
    <button class="skip press" id="fwd" aria-label="前进 5 秒"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M20 3.5v3.7h-3.7"/></svg><span>5</span></button>
  </div>

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

/* ───────── 加解密 ───────── */
async function keyFor(pw) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: ub64(S.salt), iterations: S.iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}
const open = (key, u8) => crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(0, 12) }, key, u8.subarray(12));

/* ───────── 解锁 ───────── */
const pin = $('#pin'), dots = [...document.querySelectorAll('#dots i')];
const focusPin = () => pin.focus({ preventScroll: true });
$('#dots').onclick = focusPin; $('#lock').onclick = focusPin;
pin.addEventListener('input', () => {
  pin.value = pin.value.replace(/\D/g, '').slice(0, 4);
  dots.forEach((d, i) => d.classList.toggle('on', i < pin.value.length));
  $('#ask').classList.remove('err'); $('#ask').textContent = '输入密码收听';
  if (pin.value.length === 4) tryUnlock(pin.value, true);
});
async function tryUnlock(pw, typed) {
  $('#lock').classList.add('busy'); pin.blur();
  try {
    const key = await keyFor(pw);
    await open(key, ub64(S.check));                       // 密码错会在这里抛错
    store.set(PW_KEY, pw);
    if (S.token) PUSH = new TextDecoder().decode(await open(key, ub64(S.token)));
    if (S.wkey) WK = new TextDecoder().decode(await open(key, ub64(S.wkey)));
    splash();
    const minWait = new Promise(r => setTimeout(r, typed ? 900 : 650));
    const slow = setTimeout(() => { $('#by').textContent = '正在载入…'; }, 1600);
    await Promise.all([loadAudio(key), minWait]);
    clearTimeout(slow);
    enterApp();
  } catch (e) {
    $('#lock').classList.remove('busy');
    store.del(PW_KEY);
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
function enterApp() {
  // FLIP：解锁页的封面平滑移动、缩放到页头封面的位置
  const L = $('#lock'), from = L.querySelector('.art'), to = $('#app .head .art');
  $('#app').removeAttribute('aria-hidden');
  [...$('#app').children].forEach((el, i) => el.style.setProperty('--i', i));
  const a1 = from.getBoundingClientRect(), a2 = to.getBoundingClientRect();
  const dx = a2.left + a2.width / 2 - (a1.left + a1.width / 2), dy = a2.top + a2.height / 2 - (a1.top + a1.height / 2);
  const k = a2.width / a1.width;
  to.style.opacity = 0;
  L.classList.add('leaving');
  from.style.transform = `translate(${dx}px,${dy}px) scale(${k})`;
  from.style.borderRadius = (14 / k) + 'px';
  $('#app').classList.add('in');
  setTimeout(() => { to.style.opacity = ''; L.remove(); }, 700);
  markSeg(); updateCta();
}
let KEY = null;
const urls = {};
async function fetchVersion(i) {
  if (!urls[i]) urls[i] = (async () => {
    const r = await fetch(V[i].audio);
    const plain = await open(KEY, new Uint8Array(await r.arrayBuffer()));
    return URL.createObjectURL(new Blob([plain], { type: 'audio/mpeg' }));
  })();
  try { return await urls[i]; } catch (e) { delete urls[i]; throw e; }
}
async function loadAudio(key) {
  KEY = key;
  try {
    if (a.src) return;
    a.src = await fetchVersion(vi);
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
  // 评论标记
  ctx.fillStyle = 'rgba(236,234,230,.95)';
  notes.forEach(o => { const x = o.t / dur() * w; ctx.beginPath(); ctx.arc(x, h - 2.5, 2.5, 0, 7); ctx.fill(); });
  // 播放头
  if (tt > 0 || !a.paused) { ctx.fillStyle = '#ebe9e5'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px - 1, 2, 2, h - 10, 1) : ctx.rect(px - 1, 2, 2, h - 10); ctx.fill(); }

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

function render(newId) {
  const list = $('#list'); list.innerHTML = '';
  notes.forEach(o => {
    const row = document.createElement('div'); row.className = 'row' + (o.id === newId ? ' new' : '');
    row.innerHTML = '<button class="t press"></button><div class="m"></div><button class="x" aria-label="删除"><svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2 2 10"/></svg></button>';
    const t = row.querySelector('.t'); t.textContent = fmt(o.t);
    t.onclick = () => { seek(o.t); if (a.paused && !$('#play').disabled) a.play(); };
    row.querySelector('.m').textContent = o.m;
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
  $('#vt1').textContent = cur.file; $('#vd1').textContent = fmt(cur.duration);
}
function showMeta() {
  $('#vfile').textContent = cur.file;
  $('#vmeta').innerHTML = '<b>' + esc(cur.ver) + '</b>' + fmt(cur.duration) + ' · ' + esc(cdate(cur.date)) + (V.length > 1 ? ' · 共 ' + V.length + ' 版' : '');
  $('#mt').textContent = S.title + ' · ' + cur.ver;
}
let switching = 0;
async function switchTo(i) {
  if (i === vi || !KEY) return;
  const token = ++switching, t = a.currentTime, playing = !a.paused;
  save();
  vi = i; cur = V[i];
  P0 = P; P = cur.peaks; morphAt = performance.now();
  loadNotes(); render(); updateCta(); showMeta(); markSeg();
  $('#loading').textContent = '正在载入 ' + cur.ver + '…'; $('#loading').style.opacity = 1;
  try {
    const url = await fetchVersion(i);
    if (token !== switching) return;
    a.src = url;
    await new Promise(r => a.addEventListener('loadedmetadata', r, { once: true }));
    a.currentTime = Math.min(t, dur() - .1); lastT = a.currentTime; lastAt = performance.now();
    if (playing) a.play();
    $('#loading').style.opacity = 0;
  } catch (e) { $('#loading').textContent = '载入失败，请刷新重试'; }
}
$('#seg').addEventListener('click', e => { const b = e.target.closest('.vrow'); if (b) switchTo(+b.dataset.i); });
$('#stack').onclick = () => $('#seg').classList.toggle('open');
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
const device = (/iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? '安卓' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : '设备')
  + (/MicroMessenger/i.test(ua) ? ' · 微信内打开' : '');
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
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') report(); });
setInterval(() => { if (!a.paused) track(vi); }, 30000);
addEventListener('pagehide', report);

/* 记住过密码就直接进 */
const saved = store.get(PW_KEY);
if (saved) tryUnlock(saved, false); else setTimeout(focusPin, 300);
})();
