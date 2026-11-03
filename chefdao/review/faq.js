// 回复框（只在你的设备用）：写回复时可以搜 price 页的 FAQ，点一条就把答案填进来。FAQ 每次从 /chefdao/price/ 现读，改了价格页这里自动跟着变
(() => {
  let FAQ = null;
  const strip = s => String(s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
  async function load() {
    if (FAQ) return FAQ;
    const html = await (await fetch('/chefdao/price/', { cache: 'no-cache' })).text();
    const i = html.indexOf('faqItems: ['); if (i < 0) throw new Error('faq');   // 第一份是中文
    let d = 0, j = i + 10, q = null;
    for (; j < html.length; j++) { const c = html[j];
      if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') q = c; else if (c === '[') d++; else if (c === ']' && !--d) break; }
    const arr = new Function('return ' + html.slice(i + 10, j + 1))();
    return FAQ = arr.map(x => ({ q: strip(x.q), a: strip(x.a) + (x.list && x.list.length ? '\n' + x.list.map(strip).map(s => '· ' + s).join('\n') : '') }));
  }
  const css = `.cuR{position:fixed;inset:0;z-index:2000;display:flex;align-items:flex-end;justify-content:center;background:rgba(10,10,12,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:cuRf .18s ease both}
@media (min-width:640px){.cuR{align-items:center}}
@keyframes cuRf{from{opacity:0}}@keyframes cuRu{from{transform:translateY(16px);opacity:0}}
.cuR .bx{width:min(560px,100%);max-height:88vh;display:flex;flex-direction:column;gap:10px;background:#1f2125;color:#d6d3cd;border-radius:18px 18px 0 0;padding:18px 16px calc(16px + env(safe-area-inset-bottom));box-shadow:0 20px 60px rgba(0,0,0,.4);animation:cuRu .24s cubic-bezier(.2,.8,.2,1) both;font:15px/1.6 -apple-system,"PingFang SC",sans-serif}
@media (min-width:640px){.cuR .bx{border-radius:18px}}
.cuR .qt{font-size:13px;color:#8f8c86;border-left:2px solid #3a3d43;padding-left:10px;max-height:4.8em;overflow:auto}
.cuR textarea{width:100%;box-sizing:border-box;min-height:110px;resize:vertical;border:1px solid #33363c;border-radius:12px;background:#17181b;color:inherit;font:inherit;padding:10px 12px;outline:none}
.cuR textarea:focus,.cuR input:focus{border-color:#5d6a60}
.cuR .fq{display:flex;gap:8px;align-items:center}
.cuR .fq input{flex:1;border:1px solid #33363c;border-radius:999px;background:#17181b;color:inherit;font:inherit;font-size:14px;padding:6px 14px;outline:none}
.cuR .ls{overflow:auto;max-height:34vh;display:flex;flex-direction:column;gap:4px}
.cuR .ls button{all:unset;cursor:pointer;padding:8px 12px;border-radius:10px;font-size:14px;color:#d6d3cd;background:#26292e;transition:background .15s}
.cuR .ls button:hover{background:#2f3339}.cuR .ls button:active{transform:scale(.99)}
.cuR .ls small{display:block;color:#8f8c86;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cuR .ft{display:flex;gap:8px;justify-content:flex-end}
.cuR .ft button{all:unset;cursor:pointer;padding:8px 18px;border-radius:999px;font-size:14px;background:#2b2e33}
.cuR .ft .go{background:#d6d3cd;color:#1a1c20;font-weight:600}
.cuR .tip{font-size:12px;color:#8f8c86}`;
  window.cuReplyBox = ({ quote = '', init = '', send = '发送', max = 500, empty = false } = {}) => new Promise(done => {
    if (!document.getElementById('cuRcss')) { const st = document.createElement('style'); st.id = 'cuRcss'; st.textContent = css; document.head.appendChild(st); }
    const w = document.createElement('div'); w.className = 'cuR';
    w.innerHTML = `<div class="bx" role="dialog" aria-label="回复">${quote ? '<div class="qt"></div>' : ''}<textarea placeholder="写回复…"></textarea>
      <div class="fq"><input placeholder="搜 FAQ，点一条填进回复" aria-label="搜 FAQ"></div><div class="ls"><div class="tip">FAQ 加载中…</div></div>
      <div class="ft"><button class="cx">取消</button><button class="go">${send}</button></div></div>`;
    if (quote) w.querySelector('.qt').textContent = quote;
    w.querySelector('textarea').maxLength = max;
    const ta = w.querySelector('textarea'), fi = w.querySelector('.fq input'), ls = w.querySelector('.ls'); ta.value = init;
    const close = v => { w.remove(); document.removeEventListener('keydown', key); done(v); };
    const key = e => { if (e.key === 'Escape') close(null); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) close(ta.value.trim() || null); };
    document.addEventListener('keydown', key);
    w.onclick = e => { if (e.target === w) close(null); };
    w.querySelector('.cx').onclick = () => close(null);
    w.querySelector('.go').onclick = () => close(ta.value.trim() || (empty ? '' : null));   // empty：允许清空（看板里清掉回复）
    const draw = () => { if (!FAQ) return; const k = fi.value.trim();
      const hit = FAQ.filter(x => !k || (x.q + x.a).includes(k));
      ls.innerHTML = hit.length ? '' : '<div class="tip">没找到</div>';
      hit.forEach(x => { const b = document.createElement('button'); b.textContent = x.q; const sm = document.createElement('small'); sm.textContent = x.a.replace(/\n/g, ' '); b.appendChild(sm);
        b.onclick = () => { ta.value = (ta.value.trim() ? ta.value.trim() + '\n\n' : '') + x.a; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); };
        ls.appendChild(b); }); };
    fi.oninput = draw;
    load().then(draw).catch(() => { ls.innerHTML = '<div class="tip">FAQ 没读到，检查网络</div>'; });
    document.body.appendChild(w); setTimeout(() => ta.focus(), 50);
  });
})();
