// iMessage 的「输入中」三个点：对方在打字时，对话最下面出现一个灰气泡，三个点轮流起伏
// 用法：var ty = Typing({ log: logEl, ping: function () { 发 /chat/typing }, input: textarea, active: function () { return 能不能发 } })
//   ty.set(true/false)  服务器说对方在不在打字
//   ty.detach() / ty.reattach()  往对话里加消息前后调用，保证三个点永远在最底下
(function () {
  var css = '.typ{display:flex;padding:0 16px;margin:2px 0 8px}'
    + '.typ .tb{position:relative;display:flex;align-items:center;gap:4px;height:38px;padding:0 13px;border-radius:19px;background:var(--other);transform-origin:0 100%}'
    + '.typ .tb::before,.typ .tb::after{content:"";position:absolute;border-radius:50%;background:var(--other)}'
    + '.typ .tb::before{left:-1px;bottom:-1px;width:13px;height:13px}'
    + '.typ .tb::after{left:-6px;bottom:-6px;width:6px;height:6px}'
    + '.typ i{width:8px;height:8px;border-radius:50%;background:var(--dim);opacity:.45;animation:typdot 1.3s ease-in-out infinite}'
    + '.typ i:nth-child(2){animation-delay:.18s}.typ i:nth-child(3){animation-delay:.36s}'
    + '@keyframes typdot{0%,55%,100%{opacity:.45;transform:translateY(0)}25%{opacity:.95;transform:translateY(-2.5px)}}'
    + '@media (prefers-reduced-motion:reduce){.typ i{animation:none;opacity:.7}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  window.Typing = function (o) {
    var row = document.createElement('div'); row.className = 'typ'; row.setAttribute('aria-label', '对方正在输入');
    row.innerHTML = '<div class="tb"><i></i><i></i><i></i></div>';
    var on = false, sent = 0;
    var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function near() { return o.log.scrollHeight - o.log.scrollTop - o.log.clientHeight < 140; }
    function set(v) {
      v = !!v;
      if (v === on) { if (on && row.nextSibling) o.log.appendChild(row); return; }
      on = v;
      if (on) {
        var stick = near(); o.log.appendChild(row);
        if (stick) o.log.scrollTo({ top: o.log.scrollHeight, behavior: still ? 'auto' : 'smooth' });
        if (!still) row.firstChild.animate([{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.22,1.25,.36,1)' });
      } else if (row.parentNode) {
        if (still) row.remove();
        else row.firstChild.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.4)', opacity: 0 }], { duration: 180, easing: 'ease-in' }).onfinish = function () { if (!on) row.remove(); };
      }
    }
    // 自己在打字：每 3 秒最多告诉服务器一次（停手 7 秒后对方那边自动消失）
    if (o.input) o.input.addEventListener('input', function () {
      if (!o.input.value.trim() || (o.active && !o.active())) return;
      var t = Date.now(); if (t - sent < 3000) return; sent = t;
      try { o.ping(); } catch (e) {}
    });
    return {
      set: set,
      sent: function () { sent = 0; },
      detach: function () { if (row.parentNode) row.remove(); },
      reattach: function () { if (on) o.log.appendChild(row); }
    };
  };
})();
