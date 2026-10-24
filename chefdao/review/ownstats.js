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
      + '.ols .e{padding:10px 0;font-size:13px;color:var(--text-3,#8a8886)}';
    document.head.appendChild(st);
  }
  const ago = (t, now) => { const d = Math.floor((now - t) / 864e5), m = Math.floor((now - t) / 6e4); return d >= 1 ? (d === 1 ? '昨天' : d + ' 天前') : m < 2 ? '刚刚' : m < 60 ? m + ' 分钟前' : Math.floor(m / 60) + ' 小时前'; };
  const mins = s => s < 90 ? Math.round(s) + ' 秒' : (s / 60).toFixed(1) + ' 分钟';
  window.cuListenStats = async function (o) {
    const el = document.createElement('section'); el.className = 'ols'; o.mount(el);
    const set = new Set(o.slugs);
    async function load() {
      let j; try { j = await (await fetch(o.api + '/q?days=365', { headers: { Authorization: 'Bearer ' + o.key }, cache: 'no-store' })).json(); } catch (e) { return; }
      if (!j || !j.ok) return;
      const rows = (j.rows || []).filter(r => set.has(r.slug)), now = j.now || Date.now();
      const names = new Map((j.listeners || []).map(l => [l.lid, l.name || l.self || '']));
      const by = new Map();
      rows.forEach(r => { const a = by.get(r.lid) || { lid: r.lid, plays: 0, sec: 0, ends: 0, vers: new Set(), last: 0, device: '', notes: 0 }; a.plays++; a.sec += r.sec || 0; a.ends += r.ends || 0; a.vers.add(r.ver); a.notes += r.notes || 0;
        if ((r.updated || r.started) >= a.last) { a.last = r.updated || r.started; a.device = r.device || a.device; } by.set(r.lid, a); });
      const opened = new Map(); (j.access || []).filter(a => set.has(a.slug)).forEach(a => { if (!by.has(a.lid)) { const c = opened.get(a.lid); if (!c || a.updated > c.updated) opened.set(a.lid, a); } });
      const list = [...by.values()].sort((x, y) => y.last - x.last), totalSec = list.reduce((s, a) => s + a.sec, 0), totalPlays = list.reduce((s, a) => s + a.plays, 0);
      el.innerHTML = '<div class="hd"><span>聆听情况</span><i>仅你可见 · ' + esc(o.title || '当前项目') + '</i></div>'
        + (list.length || opened.size
          ? '<div class="sum">' + list.length + ' 位听众 · ' + totalPlays + ' 次播放 · 共 ' + mins(totalSec) + (opened.size ? ' · ' + opened.size + ' 位只打开没听' : '') + '</div>'
            + list.slice(0, 12).map(a => '<div class="r"><div><b>' + esc(names.get(a.lid) || '听众 ' + a.lid) + '</b><small>听 ' + a.plays + ' 次 · ' + mins(a.sec) + (a.ends ? ' · 听完 ' + a.ends + ' 次' : '') + (a.vers.size > 1 ? ' · ' + a.vers.size + ' 个版本' : '') + (a.notes ? ' · 写了 ' + a.notes + ' 条评论' : '') + (a.device ? ' · ' + esc(a.device) : '') + '</small></div><em>' + ago(a.last, now) + '</em></div>').join('')
            + [...opened.values()].slice(0, 6).map(a => '<div class="r"><div><b>' + esc(names.get(a.lid) || '听众 ' + a.lid) + '</b><small>只打开了页面，没有播放' + (a.device ? ' · ' + esc(a.device) : '') + '</small></div><em>' + ago(a.updated, now) + '</em></div>').join('')
          : '<div class="e">还没有人听过</div>');
    }
    await load();
    setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
  };
})();
