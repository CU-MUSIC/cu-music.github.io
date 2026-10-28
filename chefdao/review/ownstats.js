// 你自己的设备上才加载：在审听页 / 项目页旁边显示「当前项目的聆听情况」，数据来自看板同一个接口 /q
//   cuListenStats({ api, key, slugs: ['wubu'], mount: element, title: '舞步' })
(function () {
  const esc = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  if (!document.getElementById('ols-css')) {
    const st = document.createElement('style'); st.id = 'ols-css';
    st.textContent = '.ols{margin:18px 0;padding:16px 16px 10px;border-radius:14px;background:var(--fill,rgba(255,255,255,.06));font-variant-numeric:tabular-nums;color:var(--text,#e8e6e2)}'
      + '.ols .hd{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:6px;font-size:14px;font-weight:600}.ols .hd i{font-style:normal;font-weight:400;font-size:12px;color:var(--text-3,#8a8886)}'
      + '.ols .sum{font-size:13px;color:var(--text-2,#b8b6b2);margin-bottom:8px}'
      + '.ols .r{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:.5px solid var(--hair,rgba(255,255,255,.1));font-size:13.5px}'
      + '.ols .r b{font-weight:600}.ols .r small{display:block;margin-top:2px;font-size:12px;color:var(--text-3,#8a8886)}.ols .r em{font-style:normal;white-space:nowrap;font-size:12px;color:var(--text-3,#8a8886)}'
      + '.ols .e{padding:10px 0;font-size:13px;color:var(--text-3,#8a8886)}'
      + '.ols .hd{cursor:pointer;user-select:none}.ols .hd b{font-weight:400;color:var(--text-3,#8a8886);margin-left:8px;font-size:12px}.ols .chips{display:flex;gap:6px;flex-wrap:wrap;margin:2px 0 8px}.ols .chips button{padding:4px 11px;border-radius:99px;background:var(--fill-2,rgba(255,255,255,.08));color:var(--text-2,#b8b6b2);font-size:12.5px}.ols .chips button.on{background:var(--pearl,#ebe9e5);color:var(--ink,#121213)}.ols.fold>:not(.hd){display:none}';
    document.head.appendChild(st);
  }
  const ago = (t, now) => { const d = Math.floor((now - t) / 864e5), m = Math.floor((now - t) / 6e4); return d >= 1 ? (d === 1 ? '昨天' : d + ' 天前') : m < 2 ? '刚刚' : m < 60 ? m + ' 分钟前' : Math.floor(m / 60) + ' 小时前'; };
  const mins = s => s < 90 ? Math.round(s) + ' 秒' : (s / 60).toFixed(1) + ' 分钟';
  // 根据反复听的片段猜听众是哪位歌手：把这位听众在每首歌里各时间段的听的秒数，按歌手的段落分组，比「平均每秒被听了多少」，明显更高的那位多半就是他自己
  const SECT = /^(intro|verse|hook|chorus|bridge|outro|pre|drop|interlude|前奏|主歌|副歌|桥段|尾奏)/i;
  function guess(bins, dur, parts) {
    const segs = (parts || []).slice().sort((x, y) => x.t - y.t); if (!bins || !bins.length || !(dur > 0)) return null;
    if (new Set(segs.filter(p => !SECT.test(p.n)).map(p => p.n)).size < 2) return null;
    const N = bins.length, bw = dur / N, total = bins.reduce((x, y) => x + y, 0); if (total < 20) return null;
    const acc = {}, mean = total / dur;
    segs.forEach((p, k) => { if (SECT.test(p.n)) return; const a = p.t, b = segs[k + 1] ? segs[k + 1].t : dur; if (b <= a) return; let sec = 0;
      for (let i = 0; i < N; i++) { const lo = Math.max(a, i * bw), hi = Math.min(b, (i + 1) * bw); if (hi > lo) sec += bins[i] * (hi - lo) / bw; }
      const c = acc[p.n] || (acc[p.n] = { sec: 0, len: 0 }); c.sec += sec; c.len += b - a; });
    const r = Object.entries(acc).filter(([, c]) => c.len > 3).map(([n, c]) => [n, c.sec / c.len / mean]).sort((x, y) => y[1] - x[1]);
    return r.length > 1 && r[0][1] >= 1.4 && r[0][1] >= r[1][1] * 1.15 ? { name: r[0][0], ratio: r[0][1] } : null;
  }
  window.cuListenStats = async function (o) {
    const el = document.createElement('section'); el.className = 'ols'; o.mount(el);
    const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
    const fk = 'review:ols:fold', singers = [...new Set((o.tracks || []).flatMap(t => String(t.artist || '').split(/[、,，]/).map(x => x.trim()).filter(Boolean)))];
    let pick = '', pickL = '', fold = store.get(fk) !== '0';   // 不是特别重要：默认折叠，展开过就记住 el.classList.toggle('fold', fold);   // 折叠状态记在本机
    const slugsOf = n => new Set((o.tracks || []).filter(t => String(t.artist || '').split(/[、,，]/).some(x => x.trim() === n)).map(t => t.slug));
    const partsCache = {};
    const partsOf = async sl => { if (partsCache[sl]) return partsCache[sl]; try { const j = await (await fetch(o.api + '/rs?s=' + sl, { headers: { Authorization: 'Bearer ' + o.key } })).json(); return (partsCache[sl] = j.ok ? (j.song.parts || []) : []); } catch (e) { return []; } };
    let set = new Set(o.slugs), last = null, scope = o.current ? 'track' : 'all';   // 歌曲页默认只看这首歌，可切到整个项目
    async function load() {
      let j; try { j = await (await fetch(o.api + '/q?days=365', { headers: { Authorization: 'Bearer ' + o.key }, cache: 'no-store' })).json(); } catch (e) { return; }
      if (!j || !j.ok) return;
      await Promise.all(o.slugs.map(partsOf)); last = j; draw();
    }
    function draw() {
      const j = last; if (!j) return; set = scope === 'track' ? new Set([o.current]) : pick ? slugsOf(pick) : new Set(o.slugs);
      const rows = (j.rows || []).filter(r => set.has(r.slug)), now = j.now || Date.now();
      const names = new Map((j.listeners || []).map(l => [l.lid, l.name || l.self || '']));
      const by = new Map();
      rows.forEach(r => { const a = by.get(r.lid) || { lid: r.lid, plays: 0, sec: 0, ends: 0, vers: new Set(), last: 0, device: '', notes: 0, bins: {} }; a.plays++; a.sec += r.sec || 0; a.ends += r.ends || 0; a.vers.add(r.ver); a.notes += r.notes || 0;
        try { const b = typeof r.bins === 'string' ? JSON.parse(r.bins) : r.bins; if (Array.isArray(b)) { const h = a.bins[r.slug] || (a.bins[r.slug] = { bins: new Array(b.length).fill(0), dur: r.dur || 0 }); b.forEach((x, i) => { h.bins[i] = (h.bins[i] || 0) + (x || 0); }); if (r.dur) h.dur = Math.max(h.dur, r.dur); } } catch (e) {}
        if ((r.updated || r.started) >= a.last) { a.last = r.updated || r.started; a.device = r.device || a.device; } by.set(r.lid, a); });
      const opened = new Map(); (j.access || []).filter(a => set.has(a.slug)).forEach(a => { if (!by.has(a.lid)) { const c = opened.get(a.lid); if (!c || a.updated > c.updated) opened.set(a.lid, a); } });
      by.forEach(a => { let best = null; Object.entries(a.bins).forEach(([sl, h]) => { if (!set.has(sl)) return; const g = guess(h.bins, h.dur, partsCache[sl]); if (g && (!best || g.ratio > best.ratio)) best = g; }); a.g = best; });
      const gnames = [...new Set([...by.values()].map(a => a.g && a.g.name).filter(Boolean))];
      const list0 = [...by.values()].sort((x, y) => y.last - x.last);
      const list = scope === 'track' && pickL ? list0.filter(a => pickL === '未识别' ? !a.g : a.g && a.g.name === pickL) : list0;
      const totalSec = list.reduce((s, a) => s + a.sec, 0), totalPlays = list.reduce((s, a) => s + a.plays, 0);
      el.innerHTML = '<div class="hd"><span>聆听情况<b>' + (fold ? '展开' : '收起') + '</b></span><i>仅你可见 · ' + esc(scope === 'track' ? '这首歌' : pick || o.title || '当前项目') + '</i></div>'
        + (o.current && o.slugs.length > 1 ? '<div class="chips"><button data-sc="track" class="' + (scope === 'track' ? 'on' : '') + '">本曲</button><button data-sc="all" class="' + (scope === 'all' ? 'on' : '') + '">整个项目</button></div>' : '')
        + (scope === 'track' && gnames.length ? '<div class="chips"><button data-l="" class="' + (pickL ? '' : 'on') + '">全部听众</button>' + gnames.map(n => '<button data-l="' + esc(n) + '" class="' + (pickL === n ? 'on' : '') + '">' + esc(n) + '</button>').join('') + '<button data-l="未识别" class="' + (pickL === '未识别' ? 'on' : '') + '">未识别</button></div>' : '')
        + (singers.length > 1 && scope === 'all' ? '<div class="chips"><button data-s="" class="' + (pick ? '' : 'on') + '">全部</button>' + singers.map(n => '<button data-s="' + esc(n) + '" class="' + (pick === n ? 'on' : '') + '">' + esc(n) + '</button>').join('') + '</div>' : '')
        + (list.length || opened.size
          ? '<div class="sum">' + list.length + ' 位听众 · ' + totalPlays + ' 次播放 · 共 ' + mins(totalSec) + (opened.size ? ' · ' + opened.size + ' 位只打开没听' : '') + '</div>'
            + list.slice(0, 12).map(a => '<div class="r"><div><b>' + esc(names.get(a.lid) || '听众 ' + a.lid) + '</b><small>听 ' + a.plays + ' 次 · ' + mins(a.sec) + (a.ends ? ' · 听完 ' + a.ends + ' 次' : '') + (a.vers.size > 1 ? ' · ' + a.vers.size + ' 个版本' : '') + (a.notes ? ' · 写了 ' + a.notes + ' 条评论' : '') + (a.device ? ' · ' + esc(a.device) : '') + (a.g ? '<br><span style="color:var(--accent-2,#9cc9b2)">反复听的是 ' + esc(a.g.name) + ' 的段落（平均的 ' + a.g.ratio.toFixed(1) + ' 倍），可能就是' + esc(a.g.name) + '</span>' : '') + '</small></div><em>' + ago(a.last, now) + '</em></div>').join('')
            + [...opened.values()].slice(0, 6).map(a => '<div class="r"><div><b>' + esc(names.get(a.lid) || '听众 ' + a.lid) + '</b><small>只打开了页面，没有播放' + (a.device ? ' · ' + esc(a.device) : '') + '</small></div><em>' + ago(a.updated, now) + '</em></div>').join('')
          : '<div class="e">还没有人听过</div>');
      el.querySelector('.hd').onclick = () => { fold = !fold; store.set(fk, fold ? '1' : '0'); el.classList.toggle('fold', fold); el.querySelector('.hd b').textContent = fold ? '展开' : '收起'; };
      el.querySelectorAll('.chips button').forEach(b => b.onclick = () => { if (b.dataset.sc) { scope = b.dataset.sc; pick = ''; pickL = ''; } else if (b.dataset.l !== undefined) pickL = b.dataset.l; else pick = b.dataset.s; draw(); });
    }
    await load();
    setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
  };
})();
