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
})();
