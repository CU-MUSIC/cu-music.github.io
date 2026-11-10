// 网络兜底 + 走 Bunny CDN：Cloudflare 免费版把韩国、国内分到洛杉矶（音频几十 KB/s，国内接口平均 4 秒、常失败），Bunny 有首尔 / 东京 / 香港节点
// ① 音频（/ra/…）先从 Bunny 下（可缓存）；② 不带管理钥匙的 GET 接口也经 Bunny 转发（加时间戳，不让 CDN 缓存）；8 秒没响应或出错就退回 stats
// ③ 直连 stats 的 GET：10 秒没回就换带 cookie 的那组连接重发一次（Chrome 睡眠 / 换网后偶尔卡死一条连接）
(() => { if (window.__cuNet) return; window.__cuNet = 1; const F = window.fetch.bind(window), H = 'https://stats.cumusic.work', CDN = 'https://cumusic-audio.b-cdn.net';
  const auth = h => !!h && !!(typeof h.get === 'function' ? h.get('Authorization') : (h.Authorization || h.authorization));
  window.fetch = (u, o = {}) => { const s = typeof u === 'string' ? u : (u && u.url) || '';
    if (!s.startsWith(H) || o.signal || (o.method && o.method !== 'GET')) return F(u, o);
    const go = (url, cr, ms) => { const ac = new AbortController(), t = ms && setTimeout(() => ac.abort(), ms);
      return F(url, { ...o, credentials: cr, signal: ac.signal }).then(r => { clearTimeout(t); if (!r.ok && url !== s) throw new Error('cdn ' + r.status); return r; }, e => { clearTimeout(t); throw e; }); };
    const direct = () => go(s, o.credentials || 'same-origin', 10000).catch(e => e && e.name === 'AbortError' ? go(s, 'include', 0) : Promise.reject(e));
    const p = s.slice(H.length);
    if (p.startsWith('/ra/')) return go(CDN + p, 'omit', 8000).catch(direct);
    if (!auth(o.headers) && !(u && typeof u !== 'string' && auth(u.headers))) return go(CDN + p + (p.includes('?') ? '&' : '?') + '_=' + Date.now(), 'omit', 8000).catch(direct);
    return direct(); }; })();
// 审听页加载器：歌曲数据从 stats.cumusic.work 读（音频是加密的，要输密码才能听），然后交给共用播放器 player.js
//   <script src="../load.js" data-slug="wubu"></script>   老歌，网址 review/wubu/ 不变
//   <script src="../load.js"></script>                    看板新建的歌，网址 review/s/#码
(async () => {
  const me = document.currentScript;
  // 整页交给审听外壳（shell.js），播放器放进它的 iframe。你自己的设备：切歌时正在播的那首留在后台
  const embedded = window.top !== window;
  // 客户也走外壳：同一个项目里切歌时预载好的下一首直接换上，不刷新页面（外壳里只有你的设备才有侧边栏和底部播放条）
  try { if (!embedded && !/[?&]noshell\b/.test(location.search)) { const sh = document.createElement('script'); sh.src = me.src.replace(/load\.js(\?.*)?$/, 'shell.js') + (me.dataset.v ? '?v=' + me.dataset.v : ''); document.head.appendChild(sh); return; } } catch (e) {}
  // 在独立应用窗口里打开审听页：左上角给一个返回看板的小标签（只有你自己的设备才有）
  try { if (matchMedia('(display-mode: standalone)').matches && localStorage.getItem('insights:key')) { const bk = document.createElement('a'); bk.href = '/chefdao/review/insights/'; bk.textContent = '‹ Insights';
    bk.style.cssText = 'position:fixed;top:max(10px,env(safe-area-inset-top,0px));left:12px;z-index:98;padding:5px 12px;border-radius:99px;background:rgba(255,255,255,.1);color:#d8d6d2;font:500 13px -apple-system,"PingFang SC",sans-serif;text-decoration:none;backdrop-filter:blur(8px)'; document.body.appendChild(bk); } } catch (e) {}
  
  const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:8787' : 'https://stats.cumusic.work';
  const slug = (me.dataset.slug || location.hash.slice(1) || new URLSearchParams(location.search).get('s') || '').replace(/[^a-z0-9]/g, '');
  const player = me.src.replace(/load\.js(\?.*)?$/, 'player.js') + (me.dataset.v ? '?v=' + me.dataset.v : '');
  // 错误页：品牌标志 + 一个标题 + 一句说明，措辞客观，不带个人称呼
  const MARK = '<svg viewBox="272 164 456 456" width="52" height="52" fill="none" stroke="currentColor" stroke-width="30" stroke-linecap="round" aria-hidden="true"><path d="M 592.06,203.25 A 210,210 0 1 1 407.94,203.25"/><path d="M 619.61,478.90 A 147.84,147.84 0 1 1 619.61,305.10"/></svg>';
  const MSG = {
    incomplete: ['链接不完整', '请核对链接是否完整，或联系发送方获取新链接。'],
    missing: ['未找到该曲目', '链接可能有误或已失效，请联系发送方确认。'],
    empty: ['暂无可播放的版本', '该曲目尚未上传可试听的版本。'],
    net: ['网络连接异常', '请检查网络后刷新页面。'],
    archived: ['此项目已归档', '该项目已完成交付并归档，如需回看请联系发送方。'],
    approval: ['需要申请后查看', '该曲目属于需批准才能查看的项目。'],
    locked: ['暂未开放', '这首歌还没有对你开放。']
  };
  const fail = (k, link) => {
    const b = document.getElementById('boot'); if (!b) return;
    const m = MSG[k] || [k, ''];
    b.innerHTML = '<div style="text-align:center;max-width:320px;padding:0 24px"><div style="color:#d8d6d2;display:flex;justify-content:center;opacity:.9">' + MARK + '</div>'
      + '<div style="margin-top:22px;font-size:17px;font-weight:600;color:#e6e4e0;letter-spacing:.01em">' + m[0] + '</div>'
      + (m[1] ? '<div style="margin-top:8px;font-size:14px;line-height:1.7;color:#8a8886">' + m[1] + '</div>' : '')
      + (link ? '<a href="' + link + '" style="display:inline-block;margin-top:18px;padding:10px 20px;border-radius:99px;background:#eeeee6;color:#0e0e0f;font-size:14px;font-weight:600;text-decoration:none">去项目页申请</a>' : '') + '</div>';
  };
  if (!slug) return fail('incomplete');
  try {
    let owner = null; try { owner = localStorage.getItem('insights:key'); } catch (e) {}   // 你自己的设备带着看板钥匙，归档的项目也能看
    let tok = ''; try { tok = localStorage.getItem('review:tok') || ''; } catch (e) {}
    const r = await fetch(API + '/rs?s=' + slug + (tok ? '&tok=' + tok : ''), { cache: 'no-store', headers: owner ? { Authorization: 'Bearer ' + owner } : {} });
    const j = await r.json();
    if (!j.ok && j.e === 'archived') return fail('archived');
    if (!j.ok && j.e === 'approval') return fail(j.state === 'locked' ? 'locked' : 'approval', j.project && j.project.url);
    if (!j.ok) return fail('missing');
    j.song.versions.forEach(v => { if (v.audio.startsWith('/')) v.audio = API + v.audio; });
    if (!j.song.versions.length) return fail('empty');
    if (j.song.archived) { const d = document.createElement('div'); d.textContent = '已归档 · 客户打不开，只有你的设备能看';
      d.style.cssText = 'position:fixed;top:max(10px,env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:99;padding:6px 14px;border-radius:99px;background:rgba(232,201,138,.16);border:1px solid rgba(232,201,138,.4);color:#e8c98a;font:500 13px/1.4 -apple-system,"PingFang SC",sans-serif;white-space:nowrap;pointer-events:none'; document.body.appendChild(d); }
    window.SONG = j.song; window.SONG_LIVE = { api: API };   // SONG_LIVE：可以在页面里上传 / 删除版本
    document.title = 'CU MUSIC';   // 歌名等输对密码再显示
    const s = document.createElement('script'); s.src = player;
    // 侧边栏：只有你的设备有。等播放器画完页面再加（播放器会整个重写 body，先加的会被清掉）
    s.onload = () => { try { if (!embedded && localStorage.getItem('insights:key')) { const sd = document.createElement('script'); sd.src = me.src.replace(/load\.js(\?.*)?$/, 'side.js') + (me.dataset.v ? '?v=' + me.dataset.v : ''); document.body.appendChild(sd); } } catch (e) {} };
    document.body.appendChild(s);
  } catch (e) { fail('net'); }
})();
