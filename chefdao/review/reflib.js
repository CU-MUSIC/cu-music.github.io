// 参考库：你内录的商业歌曲，只在你自己的设备上用（Insights 上传管理，审听页挑一首当 REF）
//   加密：密钥从管理钥匙（localStorage['insights:key']）用 HKDF 派生——只有登录过 Insights 的设备解得开，服务器只存密文。
//         和每首歌的审听密码无关；管理钥匙换了，旧的参考库就解不开了（要重新上传）。
//   cuRefLib.list(api, key) → [{ id, title, artist, genre, duration, lufs, file }]
//   cuRefLib.pair(files) → [{ file, meta }]（音频 + 同名 .json）· walk(entriesOf(dataTransfer)) → 展开拖进来的文件夹
//   cuRefLib.upload({ api, key, file, meta?, genre, lib, step, bar }) → item     （WAV/AIFF 转 m4a，要先加载 upload.js；lib = 现有列表，重复的抛 e.dup）
//   cuRefLib.open(api, key, item) → ArrayBuffer（明文音频，m4a / mp3；密文缓存在本机 Cache Storage）
//   cuRefLib.cached() → Set(文件名) · prefetch(api, key, items, onp) 全部存到本机 · uncache(file)
//   cuRefLib.save(api, key, { id, title?, artist?, genre? }) · drop(api, key, id) · genre(api, key, from, to)
(() => {
const te = new TextEncoder();
let KC = null, KFOR = '';
async function libKey(admin) {
  if (KC && KFOR === admin) return KC;
  const ikm = await crypto.subtle.importKey('raw', te.encode(admin), 'HKDF', false, ['deriveKey']);
  KC = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: te.encode('cu-reflib'), info: te.encode('audio-v1') }, ikm,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  KFOR = admin; return KC;
}
async function call(api, key, path, body) {
  const r = await fetch(api + path, body ? { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { headers: { Authorization: 'Bearer ' + key }, cache: 'no-store' });
  const j = await r.json().catch(() => ({ ok: false }));
  if (!j.ok) throw new Error(j.e || ('HTTP ' + r.status));
  return j;
}
const rid = (n, abc) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => abc[b % abc.length]).join('');
// 「歌手 - 歌名.wav」→ 歌手 / 歌名；没有「 - 」就整个当歌名
function nameOf(fn) {
  const raw = fn.replace(/\.[^.]+$/, '').replace(/\s*\(\d+\.\d+-\d+\.\d+\)$/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();   // 录音工具的「(0.00-3.20)」时间后缀去掉
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(raw);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: raw };
}
async function upload(o) {
  const step = o.step || (() => {}), bar = o.bar || (() => {}), E = window.cuEnc;
  if (!E) throw new Error('upload.js 没加载');
  // 比较歌名时去掉「(0.00-3.24)」时间后缀：库里早期条目的歌名带着它，也算同一首
  const file = o.file, M = o.meta || null, norm = v => String(v || '').replace(/\s*\(\d+\.\d+-\d+\.\d+\)$/, '').toLowerCase().replace(/\s+/g, ' ').trim();
  // 旁边有同名 .json（录音工具写的）：歌名 / 歌手 / 风格以它为准；有 Spotify id 就按 id 去重，有时长就不用解码先查重
  const n0 = M && M.title ? { title: String(M.title).trim(), artist: String(M.artist || '').trim() } : nameOf(file.name);
  const same = d => (o.lib || []).find(x => (M && M.spotify_id && x.spid === M.spotify_id) ||
    (norm(x.title) === norm(n0.title) && norm(x.artist) === norm(n0.artist) && Math.abs((x.duration || 0) - d) < 1));
  const mdur = M ? +(M.length_s || (M.duration_ms ? M.duration_ms / 1000 : 0)) : 0;
  if (mdur > 0 || (M && M.spotify_id)) { const d0 = same(mdur || -9); if (d0) { const e = new Error('已在库里'); e.dup = d0; throw e; } }
  step('读取文件…'); bar(.03);
  const buf = await file.arrayBuffer();
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  step('解码…'); bar(.08);
  const AC = window.AudioContext || window.webkitAudioContext, sr = E.wavRate(buf);
  let ac; try { ac = new AC({ sampleRate: sr === 44100 || sr === 48000 ? sr : 48000 }); } catch (e) { ac = new AC(); }
  const au = await new Promise((ok, no) => { const p = ac.decodeAudioData(buf.slice(0), ok, no); if (p && p.catch) p.catch(no); });
  // 重复：歌名、歌手一样，时长差不到 1 秒 → 不转码不上传，直接跳过
  const dup = same(au.duration);
  if (dup) { if (ac.close) ac.close(); const e = new Error('已在库里'); e.dup = dup; throw e; }
  step('测响度…'); bar(.12);
  let lufs = null; try { await E.loadLib('lufs.js', 'cuLufs'); const L = await cuLufs(au); lufs = L && Number.isFinite(L.i) ? Math.round(L.i * 10) / 10 : (Number.isFinite(L) ? Math.round(L * 10) / 10 : null); } catch (e) {}
  const LIM = 24 * 1048576 - 64;
  let bytes, mime;
  if (ext === 'mp3' && buf.byteLength <= LIM) { bytes = new Uint8Array(buf); mime = 'audio/mpeg'; }
  else if (['m4a', 'mp4', 'aac'].includes(ext) && buf.byteLength <= LIM) { bytes = new Uint8Array(buf); mime = 'audio/mp4'; }
  else if (await E.aacOk(au)) {
    const k = Math.max(128, Math.min(320, Math.floor(LIM * 8 / au.duration / 1000 * .96 / 32) * 32));
    step('转成 m4a' + (k < 320 ? '（AAC ' + k + 'k）' : '') + '…');
    bytes = await E.toM4A(au, p => bar(.15 + p * .5), k * 1000); mime = 'audio/mp4';
  } else throw new Error('这个浏览器不支持 m4a 编码，用 Chrome / Safari 再试');
  if (ac.close) ac.close();
  if (bytes.length > LIM) throw new Error('文件太大（超过 24MB）');
  step('加密…'); bar(.68);
  const key = await libKey(o.key), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const blob = new Uint8Array(12 + ct.length); blob.set(iv); blob.set(ct, 12);
  const id = rid(10, 'abcdefghijkmnpqrstuvwxyz23456789'), fname = id + '-' + rid(8, 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789') + '.bin';
  step('上传…'); bar(.72);
  await new Promise((ok, no) => {
    const x = new XMLHttpRequest(); x.open('PUT', o.api + '/rlib/audio?f=' + fname);
    x.setRequestHeader('Authorization', 'Bearer ' + o.key); x.setRequestHeader('Content-Type', 'application/octet-stream');
    x.upload.onprogress = e => { if (e.lengthComputable) bar(.72 + e.loaded / e.total * .25); };
    x.onload = () => x.status === 200 ? ok() : no(new Error(x.status === 413 ? '文件太大' : '上传失败 ' + x.status));
    x.onerror = () => no(new Error('网络断了，再试一次')); x.send(blob);
  });
  const j = await call(o.api, o.key, '/rlib/save', { id, file: fname, title: n0.title || '未命名', artist: n0.artist, genre: (M && M.genre) || o.genre || '',
    album: (M && M.album) || '', spid: (M && M.spotify_id) || '',
    duration: Math.round(au.duration * 100) / 100, lufs, mime, size: blob.length });
  if (j.dup) { const e = new Error('已在库里'); e.dup = j.item; throw e; }
  if (cacheOk()) try { await (await caches.open(CN)).put(ckey(fname), new Response(blob)); } catch (e) {}   // 刚传的顺手存到本机   // 服务器按 Spotify id 判出重复
  bar(1);
  return j.item;
}
// 拖进来的东西：文件夹也展开（drop 事件里先同步拿 entries，再交给这里）
async function walk(entries) {
  const out = [];
  const go = async en => {
    if (!en) return;
    if (en.isFile) { out.push(await new Promise((ok, no) => en.file(ok, no))); return; }
    if (en.isDirectory) { const rd = en.createReader(); for (;;) { const b = await new Promise((ok, no) => rd.readEntries(ok, no)); if (!b.length) break; for (const x of b) await go(x); } }
  };
  for (const en of entries) await go(en);
  return out;
}
const entriesOf = dt => [...((dt && dt.items) || [])].map(i => i.webkitGetAsEntry ? i.webkitGetAsEntry() : null);
// 音频 + 同名 .json 配对 → [{ file, meta }]；只有 json 没有音频的忽略
async function pair(files) {
  files = [...files]; const base = f => f.name.replace(/\.[^.]+$/, '');
  const js = new Map(files.filter(f => /\.json$/i.test(f.name)).map(f => [base(f), f]));
  const au = files.filter(f => /\.(wav|aif|aiff|m4a|mp4|aac|mp3)$/i.test(f.name) || (/^audio\//.test(f.type) && !/\.json$/i.test(f.name)));
  return Promise.all(au.map(async f => { let meta = null; const j = js.get(base(f)); if (j) try { meta = JSON.parse(await j.text()); } catch (e) {} return { file: f, meta }; }));
}
const CACHE = new Map();
// 本机缓存：把加密的音频存进浏览器的 Cache Storage（文件名不会变，存一次一直能用），下次挂 REF 不用再下载；存的是密文，解密在用的时候做
const CN = 'cu-reflib-v1', ckey = f => location.origin + '/__reflib/' + f;
const cacheOk = () => !!(window.caches && window.isSecureContext !== false);
let persistAsked = false;
async function getEnc(api, key, file) {
  if (cacheOk()) try { const hit = await (await caches.open(CN)).match(ckey(file)); if (hit) return new Uint8Array(await hit.arrayBuffer()); } catch (e) {}
  const r = await fetch(api + '/rlib/a/' + file, { headers: { Authorization: 'Bearer ' + key } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const u8 = new Uint8Array(await r.arrayBuffer());
  if (cacheOk()) try {
    if (!persistAsked && navigator.storage && navigator.storage.persist) { persistAsked = true; navigator.storage.persist().catch(() => {}); }   // 请浏览器别在空间紧张时自动清掉
    await (await caches.open(CN)).put(ckey(file), new Response(u8, { headers: { 'Content-Type': 'application/octet-stream' } }));
  } catch (e) {}
  return u8;
}
async function cached() {   // 已经存在本机的文件名
  if (!cacheOk()) return new Set();
  try { return new Set((await (await caches.open(CN)).keys()).map(r => decodeURIComponent(r.url.split('/__reflib/')[1] || ''))); } catch (e) { return new Set(); }
}
async function prefetch(api, key, items, onp, par = 4) {   // 把还没存的全部存到本机；同时下 4 首（韩国到 Cloudflare 单线只有 0.5～0.8MB/s，并行能快一倍左右）
  const have = await cached(), todo = items.filter(x => !have.has(x.file)), n = todo.length;
  let next = 0, done = 0, fail = null;
  if (onp) onp(0, n, null);
  const worker = async () => { while (next < n && !fail) { const x = todo[next++]; try { await getEnc(api, key, x.file); done++; if (onp) onp(done, n, x); } catch (e) { fail = e; } } };
  await Promise.all(Array.from({ length: Math.min(par, n) }, worker));
  if (fail) throw fail;
  return n;
}
async function prune(items) {   // 库里已经删掉的歌（在别的设备删的也算）：本机存的那份也清掉
  const keep = new Set(items.map(x => x.file)), have = await cached(); let n = 0;
  for (const f of have) if (f && !keep.has(f)) { await uncache(f); n++; }
  return n;
}
async function uncache(file) { if (cacheOk()) try { await (await caches.open(CN)).delete(ckey(file)); } catch (e) {} }
async function open(api, key, item) {
  if (CACHE.has(item.file)) return CACHE.get(item.file).slice(0);
  const u8 = await getEnc(api, key, item.file);
  let plain;
  try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(0, 12) }, await libKey(key), u8.subarray(12)); }
  catch (e) { uncache(item.file); throw new Error('解不开：管理钥匙换过了？'); }
  CACHE.clear(); CACHE.set(item.file, plain);   // 内存里只留最近一首
  return plain.slice(0);
}
window.cuRefLib = {
  list: async (api, key) => (await call(api, key, '/rlib')).items,
  upload, open, nameOf, pair, walk, entriesOf, cached, prefetch, uncache, prune,
  save: async (api, key, o) => (await call(api, key, '/rlib/save', o)).item,
  drop: async (api, key, id, file) => { const j = await call(api, key, '/rlib/drop', { id }); if (file) uncache(file); return j; },
  genre: (api, key, from, to) => call(api, key, '/rlib/genre', { from, to }),
};
})();
