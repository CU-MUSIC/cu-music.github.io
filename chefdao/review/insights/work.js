/* Insights「工作」页 —— 工作状态系统（2026-11-15 重写，单独一个文件，不往 index.html 里堆）
   只回答三件事：现在该做哪一首 / 谁在等谁 / 这个月够不够。
   每首歌算出一个状态（球在谁手里）：me 该我动 · client 等客户 · assist 等助理 · done 完成。
   数据各认一个来源：
     · 客户那边的实时进度（待审听、修改中、交付结算…）= 审听系统，也就是 Library 里每首歌的 prog
     · 截止日期、净收入、工时日志、等素材 = Notion 项目管理库（Worker GET /work，只读）
   两边靠歌名对上；对上了以审听系统的进度为准（它是实时的），任何一边说已交付就算完成。
   index.html 的脚本变量外面拿不到，它通过 window.__ins 把 API KEY tab LIB esc root render typing 递过来 */
(() => {
  const G = new Proxy({}, { get: (_, k) => window.__ins[k] });   // 每次用的时候现取，拿到的是 index.html 里的当前值
  const css = `
.wk-rec{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:-4px 0 10px}.wk-rec>div{background:var(--fill);border-radius:14px;padding:12px 14px;min-width:0}
.wk-rec .lb{font-size:13px;color:var(--text-2)}.wk-rec .n{font-size:26px;font-weight:700;letter-spacing:-.02em;line-height:1.2;font-variant-numeric:tabular-nums}.wk-rec .d{font-size:12.5px;color:var(--text-3);margin-top:1px;font-variant-numeric:tabular-nums}
.wk-wkb{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:16px;padding:0 4px}.wk-wkb>div{display:flex;flex-direction:column;align-items:center;gap:4px}.wk-wkb .col{height:44px;width:100%;display:flex;align-items:flex-end}.wk-wkb .col i{display:block;width:100%;border-radius:4px;background:#3a7558;min-height:3px}.wk-wkb .col i.z{background:var(--fill-3)}
.wk-wkb span{font-size:11.5px;color:var(--text-3)}.wk-wkb .t span{color:var(--text);font-weight:600}.wk-wkb em{font-style:normal;font-size:11px;color:var(--text-3);font-variant-numeric:tabular-nums;min-height:13px}
.wk-rpt{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:22px 2px 6px;font-size:13px;color:var(--text-3)}.wk-rpt button{font-size:13px;padding:6px 12px;border-radius:999px;background:var(--fill);color:var(--text-2)}
.wk-bar{font-size:14px;color:var(--text-2);font-variant-numeric:tabular-nums;margin:-8px 0 16px;display:flex;gap:6px 14px;flex-wrap:wrap}.wk-bar b{color:var(--text);font-weight:600}.wk-bar .ld{color:var(--text-3)}
.wk-now{display:block;background:var(--fill);border-radius:18px;padding:18px 18px 16px;margin-bottom:10px;color:inherit;text-decoration:none}
.wk-now .k{font-size:12.5px;letter-spacing:.06em;color:#7fb894}.wk-now .t{font-size:26px;font-weight:700;letter-spacing:-.01em;line-height:1.25;margin:3px 0 4px;overflow-wrap:anywhere}
.wk-now .w{font-size:15px;color:var(--text)}.wk-now .w.warn{color:var(--red)}.wk-now .s{font-size:13px;color:var(--text-3);margin-top:2px}
.wk-now .go{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}.wk-now .go a{font-size:14px;padding:7px 14px;border-radius:999px;background:var(--pearl);color:var(--ink);text-decoration:none;font-weight:600}.wk-now .go a.alt{background:var(--fill-3);color:var(--text);font-weight:500}
.wk-row{display:grid;grid-template-columns:1fr auto;gap:1px 12px;padding:11px 2px;border-top:.5px solid var(--hair);font-size:15px;color:inherit;text-decoration:none}
.wk-row b{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wk-row em{font-style:normal;font-size:13px;color:var(--text-2);white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums}.wk-row em.warn{color:var(--red)}
.wk-row small{grid-column:1/-1;font-size:13px;color:var(--text-3)}
.wk-list{margin-bottom:8px}.wk-list .wk-row:first-child{border-top:0}
.wk-more{display:block;margin:2px auto 10px;font-size:14px;color:var(--text-2);padding:8px 14px}
.wk-fold{border-top:.5px solid var(--hair)}.wk-fold:last-of-type{border-bottom:.5px solid var(--hair)}
.wk-fold>summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:14px 2px;font-size:16px;font-weight:600}.wk-fold>summary::-webkit-details-marker{display:none}
.wk-fold>summary span{font-size:13px;font-weight:400;color:var(--text-3);text-align:right}.wk-fold>summary span.nudge{color:#c9a86c}
.wk-fold>summary::before{content:'›';color:var(--text-3);margin-right:8px;display:inline-block;transition:transform .15s}.wk-fold[open]>summary::before{transform:rotate(90deg)}
.wk-fold>summary>i{font-style:normal;flex:1}
.wk-in{padding:0 2px 16px}
.wk-h{font-size:13px;color:var(--text-3);margin:14px 0 2px;letter-spacing:.03em}
.wk-nav{display:flex;align-items:center;gap:8px;margin:2px 0 14px}.wk-nav b{font-size:16px;font-weight:600;min-width:92px;text-align:center;font-variant-numeric:tabular-nums}
.wk-nav button{width:32px;height:32px;border-radius:50%;background:var(--fill);color:var(--text-2);font-size:17px;line-height:1}.wk-nav .now{width:auto;padding:0 14px;font-size:14px;margin-left:auto}
.wk-cards{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}.wk-cards>div{background:var(--fill);border-radius:14px;padding:13px 14px;min-width:0}.wk-cards .tap{cursor:pointer}
.wk-cards .lb{font-size:13px;color:var(--text-2)}.wk-cards .n{font-size:24px;font-weight:700;letter-spacing:-.02em;line-height:1.2;font-variant-numeric:tabular-nums}.wk-cards .n small{font-size:13px;font-weight:500;color:var(--text-3);letter-spacing:0;margin-left:4px}
.wk-cards .bar{height:4px;border-radius:2px;background:var(--fill-3);margin:8px 0 6px;overflow:hidden}.wk-cards .bar i{display:block;height:100%;border-radius:2px;background:var(--pearl)}.wk-cards .d{font-size:12.5px;color:var(--text-3);font-variant-numeric:tabular-nums}
.wk-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.wk-cal .wd{font-size:12px;color:var(--text-3);text-align:center;padding-bottom:4px}
.wk-cal button{aspect-ratio:1/1;max-height:52px;border-radius:9px;background:rgba(235,233,229,.04);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font-variant-numeric:tabular-nums;color:var(--text-2);min-width:0}
.wk-cal button b{font-size:13px;font-weight:500}.wk-cal button i{font-style:normal;font-size:11px;min-height:13px;opacity:.9}.wk-cal .l1{background:#1d3128;color:var(--text)}.wk-cal .l2{background:#2a5140;color:var(--text)}.wk-cal .l3{background:#3a7558;color:#f1efeb}.wk-cal .l4{background:#5fa57d;color:var(--ink)}.wk-cal .l5{background:#a3d9b6;color:var(--ink)}
.wk-cal button.tdy{box-shadow:0 0 0 1.5px var(--text) inset}.wk-cal button.on{box-shadow:0 0 0 2px var(--pearl)}.wk-cal button.fut{opacity:.4}.wk-cal .gap{visibility:hidden}
.wk-day{margin-top:10px;background:var(--fill);border-radius:12px;padding:2px 12px}.wk-day .wk-row:first-child{border-top:0}
.wk-al{padding:11px 0;border-top:.5px solid var(--hair)}.wk-al .t{display:flex;justify-content:space-between;gap:10px;font-size:15px}.wk-al .t b{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wk-al .t span{font-size:13px;color:var(--text-2);white-space:nowrap}.wk-al .t span.warn{color:var(--red)}
.wk-al .bar{height:4px;border-radius:2px;background:var(--fill-3);margin:7px 0 0;overflow:hidden}.wk-al .bar i{display:block;height:100%;background:var(--pearl);border-radius:2px}
.wk-code{display:block;margin:12px auto;max-width:560px;text-align:left;background:var(--fill);border-radius:10px;padding:12px 14px;font:13px/1.6 ui-monospace,Menlo,monospace;color:var(--text);word-break:break-all;user-select:all}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  let WK = null, loading = false, err = '', asked = false, day = '', allMe = false;
  try { WK = JSON.parse(ls.get('insights:work') || 'null'); } catch (e) { WK = null; }
  const T0 = new Date(); let Y = T0.getFullYear(), M = T0.getMonth();
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const yen = x => '¥' + Math.round(x).toLocaleString('en-US'), hr = x => (Math.round(x * 10) / 10) + 'h';
  const target = k => +ls.get('insights:w' + k) || (k === 'inc' ? 6000 : 60);
  const ago = isoDay => isoDay ? Math.floor((new Date(iso(new Date())) - new Date(isoDay)) / 864e5) : null;
  const since = ts => ts ? Math.max(0, Math.floor((Date.now() - ts) / 864e5)) : null;
  const dayTxt = n => n == null ? '' : n === 0 ? '今天' : n === 1 ? '昨天' : n + ' 天前';

  async function load(fresh) {
    if (loading) return; loading = true; asked = true;
    try {
      const j = await (await fetch(G.API + '/work' + (fresh ? '?fresh=1' : ''), { headers: { Authorization: 'Bearer ' + G.KEY } })).json();
      if (j.ok) { WK = j; err = ''; ls.set('insights:work', JSON.stringify(j)); } else err = j.err || 'err';
    } catch (e) { err = 'net'; }
    loading = false; if (G.tab === 'work' && !G.typing()) G.render();
  }

  // ── 状态引擎 ──
  const nDone = p => /已交付|母带/.test(p.st) || !!p.ed, nCancel = p => /取消/.test(p.st), single = p => !p.al || p.al.includes('单曲');
  const last = p => { let m = ''; for (const k in p.d) if (k > m) m = k; return m; };
  // 歌名对照：去掉开头的曲目号、空格和标点，不分大小写
  const norm = s => String(s || '').toLowerCase().replace(/^\s*\d{1,2}[\s._\-、]+/, '').replace(/[\s\-_.,，。·、:：'’"“”!！?？()（）\[\]【】]/g, '');
  const mine = p => !p || !p.eb || !p.eb.length || p.eb.some(x => /chefdao/i.test(x));   // 音编没填或写的是自己 → 编辑也算我的
  function items() {
    const tracks = new Map();   // 歌名 → 审听系统里的那首（归档的项目不算）
    ((G.LIB && G.LIB.projects) || []).forEach(pj => { if (pj.archived) return; (pj.tracks || []).forEach(t => { const k = norm(t.title); if (k && (!tracks.has(k) || (t.updTs || 0) > (tracks.get(k).t.updTs || 0))) tracks.set(k, { t, pj }); }); });
    const out = [], used = new Set(), today = iso(new Date());
    const build = (p, hit) => {
      const t = hit && hit.t, g = t && t.prog, s = g ? g.s : null, at = (g && g.at) || {};
      const it = { name: (p && p.n) || t.title, artist: (p && p.ar.length ? p.ar.join('、') : (t && t.artist) || ''), album: p && !single(p) ? p.al : (hit && hit.pj.kind !== 'single' && hit.pj.title !== t.title ? hit.pj.title : ''), p, t,
        url: t && t.url, notion: p ? 'https://www.notion.so/' + p.id : '', dl: (p && p.dl) || '', lastWork: p ? last(p) : '' };
      if ((p && nDone(p)) || s === 5) { it.state = 'done'; return it; }
      if (s === 7) { it.state = 'me'; it.stage = '修改中' + (g.r ? ' · 第 ' + g.r + ' 轮' : ''); it.wait = since(at[7]); it.why = '客户反馈' + (it.wait == null ? '已到' : dayTxt(it.wait) + '到了'); it.score = 100 + (it.wait || 0) * 5; }
      else if (s === 4) { it.state = 'client'; it.stage = '待审听'; it.wait = since(at[4]); it.why = '新版本已发，等反馈'; }
      else if (s === 0) { it.state = 'client'; it.stage = '待付款'; it.wait = since(at[0]); it.why = '等客户付款'; it.nudge = it.wait != null && it.wait >= 3; }
      else if (s === 8) { it.state = 'client'; it.stage = '交付结算'; it.wait = since(at[8]); it.why = '等客户结尾款'; it.nudge = it.wait != null && it.wait >= 3; }
      else if (s === 2 || (s == null && p && /音频编辑/.test(p.st))) { const me = mine(p); it.state = me ? 'me' : 'assist'; it.stage = '音频编辑'; it.wait = since(at[2] || (p && p.le)); it.why = me ? '音频编辑' : '音编：' + p.eb.join('、'); it.nudge = !me && it.wait != null && it.wait >= 5; it.score = 30; }
      else if (s == null && p && /等素材/.test(p.st)) { it.state = 'client'; it.stage = '等素材'; it.wait = since(p.le); it.why = '等客户发素材'; it.nudge = it.wait != null && it.wait >= 14; }
      else { it.state = 'me'; it.stage = s === 6 ? '人声制作中' : s === 1 ? '准备中' : s === 3 ? '混音中' : (p && p.st) || '进行中'; it.score = s == null && p && /修改中/.test(p.st) ? 50 : 30; }   // Notion 里标了修改中：客户在等，排在普通混音前面
      if (!(s === 7) && p) {   // 搁置：逾期超过 30 天又 30 天没碰 / 等了超过 60 天——这种是遗留数据，别让它们顶在最上面
        const lw0 = ago(it.lastWork), left0 = it.dl ? -ago(it.dl) : null;
        if (it.state === 'me' && left0 != null && left0 < -30 && (lw0 == null || lw0 > 30)) { it.state = 'shelved'; it.stage = '搁置'; it.why = '逾期 ' + -left0 + ' 天' + (lw0 == null ? '，没有工时记录' : '，' + lw0 + ' 天没碰'); return it; }
        if (it.state === 'client' && it.wait != null && it.wait > 60) { it.state = 'shelved'; it.stage = it.stage; it.why = it.stage + ' ' + it.wait + ' 天了'; return it; }
      }
      if (it.state === 'me') {   // 排序：客户在等的修改 > 逾期 > 快到期 > 这两天正在做的 > 其他（越久没碰越靠前）
        const left = it.dl ? -ago(it.dl) : null, lw = ago(it.lastWork);
        if (left != null && left < 0) { it.score = Math.max(it.score, 80 + Math.min(15, -left)); it.due = '逾期 ' + -left + ' 天'; it.warn = 1; }
        else if (left != null && left <= 7) { it.score = Math.max(it.score, 60 + (7 - left) * 2); it.due = left === 0 ? '今天截止' : left + ' 天后截止'; }
        if (s !== 7) { if (lw != null && lw <= 2) { it.score += 12; it.why = lw === 0 ? '今天做到一半' : '接着做，' + dayTxt(lw) + '做过'; } else if (lw != null) { it.score += Math.min(8, lw / 4); it.why = it.stage + '，' + lw + ' 天没碰了'; } else it.why = it.stage + '，还没开工'; }
        it.why0 = it.why; if (it.due && s !== 7) it.why = it.due + ' · ' + it.why;   // why0 给列表行用（截止已经写在右边了）
      }
      return it;
    };
    (WK ? WK.rows : []).forEach(p => { if (nCancel(p)) return; const k = norm(p.n), hit = tracks.get(k); if (hit) used.add(k); out.push(build(p, hit)); });
    tracks.forEach((hit, k) => { if (!used.has(k) && hit.t.prog && hit.t.prog.s !== 5) out.push(build(null, hit)); });   // 只在审听系统里有、Notion 里没有的歌也算进来
    return out;
  }
  function month(y, m, upto) {   // 收入按「结束日期」所在月算；工时按日志日期算
    const pre = y + '-' + String(m + 1).padStart(2, '0') + '-'; let inc = 0, hrs = 0, mi = 0, mh = 0; const days = {}, list = [];
    WK.rows.forEach(p => {
      for (const k in p.d) if (k.startsWith(pre) && (!upto || +k.slice(8) <= upto)) { hrs += p.d[k]; days[k] = (days[k] || 0) + p.d[k]; }
      if (p.ed && p.ed.startsWith(pre) && !nCancel(p)) { inc += p.net; list.push(p); if (p.mix > 0 && p.net > 0) { mi += p.net; mh += p.mix; } }
    });
    list.sort((a, b) => b.net - a.net);
    return { inc, hrs, days, list, rate: mh > 0 ? mi / mh : 0, nd: Object.keys(days).length };
  }

  // ── 界面 ──
  const rowHtml = it => it.state === 'shelved' ? `<a class="wk-row" href="${G.esc(it.url || it.notion || '#')}" target="_blank" rel="noopener"><b>${G.esc(it.name)}</b><em>${G.esc(it.stage)}</em><small>${G.esc([it.artist, it.album, it.why].filter(Boolean).join(' · '))}</small></a>` : `<a class="wk-row" href="${G.esc(it.url || it.notion || '#')}" target="_blank" rel="noopener"><b>${G.esc(it.name)}</b><em class="${it.warn || it.nudge ? 'warn' : ''}">${G.esc(it.state === 'me' ? (it.due || it.stage) : it.stage + (it.wait != null ? ' · ' + (it.wait === 0 ? '今天' : it.wait + ' 天') : ''))}</em><small>${G.esc([it.artist, it.album, it.state === 'me' ? (it.why0 || it.why) : it.nudge ? '该催了' : ''].filter(Boolean).join(' · '))}</small></a>`;
  const fold = (id, title, right, nudge, body) => `<details class="wk-fold" data-wf="${id}"${ls.get('insights:wf:' + id) === '1' ? ' open' : ''}><summary><i>${title}</i><span class="${nudge ? 'nudge' : ''}">${right}</span></summary><div class="wk-in">${body}</div></details>`;

  window.renderWork = () => {
    if (!asked) load(!!WK);
    if (!WK) {
      if (err === 'no_token') return `<div class="msg">还没接上 Notion。在终端运行下面这条，粘贴 Notion 的 Integration Token：<code class="wk-code">cd "/Volumes/正在工作/Claude/01 网站 Website/cumusic-site/tools/stats-worker" && npx wrangler secret put NOTION_TOKEN</code><button class="wk-more" id="wkRetry">已填好，重新读取</button></div>`;
      return `<div class="msg">${loading ? '正在读取…' : '没读到数据' + (err ? '（' + G.esc(err) + '）' : '') + '<button class="wk-more" id="wkRetry">重试</button>'}</div>`;
    }
    const all = items(), nowD = new Date(), today = iso(nowD);
    const me = all.filter(x => x.state === 'me').sort((a, b) => b.score - a.score), cl = all.filter(x => x.state === 'client').sort((a, b) => (b.nudge ? 1 : 0) - (a.nudge ? 1 : 0) || (b.wait || 0) - (a.wait || 0)), as = all.filter(x => x.state === 'assist');
    const sh = all.filter(x => x.state === 'shelved').sort((a, b) => (a.dl || '') < (b.dl || '') ? -1 : 1), others = cl.concat(as), nudges = others.filter(x => x.nudge).length;
    const now = month(T0.getFullYear(), T0.getMonth()), todayH = now.days[today] || 0, pct = (a, b) => Math.max(0, Math.min(100, b ? a / b * 100 : 0));
    const sumR = (a, b) => { let h = 0; const n = new Set(); WK.rows.forEach(p => { for (const k in p.d) if (k >= a && k <= b) { h += p.d[k]; n.add(p.n); } }); return { h, n: n.size }; };
    const dow = (nowD.getDay() + 6) % 7, monD = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate() - dow), mon = iso(monD), pmon = iso(new Date(monD.getFullYear(), monD.getMonth(), monD.getDate() - 7)), pend = iso(new Date(monD.getFullYear(), monD.getMonth(), monD.getDate() - 7 + dow));
    const dS = sumR(today, today), wS = sumR(mon, today), pS = sumR(pmon, pend), mS = sumR(today.slice(0, 8) + '01', today), mDays = new Set(); WK.rows.forEach(p => { for (const k in p.d) if (k.startsWith(today.slice(0, 7))) mDays.add(k); });
    const wd = []; for (let i = 0; i < 7; i++) { const k = iso(new Date(monD.getFullYear(), monD.getMonth(), monD.getDate() + i)); wd.push({ k, h: sumR(k, k).h, t: k === today, f: k > today }); }
    const bar = `<div class="wk-rec"><div><div class="lb">今天</div><div class="n">${hr(dS.h)}</div><div class="d">${dS.n ? dS.n + ' 首' : '还没开工'}</div></div>
      <div><div class="lb">本周</div><div class="n">${hr(wS.h)}</div><div class="d">${wS.n} 首${pS.h ? ' · 上周同期 ' + hr(pS.h) : ''}</div></div>
      <div><div class="lb">本月</div><div class="n">${hr(mS.h)}</div><div class="d">${mDays.size} 天 · ${yen(now.inc)}</div></div></div>
      <div class="wk-wkb">${wd.map((x, i) => `<div class="${x.t ? 't' : ''}"><em>${x.h ? (Math.round(x.h * 10) / 10) : ''}</em><div class="col"><i class="${x.h ? '' : 'z'}" style="height:${x.h ? Math.max(8, Math.min(100, x.h / 8 * 100)) + '%' : '3px'}"></i></div><span>${'一二三四五六日'[i]}</span></div>`).join('')}</div>${loading ? '<div class="wk-bar"><span class="ld">刷新中…</span></div>' : ''}`;
    // ① 现在做这首 + 后面两首
    const top = me[0];
    const nowCard = top ? `<div class="wk-now"><div class="k">现在做这首</div><div class="t">${G.esc(top.name)}</div><div class="w${top.warn ? ' warn' : ''}">${G.esc(top.why)}</div><div class="s">${G.esc([top.artist, top.album].filter(Boolean).join(' · '))}</div>
      <div class="go">${top.url ? `<a href="${G.esc(top.url)}" target="_blank" rel="noopener">打开审听页</a>` : ''}${top.notion ? `<a class="${top.url ? 'alt' : ''}" href="${top.notion}" target="_blank" rel="noopener">Notion</a>` : ''}</div></div>`
      : `<div class="wk-now"><div class="k">现在</div><div class="t">没有该你动的歌</div><div class="w">${nudges ? '有 ' + nudges + ' 首该催一下，见下面「等别人」' : '球都在别人手里'}</div></div>`;
    const rest = me.slice(1), show = allMe ? rest : rest.slice(0, 2);
    const meList = show.length ? `<div class="wk-list">${show.map(rowHtml).join('')}</div>${rest.length > 2 ? `<button class="wk-more" id="wkAll">${allMe ? '收起' : '还有 ' + (rest.length - 2) + ' 首该你动'}</button>` : ''}` : '';
    // ② 等别人（默认收起，有该催的才提示）
    const waitBody = others.length ? others.map(rowHtml).join('') : '<div class="msg">没有在等别人的歌</div>';
    // ③ 本月数字和日历
    const isNow = Y === T0.getFullYear() && M === T0.getMonth(), S = month(Y, M), pv = new Date(Y, M - 1, 1), P = month(pv.getFullYear(), pv.getMonth(), isNow ? new Date().getDate() : 0), PF = month(pv.getFullYear(), pv.getMonth());
    const tI = target('inc'), tH = target('hr'), dH = S.hrs - P.hrs;
    const cards = `<div class="wk-cards">
      <div class="tap" data-wt="inc" title="点一下改月目标"><div class="lb">收入</div><div class="n">${yen(S.inc)}<small>/ ${yen(tI)}</small></div><div class="bar"><i style="width:${pct(S.inc, tI)}%"></i></div><div class="d">${S.list.length} 首交付${PF.inc ? ' · 上月 ' + yen(PF.inc) : ''}</div></div>
      <div class="tap" data-wt="hr" title="点一下改工时目标"><div class="lb">工时</div><div class="n">${hr(S.hrs)}<small>/ ${tH}h</small></div><div class="bar"><i style="width:${pct(S.hrs, tH)}%"></i></div><div class="d">${S.nd} 天开工${P.hrs ? ' · 比上月同期 ' + (dH >= 0 ? '+' : '') + hr(dH) : ''}</div></div>
      <div><div class="lb">混音时薪</div><div class="n">${S.rate ? yen(S.rate) : '—'}<small>/h</small></div><div class="d">${S.rate ? '按当月交付的歌算' : '还没有交付'}${PF.rate ? ' · 上月 ' + yen(PF.rate) : ''}</div></div>
      <div><div class="lb">在手</div><div class="n">${me.length + others.length}<small>首</small></div><div class="d">该你动 ${me.length} · 等别人 ${others.length}</div></div></div>`;
    const first = new Date(Y, M, 1), nd = new Date(Y, M + 1, 0).getDate(), lead = (first.getDay() + 6) % 7;
    let cal = ['一', '二', '三', '四', '五', '六', '日'].map(x => `<span class="wd">${x}</span>`).join('') + '<button class="gap"></button>'.repeat(lead);
    for (let d = 1; d <= nd; d++) { const k = Y + '-' + String(M + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'), h = S.days[k] || 0, lv = !h ? 0 : h < 1 ? 1 : h < 2.5 ? 2 : h < 4 ? 3 : h < 6 ? 4 : 5;
      cal += `<button data-wd="${k}" class="l${lv} ${k === today ? 'tdy ' : ''}${k > today ? 'fut ' : ''}${k === day ? 'on' : ''}"><b>${d}</b><i>${h ? (Math.round(h * 10) / 10) : ''}</i></button>`; }
    const dRows = day ? WK.rows.filter(p => p.d[day]).sort((a, b) => b.d[day] - a.d[day]) : [];
    const dayBox = day ? `<div class="wk-day">${dRows.length ? dRows.map(p => `<div class="wk-row"><b>${G.esc(p.n)}</b><em>${hr(p.d[day])}</em></div>`).join('') : '<div class="msg">这一天没有工时记录</div>'}</div>` : '';
    const delivered = S.list.map(p => `<a class="wk-row" href="https://www.notion.so/${p.id}" target="_blank" rel="noopener"><b>${G.esc(p.n)}</b><em>${yen(p.net)}</em><small>${G.esc([p.ar.join('、'), p.mix ? hr(p.mix) + (p.net ? ' · ' + yen(p.net / p.mix) + '/h' : '') : '没有工时记录'].filter(Boolean).join(' · '))}</small></a>`).join('');
    const numBody = `<div class="wk-nav"><button data-wm="-1" aria-label="上个月">‹</button><b>${Y} 年 ${M + 1} 月</b><button data-wm="1" aria-label="下个月">›</button>${isNow ? '' : '<button class="now" data-wm="0">本月</button>'}</div>${cards}
      <div class="wk-cal">${cal}</div>${dayBox}<div class="wk-h">${isNow ? '本月' : M + 1 + ' 月'}交付 · ${S.list.length} 首 · ${yen(S.inc)}</div>${delivered || '<div class="msg">这个月还没有交付的歌</div>'}`;
    // ④ 专辑进度
    const am = {}; WK.rows.forEach(p => { if (single(p) || nCancel(p)) return; const g = am[p.al] || (am[p.al] = { name: p.al, total: 0, done: 0, last: '' }); g.total++; if (nDone(p)) g.done++; const l = last(p); if (l > g.last) g.last = l; });
    const albums = Object.values(am).filter(g => g.done < g.total).sort((a, b) => (a.last || '9') < (b.last || '9') ? -1 : 1);
    const alBody = albums.map(g => { const a = ago(g.last), stall = a != null && a >= 14; return `<div class="wk-al"><div class="t"><b>${G.esc(g.name)}</b><span class="${stall ? 'warn' : ''}">${g.done}/${g.total} 首 · ${a == null ? '还没开工' : a === 0 ? '今天动过' : a + ' 天' + (stall ? '没动了' : '前')}</span></div><div class="bar"><i style="width:${pct(g.done, g.total)}%"></i></div></div>`; }).join('');
    const stalled = albums.filter(g => { const a = ago(g.last); return a != null && a >= 14; }).length;
    const rpt = `<div class="wk-rpt">推送到手机：<button data-rp="day">日报</button><button data-rp="week">周报</button><button data-rp="month">月报</button><span>每天 10:00 · 周日 21:00 · 每月 1 号</span></div>`;
    return bar + nowCard + meList
      + (sh.length ? fold('shelf', '搁置的', sh.length + ' 首 · 逾期很久没动', 0, sh.map(rowHtml).join('')) : '')
      + fold('wait', '等别人', others.length + ' 首' + (nudges ? ' · ' + nudges + ' 首该催了' : ''), nudges, waitBody)
      + fold('num', '本月数字和日历', yen(now.inc) + ' · ' + hr(now.hrs), 0, numBody)
      + rpt
      + (albums.length ? fold('album', '专辑进度', albums.length + ' 张在做' + (stalled ? ' · ' + stalled + ' 张停了两周' : ''), stalled, alBody) : '');
  };
  window.bindWork = () => {
    const q = s => G.root.querySelector(s), rt = q('#wkRetry'); if (rt) rt.onclick = () => { err = ''; load(true); G.render(); };
    G.root.querySelectorAll('.wk-fold').forEach(d => d.ontoggle = () => ls.set('insights:wf:' + d.dataset.wf, d.open ? '1' : '0'));
    G.root.querySelectorAll('[data-wm]').forEach(b => b.onclick = () => { const d = +b.dataset.wm; if (!d) { Y = T0.getFullYear(); M = T0.getMonth(); } else { const x = new Date(Y, M + d, 1); Y = x.getFullYear(); M = x.getMonth(); } day = ''; G.render(); });
    G.root.querySelectorAll('[data-wd]').forEach(b => b.onclick = () => { day = day === b.dataset.wd ? '' : b.dataset.wd; G.render(); });
    G.root.querySelectorAll('[data-wt]').forEach(c => c.onclick = () => { const k = c.dataset.wt, v = prompt(k === 'inc' ? '月收入目标（元）' : '月工时目标（小时）', target(k)); if (v == null) return; const n = parseFloat(v); if (n > 0) { ls.set('insights:w' + k, n); G.render(); } });
    G.root.querySelectorAll('[data-rp]').forEach(b => b.onclick = async () => { const k = b.dataset.rp, nm = b.textContent; b.textContent = '发送中…';
      try { const j = await (await fetch(G.API + '/work/report?kind=' + k + '&send=1', { headers: { Authorization: 'Bearer ' + G.KEY } })).json(); b.textContent = nm; G.toast(j.ok ? (j.sent && j.sent.length ? nm + '已发到手机：' + j.title : nm + '已生成，但没有设备可推送') : '没发出去（' + (j.err || '') + '）', 3500); } catch (e) { b.textContent = nm; G.toast('没发出去，检查网络', 3000); } });
    const al = q('#wkAll'); if (al) al.onclick = () => { allMe = !allMe; G.render(); };
  };
})();
