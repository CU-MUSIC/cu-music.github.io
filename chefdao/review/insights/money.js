/* Insights「记账」页 —— 手机上直接记资产，写进 Notion Money Routine（Worker GET/POST /money）
   余额默认填上一条的数，只改变了的；点「记一条」就写进今天那行（今天那行空着就填，已经填过就新增一条）。
   收支是选填，收在折叠里。草稿存本机，切走再回来还在。 */
(() => {
  const G = new Proxy({}, { get: (_, k) => window.__ins[k] });
  const css = `
.mn-top{background:var(--fill);border-radius:18px;padding:16px 18px;margin-bottom:14px}.mn-top .k{font-size:13px;color:var(--text-2)}
.mn-top .n{font-size:30px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.25}.mn-top .d{font-size:13.5px;color:var(--text-3);font-variant-numeric:tabular-nums}
.mn-top .d b{color:var(--text-2);font-weight:500}.mn-top .d b.ok{color:#7fb894}.mn-top .d b.warn{color:var(--red)}
.mn-h{font-size:13px;color:var(--text-3);margin:16px 2px 4px;letter-spacing:.03em}
.mn-row{display:grid;grid-template-columns:1fr minmax(0,150px);align-items:center;gap:2px 12px;padding:6px 2px;border-top:.5px solid var(--hair)}.mn-list .mn-row:first-child{border-top:0}
.mn-row label{font-size:16px;color:var(--text)}.mn-row small{grid-column:1/-1;text-align:right;font-size:12.5px;color:var(--text-3);font-variant-numeric:tabular-nums;margin-top:-2px}
.mn-row small.up{color:#7fb894}.mn-row small.dn{color:var(--red)}
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
    return `<div class="mn-row${grp === 'bal' && k in D.bal && d ? ' chg' : ''}"><label for="mn-${grp}-${k}">${lb}</label><input id="mn-${grp}-${k}" data-mg="${grp}" data-mk="${k}" inputmode="decimal" enterkeyhint="next" autocomplete="off" value="${has ? G.esc(String(v)) : ''}" placeholder="${grp === 'flow' ? '0' : '—'}">${grp === 'bal' && k in D.bal && d ? `<small class="${d > 0 ? 'up' : 'dn'}">${d > 0 ? '+' : ''}${fmt(d)}</small>` : ''}</div>`;
  };

  window.renderMoney = () => {
    if (!asked) load();
    if (!MD) {
      if (err === 'no_access') return `<div class="msg">Worker 读不到 Money Routine。在 Notion 打开 Money Routine → 右上角 ⋯ → 连接 → 选和「项目管理」同一个集成，然后<button class="wk-more" id="mnRetry">重新读取</button></div>`;
      return `<div class="msg">${loading ? '正在读取…' : '没读到数据' + (err ? '（' + G.esc(err) + '）' : '') + '<button class="wk-more" id="mnRetry">重试</button>'}</div>`;
    }
    const L = MD.last, chg = BAL.filter(([k]) => k in D.bal && Number(D.bal[k]) !== base(k)).length, fl = FLOW.filter(([k]) => D.flow[k] !== undefined && D.flow[k] !== '').length;
    const diff = L && Number.isFinite(L.diff) ? L.diff : null;
    const top = `<div class="mn-top"><div class="k">上一条 · ${G.esc(L ? L.date + (L.note ? ' · ' + L.note : '') : '还没有记录')}</div><div class="n">${L && Number.isFinite(L.total) ? yen(L.total) : '—'}</div>
      <div class="d">总资产${diff != null ? ` · 对账差额 <b class="${Math.abs(diff) < 50 ? 'ok' : 'warn'}">${diff > 0 ? '+' : ''}${fmt(diff)}</b>` : ''}${loading ? ' · 刷新中…' : ''}</div></div>`;
    const hist = (MD.recent || []).slice(0, 4).map(r => `<div class="wk-row"><b>${G.esc(r.date)}${r.note ? ' · ' + G.esc(r.note) : ''}</b><em>${Number.isFinite(r.total) ? yen(r.total) : '—'}</em>${Number.isFinite(r.diff) ? `<small>对账差额 ${r.diff > 0 ? '+' : ''}${fmt(r.diff)}</small>` : ''}</div>`).join('');
    return top + `<div class="mn-h">余额 · 改变了的才改</div><div class="mn-list">${BAL.map(([k, lb]) => inp('bal', k, lb, val(k), base(k))).join('')}</div>
      <details class="mn-fold" id="mnFlow"${fl || ls.get('insights:mnflow') === '1' ? ' open' : ''}><summary>收支（选填）<span>${fl ? '填了 ' + fl + ' 项' : '上一条之后的'}</span></summary><div class="mn-list">${FLOW.map(([k, lb]) => inp('flow', k, lb, D.flow[k], null)).join('')}</div></details>
      <input class="mn-note" id="mnNote" placeholder="备注（选填，比如：买洗发水）" value="${G.esc(D.note || '')}" maxlength="80">
      <div class="mn-go"><button id="mnSave"${saving ? ' disabled' : ''}>${saving ? '记录中…' : '＋ 记一条' + (chg || fl ? '（改了 ' + (chg + fl) + ' 项）' : '')}</button></div>
      ${hist ? `<div class="mn-h">最近</div><div class="mn-hist">${hist}</div>` : ''}`;
  };

  window.bindMoney = () => {
    const q = s => G.root.querySelector(s), rt = q('#mnRetry'); if (rt) rt.onclick = () => { err = ''; load(); G.render(); };
    G.root.querySelectorAll('[data-mg]').forEach(el => {
      el.oninput = () => { const g = el.dataset.mg, k = el.dataset.mk, v = el.value.replace(/[,，\s¥₩]/g, '');
        if (g === 'bal') { if (v === '' || Number(v) === base(k)) delete D.bal[k]; else D.bal[k] = v; } else { if (v === '') delete D.flow[k]; else D.flow[k] = v; }
        if (g === 'bal') {   // 原地更新 +/-，不重画（重画会把手机键盘收起来）
          const row = el.closest('.mn-row'), b0 = base(k), d = k in D.bal && b0 != null ? Number(v) - b0 : 0; let sm = row.querySelector('small');
          row.classList.toggle('chg', !!d); if (d && !sm) { sm = document.createElement('small'); row.appendChild(sm); }
          if (sm) { sm.textContent = d ? (d > 0 ? '+' : '') + fmt(d) : ''; sm.className = d > 0 ? 'up' : 'dn'; }
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
