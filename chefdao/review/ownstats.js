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
  window.cuListenStats = async function (o) {
    const el = document.createElement('section'); el.className = 'ols'; o.mount(el);
    const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
    const fk = 'review:ols:fold', singers = [...new Set((o.tracks || []).flatMap(t => String(t.artist || '').split(/[、,，]/).map(x => x.trim()).filter(Boolean)))];
    let pick = '', fold = store.get(fk) === '1'; el.classList.toggle('fold', fold);   // 折叠状态记在本机
    const slugsOf = n => new Set((o.tracks || []).filter(t => String(t.artist || '').split(/[、,，]/).some(x => x.trim() === n)).map(t => t.slug));
    let set = new Set(o.slugs), last = null;
    async function load() {
      let j; try { j = await (await fetch(o.api + '/q?days=365', { headers: { Authorization: 'Bearer ' + o.key }, cache: 'no-store' })).json(); } catch (e) { return; }
      if (!j || !j.ok) return;
      last = j; draw();
    }
    function draw() {
      const j = last; if (!j) return; set = pick ? slugsOf(pick) : new Set(o.slugs);
      const rows = (j.rows || []).filter(r => set.has(r.slug)), now = j.now || Date.now();
      const names = new Map((j.listeners || []).map(l => [l.lid, l.name || l.self || '']));
      const by = new Map();
      rows.forEach(r => { const a = by.get(r.lid) || { lid: r.lid, plays: 0, sec: 0, ends: 0, vers: new Set(), last: 0, device: '', notes: 0 }; a.plays++; a.sec += r.sec || 0; a.ends += r.ends || 0; a.vers.add(r.ver); a.notes += r.notes || 0;
        if ((r.updated || r.started) >= a.last) { a.last = r.updated || r.started; a.device = r.device || a.device; } by.set(r.lid, a); });
      const opened = new Map(); (j.access || []).filter(a => set.has(a.slug)).forEach(a => { if (!by.has(a.lid)) { const c = opened.get(a.lid); if (!c || a.updated > c.updated) opened.set(a.lid, a); } });
      const list = [...by.values()].sort((x, y) => y.last - x.last), totalSec = list.reduce((s, a) => s + a.sec, 0), totalPlays = list.reduce((s, a) => s + a.plays, 0);
      el.innerHTML = '<div class="hd"><span>聆听情况<b>' + (fold ? '展开' : '收起') + '</b></span><i>仅你可见 · ' + esc(pick || o.title || '当前项目') + '</i></div>'
        + (singers.length > 1 ? '<div class="chips"><button data-s="" class="' + (pick ? '' : 'on') + '">全部</button>' + singers.map(n => '<button data-s="' + esc(n) + '" class="' + (pick === n ? 'on' : '') + '">' + esc(n) + '</button>').join('') + '</div>' : '')
        + (list.length || opened.size
          ? '<div class="sum">' + list.length + ' 位听众 · ' + totalPlays + ' 次播放 · 共 ' + mins(totalSec) + (opened.size ? ' · ' + opened.size + ' 位只打开没听' : '') + '</div>'
            + list.slice(0, 12).map(a => '<div class="r"><div><b>' + esc(names.get(a.lid) || '听众 ' + a.lid) + '</b><small>听 ' + a.plays + ' 次 · ' + mins(a.sec) + (a.ends ? ' · 听完 ' + a.ends + ' 次' : '') + (a.vers.size > 1 ? ' · ' + a.vers.size + ' 个版本' : '') + (a.notes ? ' · 写了 ' + a.notes + ' 条评论' : '') + (a.device ? ' · ' + esc(a.device) : '') + '</small></div><em>' + ago(a.last, now) + '</em></div>').join('')
            + [...opened.values()].slice(0, 6).map(a => '<div class="r"><div><b>' + esc(names.get(a.lid) || '听众 ' + a.lid) + '</b><small>只打开了页面，没有播放' + (a.device ? ' · ' + esc(a.device) : '') + '</small></div><em>' + ago(a.updated, now) + '</em></div>').join('')
          : '<div class="e">还没有人听过</div>');
      el.querySelector('.hd').onclick = () => { fold = !fold; store.set(fk, fold ? '1' : '0'); el.classList.toggle('fold', fold); el.querySelector('.hd b').textContent = fold ? '展开' : '收起'; };
      el.querySelectorAll('.chips button').forEach(b => b.onclick = () => { pick = b.dataset.s; draw(); });
    }
    await load();
    setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
  };
})();
