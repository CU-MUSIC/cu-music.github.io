// 审听页加载器：歌曲数据从 stats.cumusic.work 读（音频是加密的，要输密码才能听），然后交给共用播放器 player.js
//   <script src="../load.js" data-slug="wubu"></script>   老歌，网址 review/wubu/ 不变
//   <script src="../load.js"></script>                    看板新建的歌，网址 review/s/#码
(async () => {
  const me = document.currentScript;
  const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:8787' : 'https://stats.cumusic.work';
  const slug = (me.dataset.slug || location.hash.slice(1) || new URLSearchParams(location.search).get('s') || '').replace(/[^a-z0-9]/g, '');
  const player = me.src.replace(/load\.js(\?.*)?$/, 'player.js') + (me.dataset.v ? '?v=' + me.dataset.v : '');
  const fail = t => { const b = document.getElementById('boot'); if (b) b.textContent = t; };
  if (!slug) return fail('链接不完整，请向刀大厨要完整链接');
  try {
    const r = await fetch(API + '/rs?s=' + slug, { cache: 'no-store' });
    const j = await r.json();
    if (!j.ok) return fail('找不到这首歌，请向刀大厨确认链接');
    j.song.versions.forEach(v => { if (v.audio.startsWith('/')) v.audio = API + v.audio; });
    if (!j.song.versions.length) return fail('这首歌暂时没有可以听的版本');
    window.SONG = j.song; window.SONG_LIVE = { api: API };   // SONG_LIVE：可以在页面里上传 / 删除版本
    document.title = 'CU MUSIC';   // 歌名等输对密码再显示
    const s = document.createElement('script'); s.src = player; document.body.appendChild(s);
  } catch (e) { fail('网络不好，刷新再试一次'); }
})();
