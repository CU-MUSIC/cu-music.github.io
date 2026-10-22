// 整体响度（Integrated LUFS，ITU-R BS.1770-4）：K 计权 → 400ms 块（75% 重叠）→ -70 LUFS 绝对门限 + -10 LU 相对门限
//   const lufs = await cuLufs(audioBuffer)
// 审听页「响度统一」和上传时测响度共用。K 计权用标准的两级双二阶滤波（按采样率现算系数），和 ffmpeg ebur128 对得上
(() => {
function biquad(type, fc, G, Q, fs) {
  const A = Math.pow(10, G / 40), w = 2 * Math.PI * fc / fs, c = Math.cos(w), al = Math.sin(w) / (2 * Q), sA = 2 * Math.sqrt(A) * al;
  let b0, b1, b2, a0, a1, a2;
  if (type === 'shelf') {
    b0 = A * ((A + 1) + (A - 1) * c + sA); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - sA);
    a0 = (A + 1) - (A - 1) * c + sA; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - sA;
  } else {
    b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al;
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function filt(x, k) {
  const [b0, b1, b2, a1, a2] = k, y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
async function cuLufs(au) {
  const fs = au.sampleRate, n = au.length, ch = Math.min(2, au.numberOfChannels);
  const s1 = biquad('shelf', 1681.974450955533, 3.999843853973347, .7071752369554196, fs);
  const s2 = biquad('hp', 38.13547087602444, 0, .5003270373238773, fs);
  const data = [];
  for (let i = 0; i < ch; i++) { data.push(filt(filt(au.getChannelData(i), s1), s2)); await new Promise(r => setTimeout(r, 0)); }
  const blk = Math.round(fs * .4), hop = Math.round(fs * .1), z = [];
  for (let s = 0; s + blk <= n; s += hop) {
    let sum = 0;
    for (const d of data) { let m = 0; for (let j = s; j < s + blk; j++) m += d[j] * d[j]; sum += m / blk; }
    z.push(sum);
  }
  const L = x => -0.691 + 10 * Math.log10(x);
  const abs = z.filter(x => x > 0 && L(x) > -70);
  if (!abs.length) return -70;
  const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const g = abs.filter(x => L(x) > rel);
  return Math.round(L(g.reduce((a, b) => a + b, 0) / g.length) * 10) / 10;
}
window.cuLufs = cuLufs;

// 母带数据：一次算完。响度按 BS.1770 / EBU R128（LRA 按 EBU Tech 3342），真峰值 4 倍过采样
//   const s = await cuStats(audioBuffer) → { i, lra, stMax, mMax, tp, sp, rms, crest, plr, corr, sm, clip, short }
const TAPS = (() => {   // 4 倍插值滤波器：65 阶加窗 sinc，相位 0 正好落在原采样点
  const L = 65, h = new Float64Array(L);
  for (let m = 0; m < L; m++) { const x = (m - 32) / 4, s = x ? Math.sin(Math.PI * x) / (Math.PI * x) : 1;
    h[m] = s * (0.42 - 0.5 * Math.cos(2 * Math.PI * m / (L - 1)) + 0.08 * Math.cos(4 * Math.PI * m / (L - 1))); }
  return [1, 2, 3].map(p => { const k = []; for (let m = p; m < L; m += 4) k.push(h[m]); return Float64Array.from(k); });
})();
function truePeak(x) {
  let pk = 0;
  for (const k of TAPS) {
    const n = k.length;
    for (let i = n; i < x.length; i++) { let v = 0; for (let j = 0; j < n; j++) v += k[j] * x[i - j]; if (v < 0) v = -v; if (v > pk) pk = v; }
  }
  return pk;
}
const dB = x => x > 0 ? 20 * Math.log10(x) : -Infinity;
const r1 = x => Number.isFinite(x) ? Math.round(x * 10) / 10 : null;
async function cuStats(au) {
  const fs = au.sampleRate, n = au.length, ch = Math.min(2, au.numberOfChannels), tick = () => new Promise(r => setTimeout(r, 0));
  const raw = []; for (let i = 0; i < ch; i++) raw.push(au.getChannelData(i));
  const s1 = biquad('shelf', 1681.974450955533, 3.999843853973347, .7071752369554196, fs);
  const s2 = biquad('hp', 38.13547087602444, 0, .5003270373238773, fs);
  const kw = []; for (const d of raw) { kw.push(filt(filt(d, s1), s2)); await tick(); }
  // 每 100ms 一段的 K 计权能量，400ms（瞬时/整体）和 3s（短时/LRA）都由它拼出来
  const hop = Math.round(fs * .1), segs = Math.floor(n / hop), E = new Float64Array(segs);
  for (let s = 0; s < segs; s++) { let sum = 0; for (const d of kw) { let m = 0; for (let j = s * hop, e = j + hop; j < e; j++) m += d[j] * d[j]; sum += m / hop; } E[s] = sum; }
  const win = w => { const out = []; let acc = 0; for (let s = 0; s < segs; s++) { acc += E[s]; if (s >= w) acc -= E[s - w]; if (s >= w - 1) out.push(acc / w); } return out; };
  const L = x => -0.691 + 10 * Math.log10(x);
  const M = win(4), ST = win(30);
  const gated = (z, rel) => { const a = z.filter(x => x > 0 && L(x) > -70); if (!a.length) return []; const t = L(a.reduce((p, q) => p + q, 0) / a.length) + rel; return a.filter(x => L(x) > t); };
  const g = gated(M, -10), I = g.length ? L(g.reduce((p, q) => p + q, 0) / g.length) : -70;
  const sg = gated(ST, -20).map(L).sort((p, q) => p - q), pct = q => sg[Math.min(sg.length - 1, Math.max(0, Math.round(q * (sg.length - 1))))];
  const lra = sg.length ? pct(.95) - pct(.1) : 0;
  const mMax = M.length ? L(Math.max(...M)) : -Infinity, stMax = ST.length ? L(Math.max(...ST)) : -Infinity;
  // 峰值、RMS、立体声、削波
  let sp = 0, sq = 0, clip = 0, lr = 0, l2 = 0, r2 = 0, mid = 0, side = 0;
  for (let c = 0; c < ch; c++) { const d = raw[c]; for (let i = 0; i < n; i++) { const v = d[i] < 0 ? -d[i] : d[i]; if (v > sp) sp = v; sq += d[i] * d[i]; if (v >= .9999) clip++; } }
  if (ch === 2) { const [a, b] = raw; for (let i = 0; i < n; i++) { const x = a[i], y = b[i]; lr += x * y; l2 += x * x; r2 += y * y; const m = x + y, s = x - y; mid += m * m; side += s * s; } }
  await tick();
  let tp = 0; for (const d of raw) { tp = Math.max(tp, truePeak(d)); await tick(); }
  tp = Math.max(tp, sp);
  const rms = dB(Math.sqrt(sq / (n * ch)));
  // 短时响度曲线（每秒一个点），画小图用
  const short = []; for (let k = 20; k < ST.length; k += 10) short.push(r1(Math.max(-60, L(ST[k]))));
  return { i: r1(I), lra: r1(lra), stMax: r1(stMax), mMax: r1(mMax), tp: r1(dB(tp)), sp: r1(dB(sp)), rms: r1(rms), crest: r1(dB(sp) - rms),
    plr: r1(dB(tp) - I), corr: ch === 2 && l2 && r2 ? Math.round(lr / Math.sqrt(l2 * r2) * 100) / 100 : null,
    sm: ch === 2 && mid ? r1(10 * Math.log10(side / mid)) : null, clip, dur: Math.round(n / fs), short };
}
window.cuStats = cuStats;
})();
