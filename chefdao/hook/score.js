// 盲听算分：Insights 和艺人结果页共用
//   主打榜：大多数人能接受。每个右滑按这个人自己的松紧校正（严格的人右滑更值钱），再往 0 收缩，人少的歌不会靠运气冲上去
//   宝藏榜：右滑率不高（≤ 中位数），但有人特别上头：选它最想听完整版 / 听得比平均久 / 严格的人也右滑 / 有人专门写评论
//   对决：两两对决的胜负，用 Bradley-Terry 估实力
(function () {
  function rateOf(r) { var n = 0, y = 0; Object.keys(r.votes || {}).forEach(function (k) { n++; y += r.votes[k] ? 1 : 0; }); return { n: n, b: (y + 1) / (n + 2) }; }
  function compute(rows, names, role) {
    rows = (rows || []).filter(function (r) { return !role || r.role === role; });
    var st = {}, ids = Object.keys(names);
    ids.forEach(function (id) { st[id] = { id: id, t: names[id], yes: 0, seen: 0, best: 0, lift: 0, sec: 0, sn: 0, p: 0, m: 0, pn: 0, strict: 0, cm: 0 }; });
    var done = rows.filter(function (r) { return r.done !== 0; }).length, allSec = 0, allSn = 0;
    rows.forEach(function (r) {
      var q = rateOf(r);
      Object.keys(r.votes || {}).forEach(function (id) { var s = st[id]; if (!s) return; var v = r.votes[id] ? 1 : 0;
        s.seen++; s.yes += v; s.lift += v - q.b; if (v && q.b <= 0.3) s.strict++; });
      if (r.done !== 0 && st[r.best]) st[r.best].best++;
      Object.keys(r.secs || {}).forEach(function (id) { if (st[id]) { st[id].sec += r.secs[id]; st[id].sn++; allSec += r.secs[id]; allSn++; } });
      Object.keys(r.pos || {}).forEach(function (id) { if (st[id]) { st[id].p += r.pos[id].p; st[id].m += r.pos[id].m; st[id].pn++; } });
      Object.keys(r.cm || {}).forEach(function (id) { if (st[id]) st[id].cm++; });
    });
    var avgSec = allSn ? allSec / allSn : 0;
    var list = ids.map(function (id) { var s = st[id];
      s.rate = s.seen ? s.yes / s.seen : 0;
      s.adj = s.lift / (s.seen + 3);                          // 校正后的右滑，往 0 收缩
      s.hit = s.adj + 1.0 * (s.best / (done + 2));   // 「最想听完整版」是最强的主打信号
      s.avg = s.sn ? s.sec / s.sn : 0;
      return s; });
    var rates = list.filter(function (s) { return s.seen; }).map(function (s) { return s.rate; }).sort(function (a, b) { return a - b; });
    var med = rates.length ? rates[Math.floor((rates.length - 1) / 2)] : 0;
    list.forEach(function (s) {
      var long = avgSec && s.sn >= 2 ? Math.max(0, s.avg / avgSec - 1) : 0;
      s.gem = s.best * 1 + long * 3 + s.strict * 0.7 + s.cm * 0.3;
      s.why = [];
      if (s.best) s.why.push(s.best + ' 人最想听完整版');
      if (long >= 0.25) s.why.push('平均听 ' + Math.round(s.avg) + ' 秒，比平均久 ' + Math.round(long * 100) + '%');
      if (s.strict) s.why.push(s.strict + ' 个严格的人也右滑');
      if (s.cm) s.why.push(s.cm + ' 条单独评论');
    });
    var hit = list.filter(function (s) { return s.seen; }).slice().sort(function (a, b) { return b.hit - a.hit; });
    var hitTop = hit.slice(0, 3).map(function (s) { return s.id; });
    var gem = list.filter(function (s) { return s.seen && s.rate <= med && hitTop.indexOf(s.id) < 0 && s.gem > 0; }).sort(function (a, b) { return b.gem - a.gem; });
    return { n: rows.length, done: done, med: med, avgSec: avgSec, list: list, hit: hit, gem: gem };
  }
  function duel(rows, ids, role) {
    rows = (rows || []).filter(function (r) { return !role || r.role === role; });
    var w = {}, g = {}, m = {};
    ids.forEach(function (a) { w[a] = 0; g[a] = 0; m[a] = {}; ids.forEach(function (b) { m[a][b] = 0; }); });
    rows.forEach(function (r) { (r.picks || []).forEach(function (x) { if (!(x.a in w) || !(x.b in w)) return; var l = x.w === x.a ? x.b : x.a;
      w[x.w]++; g[x.a]++; g[x.b]++; m[x.w][l]++; }); });
    // Bradley-Terry（每对加 0.5 场虚拟平局，避免全胜全负算不出来）
    var p = {}; ids.forEach(function (a) { p[a] = 1; });
    for (var it = 0; it < 60; it++) { var np = {}, s = 0;
      ids.forEach(function (a) { var num = 0.5 * (ids.length - 1) + w[a], den = 0;
        ids.forEach(function (b) { if (a === b) return; var n = m[a][b] + m[b][a] + 1; den += n / (p[a] + p[b]); });
        np[a] = den ? num / den : 1; s += np[a]; });
      ids.forEach(function (a) { p[a] = np[a] / s * ids.length; }); }
    var tot = ids.reduce(function (x, a) { return x + p[a]; }, 0);
    return { n: rows.length, list: ids.map(function (a) { return { id: a, w: w[a], g: g[a], share: tot ? p[a] / tot : 0 }; }).sort(function (a, b) { return b.share - a.share; }) };
  }
  window.HookScore = { compute: compute, duel: duel };
})();
