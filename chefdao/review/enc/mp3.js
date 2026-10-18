importScripts('lame.min.js');

self.onmessage = e => {
  const {id, L, R, rate, kbps} = e.data;
  const ch = R ? 2 : 1;
  const enc = new lamejs.Mp3Encoder(ch, rate, kbps);
  const BLK = 1152, out = [];
  let total = 0, last = 0;
  for (let i = 0; i < L.length; i += BLK) {
    const l = L.subarray(i, i + BLK);
    const d = R ? enc.encodeBuffer(l, R.subarray(i, i + BLK)) : enc.encodeBuffer(l);
    if (d.length) { out.push(d); total += d.length; }
    if (i - last > BLK * 400) { last = i; self.postMessage({id, p: i / L.length}); }
  }
  const tail = enc.flush();
  if (tail.length) { out.push(tail); total += tail.length; }

  const mp3 = new Uint8Array(total);
  let o = 0;
  for (const d of out) { mp3.set(d, o); o += d.length; }
  self.postMessage({id, done: true, mp3}, [mp3.buffer]);
};
