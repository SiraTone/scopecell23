/* CellScope video player. Upgrades <video class="shot" controls> into a custom
   player with the KyCast viewer's dock-style play bar. Without JS the native
   controls stay, so nothing breaks. */
(function () {
  'use strict';
  var I = {
    play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M11 12l9-7v14zM3 5h2.5v14H3zM5.5 12L13 6v12z" transform="translate(0 0)"/></svg>',
    fwd: '<svg viewBox="0 0 24 24"><path d="M13 12L4 5v14zM18.5 5H21v14h-2.5zM18.5 12L11 6v12z"/></svg>',
    vol: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9zM15.5 8.5a5 5 0 010 7l-1.4-1.4a3 3 0 000-4.2zM18.4 5.6a9 9 0 010 12.8l-1.4-1.4a7 7 0 000-10z"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9zM16 9.4l1.4-1.4 2.6 2.6L22.6 8 24 9.4 21.4 12 24 14.6 22.6 16 20 13.4 17.4 16 16 14.6 18.6 12z" transform="translate(-1 0)"/></svg>',
    full: '<svg viewBox="0 0 24 24"><path d="M4 4h6v2H6v4H4zM14 4h6v6h-2V6h-4zM4 14h2v4h4v2H4zM18 14h2v6h-6v-2h4z"/></svg>',
    big: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>'
  };

  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  }

  function build(v) {
    if (v.dataset.vp) return;
    v.dataset.vp = '1';
    v.removeAttribute('controls');
    v.controls = false;

    var box = el('div', 'vp');
    box.tabIndex = 0;
    v.parentNode.insertBefore(box, v);
    box.appendChild(v);

    var big = el('button', 'vp-big', I.big);
    big.type = 'button'; big.setAttribute('aria-label', 'Play');
    var dock = el('div', 'vp-dock');
    var clock = el('div', 'vp-clock', '<b>0:00</b><span>/ 0:00</span>');
    var row = el('div', 'vp-row');

    function btn(icon, label) {
      var b = el('button', 'vp-btn', icon);
      b.type = 'button'; b.title = label; b.setAttribute('aria-label', label);
      return b;
    }
    var bBack = btn(I.back, 'back 5 s (Left)');
    var bPlay = btn(I.play, 'play / pause (Space)');
    var bFwd = btn(I.fwd, 'forward 5 s (Right)');
    var bar = el('div', 'vp-bar');
    var track = el('div', 'vp-track');
    var buf = el('div', 'vp-buf'), fill = el('div', 'vp-fill');
    track.appendChild(buf); track.appendChild(fill);
    var knob = el('div', 'vp-knob'), tip = el('div', 'vp-tip', '0:00');
    bar.appendChild(track); bar.appendChild(knob); bar.appendChild(tip);
    bar.setAttribute('role', 'slider'); bar.setAttribute('aria-label', 'Seek');

    var spd = el('select', 'vp-spd');
    [['0.5', '0.5x'], ['1', '1x'], ['1.5', '1.5x'], ['2', '2x']].forEach(function (o) {
      var op = el('option'); op.value = o[0]; op.textContent = o[1];
      if (o[0] === '1') op.selected = true;
      spd.appendChild(op);
    });
    spd.title = 'speed'; spd.setAttribute('aria-label', 'Playback speed');
    var bMute = btn(I.vol, 'mute (M)');
    var vol = el('input', 'vp-vol');
    vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.05; vol.value = 1;
    vol.setAttribute('aria-label', 'Volume');
    var bFull = btn(I.full, 'fullscreen (F)');
    var time = el('span', 'vp-time', '0:00 / 0:00');

    [bPlay, bar, time, spd, bMute, vol, bFull].forEach(function (n) { row.appendChild(n); });
    dock.appendChild(row);
    box.appendChild(big); box.appendChild(dock);

    
    function toggle() { v.paused ? v.play() : v.pause(); }
    function seekBy(d) { v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + d)); }
    function paint() {
      var d = v.duration || 0, p = d ? v.currentTime / d : 0;
      fill.style.width = (p * 100) + '%';
      knob.style.left = (p * 100) + '%';
      time.textContent = fmt(v.currentTime) + ' / ' + fmt(d);
      bar.setAttribute('aria-valuenow', Math.round(p * 100));
    }
    function paintBuf() {
      var d = v.duration || 0, e = 0, b = v.buffered, t = v.currentTime;
      for (var i = 0; i < b.length; i++) if (b.start(i) <= t + 0.5 && b.end(i) > e) e = b.end(i);
      buf.style.width = d ? (e / d * 100) + '%' : '0';
    }
    function state() {
      var pl = !v.paused && !v.ended;
      box.classList.toggle('playing', pl);
      bPlay.innerHTML = pl ? I.pause : I.play;
      big.setAttribute('aria-label', pl ? 'Pause' : 'Play');
      wake();
    }

    var idleT;
    function wake() {
      box.classList.remove('idle');
      clearTimeout(idleT);
      if (!v.paused && !v.ended) idleT = setTimeout(function () { box.classList.add('idle'); }, 2500);
    }
    box.addEventListener('mousemove', wake);
    box.addEventListener('touchstart', wake, { passive: true });
    box.addEventListener('mouseleave', function () {
      if (!v.paused) { clearTimeout(idleT); idleT = setTimeout(function () { box.classList.add('idle'); }, 600); }
    });

    function frac(ev) {
      var r = bar.getBoundingClientRect();
      return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    }
    var scrubbing = false, wasPlaying = false;
    function scrubTo(ev) {
      var f = frac(ev), d = v.duration || 0;
      v.currentTime = f * d;
      paint();
    }
    bar.addEventListener('pointerdown', function (ev) {
      if (!v.duration) return;
      scrubbing = true; wasPlaying = !v.paused;
      box.classList.add('scrub');
      bar.setPointerCapture(ev.pointerId);
      v.pause();
      scrubTo(ev);
    });
    bar.addEventListener('pointermove', function (ev) {
      var f = frac(ev);
      tip.style.left = (f * 100) + '%';
      tip.textContent = fmt(f * (v.duration || 0));
      if (scrubbing) scrubTo(ev);
    });
    function endScrub() {
      if (!scrubbing) return;
      scrubbing = false; box.classList.remove('scrub');
      if (wasPlaying) v.play();
    }
    bar.addEventListener('pointerup', endScrub);
    bar.addEventListener('pointercancel', endScrub);

    v.addEventListener('timeupdate', paint);
    v.addEventListener('progress', paintBuf);
    v.addEventListener('loadedmetadata', function () { paint(); paintBuf(); });
    v.addEventListener('durationchange', paint);
    v.addEventListener('play', state);
    v.addEventListener('pause', state);
    v.addEventListener('ended', state);
    v.addEventListener('waiting', function () { box.classList.add('loading'); });
    v.addEventListener('canplay', function () { box.classList.remove('loading'); paintBuf(); });
    v.addEventListener('volumechange', function () {
      bMute.innerHTML = (v.muted || v.volume === 0) ? I.mute : I.vol;
      vol.value = v.muted ? 0 : v.volume;
      vol.style.setProperty('--v', (vol.value * 100) + '%');
    });

    big.addEventListener('click', toggle);
    v.addEventListener('click', toggle);
    v.addEventListener('dblclick', fs);
    bPlay.addEventListener('click', toggle);
        spd.addEventListener('change', function () { v.playbackRate = parseFloat(spd.value); });
    bMute.addEventListener('click', function () { v.muted = !v.muted; });
    vol.addEventListener('input', function () { v.muted = false; v.volume = parseFloat(vol.value); });

    function fs() {
      if (document.fullscreenElement) { document.exitFullscreen(); return; }
      var f = box.requestFullscreen || box.webkitRequestFullscreen;
      if (f) f.call(box);
      else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); /* iOS */
    }
    bFull.addEventListener('click', fs);

    box.addEventListener('keydown', function (ev) {
      if (ev.target === spd || ev.target === vol) return;
      var k = ev.key, used = true;
      if (k === ' ' || k === 'k') toggle();
      else if (k === 'ArrowLeft') seekBy(-5);
      else if (k === 'ArrowRight') seekBy(5);
      else if (k === 'ArrowUp') v.volume = Math.min(1, v.volume + 0.1);
      else if (k === 'ArrowDown') v.volume = Math.max(0, v.volume - 0.1);
      else if (k === 'm') v.muted = !v.muted;
      else if (k === 'f') fs();
      else used = false;
      if (used) { ev.preventDefault(); wake(); }
    });

    state(); paint();
  }

  function init() {
    var vs = document.querySelectorAll('video.shot');
    for (var i = 0; i < vs.length; i++) build(vs[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
