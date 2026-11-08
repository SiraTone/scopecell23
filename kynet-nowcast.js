/* KyCast public nowcast (cellscope.live). Experimental, not an official forecast.
   Reads the latest 0-2 h radar nowcast (meta.json + frames.bin.gz) from the kynow-data branch and gunzips it here.
   frames: uint8 dBZ, [4 observed + 24 forecast, ny, nx], row 0 = north. Diag: window.__kynowPubDiag(). */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const DATA_BASES = ['https://raw.githubusercontent.com/SiraTone/scopecell23/refs/heads/kynow-data', 'https://cdn.jsdelivr.net/gh/SiraTone/scopecell23@kynow-data'];
  const STALE_MIN = 25;                       // the publisher pushes every ~5 min; 25 min = several missed pushes
  const NFR = 28, NOBS = 4;
  const STOPS = [[5, 4, 233, 231], [10, 1, 159, 244], [15, 3, 0, 244], [20, 2, 253, 2], [25, 1, 197, 1], [30, 0, 142, 0],
    [35, 253, 248, 2], [40, 229, 188, 0], [45, 253, 149, 0], [50, 253, 0, 0], [55, 212, 0, 0], [60, 188, 0, 0],
    [65, 248, 0, 253], [70, 152, 84, 198], [75, 255, 255, 255]];
  const LUT = new Uint8ClampedArray(81 * 4);
  for (let v = 0; v <= 80; v++) { let s = null; for (const st of STOPS) if (v >= st[0]) s = st; if (s && v >= 8) LUT.set([s[1], s[2], s[3], v < 15 ? 150 : 225], v * 4); }

  const S = { meta: null, buf: null, urls: [], idx: 3, playing: false, timer: null, lastIssued: null, probe: null, host: null, loads: 0 };

  const map = L.map('map', { zoomSnap: 0.25, minZoom: 5, maxZoom: 11, attributionControl: false }).setView([37.75, -85.75], 7.25);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 10, maxZoom: 11, crossOrigin: true }).addTo(map);
  map.createPane('radar').style.zIndex = 420;
  map.createPane('ref').style.zIndex = 450;
  map.getPane('ref').style.pointerEvents = 'none';
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { pane: 'ref', maxNativeZoom: 10, maxZoom: 11, crossOrigin: true }).addTo(map);
  L.control.attribution({ prefix: false }).addAttribution('KyCast nowcast on NOAA MRMS | basemap Esri').addTo(map);
  let overlay = null;

  $('legend').innerHTML = '<span>dBZ</span>' + STOPS.filter((s) => (s[0] >= 10 && s[0] <= 70 && s[0] % 10 === 0) || s[0] === 35 || s[0] === 45)
    .map((s) => `<i style="background:rgb(${s[1]},${s[2]},${s[3]})" title="${s[0]}"></i>`).join('') + '<span>10 - 70</span>';

  const msg = (t) => { $('msg').textContent = t || ''; $('msg').classList.toggle('hidden', !t); };
  const fmtT = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const dir = (d) => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(d / 22.5) % 16];

  async function gunzip(u8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decompress the data (DecompressionStream missing). Use a current Chrome, Edge, Firefox or Safari.');
    const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function getFile(path, kind) {
    let err;
    for (const b of DATA_BASES) {
      try {
        const r = await fetch(b + '/' + path, { cache: 'no-cache' });
        if (!r.ok) throw new Error(path + ' ' + r.status);
        S.host = b;
        return kind === 'json' ? await r.json() : new Uint8Array(await r.arrayBuffer());
      } catch (e) { err = e; }
    }
    throw err;
  }

  // one frame -> Mercator-row PNG data URL (the 0.02 deg grid rows are equal-latitude; Leaflet is Mercator)
  function frameUrl(k) {
    const g = S.meta.grid, ny = g.ny, nx = g.nx, off = k * ny * nx;
    const ym = (la) => Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360));
    const y0 = ym(g.bounds[1][0]), y1 = ym(g.bounds[0][0]);
    const oh = Math.round(ny * 1.25);
    const cv = document.createElement('canvas'); cv.width = nx; cv.height = oh;
    const cx = cv.getContext('2d'), im = cx.createImageData(nx, oh), px = im.data;
    for (let r = 0; r < oh; r++) {
      const y = y0 - (r + 0.5) / oh * (y0 - y1);
      const la = (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
      const src = Math.min(ny - 1, Math.max(0, Math.round((g.lat_top - la) / g.d)));
      const so = off + src * nx, ro = r * nx * 4;
      for (let c = 0; c < nx; c++) {
        const v = S.buf[so + c];
        if (v >= 8) { const l = v * 4; px[ro + c * 4] = LUT[l]; px[ro + c * 4 + 1] = LUT[l + 1]; px[ro + c * 4 + 2] = LUT[l + 2]; px[ro + c * 4 + 3] = LUT[l + 3]; }
      }
    }
    cx.putImageData(im, 0, 0);
    return cv.toDataURL();
  }

  function show(i) {
    S.idx = i;
    $('slider').value = i;
    if (!S.urls[i]) S.urls[i] = frameUrl(i);
    if (!overlay) overlay = L.imageOverlay(S.urls[i], S.meta.grid.bounds, { pane: 'radar', opacity: $('opacity').value / 100 }).addTo(map);
    else overlay.setUrl(S.urls[i]);
    const lead = (i - (NOBS - 1)) * 5;
    const kind = i < NOBS ? '<span class="ob">OBSERVED</span>' : `<span class="fc">FORECAST +${lead} min</span>`;
    $('tLabel').innerHTML = `${kind} &nbsp;${fmtT(S.meta.times[i])}${i < NOBS - 1 ? ` (${lead} min)` : ''}`;
    drawProbe();
  }

  const csiClass = (v) => (v == null ? '' : v >= 0.5 ? 'good' : v >= 0.3 ? 'ok' : 'low');
  function renderSide(m) {
    const age = Math.max(0, Math.round((Date.now() - new Date(m.issued)) / 60000));
    const stale = age > STALE_MIN;
    $('chipLive').textContent = `radar ${age} min old`;
    $('chipLive').style.color = stale ? 'var(--warn)' : 'var(--accent)';
    $('stale').classList.toggle('hidden', !stale);
    if (stale) $('stale').innerHTML = `<b>This nowcast is out of date: its radar is ${age >= 120 ? Math.round(age / 60) + ' hours' : age + ' minutes'} old.</b> It normally updates every few minutes. Do not use it as current guidance; check the National Weather Service radar.`;
    $('srcInfo').textContent = `NOAA MRMS composite ${fmtT(m.issued)}. Method: ${m.method}.`;
    $('motion').textContent = m.echo_pct < 0.2 ? 'no echoes' : `${m.motion.mph} mph toward ${dir(m.motion.toward_deg)}`;
    $('echo').textContent = `${m.echo_pct}% of the map has rain (>= 20 dBZ)`;
    let h = '<tr><th></th>' + [30, 60, 120].map((l) => `<th>${l} min</th>`).join('') + '</tr>';
    for (const t of [20, 30, 40]) {
      h += `<tr><td>${t} dBZ</td>` + [30, 60, 120].map((l) => {
        const v = m.verify && m.verify[`${l}m_${t}`];
        return `<td class="${csiClass(v && v.csi)}" title="${v && v.n ? v.n + ' checks' : 'no checks yet'}">${v && v.csi != null ? v.csi.toFixed(2) : '-'}</td>`;
      }).join('') + '</tr>';
    }
    $('vTab').innerHTML = h;
  }

  async function load() {
    const m = await getFile('meta.json', 'json');
    if (m.issued === S.lastIssued) { renderSide(m); return; }
    const buf = await gunzip(await getFile('frames.bin.gz'));
    if (buf.length !== NFR * m.grid.ny * m.grid.nx) throw new Error('Nowcast files do not match their description (an upload may be in progress). Retrying shortly.');
    S.buf = buf; S.meta = m; S.urls = []; S.lastIssued = m.issued; S.loads++;
    msg('');
    renderSide(m);
    show(S.playing ? S.idx : NOBS - 1);
  }

  // point probe: max over a 3x3 box (6 km), so a near miss still shows
  map.on('mousemove', (e) => { S.probe = e.latlng; drawProbe(); });
  map.on('click', (e) => { S.probe = e.latlng; drawProbe(); });
  function drawProbe() {
    const cv = $('probeCv'), cx = cv.getContext('2d');
    cx.clearRect(0, 0, cv.width, cv.height);
    if (!S.meta || !S.probe) return;
    const g = S.meta.grid, r = Math.round((g.lat_top - S.probe.lat) / g.d), c = Math.round((S.probe.lng - g.lon_w) / g.d);
    if (r < 1 || c < 1 || r >= g.ny - 1 || c >= g.nx - 1) { $('probe').textContent = 'Outside the nowcast area.'; return; }
    const vals = [];
    for (let k = 0; k < NFR; k++) { let m = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) m = Math.max(m, S.buf[k * g.ny * g.nx + (r + a) * g.nx + c + b]); vals.push(m); }
    const W = cv.width, H = cv.height, x = (i) => 4 + i / (NFR - 1) * (W - 8), y = (v) => H - 4 - Math.min(v, 70) / 70 * (H - 14);
    cx.strokeStyle = '#223148'; cx.beginPath(); for (const v of [20, 40, 60]) { cx.moveTo(0, y(v)); cx.lineTo(W, y(v)); } cx.stroke();
    cx.fillStyle = '#8ea1bb'; cx.font = '9px monospace'; cx.fillText('40', 2, y(40) - 2);
    cx.strokeStyle = '#ffffff55'; cx.beginPath(); cx.moveTo(x(NOBS - 1), 0); cx.lineTo(x(NOBS - 1), H); cx.stroke();
    cx.strokeStyle = '#ffffff33'; cx.beginPath(); cx.moveTo(x(S.idx), 0); cx.lineTo(x(S.idx), H); cx.stroke();
    cx.strokeStyle = '#4fd8c8'; cx.lineWidth = 2; cx.beginPath(); vals.forEach((v, i) => (i ? cx.lineTo : cx.moveTo).call(cx, x(i), y(v))); cx.stroke(); cx.lineWidth = 1;
    let first = -1; for (let i = NOBS; i < NFR; i++) if (vals[i] >= 35) { first = i; break; }
    const now = vals[NOBS - 1];
    $('probe').innerHTML = `${S.probe.lat.toFixed(2)}, ${S.probe.lng.toFixed(2)}: now ${now >= 8 ? now + ' dBZ' : 'dry'}` +
      (first > 0 ? `, heavy rain (35+ dBZ) in about <b>${(first - (NOBS - 1)) * 5} min</b>` : now >= 35 ? '' : ', no heavy rain in the next 2 h');
  }

  function stop() { S.playing = false; clearInterval(S.timer); $('play').textContent = 'Play'; }
  $('slider').addEventListener('input', (e) => { stop(); if (S.meta) show(+e.target.value); });
  $('opacity').addEventListener('input', (e) => overlay && overlay.setOpacity(e.target.value / 100));
  $('play').addEventListener('click', () => {
    if (S.playing) return stop();
    if (!S.meta) return;
    S.playing = true; $('play').textContent = 'Pause';
    S.timer = setInterval(() => show(S.idx >= NFR - 1 ? 0 : S.idx + 1), 260);
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
    else if (S.meta && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { stop(); show(Math.max(0, Math.min(NFR - 1, S.idx + (e.key === 'ArrowRight' ? 1 : -1)))); }
  });

  async function tick() {
    try { await load(); }
    catch (e) {
      if (!S.meta) msg('Nowcast unavailable: ' + e.message);
      else { $('stale').classList.remove('hidden'); $('stale').innerHTML = '<b>Could not refresh the nowcast.</b> Showing the last copy loaded; it may be out of date.'; }
    }
  }
  msg('Loading the latest nowcast...');
  tick();
  setInterval(tick, 60000);

  window.__kynowPubDiag = () => ({ loads: S.loads, idx: S.idx, issued: S.meta && S.meta.issued, host: S.host,
    frames: S.buf ? S.buf.length / (S.meta.grid.ny * S.meta.grid.nx) : 0, overlay: !!overlay, label: $('tLabel').textContent });
})();
