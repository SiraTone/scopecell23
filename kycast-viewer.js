/* KyCast public viewer (internal name: kynet) (cellscope.live). Experimental, not an official forecast.
   Reads the latest published run (latest.json + per-run meta/frames/daily .gz) from the kynet-data branch and
   gunzips it in the browser. One state object drives every layer, the clock, the day summary and the readout.
   Diag: window.__kycastDiag(). */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const DATA_BASES = ['https://raw.githubusercontent.com/SiraTone/scopecell23/refs/heads/kynet-data', 'https://cdn.jsdelivr.net/gh/SiraTone/scopecell23@kynet-data'];
  const STALE_H = 16;                                   // newest cycle is up to ~10 h old before the next lands; 16 h = one missed cycle
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ky.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ky.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  // ------------------------------------------------------------------ state
  const S = {
    meta: null, frames: null, daily: null, grid: null, step: 0, q: store.get('q', 'pm'), torMode: store.get('torMode', 'day'),
    playing: false, timer: null, status: null, fld: {}, runId: null, towns: [],
  };
  const TH = [5, 15, 25, 35, 45, 55];
  const QLAB = { pm: 'balanced', crisp: 'crisp', 0.5: 'likely', 0.25: 'possible', 0.1: 'high-end' };
  const QLONG = { pm: 'balanced', crisp: 'crisp cores', 0.5: 'likely (50% exceed)', 0.25: 'possible (25% exceed)', 0.1: 'high-end (10% exceed)' };
  // Tornado bands start well under 2%: a typical Kentucky day peaks near 1%, and with a 2% floor the layer drew nothing at all.
  const DAYB = [0.5, 1, 2, 5, 10, 15, 30];
  const STEPB = [0.25, 0.5, 1, 2, 5, 10, 15];
  const TCOL = { 0.25: '#4d6f8f', 0.5: '#5fa3b8', 1: '#86d6a4', 2: '#2e9e47', 5: '#8b5a2b', 10: '#ffc800', 15: '#ff2a2a', 30: '#ff3df0' };
  const bcol = bands => bands.map(v => TCOL[v]);
  const STORM_MIN = 0.02;                     // lowest chance of 35+ dBZ that is drawn (was 8%: most days never reach it)
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5), 16)];
  const DBZ = [[5, 4, 233, 231], [10, 1, 159, 244], [15, 3, 0, 244], [20, 2, 253, 2], [25, 1, 197, 1], [30, 0, 142, 0], [35, 253, 248, 2],
    [40, 229, 188, 0], [45, 253, 149, 0], [50, 253, 0, 0], [55, 212, 0, 0], [60, 188, 0, 0], [65, 248, 0, 253], [70, 152, 84, 198], [80, 255, 255, 255]];
  const DLUT = (() => {                       // dBZ*2 -> rgb
    const out = new Uint8Array(161 * 3);
    for (let i = 0; i <= 160; i++) {
      const v = i / 2; let k = 0;
      while (k < DBZ.length - 2 && v > DBZ[k + 1][0]) k++;
      const a = DBZ[k], b = DBZ[k + 1], f = Math.min(1, Math.max(0, (v - a[0]) / (b[0] - a[0])));
      for (let c = 0; c < 3; c++) out[i * 3 + c] = a[c + 1] + (b[c + 1] - a[c + 1]) * f;
    }
    return out;
  })();

  // ------------------------------------------------------------------ map
  const BASES = {
    dark: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', 'dark'],
    light: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', 'light'],
    street: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', 'light'],
  };
  const map = L.map('map', { zoomSnap: 0.25, minZoom: 5, maxZoom: 11, zoomControl: true, attributionControl: false }).setView([37.75, -85.75], 7.25);
  let baseLayer = null;
  function setBase(k) {
    if (baseLayer) map.removeLayer(baseLayer);
    baseLayer = L.tileLayer(BASES[k][0], { maxNativeZoom: 10, maxZoom: 11, crossOrigin: true }).addTo(map);
    baseLayer.setZIndex(1);
    store.set('base', k);
  }
  const PANES = { refl: 420, storm: 430, spc: 435, tor: 440, lines: 450, towns: 460 };
  Object.entries(PANES).forEach(([n, z]) => { map.createPane(n).style.zIndex = z; });
  L.control.attribution({ prefix: false }).addAttribution('KyCast on NOAA GFS | basemap Esri').addTo(map);


  // ------------------------------------------------------------------ SPC outlooks (public NWS GeoJSON, CORS-open)
  const SPC_URL = 'https://www.spc.noaa.gov/products/outlook/';
  const SPC = { layer: null, cache: {}, seq: 0 };
  const spcTime = v => {                      // 202611091630 -> "Nov 9 1630Z"
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(v || ''); if (!m) return '';
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
    return d.toUTCString().slice(8, 11) + ' ' + (+m[3]) + ' ' + m[4] + m[5] + 'Z';
  };
  async function spcLoad(key) {
    const hit = SPC.cache[key];
    if (hit && Date.now() - hit.t < 600000) return hit.d;
    const r = await fetch(SPC_URL + key + '.nolyr.geojson', { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json(); SPC.cache[key] = { t: Date.now(), d }; return d;
  }
  async function showSpc() {
    const key = $('#spcSel').value, mine = ++SPC.seq;
    store.set('spc', key);
    if (SPC.layer) { map.removeLayer(SPC.layer); SPC.layer = null; }
    $('#spcKey').innerHTML = ''; $('#spcInfo').textContent = key ? 'Loading...' : 'Choose an outlook to draw it on the map.';
    if (!key) return;
    let d;
    try { d = await spcLoad(key); } catch (e) { if (mine === SPC.seq) $('#spcInfo').textContent = 'SPC outlook unavailable right now.'; return; }
    if (mine !== SPC.seq) return;
    const fs = (d.features || []).filter(f => f.properties && f.properties.fill && f.geometry);
    const p0 = (d.features && d.features[0] && d.features[0].properties) || {};
    if (!fs.length) { $('#spcInfo').textContent = 'No areas outlined: nothing above the lowest risk level.'; return; }
    SPC.layer = L.geoJSON({ type: 'FeatureCollection', features: fs }, {
      pane: 'spc', interactive: false,
      style: f => ({ color: f.properties.stroke || f.properties.fill, weight: 1.6, fillColor: f.properties.fill, fillOpacity: 0.55, opacity: 0.95 }),
    }).addTo(map);
    $('#spcInfo').textContent = 'Valid ' + spcTime(p0.VALID) + ' to ' + spcTime(p0.EXPIRE) + ' (issued ' + spcTime(p0.ISSUE) + ')';
    $('#spcKey').innerHTML = fs.map(f => '<i style="background:' + f.properties.fill + '" title="' + (f.properties.LABEL2 || '') + '">' + (f.properties.LABEL || '') + '</i>').join('');
  }
  function stepSpc(dir) {
    const sel = $('#spcSel'), n = sel.options.length;
    sel.selectedIndex = (sel.selectedIndex + dir + n) % n; showSpc();
  }
  $('#spcSel').onchange = showSpc;
  $('#spcPrev').onclick = () => stepSpc(-1);
  $('#spcNext').onclick = () => stepSpc(1);
  $('#opSpc').oninput = () => { const g = map.getPane('spc'); if (g) g.style.opacity = $('#opSpc').value / 100; };
  { const g = map.getPane('spc'); if (g) g.style.opacity = 0.6; }
  { const k = store.get('spc'); if (k && [...$('#spcSel').options].some(o => o.value === k)) $('#spcSel').value = k; }
  showSpc();

  // overlay canvases: 2x the model grid, rows spaced in Web-Mercator so they sit exactly under Leaflet
  const OV = {};
  function makeOverlays() {
    const g = S.grid, OW = g.nx * 2, OH = g.ny * 2;
    const south = g.lat0, north = g.lat0 + (g.ny - 1) * g.d, west = g.lon0, east = g.lon0 + (g.nx - 1) * g.d;
    const mer = la => Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360));
    const inv = y => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
    const yN = mer(north), yS = mer(south);
    const ri = new Int32Array(OH), rf = new Float32Array(OH), ci = new Int32Array(OW), cf = new Float32Array(OW);
    for (let r = 0; r < OH; r++) {
      const lat = inv(yN - (yN - yS) * (r + 0.5) / OH), fi = Math.min(g.ny - 1.001, Math.max(0, (lat - g.lat0) / g.d));
      ri[r] = Math.floor(fi); rf[r] = fi - ri[r];
    }
    for (let c = 0; c < OW; c++) {
      const fj = Math.min(g.nx - 1.001, Math.max(0, (c + 0.5) / OW * (g.nx - 1)));
      ci[c] = Math.floor(fj); cf[c] = fj - ci[c];
    }
    S.lut = { OW, OH, ri, rf, ci, cf };
    const bounds = [[south, west], [north, east]];
    for (const k of Object.keys(OV)) map.removeLayer(OV[k].layer);
    for (const k of ['refl', 'storm', 'tor']) {
      const cv = document.createElement('canvas'); cv.width = OW; cv.height = OH;
      const layer = L.imageOverlay('data:image/gif;base64,R0lGODlhAQABAAAAACw=', bounds, { pane: k, interactive: false, opacity: 1 });
      OV[k] = { cv, layer, ctx: cv.getContext('2d'), img: new ImageData(OW, OH), dirty: true };
      layer.on('add', () => flush(OV[k]));
    }
    applyVisibility();
  }
  function flush(o) {                         // Leaflet image overlays only take <img>, so hand it the canvas as a data URL
    const el = o.layer.getElement();
    if (el) { el.src = o.cv.toDataURL(); o.dirty = false; } else o.dirty = true;
  }
  function applyVisibility() {
    const on = { refl: $('#lyRefl').checked, storm: $('#lyStorm').checked, tor: $('#lyTor').checked };
    const op = { refl: $('#opRefl').value, storm: $('#opStorm').value, tor: $('#opTor').value };
    for (const k in OV) {
      const has = !!S.frames;
      if (on[k] && has) { if (!map.hasLayer(OV[k].layer)) OV[k].layer.addTo(map); OV[k].layer.setOpacity(op[k] / 100); }
      else if (map.hasLayer(OV[k].layer)) map.removeLayer(OV[k].layer);
    }
  }

  // ------------------------------------------------------------------ fields (grid resolution)
  const N = () => S.grid.ny * S.grid.nx;
  // Probability-matched cuts: per level, the uint8 probability cut that makes the area equal the expected area.
  function pmCuts(t) {
    S.cutC = S.cutC || {};
    if (S.cutC[t]) return S.cutC[t];
    const n = N(), P = S.frames, cut = new Float32Array(6), vmax = new Float32Array(6);
    for (let k = 0; k < 6; k++) {
      const h = new Uint32Array(256), base = (t * 8 + k) * n; let sum = 0;
      for (let i = 0; i < n; i++) { const v = P[base + i]; h[v]++; sum += v; }
      const A = sum / 255; let cnt = 0, c = 255;
      for (; c > 0; c--) { if (cnt + h[c] > A) break; cnt += h[c]; }
      cut[k] = A < 1 ? 999 : Math.max(1, c + (cnt + h[c] > A ? 1 : 0));
      let m = 255; while (m > 0 && !h[m]) m--; vmax[k] = m;
    }
    return (S.cutC[t] = { cut, vmax });
  }
  function reflPix(t, i, q, pc) {                  // one pixel (i = row*nx+col); q 'pm' or a probability
    const n = N(), P = S.frames, base = t * 8 * n;
    const lvl = k => P[base + k * n + i];
    const pmq = q === 'pm' || q === 'crisp';
    const cut = k => (pmq ? pc.cut[k] : q * 255);
    if (lvl(0) < cut(0)) return 0;
    let kk = 0; while (kk < 5 && lvl(kk + 1) >= cut(kk + 1)) kk++;
    if (q === 'crisp') return kk >= 2 ? TH[kk] : 0;     // flat bands, only 25+ dBZ cores: shows the line, not the rain shield
    const pk = lvl(kk), c = cut(kk), top = kk < 5 ? TH[kk + 1] : TH[kk] + 10;
    let span;
    if (pmq) span = Math.max(0.5 * (pc.vmax[kk] - c), 8);
    else span = Math.max(pk - (kk < 5 ? lvl(kk + 1) : 0), 1e-6 * 255);
    const frac = Math.min(1, Math.max(0, (pk - c) / span));
    return TH[kk] + (top - TH[kk]) * frac;
  }
  function reflField(t, q) {
    const n = N(), out = new Float32Array(n), pc = (q === 'pm' || q === 'crisp') ? pmCuts(t) : null;
    const g = S.grid;
    for (let i = 0; i < n; i++) {
      const r = (i / g.nx) | 0, c = i % g.nx;
      if (r < 3 || c < 3 || r >= g.ny - 3 || c >= g.nx - 3) continue;   // conv edge effects at the grid border
      out[i] = reflPix(t, i, q, pc);
    }
    return out;
  }
  function chanField(t, c, fn) {
    const n = N(), base = (t * 8 + c) * n, out = new Float32Array(n);
    for (let k = 0; k < n; k++) out[k] = fn(S.frames[base + k]);
    return out;
  }
  const sq = v => (v / 255) * (v / 255);
  function dayOf(step) { return S.meta.days.findIndex(d => d.steps.includes(step)); }
  function clipEdges(f) {
    const g = S.grid;
    for (let i = 0; i < f.length; i++) { const r = (i / g.nx) | 0, c = i % g.nx; if (r < 4 || c < 4 || r >= g.ny - 4 || c >= g.nx - 4) f[i] = 0; }
    return f;
  }
  function torField(step) {
    if (S.torMode === 'step') return clipEdges(chanField(step, 6, sq));
    const di = dayOf(step);
    if (di < 0) return null;
    const n = N(), out = new Float32Array(n), base = di * n;
    for (let k = 0; k < n; k++) out[k] = sq(S.daily[base + k]);
    return clipEdges(out);
  }

  // ------------------------------------------------------------------ painting
  function sample(f, r, c) {
    const L_ = S.lut, g = S.grid, i = L_.ri[r], j = L_.ci[c], fy = L_.rf[r], fx = L_.cf[c], nx = g.nx;
    const a = f[i * nx + j], b = f[i * nx + j + 1], cc = f[(i + 1) * nx + j], d = f[(i + 1) * nx + j + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy;
  }
  function paintDbz(o, f) {
    const { OW, OH } = S.lut, px = o.img.data;
    for (let r = 0; r < OH; r++) for (let c = 0; c < OW; c++) {
      const v = sample(f, r, c), p = (r * OW + c) * 4;
      if (v < 5) { px[p + 3] = 0; continue; }
      const li = Math.min(160, Math.round(v * 2)) * 3;
      px[p] = DLUT[li]; px[p + 1] = DLUT[li + 1]; px[p + 2] = DLUT[li + 2];
      px[p + 3] = Math.min(255, (v - 5) / 12 * 255);
    }
    o.ctx.putImageData(o.img, 0, 0); flush(o);
  }
  function paintStorm(o, f) {
    const { OW, OH } = S.lut, px = o.img.data;
    const stops = [[STORM_MIN, 255, 240, 160, 70], [0.08, 255, 226, 120, 135], [0.25, 255, 196, 70, 175], [0.5, 255, 128, 40, 205], [0.75, 236, 52, 64, 228], [1, 214, 40, 170, 245]];
    for (let r = 0; r < OH; r++) for (let c = 0; c < OW; c++) {
      const v = sample(f, r, c), p = (r * OW + c) * 4;
      if (v < STORM_MIN) { px[p + 3] = 0; continue; }
      let k = 0; while (k < stops.length - 2 && v > stops[k + 1][0]) k++;
      const a = stops[k], b = stops[k + 1], t = Math.min(1, Math.max(0, (v - a[0]) / (b[0] - a[0])));
      for (let q = 0; q < 4; q++) px[p + q] = a[q + 1] + (b[q + 1] - a[q + 1]) * t;
    }
    o.ctx.putImageData(o.img, 0, 0); flush(o);
  }
  function paintBands(o, f, bands) {
    const { OW, OH } = S.lut, px = o.img.data, band = new Int8Array(OW * OH);
    for (let r = 0; r < OH; r++) for (let c = 0; c < OW; c++) {
      const v = sample(f, r, c) * 100; let b = -1;
      for (let k = bands.length - 1; k >= 0; k--) if (v >= bands[k]) { b = k; break; }
      band[r * OW + c] = b;
    }
    for (let r = 0; r < OH; r++) for (let c = 0; c < OW; c++) {
      const i = r * OW + c, b = band[i], p = i * 4;
      if (b < 0) { px[p + 3] = 0; continue; }
      const edge = (c + 1 < OW && band[i + 1] < b) || (c > 0 && band[i - 1] < b) || (r + 1 < OH && band[i + OW] < b) || (r > 0 && band[i - OW] < b);
      const col = hex(TCOL[bands[b]]);
      if (edge) { px[p] = col[0] * 0.8; px[p + 1] = col[1] * 0.8; px[p + 2] = col[2] * 0.8; px[p + 3] = 235; }
      else { px[p] = col[0]; px[p + 1] = col[1]; px[p + 2] = col[2]; px[p + 3] = 85; }
    }
    o.ctx.putImageData(o.img, 0, 0); flush(o);
  }

  function draw() {
    if (!S.meta || !S.frames) return;
    const t = S.step;
    S.fld = {};
    if ($('#lyRefl').checked) { S.fld.refl = reflField(t, S.q); paintDbz(OV.refl, S.fld.refl); }
    if ($('#lyStorm').checked) { S.fld.storm = chanField(t, 3, v => v / 255); paintStorm(OV.storm, S.fld.storm); }
    if ($('#lyTor').checked) {
      const f = torField(t);
      S.fld.tor = f;
      const o = OV.tor;
      if (f) paintBands(o, f, S.torMode === 'step' ? STEPB : DAYB);
      else { o.img.data.fill(0); o.ctx.putImageData(o.img, 0, 0); flush(o); }
    }
    clock(); legend(); daySummary(); spark();
    $('#empty').classList.toggle('hidden', !!(S.fld.tor || S.torMode === 'step' || !$('#lyTor').checked));
    if (!$('#empty').classList.contains('hidden')) $('#empty').innerHTML = '<div>This frame is before the first full convective day. Switch tornado chance to <b>3-hour</b> or move the timeline forward.</div>';
  }

  // ------------------------------------------------------------------ clock, days, spark
  const fmt = (iso, tz) => new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz, timeZoneName: 'short' }).format(new Date(iso));
  const hm = (iso, tz) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', timeZone: tz, timeZoneName: 'short' }).format(new Date(iso));
  function clock() {
    const st = S.meta.steps[S.step];
    $('#clkTime').textContent = fmt(st.valid, 'America/New_York');
    const cyc = new Date(S.meta.cycle);
    $('#clkSub').textContent = `${hm(st.valid, 'America/Chicago')} in western KY  |  +${st.fh} h from KyCast ${String(cyc.getUTCHours()).padStart(2, '0')}Z ${cyc.toUTCString().slice(5, 11)}`;
    $('#tl').value = S.step;
    const di = dayOf(S.step);
    $$('#days button').forEach((b, i) => b.classList.toggle('on', i === di));
  }
  function buildDays() {
    const wrap = $('#days'); wrap.innerHTML = '';
    S.meta.days.forEach((d, i) => {
      const b = document.createElement('button');
      const dt = new Date(d.start);
      const lab = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'America/New_York' }).format(dt);
      b.innerHTML = `${lab}${d.coverage < 1 ? ' (part)' : ''}<em>${d.tor_peak >= 0.01 ? Math.round(d.tor_peak * 100) + '%' : ''}</em>`;
      b.title = 'convective day 12Z to 12Z';
      b.onclick = () => { go(d.steps[0]); };
      wrap.appendChild(b);
    });
  }
  function daySummary() {
    const di = dayOf(S.step), el = $('#daySum');
    if (di < 0) { $('#dayName').textContent = ''; el.innerHTML = '<span class="muted">Before the first full convective day.</span>'; return; }
    const d = S.meta.days[di];
    $('#dayName').textContent = '| ' + new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York' }).format(new Date(d.start));
    const pct = d.tor_peak * 100;
    el.innerHTML = `<div class="big" style="color:${pct >= 2 ? '#ff7a6b' : 'inherit'}">${pct < 0.1 ? '<0.1' : pct.toFixed(pct < 1 ? 1 : 0)}%</div>
      <div class="row"><span>peak tornado chance in KY</span><b>${d.tor_peak_town ? 'near ' + d.tor_peak_town : '-'}</b></div>
      <div class="row"><span>strongest echo (balanced)</span><b>${Math.round(d.refl_peak)} dBZ</b></div>
      <div class="row"><span>peak 35+ dBZ chance</span><b>${Math.round(d.p35_peak * 100)}%</b></div>
      <div class="row"><span>steps in this day</span><b>${d.steps.length} / 8</b></div>`;
  }
  function spark() {
    const cv = $('#spark'), W = cv.clientWidth, H = 26, dpr = devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr;
    const x = cv.getContext('2d'); x.scale(dpr, dpr); x.clearRect(0, 0, W, H);
    const n = S.meta.steps.length, pk = S.meta.tor_step_peak;
    const bw = (W - 16) / n;
    S.meta.days.forEach((d, i) => { if (i % 2 === 0) { x.fillStyle = 'rgba(255,255,255,.04)'; x.fillRect(8 + d.steps[0] * bw, 0, d.steps.length * bw, H); } });
    pk.forEach((v, i) => {
      const h = Math.min(H - 3, Math.sqrt(v / 0.05) * (H - 3));
      let b = -1; STEPB.forEach((s, k) => { if (v * 100 >= s) b = k; });
      x.fillStyle = b < 0 ? '#2b3b52' : TCOL[STEPB[b]];
      x.fillRect(8 + i * bw + 1, H - Math.max(2, h), Math.max(2, bw - 2), Math.max(2, h));
    });
    x.fillStyle = '#fff'; x.fillRect(8 + S.step * bw + bw / 2 - 1, 0, 2, H);
  }
  const go = i => { S.step = Math.max(0, Math.min(S.meta.steps.length - 1, i)); draw(); };

  // ------------------------------------------------------------------ legend
  function legend() {
    let h = '';
    if ($('#lyRefl').checked) {
      const grad = DBZ.slice(0, 14).map(s => `rgb(${s[1]},${s[2]},${s[3]}) ${(s[0] - 5) / 65 * 100}%`).join(',');
      const lab = QLONG[S.q];
      h += `<div class="blk"><h4>Reflectivity dBZ - ${lab}</h4><div class="bar" style="background:linear-gradient(90deg,${grad})"></div><div class="ticks"><span>5</span><span>20</span><span>35</span><span>50</span><span>65</span></div></div>`;
    }
    if ($('#lyStorm').checked) h += '<div class="blk"><h4>Chance of 35+ dBZ</h4><div class="bar" style="background:linear-gradient(90deg,rgba(255,196,70,.4),#ff8028,#ec3440,#d628aa)"></div><div class="ticks"><span>2%</span><span>25%</span><span>50%</span><span>90%</span></div></div>';
    if ($('#lyTor').checked) {
      const b = S.torMode === 'step' ? STEPB : DAYB;
      h += `<div class="blk"><h4>Tornado within 25 mi - ${S.torMode === 'step' ? '3-hour' : 'convective day'}</h4><div class="bands">${b.map(v => `<i style="background:${TCOL[v]}${v < 2 ? ';color:#06101c' : ''}">${v}%</i>`).join('')}</div>${S.torMode === 'step' ? '' : '<div class="ticks" style="margin-top:4px"><span>capped at 15%: higher values were not supported by held-out days</span></div>'}</div>`;
    }
    $('#legend').innerHTML = h;
    $('#legend').classList.toggle('hidden', !h);
  }

  // ------------------------------------------------------------------ lines, towns, readout
  async function loadLines() {
    const rend = L.canvas({ pane: 'lines', padding: 0.3 });
    const [geo] = await Promise.all([fetch('kycast-geo.json').then(r => r.json())]);
    const ll = a => a.map(p => [p[1], p[0]]);
    S.county = L.layerGroup();
    geo.ky.forEach(a => L.polyline(ll(a), { renderer: rend, color: '#ffffff', weight: 0.7, opacity: 0.28, interactive: false }).addTo(S.county));
    geo.other.forEach(a => L.polyline(ll(a), { renderer: rend, color: '#ffffff', weight: 0.5, opacity: 0.14, interactive: false }).addTo(S.county));
    S.states = L.layerGroup();
    geo.states.forEach(a => L.polyline(ll(a), { renderer: rend, color: '#dfe9f6', weight: 1.3, opacity: 0.7, interactive: false }).addTo(S.states));
    S.states.addTo(map);
    S.towns = geo.towns.sort((a, b) => b.pop - a.pop);
    S.townLayer = L.layerGroup().addTo(map);
    toggleCounty(); drawTowns();
  }
  const toggleCounty = () => { if (!S.county) return; $('#lyCounty').checked ? S.county.addTo(map) : map.removeLayer(S.county); };
  function drawTowns() {
    if (!S.townLayer) return;
    S.townLayer.clearLayers();
    if (!$('#lyTown').checked) return;
    const z = map.getZoom(), min = z < 7.5 ? 70000 : z < 8.5 ? 28000 : z < 9.5 ? 9000 : 2500;
    const light = BASES[$('#baseSel').value][1] === 'light';
    const view = map.getBounds().pad(0.25);   // only the towns on screen: zoomed in, the full list is 1000+ DOM tooltips
    S.towns.filter(c => c.pop >= min && view.contains([c.lat, c.lon])).forEach(c => {
      L.circleMarker([c.lat, c.lon], { pane: 'towns', radius: 2.5, weight: 1, color: light ? '#222' : '#000', fillColor: light ? '#222' : '#fff', fillOpacity: 1, interactive: false })
        .bindTooltip(c.city, { permanent: true, direction: 'right', offset: [3, 0], className: 'town' + (light ? ' light' : '') }).addTo(S.townLayer);
    });
  }
  let townTimer = 0;
  map.on('zoomend moveend', () => { clearTimeout(townTimer); townTimer = setTimeout(drawTowns, 150); });
  function nearestTown(lat, lon) {
    let best = null, bd = 1e9;
    for (const c of S.towns) { if (c.pop < 4000) break; const d = ((c.lat - lat) * 111) ** 2 + ((c.lon - lon) * 88) ** 2; if (d < bd) { bd = d; best = c; } }
    return best && bd < 45 * 45 ? `${best.city}, ${best.st}` : null;
  }
  map.on('mousemove', e => {
    if (!S.meta || !S.frames) return;
    const g = S.grid, j = Math.round((e.latlng.lng - g.lon0) / g.d), i = Math.round((e.latlng.lat - g.lat0) / g.d);
    if (i < 0 || j < 0 || i >= g.ny || j >= g.nx) { $('#readout').innerHTML = '<div class="muted">Outside the KyCast grid</div>'; return; }
    const k = i * g.nx + j, n = N(), t = S.step, P = S.frames;
    const row = (a, b) => `<div class="r"><span>${a}</span><b>${b}</b></div>`;
    const di = dayOf(t), tn = nearestTown(e.latlng.lat, e.latlng.lng);
    const pct = v => v < 0.001 ? '<0.1%' : (v * 100).toFixed(v < 0.01 ? 1 : 0) + '%';
    let h = `<div class="t">${tn || e.latlng.lat.toFixed(2) + ', ' + e.latlng.lng.toFixed(2)}</div>`;
    h += row('Reflectivity (' + QLAB[S.q] + ')', (S.fld.refl ? S.fld.refl[k] : reflPix(t, k, S.q, (S.q === 'pm' || S.q === 'crisp') ? pmCuts(t) : null)).toFixed(0) + ' dBZ');
    h += row('Chance 35+ dBZ', pct(P[(t * 8 + 3) * n + k] / 255));
    h += row('Tornado, 3 h', pct(sq(P[(t * 8 + 6) * n + k])));
    h += row('Tornado, day', di < 0 ? '-' : pct(sq(S.daily[di * n + k])));
    $('#readout').innerHTML = h;
  });
  // ------------------------------------------------------------------ run loading (static files, gunzipped here)
  async function gunzip(u8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decompress the forecast (DecompressionStream missing). Use a current Chrome, Edge, Firefox or Safari.');
    const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function getFile(path, kind) {              // try each host in turn; remember the one that worked
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
  function ageNote(meta) {                           // staleness follows the run cycle, not when the run happened to be made
    const hc = (Date.now() - new Date(meta.cycle)) / 36e5, hg = (Date.now() - new Date(meta.generated)) / 36e5;
    S.ageH = hc;
    const stale = hc > STALE_H;
    const words = h => h < 1 ? 'less than 1 hour' : h < 48 ? Math.round(h) + ' hours' : Math.round(h / 24) + ' days';
    $('#stale').classList.toggle('hidden', !stale);
    if (stale) $('#stale').innerHTML = `<b>This forecast is out of date: its data is ${words(hc)} old.</b> New runs normally appear every 6 hours. Do not use it as current guidance.`;
    return `${words(hg)} ago`;
  }
  async function loadRun(id) {
    $('#runInfo').textContent = 'loading ...';
    const [meta, fz, dz] = await Promise.all([getFile(`runs/${id}/meta.json`, 'json'), getFile(`runs/${id}/frames.bin.gz`), getFile(`runs/${id}/daily.bin.gz`)]);
    const [frames, daily] = await Promise.all([gunzip(fz), gunzip(dz)]);
    const n = meta.grid.nx * meta.grid.ny, T = meta.steps.length;
    if (frames.length !== T * 8 * n || daily.length !== meta.days.length * n) throw new Error('Forecast files do not match their description (incomplete upload?). Try again in a few minutes.');
    S.meta = meta; S.frames = frames; S.daily = daily; S.grid = meta.grid; S.runId = id; S.cutC = null;
    if (!S.lut || S.lut.OW !== meta.grid.nx * 2) makeOverlays();
    $('#tl').max = T - 1;
    const first = Math.max(0, meta.days.length ? meta.days[0].steps[0] : 0);
    S.step = Math.min(S.step, T - 1) || first;
    buildDays(); applyVisibility(); draw();
    const cyc = new Date(meta.cycle);
    $('#runInfo').innerHTML = `${(meta.model && meta.model.name) || 'KyCast'}${(meta.model && String(meta.model.calibration || '').startsWith('smart')) ? '<br><span title="Rain/storm chances tuned by a second model that also sees the run 24 h older and extra GFS fields">Smart calibration: on</span>' : ''}<br>Run ${cyc.toUTCString().slice(5, 22)} Z<br>${T} steps, ${meta.days.length} convective days<br>made ${ageNote(meta)}`;
    $('#empty').classList.add('hidden');
    S.loadedAt = Date.now();
  }
  async function refreshStatus(selectRun) {
    const man = await getFile('latest.json', 'json');
    S.manifest = man;
    const fromId = id => `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}T${id.slice(8, 10)}:00:00+00:00`;
    const runs = (man.runs && man.runs.length ? man.runs : [man.latest]).map(r => typeof r === 'string' ? { id: r, cycle: r === man.latest ? man.cycle : fromId(r) } : r);
    const sel = $('#runSel'); sel.innerHTML = '';
    runs.forEach(r => { const o = document.createElement('option'); o.value = r.id; const d = new Date(r.cycle); o.textContent = r.user ? `TEST: ${r.label || r.model || 'custom'} ${new Date(r.run_time || r.cycle).toUTCString().slice(5, 22)} Z` : `KyCast ${d.toUTCString().slice(5, 22)} Z`; sel.appendChild(o); });
    const id = selectRun || man.latest;
    sel.value = id;
    if (id !== S.runId || selectRun) await loadRun(id);
  }
  $('#runSel').onchange = e => { S.step = 0; loadRun(e.target.value).catch(fail); };
  const fail = e => { $('#runInfo').textContent = 'Could not load the forecast.'; $('#empty').classList.remove('hidden'); $('#empty').innerHTML = `<div><b>No forecast available</b><br><span class="muted">${String(e.message || e).replace(/</g, '&lt;')}</span></div>`; };

  // ------------------------------------------------------------------ controls
  ['lyRefl', 'lyTor', 'lyStorm'].forEach(id => $('#' + id).onchange = () => { store.set(id, $('#' + id).checked); applyVisibility(); draw(); });
  ['opRefl', 'opTor', 'opStorm'].forEach(id => $('#' + id).oninput = () => { store.set(id, $('#' + id).value); applyVisibility(); });
  $('#lyCounty').onchange = toggleCounty;
  $('#lyTown').onchange = drawTowns;
  $('#baseSel').onchange = e => { setBase(e.target.value); drawTowns(); };
  $$('#confSeg button').forEach(b => b.onclick = () => { S.q = isNaN(+b.dataset.q) ? b.dataset.q : +b.dataset.q; store.set('q', S.q); $$('#confSeg button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $$('#torSeg button').forEach(b => b.onclick = () => { S.torMode = b.dataset.m; store.set('torMode', S.torMode); $$('#torSeg button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('#tl').oninput = e => go(+e.target.value);
  $('#bPrev').onclick = () => go(S.step - 1);
  $('#bNext').onclick = () => go(S.step + 1);
  function play(on) {
    S.playing = on; $('#bPlay').innerHTML = on ? '&#10074;&#10074;' : '&#9654;';
    clearInterval(S.timer);
    if (on) S.timer = setInterval(() => { if (!S.meta) return; go(S.step + 1 >= S.meta.steps.length ? 0 : S.step + 1); }, +$('#spd').value);
  }
  $('#bPlay').onclick = () => play(!S.playing);
  $('#spd').onchange = () => { if (S.playing) play(true); };
  addEventListener('keydown', e => {
    if (/select|input/i.test(e.target.tagName) && e.target.type !== 'range') return;
    if (e.key === 'ArrowLeft') { go(S.step - 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { go(S.step + 1); e.preventDefault(); }
    else if (e.key === ' ') { play(!S.playing); e.preventDefault(); }
  });
  addEventListener('resize', () => { if (S.meta) spark(); });

  // restore saved prefs
  ['lyRefl', 'lyTor', 'lyStorm'].forEach(id => { const v = store.get(id, null); if (v !== null) $('#' + id).checked = v; });
  ['opRefl', 'opTor', 'opStorm'].forEach(id => { const v = store.get(id, null); if (v !== null) $('#' + id).value = v; });
  $$('#confSeg button').forEach(x => x.classList.toggle('on', (isNaN(+x.dataset.q) ? x.dataset.q : +x.dataset.q) === S.q));
  $$('#torSeg button').forEach(x => x.classList.toggle('on', x.dataset.m === S.torMode));
  $('#baseSel').value = store.get('base', 'dark');
  setBase($('#baseSel').value);

  $('#sideBtn').onclick = () => { const o = document.body.classList.toggle('sideopen'); $('#sideBtn').setAttribute('aria-expanded', o); setTimeout(() => map.invalidateSize(), 200); };
  map.on('click', () => document.body.classList.remove('sideopen'));

  // ------------------------------------------------------------------ boot
  window.__kycastDiag = () => ({
    run: S.runId, host: S.host, step: S.step, steps: S.meta ? S.meta.steps.length : 0, days: S.meta ? S.meta.days.length : 0,
    q: S.q, torMode: S.torMode, clock: $('#clkTime').textContent, day: S.meta ? dayOf(S.step) : null, ageH: S.ageH,
    stale: !$('#stale').classList.contains('hidden'),
    onMap: Object.keys(OV).filter(k => map.hasLayer(OV[k].layer)),
    reflMax: S.fld.refl ? Math.max(...S.fld.refl) : null, torMax: S.fld.tor ? Math.max(...S.fld.tor) : null,
    legend: $('#legend').textContent, summary: $('#daySum').textContent, towns: S.towns.length,
  });
  window.__kycastGo = go;
  loadLines().catch(() => {});
  refreshStatus().catch(fail);
  setInterval(() => { if (!document.hidden && S.runId && Date.now() - S.loadedAt > 30 * 60e3) refreshStatus().catch(() => {}); }, 5 * 60e3);   // pick up a new run without a reload
})();
