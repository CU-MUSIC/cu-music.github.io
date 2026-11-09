// 参考库：你内录的商业歌曲，只在你自己的设备上用（Insights 上传管理，审听页挑一首当 REF）
//   加密：密钥从管理钥匙（localStorage['insights:key']）用 HKDF 派生——只有登录过 Insights 的设备解得开，服务器只存密文。
//         和每首歌的审听密码无关；管理钥匙换了，旧的参考库就解不开了（要重新上传）。
//   cuRefLib.list(api, key) → [{ id, title, artist, genre, duration, lufs, file }]
//   cuRefLib.upload({ api, key, file, genre, step, bar }) → item     （WAV/AIFF 转 m4a，要先加载 upload.js）
//   cuRefLib.open(api, key, item) → ArrayBuffer（明文音频，m4a / mp3）
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
  const raw = fn.replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(raw);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: raw };
}
async function upload(o) {
  const step = o.step || (() => {}), bar = o.bar || (() => {}), E = window.cuEnc;
  if (!E) throw new Error('upload.js 没加载');
  step('读取文件…'); bar(.03);
  const file = o.file, buf = await file.arrayBuffer();
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  step('解码…'); bar(.08);
  const AC = window.AudioContext || window.webkitAudioContext, sr = E.wavRate(buf);
  let ac; try { ac = new AC({ sampleRate: sr === 44100 || sr === 48000 ? sr : 48000 }); } catch (e) { ac = new AC(); }
  const au = await new Promise((ok, no) => { const p = ac.decodeAudioData(buf.slice(0), ok, no); if (p && p.catch) p.catch(no); });
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
  const n = nameOf(file.name);
  const j = await call(o.api, o.key, '/rlib/save', { id, file: fname, title: n.title || '未命名', artist: n.artist, genre: o.genre || '',
    duration: Math.round(au.duration * 100) / 100, lufs, mime, size: blob.length });
  bar(1);
  return j.item;
}
const CACHE = new Map();
async function open(api, key, item) {
  if (CACHE.has(item.file)) return CACHE.get(item.file).slice(0);
  const r = await fetch(api + '/rlib/a/' + item.file, { headers: { Authorization: 'Bearer ' + key } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const u8 = new Uint8Array(await r.arrayBuffer());
  let plain;
  try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(0, 12) }, await libKey(key), u8.subarray(12)); }
  catch (e) { throw new Error('解不开：管理钥匙换过了？'); }
  CACHE.clear(); CACHE.set(item.file, plain);   // 只留最近一首，省内存
  return plain.slice(0);
}
window.cuRefLib = {
  list: async (api, key) => (await call(api, key, '/rlib')).items,
  upload, open, nameOf,
  save: async (api, key, o) => (await call(api, key, '/rlib/save', o)).item,
  drop: (api, key, id) => call(api, key, '/rlib/drop', { id }),
  genre: (api, key, from, to) => call(api, key, '/rlib/genre', { from, to }),
};
})();
