// 按专辑封面给审听页 / 项目页的深色底加「一点点」色：取封面主色相，饱和度压得很低（约 12%–34%），亮度仍然很暗，只在顶部有一团柔光
//   cuTint('https://stats.cumusic.work/cv/xxx/yyy.jpg')   第二次打开用本地记住的色相，不闪
(function () {
  const KEY = 'review:tint:';
  const apply = h => {
    let st = document.getElementById('tint-css'); if (!st) { st = document.createElement('style'); st.id = 'tint-css'; document.head.appendChild(st); }
    st.textContent = ':root{--bg:hsl(' + h + ',11%,6.6%);--tint-glow:hsla(' + h + ',32%,24%,.5)}'
      + 'body{background:radial-gradient(125% 56% at 50% -8%,var(--tint-glow),transparent 64%),radial-gradient(120% 60% at 50% -10%,rgba(236,234,230,.04),transparent 60%),var(--bg)!important}'
      + 'html{background:var(--bg)!important}';
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', 'hsl(' + h + ',11%,6.6%)');
  };
  window.cuTint = async function (url) {
    if (!url) return;
    let cached = null; try { cached = localStorage.getItem(KEY + url); } catch (e) {}
    if (cached !== null && cached !== '') apply(+cached);
    try {
      const blob = await (await fetch(url + (url.indexOf('?') < 0 ? '?c=1' : ''), { mode: 'cors' })).blob();
      const bmp = await createImageBitmap(blob), N = 24, c = document.createElement('canvas'); c.width = c.height = N;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(bmp, 0, 0, N, N);
      const d = x.getImageData(0, 0, N, N).data; let sx = 0, sy = 0, wsum = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx, s = mx ? (mx - mn) / mx : 0;
        if (v < 0.14 || s < 0.12) continue;   // 近黑、近灰的像素不参与（封面的黑边、灰底不决定颜色）
        let h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4; h = (h * 60 + 360) % 360;
        const w = s * s * v; sx += Math.cos(h * Math.PI / 180) * w; sy += Math.sin(h * Math.PI / 180) * w; wsum += w;
      }
      if (wsum < 1.2) { try { localStorage.setItem(KEY + url, ''); } catch (e) {} return; }   // 封面基本无彩色：保持中性深灰
      const h = Math.round((Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360);
      try { localStorage.setItem(KEY + url, String(h)); } catch (e) {}
      apply(h);
    } catch (e) {}
  };
})();
