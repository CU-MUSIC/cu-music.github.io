// 上传审听版本（看板和审听页共用）：浏览器里分析波形、WAV 先转 m4a、用审听密码加密，再传到 stats.cumusic.work
//   WAV / AIFF 自动转 m4a（AAC 320k）；m4a / mp3 原样上传
//   const r = await cuUpload({ api, key, file, slug | (title, pass), ver?, date?, step: t => {}, bar: p => {} })
//   → { slug, title, pass, ver, url }
(() => {
const b64e = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const here = (document.currentScript && document.currentScript.src) || location.href;
// 舞步 Mix @ChefDao_V3_1022.m4a → 歌名 / 版本 / 日期；Edit / Mix / Master 不算歌名
function cuNameInfo(fn) {
  const raw = fn.replace(/\.[^.]+$/, '');
  const m = raw.match(/_V(\d+)_(\d{2})(\d{2})$/);
  // 歌名去掉流程后缀：_premaster / _master / _mix / _edit / _bip / _bounce / _final / _demo 这类，以及结尾的 _2 编号
  const title = raw.replace(/_V\d+_\d{4}$/, '').replace(/@ChefDao.*$/i, '').trim().replace(/[_ ]\d+$/, '')
    .replace(/([_\s-]+(pre-?master|master(ed)?|mix(down)?|edit|bip|bounce|final|print|stem[s]?|ref))+$/i, '').trim();
  return { raw, title, ver: m ? 'V' + (+m[1]) : '', date: m ? `${new Date().getFullYear()}-${m[2]}-${m[3]}` : '' };
}
// WAV 头里的采样率（不是 WAV 返回 0）
function wavRate(buf) {
  try { const d = new DataView(buf); if (d.getUint32(0) !== 0x52494646 || d.getUint32(8) !== 0x57415645) return 0;
    for (let p = 12; p + 8 < d.byteLength;) { const id = d.getUint32(p), n = d.getUint32(p + 4, true); if (id === 0x666d7420) return d.getUint32(p + 12, true); p += 8 + n + (n & 1); }
  } catch (e) {} return 0;
}
const AAC = (au) => ({ codec: 'mp4a.40.2', sampleRate: au.sampleRate, numberOfChannels: Math.min(2, au.numberOfChannels), bitrate: 320000 });
async function aacOk(au) {
  try { return !!(window.AudioEncoder && (await AudioEncoder.isConfigSupported(AAC(au))).supported); } catch (e) { return false; }
}
function loadLib(file, glob) {
  return window[glob] ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement('script');
    s.src = new URL(file, here).href; s.onload = ok; s.onerror = () => no(new Error(file)); document.head.appendChild(s); });
}
function loadMuxer() {
  return window.Mp4Muxer ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement('script');
    s.src = new URL('enc/mp4-muxer.min.js', here).href; s.onload = ok; s.onerror = () => no(new Error('m4a')); document.head.appendChild(s); });
}
// AAC 320k 编码 + 封装成 m4a（fastStart，边下边播）
async function toM4A(au, onp) {
  await loadMuxer();
  const cfg = AAC(au), nch = cfg.numberOfChannels, sr = au.sampleRate, len = au.length;
  const target = new Mp4Muxer.ArrayBufferTarget();
  const mux = new Mp4Muxer.Muxer({ target, audio: { codec: 'aac', numberOfChannels: nch, sampleRate: sr }, fastStart: 'in-memory' });
  let err = null;
  const enc = new AudioEncoder({ output: (c, m) => mux.addAudioChunk(c, m), error: e => { err = e; } });
  enc.configure(cfg);
  const chans = [...Array(nch)].map((_, i) => au.getChannelData(i)), F = 8192;
  for (let o = 0; o < len; o += F) {
    const n = Math.min(F, len - o), data = new Float32Array(n * nch);
    for (let c = 0; c < nch; c++) data.set(chans[c].subarray(o, o + n), c * n);
    enc.encode(new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: nch, timestamp: Math.round(o / sr * 1e6), data }));
    if (enc.encodeQueueSize > 64) await new Promise(r => setTimeout(r, 0));
    if (o % (F * 32) === 0) { onp(o / len); await new Promise(r => setTimeout(r, 0)); }
    if (err) throw err;
  }
  await enc.flush(); enc.close();
  if (err) throw err;
  mux.finalize(); onp(1);
  return new Uint8Array(target.buffer);
}
async function cuUpload(o) {
  const step = o.step || (() => {}), bar = o.bar || (() => {});
  const api = async (path, opt = {}) => {
    const r = await fetch(o.api + path, { ...opt, headers: { Authorization: 'Bearer ' + o.key, ...(opt.headers || {}) } });
    const j = await r.json().catch(() => ({ ok: false }));
    if (!j.ok) throw new Error(j.e || ('HTTP ' + r.status));
    return j;
  };
  const prep = await api('/radm/prep', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(o.slug ? { slug: o.slug } : { title: o.title, pass: o.pass }) });
  step('读取文件…'); bar(.05);
  const file = o.file, buf = await file.arrayBuffer();
  step('分析波形…'); bar(.12);
  const AC = window.AudioContext || window.webkitAudioContext;
  const srcRate = wavRate(buf), want = srcRate === 44100 || srcRate === 48000 ? srcRate : 48000;
  let ac; try { ac = new AC({ sampleRate: want }); } catch (e) { ac = new AC(); }
  const au = await new Promise((ok, no) => { const p = ac.decodeAudioData(buf.slice(0), ok, no); if (p && p.catch) p.catch(no); });
  const N = 400, ch = [...Array(au.numberOfChannels)].map((_, i) => au.getChannelData(i)), len = au.length, pk = [];
  for (let i = 0; i < N; i++) { let mx = 0; const a = Math.floor(i * len / N), b = Math.floor((i + 1) * len / N);
    for (const c of ch) for (let j = a; j < b; j += 2) { const v = c[j] < 0 ? -c[j] : c[j]; if (v > mx) mx = v; } pk.push(mx); }
  const pm = Math.max(...pk) || 1, peaks = pk.map(v => Math.round(v / pm * 100) / 100);
  step('测响度…');
  let lufs; try { await loadLib('lufs.js', 'cuLufs'); lufs = await cuLufs(au); } catch (e) {}
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  let bytes, mime;
  if (ext === 'mp3') { bytes = new Uint8Array(buf); mime = 'audio/mpeg'; }
  else if (['m4a', 'mp4', 'aac'].includes(ext)) { bytes = new Uint8Array(buf); mime = 'audio/mp4'; }
  else if (await aacOk(au)) {   // WAV / AIFF：转成 m4a（AAC 320k），用浏览器自带的编码器
    step('转成 m4a…');
    bytes = await toM4A(au, p => bar(.15 + p * .45));
    mime = 'audio/mp4';
  }
  else {   // 浏览器不支持 AAC 编码时才退回 MP3 320k
    step('这个浏览器不支持 m4a 编码，改转 MP3 320k…');
    const toI16 = f => { const out = new Int16Array(f.length); for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); out[i] = v < 0 ? v * 0x8000 : v * 0x7fff; } return out; };
    const L = toI16(ch[0]), R = ch[1] ? toI16(ch[1]) : null;
    bytes = await new Promise((ok, no) => {
      const w = new Worker(new URL('enc/mp3.js', here));
      w.onmessage = e => { if (e.data.done) { w.terminate(); ok(e.data.mp3); } else bar(.15 + e.data.p * .45); };
      w.onerror = () => { w.terminate(); no(new Error('mp3')); };
      w.postMessage({ id: 1, L, R, rate: au.sampleRate, kbps: 320 }, R ? [L.buffer, R.buffer] : [L.buffer]);
    });
    mime = 'audio/mpeg';
  }
  if (ac.close) ac.close();
  step('加密…'); bar(.62);
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(prep.pass || 'cu-open'), 'PBKDF2', false, ['deriveKey']);   // 不设密码：用公开口令
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64d(prep.salt), iterations: prep.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const seal = async u8 => { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, u8));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out; };
  const blob = await seal(bytes);
  if (blob.length > 25 * 1048576) throw new Error('文件太大（超过 25MB），请导出 m4a 或 mp3 再传');
  const ver = (String(o.ver || '').trim().toUpperCase().replace(/^(\d)/, 'V$1')) || prep.next;
  if (!/^(V\d{1,3}|REF)$/.test(ver)) throw new Error('版本要写成 V1、V2 这样');
  const fname = ver.toLowerCase() + '-' + [...crypto.getRandomValues(new Uint8Array(8))].map(b => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 55]).join('') + '.bin';
  step('上传…'); bar(.7);
  await new Promise((ok, no) => {   // 用 XHR 才有上传进度
    const x = new XMLHttpRequest(); x.open('PUT', o.api + '/radm/audio?s=' + prep.slug + '&f=' + fname);
    x.setRequestHeader('Authorization', 'Bearer ' + o.key); x.setRequestHeader('Content-Type', 'application/octet-stream');
    x.upload.onprogress = e => { if (e.lengthComputable) bar(.7 + e.loaded / e.total * .27); };
    x.onload = () => x.status === 200 ? ok() : no(new Error(x.status === 413 ? '文件太大（超过 25MB）' : '上传失败 ' + x.status));
    x.onerror = () => no(new Error('网络断了，再试一次')); x.send(blob);
  });
  const n = cuNameInfo(file.name), date = /^\d{4}-\d{2}-\d{2}$/.test(o.date || '') ? o.date : new Date().toLocaleDateString('sv-SE');
  const te = new TextEncoder();
  const res = await api('/radm/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    slug: prep.slug, title: prep.title, pass: prep.pass, salt: prep.salt, project: o.project || undefined,
    chk: prep.fresh ? b64e(await seal(te.encode('ok'))) : undefined,
    token: prep.push ? b64e(await seal(te.encode(prep.push))) : '', wkey: b64e(await seal(te.encode(prep.wk))),
    version: { ver, file: n.raw, date, duration: Math.round(au.duration * 100) / 100, peaks, audio: fname, mime, lufs } }) });
  bar(1);
  return { slug: prep.slug, title: prep.title, pass: prep.pass, ver, url: res.url, next: prep.next };
}
window.cuUpload = cuUpload; window.cuNameInfo = cuNameInfo;
})();
