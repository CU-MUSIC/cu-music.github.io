// 审听页加载器：歌曲数据从 stats.cumusic.work 读（音频是加密的，要输密码才能听），然后交给共用播放器 player.js
//   <script src="../load.js" data-slug="wubu"></script>   老歌，网址 review/wubu/ 不变
//   <script src="../load.js"></script>                    看板新建的歌，网址 review/s/#码
(async () => {
  const me = document.currentScript;
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
    archived: ['此项目已归档', '该项目已完成交付并归档，如需回看请联系发送方。']
  };
  const fail = k => {
    const b = document.getElementById('boot'); if (!b) return;
    const m = MSG[k] || [k, ''];
    b.innerHTML = '<div style="text-align:center;max-width:320px;padding:0 24px"><div style="color:#d8d6d2;display:flex;justify-content:center;opacity:.9">' + MARK + '</div>'
      + '<div style="margin-top:22px;font-size:17px;font-weight:600;color:#e6e4e0;letter-spacing:.01em">' + m[0] + '</div>'
      + (m[1] ? '<div style="margin-top:8px;font-size:14px;line-height:1.7;color:#8a8886">' + m[1] + '</div>' : '') + '</div>';
  };
  if (!slug) return fail('incomplete');
  try {
    let owner = null; try { owner = localStorage.getItem('insights:key'); } catch (e) {}   // 你自己的设备带着看板钥匙，归档的项目也能看
    const r = await fetch(API + '/rs?s=' + slug, { cache: 'no-store', headers: owner ? { Authorization: 'Bearer ' + owner } : {} });
    const j = await r.json();
    if (!j.ok && j.e === 'archived') return fail('archived');
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
