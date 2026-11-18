/* Insights「记账」页 —— 手机上直接记资产，写进 Notion Money Routine（Worker GET/POST /money）
   余额默认填上一条的数，只改变了的；点「记一条」就写进今天那行（今天那行空着就填，已经填过就新增一条）。
   收支是选填，收在折叠里。草稿存本机，切走再回来还在。 */
(() => {
  const G = new Proxy({}, { get: (_, k) => window.__ins[k] });
  const css = `
.mn-top{background:var(--fill);border-radius:18px;padding:16px 18px;margin-bottom:14px}.mn-top .k{font-size:13px;color:var(--text-2)}
.mn-top .n{font-size:30px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.25}.mn-top .d{font-size:13.5px;color:var(--text-3);font-variant-numeric:tabular-nums}
.mn-top .d b{color:var(--text-2);font-weight:500}.mn-top .d b.ok{color:#7fb894}.mn-top .d b.warn{color:var(--red)}
.mn-top .n small{font-size:15px;font-weight:500;color:var(--text-3);letter-spacing:0}
.mn-bar{position:relative;height:6px;border-radius:3px;background:var(--fill-3);margin:10px 0 8px}.mn-bar i{display:block;height:100%;border-radius:3px;background:#7fb894}
.mn-bar em{position:absolute;top:-4px;width:2px;height:14px;margin-left:-1px;background:var(--pearl);border-radius:1px}
.mn-sp{display:block;width:100%;height:56px;margin:10px 0 4px;overflow:visible}.mn-sp polyline{fill:none;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.mn-sp .sv{stroke:#7fb894;stroke-width:2}.mn-sp .pl{stroke:var(--text-3);stroke-width:1;stroke-dasharray:3 4}
.mn-st{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0 8px}.mn-st>div{background:var(--fill);border-radius:12px;padding:8px 10px;min-width:0}
.mn-st span{display:block;font-size:12px;color:var(--text-3)}.mn-st b{font-size:17px;font-weight:650;font-variant-numeric:tabular-nums}.mn-st b.ok{color:#7fb894}.mn-st b.warn{color:var(--red)}
.mn-cmp .mn-h b{font-weight:600}.mn-cmp .mn-h b.ok{color:#7fb894}.mn-cmp .mn-h b.warn{color:var(--red)}
.mn-mon .n.neg{color:var(--red)}.mn-mon .d b{font-weight:600}.mn-mon .d b.ok{color:#7fb894}.mn-mon .d b.warn{color:var(--red)}
.mn-dv{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:2px}.mn-dv.ok{color:#7fb894}.mn-dv.warn{color:var(--red)}
.mn-cmp{background:var(--fill);border-radius:14px;padding:12px 14px;margin:12px 0 4px}.mn-mv{display:flex;justify-content:space-between;font-size:15px;padding:3px 0;font-variant-numeric:tabular-nums}
.mn-mv span{color:var(--text-2)}.mn-mv b{font-weight:600}.mn-mv b.ok{color:#7fb894}.mn-mv b.warn{color:var(--red)}
.mn-hist em i{font-style:normal;font-size:13px;margin-left:6px}.mn-hist em i.mn-up{color:#7fb894}.mn-hist em i.mn-dn{color:var(--red)}
.mn-last{font-size:13.5px;color:var(--text-3);margin:-4px 2px 4px;font-variant-numeric:tabular-nums}.mn-last b.ok{color:#7fb894;font-weight:500}.mn-last b.warn{color:var(--red);font-weight:500}
.mn-h{font-size:13px;color:var(--text-3);margin:16px 2px 4px;letter-spacing:.03em}
.mn-row{display:grid;grid-template-columns:1fr minmax(0,150px);align-items:center;gap:2px 12px;padding:6px 2px;border-top:.5px solid var(--hair)}.mn-list .mn-row:first-child{border-top:0}
.mn-row label{font-size:16px;color:var(--text)}.mn-row small{grid-column:1/-1;text-align:right;font-size:12.5px;color:var(--text-3);font-variant-numeric:tabular-nums;margin-top:-2px}
.mn-row small.mn-up{color:#7fb894}.mn-row small.mn-dn{color:var(--red)}
.mn-row input{width:100%;font:inherit;font-size:18px;text-align:right;font-variant-numeric:tabular-nums;background:var(--fill);border:0;border-radius:10px;padding:9px 12px;color:var(--text);outline:none;-webkit-appearance:none}
.mn-row input:focus{background:var(--fill-3)}.mn-row.chg input{box-shadow:0 0 0 1.5px #7fb894 inset}
.mn-note{width:100%;font:inherit;font-size:16px;background:var(--fill);border:0;border-radius:10px;padding:11px 12px;color:var(--text);outline:none;margin-top:4px}
.mn-fold{border-top:.5px solid var(--hair);border-bottom:.5px solid var(--hair);margin-top:14px}.mn-fold>summary{list-style:none;cursor:pointer;padding:13px 2px;font-size:16px;font-weight:600;display:flex;justify-content:space-between}
.mn-fold>summary::-webkit-details-marker{display:none}.mn-fold>summary span{font-size:13px;font-weight:400;color:var(--text-3)}.mn-fold .mn-list{padding-bottom:10px}
.mn-go{position:sticky;bottom:calc(76px + env(safe-area-inset-bottom));margin:18px 0 8px;z-index:5}
.mn-go button{width:100%;font-size:18px;font-weight:700;padding:15px;border-radius:16px;background:var(--pearl);color:var(--ink);box-shadow:0 6px 24px rgba(0,0,0,.35)}
.mn-go button:disabled{opacity:.5}
.mn-hist .wk-row{display:grid;grid-template-columns:1fr auto;gap:1px 12px;padding:10px 2px;border-top:.5px solid var(--hair);font-size:15px}.mn-hist em{font-style:normal;color:var(--text-2);font-variant-numeric:tabular-nums}
.mn-hist small{grid-column:1/-1;font-size:12.5px;color:var(--text-3)}
@media (min-width:700px){.mn-go{bottom:16px}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
  const BAL = [['银行存款', '银行'], ['微信存款', '微信'], ['余利宝', '余利宝'], ['月利宝', '月利宝'], ['小荷包', '小荷包'], ['韩元', '韩元 ₩'], ['股票', '股票 / 基金'], ['负债', '负债'], ['借款', '借款']];
  const FLOW = [['收入·混音', '收入 · 混音'], ['收入·录音', '收入 · 录音'], ['收入·课程', '收入 · 课程'], ['收入·家里', '收入 · 家里'], ['伙食支出', '支出 · 伙食'], ['支出·房租交通', '支出 · 房租交通'], ['支出·设备订阅', '支出 · 设备订阅'], ['支出·社交娱乐', '支出 · 社交娱乐'], ['支出·生活杂类', '支出 · 生活杂类'], ['工资支出', '支出 · 工资'], ['一次性支出', '支出 · 一次性']];
  let MD = null, loading = false, err = '', asked = false, saving = false;
  try { MD = JSON.parse(ls.get('insights:money') || 'null'); } catch (e) { MD = null; }
  let D = null; try { D = JSON.parse(ls.get('insights:moneyDraft') || 'null'); } catch (e) { D = null; }
  if (!D || typeof D !== 'object') D = { bal: {}, flow: {}, note: '' };
  const saveDraft = () => ls.set('insights:moneyDraft', JSON.stringify(D));
  const yen = x => '¥' + Math.round(x).toLocaleString('en-US'), fmt = x => (Math.round(x * 100) / 100).toLocaleString('en-US');
  const base = k => { const c = MD && MD.cur && MD.cur.bal[k], l = MD && MD.last && MD.last.bal[k]; return k === '负债' && c != null ? c : l; };   // 负债今天那行自动带了，以它为准
  const val = k => k in D.bal ? D.bal[k] : base(k);

  async function load() {
    if (loading) return; loading = true; asked = true;
    try {
      const j = await (await fetch(G.API + '/money', { headers: { Authorization: 'Bearer ' + G.KEY } })).json();
      if (j.ok) { MD = j; err = ''; ls.set('insights:money', JSON.stringify(j)); } else err = j.err || 'err';
    } catch (e) { err = 'net'; }
    loading = false; if (G.tab === 'money' && !G.typing()) G.render();
  }
  const inp = (grp, k, lb, v, b) => {
    const has = v !== undefined && v !== null && v !== '', d = grp === 'bal' && has && b != null ? Number(v) - b : 0;
    return `<div class="mn-row${grp === 'bal' && k in D.bal && d ? ' chg' : ''}"><label for="mn-${grp}-${k}">${lb}</label><input id="mn-${grp}-${k}" data-mg="${grp}" data-mk="${k}" inputmode="decimal" enterkeyhint="next" autocomplete="off" value="${has ? G.esc(String(v)) : ''}" placeholder="${grp === 'flow' ? '0' : '—'}">${grp === 'bal' && k in D.bal && d ? `<small class="${d > 0 ? 'mn-up' : 'mn-dn'}">${d > 0 ? '+' : ''}${fmt(d)}</small>` : ''}</div>`;
  };

  // 记录的时间：日期 + 创建时刻（本机时区），同一天两条能分开
  const stamp = r => { const t = r.le || r.ct ? new Date(r.le || r.ct) : null; return r.date.slice(5).replace('-', '/') + (t && !isNaN(t) ? ' ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') : ''); };
  // 存钱进度：已存 / 目标、和计划线比领先还是落后、每月要存 vs 近 30 天实际
  function progCard(p) {
    if (!p) return '';
    const pct = Math.min(100, p.saved / p.goal * 100), pp = Math.min(100, p.plan / p.goal * 100), ahead = p.saved - p.plan, md = p.asOf.slice(5).replace('-', '/');
    const ser = p.ser || [], W = 300, H = 56;
    let spark = '';
    if (ser.length > 1) {
      const t0 = Date.parse(ser[0].d), t1 = Date.parse(ser[ser.length - 1].d) || t0 + 1, lo = Math.min(...ser.map(x => x.s)) * .97, hi = Math.max(...ser.map(x => x.s), p.plan) * 1.01;
      const X = d => (Date.parse(d) - t0) / (t1 - t0 || 1) * W, Yv = v => H - (v - lo) / (hi - lo || 1) * H;
      const p0 = Date.parse('2026-10-23'), pv = d => 11070 + (p.goal - 11070) * Math.max(0, (Date.parse(d) - p0) / (Date.parse('2027-02-28') - p0));
      spark = `<svg class="mn-sp" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline class="pl" points="${X(ser[0].d)},${Yv(pv(ser[0].d))} ${W},${Yv(pv(ser[ser.length - 1].d))}"/><polyline class="sv" points="${ser.map(x => X(x.d).toFixed(1) + ',' + Yv(x.s).toFixed(1)).join(' ')}"/></svg>`;
    }
    const need = p.monthly - p.surplus;
    // 比上一条：直接拿最近两条有余额的记录比（同一天记两次也能看出差多少），不按天
    const R = (MD && MD.recent) || [], a = R[0], b = R[1], dv = a && b && a.saved != null && b.saved != null ? a.saved - b.saved : null;
    // 本月已攒 = 最新已存 − 上个月最后一条的已存；本月目标按月初那一刻的缺口摊到剩下的月份（月中不会跟着变）
    const ym = p.asOf.slice(0, 7), mStart = ym + '-01', base = [...ser].reverse().find(x => x.d < mStart) || ser[0];
    const dd = (x, y) => Math.round((Date.parse(y) - Date.parse(x)) / 864e5), mSaved = base ? p.saved - base.s : 0;
    const mTarget = base ? Math.round(Math.max(0, p.goal - base.s) / Math.max(1, dd(base.d, '2027-02-28') / 30.4) / 10) * 10 : p.monthly;
    const y0 = +ym.slice(0, 4), m0 = +ym.slice(5, 7), mEnd = new Date(Date.UTC(y0, m0, 0)).toISOString().slice(0, 10), mLeft = Math.max(0, dd(p.asOf, mEnd));
    const mPct = Math.max(0, Math.min(100, mTarget ? mSaved / mTarget * 100 : 0)), mGap = mTarget - mSaved;
    const month = `<div class="mn-top mn-mon"><div class="k">${m0} 月已攒</div><div class="n ${mSaved >= 0 ? '' : 'neg'}">${mSaved >= 0 ? '' : '−'}${yen(Math.abs(mSaved))}<small> / 本月目标 ${yen(mTarget)}</small></div>
      <div class="mn-bar"><i style="width:${mPct}%"></i></div>
      <div class="d">${mGap > 0 ? `还差 <b class="warn">${yen(mGap)}</b> · 离月底 ${mLeft} 天${mLeft ? '，平均每天 ' + yen(mGap / mLeft) : ''}` : `<b class="ok">本月目标已达成，多攒了 ${yen(-mGap)}</b>`} · 从 ${base ? base.d.slice(5).replace('-', '/') : '月初'} 的 ${base ? yen(base.s) : '—'} 算起</div></div>`;
    return month + `<div class="mn-top mn-prog"><div class="k">已存 · 截至 ${a ? stamp(a) : md}</div><div class="n">${yen(p.saved)}<small> / ${yen(p.goal)}</small></div>
      ${dv != null ? `<div class="mn-dv ${dv >= 0 ? 'ok' : 'warn'}">比上一条（${stamp(b)}）${dv >= 0 ? '+' : '−'}¥${fmt(Math.abs(dv))}</div>` : ''}
      <div class="mn-bar"><i style="width:${pct}%"></i><em style="left:${pp}%" title="计划线"></em></div>
      <div class="d">按计划 ${md} 应到 ${yen(p.plan)} · <b class="${ahead >= 0 ? 'ok' : 'warn'}">${ahead >= 0 ? '领先 ' : '落后 '}${yen(Math.abs(ahead))}</b></div>${spark}
      <div class="mn-st"><div><span>每月要存</span><b>${yen(p.monthly)}</b></div><div><span>实际每月</span><b class="${need > 0 ? 'warn' : 'ok'}">${yen(p.surplus)}</b></div><div><span>剩</span><b>${p.daysLeft} 天</b></div></div>
      <div class="d">照近 30 天的速度，2/28 能到 ${yen(p.projected)}${p.projected >= p.goal ? '，够了' : '，还差 ' + yen(p.goal - p.projected)} · 1/15 决策线 ${yen(p.decide[1])}</div></div>`;
  }
  window.renderMoney = () => {
    if (!asked) load();
    if (!MD) {
      if (err === 'no_access') return `<div class="msg">Worker 读不到 Money Routine。在 Notion 打开 Money Routine → 右上角 ⋯ → 连接 → 选和「项目管理」同一个集成，然后<button class="wk-more" id="mnRetry">重新读取</button></div>`;
      return `<div class="msg">${loading ? '正在读取…' : '没读到数据' + (err ? '（' + G.esc(err) + '）' : '') + '<button class="wk-more" id="mnRetry">重试</button>'}</div>`;
    }
    const L = MD.last, chg = BAL.filter(([k]) => k in D.bal && Number(D.bal[k]) !== base(k)).length, fl = FLOW.filter(([k]) => D.flow[k] !== undefined && D.flow[k] !== '').length;
    const diff = L && Number.isFinite(L.diff) ? L.diff : null;
    const top = progCard(MD.prog) + `<div class="mn-last">上一条 ${G.esc(L ? L.date.slice(5).replace('-', '/') + (L.note ? ' · ' + L.note : '') : '还没有记录')} · 总资产 ${L && Number.isFinite(L.total) ? yen(L.total) : '—'}${diff != null ? ` · 对账差额 <b class="${Math.abs(diff) < 50 ? 'ok' : 'warn'}">${diff > 0 ? '+' : ''}${fmt(diff)}</b>` : ''}${loading ? ' · 刷新中…' : ''}</div>`;
    // 上一条和再上一条：哪几个账户变了
    const R = MD.recent || [], a = R[0], b = R[1], lbOf = k => (BAL.find(x => x[0] === k) || [k, k])[1];
    const moved = a && b ? BAL.map(([k]) => [k, (a.bal[k] || 0) - (b.bal[k] || 0)]).filter(([, d]) => Math.abs(d) >= 0.01) : [];
    const cmp = a && b ? `<div class="mn-cmp"><div class="mn-h" style="margin-top:0">最近两条 · ${G.esc(stamp(b))} → ${G.esc(stamp(a))}${a.saved != null && b.saved != null ? ` · 已存 <b class="${a.saved >= b.saved ? 'ok' : 'warn'}">${a.saved >= b.saved ? '+' : '−'}¥${fmt(Math.abs(a.saved - b.saved))}</b>` : ''}</div>${moved.length ? moved.map(([k, d]) => `<div class="mn-mv"><span>${lbOf(k)}</span><b class="${(d > 0) !== (k === '负债') ? 'ok' : 'warn'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}${k === '韩元' ? ' ₩' : ''}</b></div>`).join('') : '<div class="mn-mv"><span>余额都没变</span></div>'}</div>` : '';
    // 最近几天的已存和每天的变化（从存钱进度的序列来）
    const S = ((MD.prog && MD.prog.ser) || []).slice(-8).reverse();
    const hist = S.slice(0, 7).map((x, i) => { const pv = S[i + 1], d = pv ? x.s - pv.s : null; return `<div class="wk-row"><b>${x.d.slice(5).replace('-', '/')}</b><em>${yen(x.s)}${d != null ? ` <i class="${d >= 0 ? 'mn-up' : 'mn-dn'}">${d >= 0 ? '+' : '−'}${yen(Math.abs(d))}</i>` : ''}</em></div>`; }).join('');
    return top + cmp + `<div class="mn-h">余额 · 改变了的才改</div><div class="mn-list">${BAL.map(([k, lb]) => inp('bal', k, lb, val(k), base(k))).join('')}</div>
      <details class="mn-fold" id="mnFlow"${fl || ls.get('insights:mnflow') === '1' ? ' open' : ''}><summary>收支（选填）<span>${fl ? '填了 ' + fl + ' 项' : '上一条之后的'}</span></summary><div class="mn-list">${FLOW.map(([k, lb]) => inp('flow', k, lb, D.flow[k], null)).join('')}</div></details>
      <input class="mn-note" id="mnNote" placeholder="备注（选填，比如：买洗发水）" value="${G.esc(D.note || '')}" maxlength="80">
      <div class="mn-go"><button id="mnSave"${saving ? ' disabled' : ''}>${saving ? '记录中…' : '＋ 记一条' + (chg || fl ? '（改了 ' + (chg + fl) + ' 项）' : '')}</button></div>
      ${hist ? `<div class="mn-h">每天已存</div><div class="mn-hist">${hist}</div>` : ''}`;
  };

  window.bindMoney = () => {
    const q = s => G.root.querySelector(s), rt = q('#mnRetry'); if (rt) rt.onclick = () => { err = ''; load(); G.render(); };
    G.root.querySelectorAll('[data-mg]').forEach(el => {
      el.oninput = () => { const g = el.dataset.mg, k = el.dataset.mk, v = el.value.replace(/[,，\s¥₩]/g, '');
        if (g === 'bal') { if (v === '' || Number(v) === base(k)) delete D.bal[k]; else D.bal[k] = v; } else { if (v === '') delete D.flow[k]; else D.flow[k] = v; }
        if (g === 'bal') {   // 原地更新 +/-，不重画（重画会把手机键盘收起来）
          const row = el.closest('.mn-row'), b0 = base(k), d = k in D.bal && b0 != null ? Number(v) - b0 : 0; let sm = row.querySelector('small');
          row.classList.toggle('chg', !!d); if (d && !sm) { sm = document.createElement('small'); row.appendChild(sm); }
          if (sm) { sm.textContent = d ? (d > 0 ? '+' : '') + fmt(d) : ''; sm.className = d > 0 ? 'mn-up' : 'mn-dn'; }
        }
        saveDraft(); const b = q('#mnSave'); if (b && !saving) { const n = Object.keys(D.bal).length + Object.keys(D.flow).length; b.textContent = '＋ 记一条' + (n ? '（改了 ' + n + ' 项）' : ''); } };
      el.onfocus = () => { try { el.select(); } catch (e) {} };
      el.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const all = [...G.root.querySelectorAll('[data-mg]')], i = all.indexOf(el); if (all[i + 1]) all[i + 1].focus(); else el.blur(); } };
    });
    const nt = q('#mnNote'); if (nt) nt.oninput = () => { D.note = nt.value; saveDraft(); };
    const fd = q('#mnFlow'); if (fd) fd.ontoggle = () => ls.set('insights:mnflow', fd.open ? '1' : '0');
    const sv = q('#mnSave'); if (sv) sv.onclick = async () => {
      if (saving) return;
      const bal = {}; BAL.forEach(([k]) => { const v = val(k); if (v !== undefined && v !== null && v !== '') bal[k] = v; });   // 没改的也一起写，今天那行才是完整的
      const flow = { ...D.flow };
      if (!Object.keys(bal).length && !Object.keys(flow).length) return G.toast('还没有可记的数', 2000);
      saving = true; G.render();
      try {
        const j = await (await fetch(G.API + '/money', { method: 'POST', headers: { Authorization: 'Bearer ' + G.KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ bal, flow, note: D.note || '' }) })).json();
        if (!j.ok) throw new Error(j.err || 'err');
        D = { bal: {}, flow: {}, note: '' }; ls.del('insights:moneyDraft');
        const r = j.row || {}; G.toast('已记进 Notion' + (Number.isFinite(r.total) ? ' · 总资产 ' + yen(r.total) : '') + (Number.isFinite(r.diff) ? ' · 对账差额 ' + fmt(r.diff) : ''), 4000);
        saving = false; await load(); return;
      } catch (e) { G.toast('没记上（' + (e.message === 'no_access' ? 'Notion 没连上 Money Routine' : e.message || '网络') + '），草稿还在', 4000); }
      saving = false; G.render();
    };
  };
})();
