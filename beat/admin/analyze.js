// 测 BPM 和调性：浏览器里用 Essentia.js（RhythmExtractor2013 + KeyExtractor）分析音频
//   const { bpm, key, alt, conf } = await beatAnalyze(blobOrArrayBuffer)
//   bpm 是整数；key 是 Cm / F# 这种写法；alt 是关系大小调；conf 是调性把握度 0–1
// Essentia 约 2.5MB，第一次用到才从 jsDelivr 加载
(() => {
const CDN = 'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/';
let ready = null;
function load() {
  if (!ready) ready = (async () => {
    const [{ EssentiaWASM }, core] = await Promise.all([import(CDN + 'essentia-wasm.es.js'), import(CDN + 'essentia.js-core.es.js')]);
    if (!EssentiaWASM.calledRun) await new Promise(ok => { const prev = EssentiaWASM.onRuntimeInitialized; EssentiaWASM.onRuntimeInitialized = () => { prev && prev(); ok(); }; });
    return new core.default(EssentiaWASM);
  })().catch(e => { ready = null; throw e; });
  return ready;
}

// 解码 → 单声道 44.1k。太长的只取中间 2 分钟，够准也快
async function mono(src) {
  const buf = src instanceof ArrayBuffer ? src : await src.arrayBuffer();
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  let au;
  try { au = await ac.decodeAudioData(buf); } finally { ac.close && ac.close(); }
  const SR = 44100, MAX = 120;
  const start = au.duration > MAX + 20 ? Math.min(20, au.duration - MAX) : 0, len = Math.min(au.duration - start, MAX);
  const off = new OfflineAudioContext(1, Math.ceil(len * SR), SR);
  const s = off.createBufferSource(); s.buffer = au; s.connect(off.destination); s.start(0, start, len);
  return (await off.startRendering()).getChannelData(0);
}

// 说唱 / Trap 常见 60–180：测出一半或两倍时折回这个范围
const fold = b => { while (b < 65) b *= 2; while (b > 185) b /= 2; return Math.round(b); };

// 关系大小调（Am ↔ C）：听感最容易混，界面上一起给出
const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const ALIAS = { Db: 'C#', 'D#': 'Eb', Gb: 'F#', 'G#': 'Ab', 'A#': 'Bb' };
function relative(note, minor) {
  const i = NOTES.indexOf(ALIAS[note] || note); if (i < 0) return '';
  return minor ? NOTES[(i + 3) % 12] : NOTES[(i + 9) % 12] + 'm';
}

window.beatAnalyze = async src => {
  const [E, x] = await Promise.all([load(), mono(src)]);
  await new Promise(r => setTimeout(r, 0));
  const v = E.arrayToVector(x);
  const r = E.RhythmExtractor2013(v, 208, 'multifeature', 40);
  const k = E.KeyExtractor(v, true, 4096, 4096, 12, 3500, 60, 25, 0.2, 'edma', 44100);
  // 用所有节拍点做直线拟合求每拍时长，比 Essentia 直接给的 BPM 稳（160 不会变成 161.5）
  let bpm = r.bpm;
  try {
    const t = E.vectorToArray(r.ticks), n = t.length;
    if (n > 16) {
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (let i = 0; i < n; i++) { sx += i; sy += t[i]; sxx += i * i; sxy += i * t[i]; }
      const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
      if (slope > 0 && Math.abs(60 / slope - r.bpm) < r.bpm * 0.05) bpm = 60 / slope;
    }
  } catch (e) {}
  const minor = k.scale === 'minor';
  const out = { bpm: fold(bpm), key: k.key + (minor ? 'm' : ''), alt: relative(k.key, minor), conf: Math.round(k.strength * 100) / 100 };
  try { v.delete(); } catch (e) {}
  return out;
};
})();
