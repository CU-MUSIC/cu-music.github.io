// 审听页加载器：歌曲数据从 stats.cumusic.work 读（音频是加密的，要输密码才能听），然后交给共用播放器 player.js
//   <script src="../load.js" data-slug="wubu"></script>   老歌，网址 review/wubu/ 不变
//   <script src="../load.js"></script>                    看板新建的歌，网址 review/s/#码
(async () => {
  const me = document.currentScript;
  // 在独立应用窗口里打开审听页：左上角给一个返回看板的小标签（只有你自己的设备才有）
  try { if (matchMedia('(display-mode: standalone)').matches && localStorage.getItem('insights:key')) { const bk = document.createElement('a'); bk.href = '/chefdao/review/insights/'; bk.textContent = '‹ Insights';
    bk.style.cssText = 'position:fixed;top:max(10px,env(safe-area-inset-top,0px));left:12px;z-index:98;padding:5px 12px;border-radius:99px;background:rgba(255,255,255,.1);color:#d8d6d2;font:500 13px -apple-system,"PingFang SC",sans-serif;text-decoration:none;backdrop-filter:blur(8px)'; document.body.appendChild(bk); } } catch (e) {}
  
  try { if (localStorage.getItem('insights:key')) { const sd = document.createElement('script'); sd.src = me.src.replace(/load\.js(\?.*)?$/, 'side.js') + (me.dataset.v ? '?v=' + me.dataset.v : ''); document.body.appendChild(sd); } } catch (e) {}   // 侧边栏：只有你的设备有
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
    approval: ['需要申请后查看', '该曲目属于需批准才能查看的项目。']
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
    if (!j.ok && j.e === 'approval') return fail('approval', j.project && j.project.url);
    if (!j.ok) return fail('missing');
    j.song.versions.forEach(v => { if (v.audio.startsWith('/')) v.audio = API + v.audio; });
    if (!j.song.versions.length) return fail('empty');
    if (j.song.archived) { const d = document.createElement('div'); d.textContent = '已归档 · 客户打不开，只有你的设备能看';
      d.style.cssText = 'position:fixed;top:max(10px,env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:99;padding:6px 14px;border-radius:99px;background:rgba(232,201,138,.16);border:1px solid rgba(232,201,138,.4);color:#e8c98a;font:500 13px/1.4 -apple-system,"PingFang SC",sans-serif;white-space:nowrap;pointer-events:none'; document.body.appendChild(d); }
    window.SONG = j.song; window.SONG_LIVE = { api: API };   // SONG_LIVE：可以在页面里上传 / 删除版本
    document.title = 'CU MUSIC';   // 歌名等输对密码再显示
    const s = document.createElement('script'); s.src = player; document.body.appendChild(s);
  } catch (e) { fail('net'); }
})();
