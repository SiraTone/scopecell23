/* Sounding Lab: a full SPC-style sounding display, dark, where every piece explains itself.
 * window.HodoLab.open(P) / close(). Needs HodoCalc (soundlab-calc.js). Hover = short tip, click = pinned explanation.
 * Click a parcel row (SFC / ML / MU) to change which parcel the skew-T lifts. ASCII only. */
(function () {
  'use strict';
  const C = window.HodoCalc, KT = 0.514444;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f0 = (x) => (x == null || isNaN(x) ? '--' : String(Math.round(x)));
  const f1 = (x) => (x == null || isNaN(x) ? '--' : (Math.round(x * 10) / 10).toFixed(1));
  const f2 = (x) => (x == null || isNaN(x) ? '--' : (Math.round(x * 100) / 100).toFixed(2));
  const ft = (m) => (m == null ? '--' : Math.round(m * 3.28084).toLocaleString());
  const F = (c) => c * 1.8 + 32;
  const COL = { t: '#ff6161', td: '#4ade80', wb: '#38bdf8', par: '#f8fafc', cape: '#ff9a3c', cin: '#5aa0ff', frz: '#7dd3fc', hail: '#22d3ee', acc: '#7fb0ff', eff: '#c084fc' };
  const S = { bg: false, wb: false, L: null, P: null, par: 'sb', pin: null, tour: -1, tourIds: [] };

  // ---------------------------------------------------------------- skew-T geometry
  const PB = 1050, PT = 100, T0 = 14, PH = 580, L0 = 66, SK = 0.5, TMIN = -40, KX = 4.6, XR = 478;
  const Y = (p) => T0 + (Math.log(p) - Math.log(PT)) / (Math.log(PB) - Math.log(PT)) * PH;
  const X = (t, p) => L0 + (t - TMIN) * KX + (T0 + PH - Y(p)) * SK;
  const pt = (t, p) => f1(X(t, p)) + ',' + f1(Y(p));
  const path = (arr, fn) => 'M' + arr.map(fn).join('L');

  function windBarb(x, y, u, v, col) {
    x = +x; y = +y;
    const sp = Math.hypot(u, v);
    if (sp < 2.5) return '<circle cx="' + x + '" cy="' + y + '" r="3" fill="none" stroke="' + col + '"/>';
    const th = Math.atan2(-u, -v), d = [Math.sin(th), -Math.cos(th)], pr = [-d[1], d[0]], len = 26;
    const tip = [x + d[0] * len, y + d[1] * len];
    let s = Math.round(sp / 5) * 5, o = '<path d="M' + x + ',' + y + 'L' + f1(tip[0]) + ',' + f1(tip[1]) + '"/>', k = 0;
    const at = (n) => [tip[0] - d[0] * n, tip[1] - d[1] * n];
    while (s >= 50) { const a = at(k * 4), b = at(k * 4 + 5); o += '<path class="fl" d="M' + f1(a[0]) + ',' + f1(a[1]) + 'L' + f1(a[0] + pr[0] * 9) + ',' + f1(a[1] + pr[1] * 9) + 'L' + f1(b[0]) + ',' + f1(b[1]) + 'Z"/>'; s -= 50; k += 1.4; }
    while (s >= 10) { const a = at(k * 4); o += '<path d="M' + f1(a[0]) + ',' + f1(a[1]) + 'L' + f1(a[0] + pr[0] * 9 + d[0] * 3) + ',' + f1(a[1] + pr[1] * 9 + d[1] * 3) + '"/>'; s -= 10; k++; }
    if (s >= 5) { const a = at(k * 4 + (k === 0 ? 4 : 0)); o += '<path d="M' + f1(a[0]) + ',' + f1(a[1]) + 'L' + f1(a[0] + pr[0] * 5 + d[0] * 1.5) + ',' + f1(a[1] + pr[1] * 5 + d[1] * 1.5) + '"/>'; }
    return '<g stroke="' + col + '" stroke-width="1.3" fill="' + col + '" stroke-linecap="round">' + o + '</g>';
  }

  // ---------------------------------------------------------------- skew-T
  function skewT(L) {
    const E = L.E, lev = E.lev, par = L[S.par] || L.sb;
    let s = '<svg id="labSkew" viewBox="0 0 600 640" role="img" aria-label="Skew-T log-P sounding"><defs><clipPath id="skClip"><rect x="' + L0 + '" y="' + T0 + '" width="' + (XR - L0) + '" height="' + PH + '"/></clipPath></defs>';
    s += '<rect x="' + L0 + '" y="' + T0 + '" width="' + (XR - L0) + '" height="' + PH + '" fill="#0b121d"/><g clip-path="url(#skClip)">';
    // background: dry adiabats, moist adiabats, mixing ratio, isotherms, isobars
    let g = '';
    for (let th = 250; th <= 520; th += 10) { const a = []; for (let p = PB; p >= PT; p -= 25) a.push(pt((th * Math.pow(p / 1000, 0.2854)) - 273.15, p)); g += '<path d="' + path(a, (q) => q) + '"/>'; }
    if (S.bg) s += '<g class="bgd" data-k="bgdry" fill="none" stroke="#7a5a34" stroke-width="0.7" opacity=".38">' + g + '</g>'; g = '';
    for (let tw = -8; tw <= 36; tw += 4) { let t = tw, pp = 1000; const a = [pt(t, pp)]; for (let p = 975; p >= PT; p -= 25) { t = C.moistStep(pp, t, p); pp = p; a.push(pt(t, p)); } g += '<path d="' + path(a, (q) => q) + '"/>'; }
    if (S.bg) s += '<g class="bgm" data-k="bgmoist" fill="none" stroke="#2f7a64" stroke-width="0.7" opacity=".38">' + g + '</g>'; g = '';
    [1, 2, 4, 8, 12, 16, 20].forEach((r) => { const a = []; for (let p = PB; p >= 600; p -= 25) a.push(pt(tdOf(r, p), p)); g += '<path d="' + path(a, (q) => q) + '"/>'; });
    if (S.bg) s += '<g class="bgr" data-k="bgmix" fill="none" stroke="#3a8a3a" stroke-width="0.7" stroke-dasharray="3 4" opacity=".4">' + g + '</g>'; g = '';
    for (let t = -120; t <= 50; t += (S.bg ? 10 : 20)) g += '<path d="M' + pt(t, PB) + 'L' + pt(t, PT) + '"' + (t === 0 ? ' stroke="#4a8fb0" stroke-width="1.2"' : '') + '/>';
    s += '<g class="bgi" data-k="bgiso" stroke="#1b2740" stroke-width="0.8">' + g + '</g>'; g = '';
    [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150].forEach((p) => { g += '<path d="M' + L0 + ',' + f1(Y(p)) + 'L' + XR + ',' + f1(Y(p)) + '"/>'; });
    s += '<g class="bgp" stroke="#2a3a52" stroke-width="0.8">' + g + '</g>';
    // hail growth zone and freezing level on the axis
    if (L.hail.m10 && L.hail.m30) s += '<g class="hg" data-k="hail"><rect x="' + L0 + '" y="' + f1(Y(L.hail.m30.p)) + '" width="' + (XR - L0) + '" height="' + f1(Y(L.hail.m10.p) - Y(L.hail.m30.p)) + '" fill="' + COL.hail + '" opacity=".07"/><rect class="hit" x="' + L0 + '" y="' + f1(Y(L.hail.m30.p)) + '" width="22" height="' + f1(Y(L.hail.m10.p) - Y(L.hail.m30.p)) + '" fill="' + COL.hail + '" opacity=".45"/></g>';
    // cape / cin
    const gr = par.grid, up = [], dn = [];
    const seg = (test, store, cls, col, key) => {
      let cur = null; const out = [];
      gr.forEach((q) => { if (test(q)) { (cur = cur || []).push(q); } else if (cur) { out.push(cur); cur = null; } });
      if (cur) out.push(cur);
      out.forEach((a) => { if (a.length < 2) return; const pts = a.map((q) => pt(q.tp, q.p)).concat(a.slice().reverse().map((q) => pt(q.te, q.p))); store.push('<polygon class="hg" data-k="' + key + '" points="' + pts.join(' ') + '" fill="' + col + '" opacity=".5"/>'); });
    };
    seg((q) => q.p <= par.plcl && q.b > 0, up, 'cape', COL.cape, 'cape');
    if (par.lfc) seg((q) => q.b <= 0 && q.z <= par.lfc.z, dn, 'cin', COL.cin, 'cin');
    s += dn.join('') + up.join('');
    // effective inflow layer band
    if (L.eff) s += '<g class="hg" data-k="eff"><rect x="' + (L0 + 24) + '" y="' + f1(Y(L.eff.ptop)) + '" width="8" height="' + f1(Math.max(3, Y(L.eff.pbot) - Y(L.eff.ptop))) + '" fill="' + COL.eff + '" opacity=".85"/></g>';
    // freezing and wet-bulb zero levels
    const hl = (o, key, lab, col) => o ? '<g class="hg" data-k="' + key + '"><path d="M' + L0 + ',' + f1(Y(o.p)) + 'L' + XR + ',' + f1(Y(o.p)) + '" stroke="' + col + '" stroke-dasharray="5 4" stroke-width="1.1" opacity=".75"/><path class="hit" d="M' + L0 + ',' + f1(Y(o.p)) + 'L' + XR + ',' + f1(Y(o.p)) + '" stroke="transparent" stroke-width="10"/><text x="' + (L0 + 38) + '" y="' + f1(Y(o.p) - 3) + '" fill="' + col + '" font-size="9.5">' + lab + '</text></g>' : '';
    s += hl(L.fzl, 'fzl', 'FZL ' + ft(L.fzl && L.fzl.z) + ' ft', COL.frz) + hl(L.wbz, 'wbz', 'WB 0 ' + ft(L.wbz && L.wbz.z) + ' ft', '#a5b4fc');
    // profiles
    const tdp = lev.filter((q) => q.td != null);
    if (S.wb) s += '<g class="hg" data-k="wetbulb"><path d="' + path(L.tw.filter((q) => q.t != null), (q) => pt(q.t, q.p)) + '" fill="none" stroke="' + COL.wb + '" stroke-width="1.5" stroke-dasharray="2 3"/></g>';
    s += '<g class="hg" data-k="par"><path d="' + path(gr, (q) => pt(q.tp, q.p)) + '" fill="none" stroke="' + COL.par + '" stroke-width="1.6" stroke-dasharray="6 4"/><path class="hit" d="' + path(gr, (q) => pt(q.tp, q.p)) + '" fill="none" stroke="transparent" stroke-width="10"/></g>';
    s += '<g class="hg" data-k="dew"><path d="' + path(tdp, (q) => pt(q.td, q.p)) + '" fill="none" stroke="' + COL.td + '" stroke-width="2.4" stroke-linejoin="round"/><path class="hit" d="' + path(tdp, (q) => pt(q.td, q.p)) + '" fill="none" stroke="transparent" stroke-width="12"/></g>';
    s += '<g class="hg" data-k="temp"><path d="' + path(lev, (q) => pt(q.te, q.p)) + '" fill="none" stroke="' + COL.t + '" stroke-width="2.6" stroke-linejoin="round"/><path class="hit" d="' + path(lev, (q) => pt(q.te, q.p)) + '" fill="none" stroke="transparent" stroke-width="12"/></g>';
    s += '</g>';
    // parcel start marker
    s += '<circle cx="' + f1(X(par.t0, par.p0)) + '" cy="' + f1(Y(par.p0)) + '" r="3.5" fill="' + COL.par + '" stroke="#0a0f18"/>';
    // axis labels
    [1000, 850, 700, 500, 300, 200, 150].forEach((p) => { s += '<text x="' + (L0 - 6) + '" y="' + f1(Y(p) + 3.5) + '" text-anchor="end" fill="#8394ad" font-size="10.5">' + p + '</text>'; });
    s += '<text x="' + (L0 - 6) + '" y="' + (T0 - 3) + '" text-anchor="end" fill="#8394ad" font-size="9">hPa</text>';
    for (let km = 2; km <= 14; km += 2) { const p = E.pOfZ(km * 1000 + E.z0); if (p < PT + 6 || km * 1000 > (E.lev[E.lev.length - 1].z - E.z0)) break; s += '<g class="hg" data-k="km"><text x="' + (L0 + 4) + '" y="' + f1(Y(p) + 3.5) + '" fill="#6f86a8" font-size="9.5">' + km + ' km</text></g>'; }
    // bottom temperature scale
    for (let t = -30; t <= 40; t += 10) { const x = X(t, PB); if (x > L0 + 4 && x < XR - 8) s += '<text x="' + f1(x) + '" y="' + (T0 + PH + 14) + '" text-anchor="middle" fill="' + (t === 0 ? '#7dd3fc' : '#8394ad') + '" font-size="10.5">' + t + '</text>'; }
    s += '<text x="' + f1((L0 + XR) / 2) + '" y="' + (T0 + PH + 28) + '" text-anchor="middle" fill="#6f86a8" font-size="9.5">temperature (&deg;C)</text>';
    // markers for LCL / LFC / EL
    const mk = [['lcl', 'LCL', { p: par.plcl, z: par.lcl }], ['lfc', 'LFC', par.lfc], ['el', 'EL', par.el]].filter((m) => m[2]);
    let lastY = -99;
    mk.sort((a, b) => Y(a[2].p) - Y(b[2].p)).reverse().forEach((m) => {
      let y = Y(m[2].p); if (Math.abs(y - lastY) < 12) y = lastY - 12; lastY = y;
      s += '<g class="hg sk-mk" data-k="' + m[0] + '"><path d="M' + (XR - 12) + ',' + f1(Y(m[2].p)) + 'L' + XR + ',' + f1(Y(m[2].p)) + '" stroke="#f8fafc" stroke-width="2"/><rect class="hit" x="' + (XR + 2) + '" y="' + f1(y - 8) + '" width="34" height="14" rx="3" fill="#162234" stroke="#33496b"/><text x="' + (XR + 19) + '" y="' + f1(y + 3) + '" text-anchor="middle" fill="#e5edf8" font-size="9.5" font-weight="600">' + m[1] + '</text></g>';
    });
    // wind barbs
    s += '<g class="hg" data-k="barbs">';
    const zt = E.lev[E.lev.length - 1].z - E.z0;
    for (let z = 0; z <= Math.min(L.W.top, zt, 14000); z += 500) { const w = L.W.at(z), p = E.pOfZ(z + E.z0); if (Y(p) < T0 + 2) break; s += windBarb(556, f1(Y(p)), w[0], w[1], '#cbd5e1'); }
    s += '<rect class="hit" x="526" y="' + T0 + '" width="72" height="' + PH + '" fill="transparent"/></g>';
    s += '<text x="556" y="' + (T0 + PH + 14) + '" text-anchor="middle" fill="#6f86a8" font-size="9.5">winds</text>';
    return s + '</svg>';
  }
  function tdOf(r, p) { const e = r / 1000 * p / (0.622 + r / 1000), l = Math.log(e / 6.112); return 243.5 * l / (17.67 - l); }

  // ---------------------------------------------------------------- small charts
  const speedCol = (v) => (v < 20 ? '#4a6a96' : v < 35 ? '#4fd8c8' : v < 50 ? '#ffd23f' : v < 70 ? '#ff9a3c' : '#ff4d4d');
  function hbars(rows, o) {      // rows [{y0,y1,v,col}] vertical axis = height (km), horizontal value
    const W = o.w, H = o.h, ml = 34, mr = 8, mt = 8, mb = 22, zmax = o.zmax;
    const vx = (v) => ml + (v - o.vmin) / (o.vmax - o.vmin) * (W - ml - mr);
    const zy = (z) => H - mb - z / zmax * (H - mt - mb);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="mini" role="img" aria-label="' + o.label + '">';
    for (let k = 0; k <= zmax; k += 2000) s += '<path d="M' + ml + ',' + f1(zy(k)) + 'L' + (W - mr) + ',' + f1(zy(k)) + '" stroke="#1d2a3f"/><text x="' + (ml - 4) + '" y="' + f1(zy(k) + 3) + '" text-anchor="end" fill="#6f86a8" font-size="9.5">' + k / 1000 + '</text>';
    o.ticks.forEach((v) => { s += '<path d="M' + f1(vx(v)) + ',' + mt + 'L' + f1(vx(v)) + ',' + (H - mb) + '" stroke="' + (v === 0 ? '#3b4f70' : '#1d2a3f') + '"/><text x="' + f1(vx(v)) + '" y="' + (H - 8) + '" text-anchor="middle" fill="#6f86a8" font-size="9.5">' + v + '</text>'; });
    s += '<g class="hg" data-k="' + o.key + '">';
    rows.forEach((r) => { const a = vx(Math.min(0, o.vmin > 0 ? o.vmin : 0)), b = vx(r.v); s += '<rect x="' + f1(Math.min(a, b)) + '" y="' + f1(zy(r.y1) + 0.8) + '" width="' + f1(Math.abs(b - a)) + '" height="' + f1(Math.max(1.5, zy(r.y0) - zy(r.y1) - 1.6)) + '" fill="' + r.col + '" opacity=".92"/>'; });
    s += '<rect class="hit" x="' + ml + '" y="' + mt + '" width="' + (W - ml - mr) + '" height="' + (H - mt - mb) + '" fill="transparent"/></g>';
    s += '<text x="6" y="' + (H / 2) + '" fill="#6f86a8" font-size="9.5" transform="rotate(-90 6 ' + (H / 2) + ')" text-anchor="middle">km</text></svg>';
    return s;
  }
  function windSpeedChart(L) { const r = []; for (let z = 0; z < L.W.top; z += 500) { const w = L.W.at(z + 250), v = C.spdOf(w); r.push({ y0: z, y1: z + 500, v: v, col: speedCol(v) }); } return hbars(r, { w: 250, h: 250, vmin: 0, vmax: Math.max(60, Math.ceil(Math.max.apply(null, r.map((q) => q.v)) / 20) * 20), ticks: [0, 20, 40, 60, 80, 100].filter((t) => t <= Math.max(60, Math.ceil(Math.max.apply(null, r.map((q) => q.v)) / 20) * 20)), zmax: 12000, key: 'wspd', label: 'wind speed by height' }); }
  function srChart(L) { const r = []; for (let i = 0; i + 1 < L.sr.length; i++) { const v = (L.sr[i][1] + L.sr[i + 1][1]) / 2; r.push({ y0: L.sr[i][0], y1: L.sr[i + 1][0], v: v, col: v < 20 ? '#4a6a96' : v < 40 ? '#4fd8c8' : '#ffd23f' }); } const m = Math.max(60, Math.ceil(Math.max.apply(null, r.map((q) => q.v)) / 20) * 20); return hbars(r, { w: 250, h: 250, vmin: 0, vmax: m, ticks: [0, 20, 40, 60, 80, 100].filter((t) => t <= m), zmax: 12000, key: 'srw', label: 'storm-relative wind by height' }); }
  function advChart(L) { const r = L.adv.map((a) => ({ y0: a.z0, y1: a.z1, v: a.v, col: a.v >= 0 ? '#ff7a5c' : '#5aa0ff' })); const m = Math.max(2, Math.ceil(Math.max.apply(null, r.map((q) => Math.abs(q.v))))); return hbars(r, { w: 250, h: 250, vmin: -m, vmax: m, ticks: [-m, 0, m], zmax: 10000, key: 'adv', label: 'inferred temperature advection' }); }

  function thetaEChart(L) {
    const a = L.te.filter((q) => q.p >= 300), W = 250, H = 250, ml = 38, mr = 10, mt = 8, mb = 22;
    const vmin = Math.floor(Math.min.apply(null, a.map((q) => q.v)) / 5) * 5 - 5, vmax = Math.ceil(Math.max.apply(null, a.map((q) => q.v)) / 5) * 5 + 5;
    const x = (v) => ml + (v - vmin) / (vmax - vmin) * (W - ml - mr), y = (p) => mt + (Math.log(p) - Math.log(300)) / (Math.log(1050) - Math.log(300)) * (H - mt - mb);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="mini" role="img" aria-label="theta-e by pressure">';
    [1000, 850, 700, 500, 300].forEach((p) => { s += '<path d="M' + ml + ',' + f1(y(p)) + 'L' + (W - mr) + ',' + f1(y(p)) + '" stroke="#1d2a3f"/><text x="' + (ml - 4) + '" y="' + f1(y(p) + 3) + '" text-anchor="end" fill="#6f86a8" font-size="9.5">' + p + '</text>'; });
    for (let v = Math.ceil(vmin / 10) * 10; v <= vmax; v += 10) s += '<path d="M' + f1(x(v)) + ',' + mt + 'L' + f1(x(v)) + ',' + (H - mb) + '" stroke="#1d2a3f"/><text x="' + f1(x(v)) + '" y="' + (H - 8) + '" text-anchor="middle" fill="#6f86a8" font-size="9.5">' + v + '</text>';
    s += '<g class="hg" data-k="thetae"><path d="' + path(a, (q) => f1(x(q.v)) + ',' + f1(y(q.p))) + '" fill="none" stroke="#c084fc" stroke-width="2.2" stroke-linejoin="round"/><path class="hit" d="' + path(a, (q) => f1(x(q.v)) + ',' + f1(y(q.p))) + '" fill="none" stroke="transparent" stroke-width="12"/></g>';
    return s + '</svg>';
  }

  function hodoChart(L) {
    const W = 300, H = 300, cx = 150, cy = 150;
    const W_ = L.W, top = Math.min(W_.top, 12000);
    let mx = 0; for (let z = 0; z <= top; z += 250) mx = Math.max(mx, C.spdOf(W_.at(z)));
    const R = Math.max(40, Math.ceil((mx + 4) / 20) * 20), k = 138 / R;
    const P = (u, v) => f1(cx + u * k) + ',' + f1(cy - v * k);
    let s = '<svg viewBox="0 0 300 300" class="hodo" id="labHodo" role="img" aria-label="hodograph">';
    for (let r = 20; r <= R; r += 20) s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + f1(r * k) + '" fill="none" stroke="#1f2d44"/><text x="' + (cx + 3) + '" y="' + f1(cy - r * k - 2) + '" fill="#5d7396" font-size="9">' + r + '</text>';
    s += '<path d="M' + cx + ',6L' + cx + ',294M6,' + cy + 'L294,' + cy + '" stroke="#2a3a52"/>';
    const LY = [[0, 1000, '#ff4d4d'], [1000, 3000, '#ff9a3c'], [3000, 6000, '#ffd23f'], [6000, 9000, '#4ade80'], [9000, 12000, '#38bdf8']];
    s += '<g class="hg" data-k="hodo">';
    LY.forEach((l) => { if (l[0] >= top) return; const a = []; for (let z = l[0]; z <= Math.min(l[1], top); z += 100) { const w = W_.at(z); a.push(P(w[0], w[1])); } s += '<path d="M' + a.join('L') + '" fill="none" stroke="' + l[2] + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'; });
    s += '<path class="hit" d="M' + (function () { const a = []; for (let z = 0; z <= top; z += 100) { const w = W_.at(z); a.push(P(w[0], w[1])); } return a.join('L'); })() + '" fill="none" stroke="transparent" stroke-width="14"/></g>';
    for (let km = 1; km * 1000 <= top && km <= 12; km++) { const w = W_.at(km * 1000); s += '<g class="hg" data-k="hodo"><circle cx="' + P(w[0], w[1]).split(',')[0] + '" cy="' + P(w[0], w[1]).split(',')[1] + '" r="2.6" fill="#0a0f18" stroke="#e5edf8"/><text x="' + f1(cx + w[0] * k + 5) + '" y="' + f1(cy - w[1] * k - 4) + '" fill="#cbd5e1" font-size="9">' + km + '</text></g>'; }
    // srh area, right-mover triangle sfc-3km
    const rm = S.P.rm, lm = S.P.lm, ar = [P(rm[0], rm[1])]; for (let z = 0; z <= Math.min(3000, top); z += 100) { const w = W_.at(z); ar.push(P(w[0], w[1])); }
    s += '<g class="hg" data-k="srh"><polygon points="' + ar.join(' ') + '" fill="#ff9a3c" opacity=".22"/></g>';
    const dot = (key, u, v, c, lab) => '<g class="hg" data-k="' + key + '"><circle cx="' + P(u, v).split(',')[0] + '" cy="' + P(u, v).split(',')[1] + '" r="6" fill="' + c + '" stroke="#0a0f18" stroke-width="1.5"/><text x="' + f1(cx + u * k + 9) + '" y="' + f1(cy - v * k + 3) + '" fill="' + c + '" font-size="10" font-weight="700">' + lab + '</text><circle class="hit" cx="' + P(u, v).split(',')[0] + '" cy="' + P(u, v).split(',')[1] + '" r="12" fill="transparent"/></g>';
    s += dot('rm', rm[0], rm[1], '#ff6b6b', 'RM') + dot('lm', lm[0], lm[1], '#5aa0ff', 'LM') + dot('mean', L.mean06[0], L.mean06[1], '#e5edf8', 'MW');
    const co = L.corfidi; s += '<g class="hg" data-k="corfidi"><path d="M' + cx + ',' + cy + 'L' + P(co.up[0], co.up[1]) + '" stroke="#c084fc" stroke-width="1.6" stroke-dasharray="3 3"/><path d="M' + cx + ',' + cy + 'L' + P(co.down[0], co.down[1]) + '" stroke="#c084fc" stroke-width="1.6" stroke-dasharray="3 3"/><circle cx="' + P(co.up[0], co.up[1]).split(',')[0] + '" cy="' + P(co.up[0], co.up[1]).split(',')[1] + '" r="3.5" fill="#c084fc"/><circle cx="' + P(co.down[0], co.down[1]).split(',')[0] + '" cy="' + P(co.down[0], co.down[1]).split(',')[1] + '" r="3.5" fill="#c084fc"/><circle class="hit" cx="' + P(co.down[0], co.down[1]).split(',')[0] + '" cy="' + P(co.down[0], co.down[1]).split(',')[1] + '" r="10" fill="transparent"/></g>';
    return s + '</svg>';
  }

  // ---------------------------------------------------------------- tables
  const dirTxt = (w) => String(Math.round(C.dirFrom(w) / 1) % 360).padStart(3, '0') + '/' + f0(C.spdOf(w));
  const cell = (k, v, extra) => '<td data-k="' + k + '"' + (extra || '') + '>' + v + '</td>';
  function parcelTable(L) {
    const rows = [['sb', 'SFC', L.sb], ['ml', 'ML', L.ml], ['mu', 'MU', L.mu]].filter((r) => r[2]);
    let s = '<table class="lt ptab"><tr><th></th><th data-k="cape">CAPE</th><th data-k="cin">CINH</th><th data-k="lcl">LCL</th><th data-k="li">LI</th><th data-k="lfc">LFC</th><th data-k="el">EL</th></tr>';
    rows.forEach((r) => { const q = r[2]; s += '<tr class="sel' + (S.par === r[0] ? ' on' : '') + '" data-k="par_' + r[0] + '"><th>' + r[1] + '</th><td>' + q.cape + '</td><td>' + q.cin + '</td><td>' + ft(q.lcl) + '</td><td>' + f0(q.li) + '</td><td>' + (q.lfc ? ft(q.lfc.z) : '--') + '</td><td>' + (q.el ? ft(q.el.z) : '--') + '</td></tr>'; });
    return s + '</table><div class="note">J/kg and feet above ground. Click a row to lift that parcel in the skew-T.</div>';
  }
  function thermoTable(L) {
    const row = (k, name, v) => '<tr data-k="' + k + '"><th>' + name + '</th><td>' + v + '</td></tr>';
    return '<table class="lt">' + row('pw', 'PW', f2(L.pw) + ' in') + row('kidx', 'K index', f0(L.k)) + row('wbz', 'WBZ', ft(L.wbz && L.wbz.z) + ' ft') + row('fzl', 'FZL', ft(L.fzl && L.fzl.z) + ' ft') +
      row('lapse', 'Lapse 0-3 km', f1(L.lr.s3) + ' C/km') + row('lapse', 'Lapse 3-6 km', f1(L.lr.m36) + ' C/km') + row('lapse', 'Lapse 850-500', f1(L.lr.p85) + ' C/km') + row('lapse', 'Lapse 700-500', f1(L.lr.p75) + ' C/km') +
      row('dcape', 'DCAPE', f0(L.dcape) + ' J/kg') + row('convt', 'ConvT', f0(F(L.convT)) + ' F') + row('maxt', 'MaxT', f0(F(L.maxt == null ? L.maxT : L.maxt)) + ' F') + row('ncape', 'NCAPE', f2(L.ncape) + ' m/s2') + row('tei', 'TEI', f0(L.tei)) + '</table>';
  }
  function kinTable(L) {
    const nm = ['SFC-1 km', 'SFC-3 km', 'SFC-6 km', 'SFC-8 km'];
    let s = '<table class="lt ktab"><tr><th></th><th data-k="srh">SRH</th><th data-k="shear">Shear</th><th data-k="mnwind">MnWind</th><th data-k="srwind">SRW</th></tr>';
    L.layers.forEach((l, i) => { s += '<tr><th>' + nm[i] + '</th><td data-k="srh">' + f0(l.srh) + '</td><td data-k="shear">' + f0(l.shear) + '</td><td data-k="mnwind">' + dirTxt(l.mean) + '</td><td data-k="srwind">' + dirTxt(l.sr) + '</td></tr>'; });
    if (L.eff && L.eff.esrh != null) s += '<tr><th>Eff. inflow</th><td data-k="eff">' + f0(L.eff.esrh) + '</td><td data-k="eff">' + f0(L.eff.ebwd / KT) + '</td><td colspan="2" data-k="eff">' + ft(L.eff.bot) + '-' + ft(L.eff.top) + ' ft</td></tr>';
    if (L.cloud) s += '<tr><th>LCL-EL</th><td data-k="srh">' + f0(L.cloud.srh) + '</td><td data-k="shear">' + f0(L.cloud.shear) + '</td><td data-k="mnwind">' + dirTxt(L.cloud.mean) + '</td><td data-k="srwind">' + dirTxt(L.cloud.sr) + '</td></tr>';
    return s + '</table><div class="note">SRH in m2/s2, shear and winds in knots (direction/speed).</div>';
  }
  function motionTable(L) {
    const rm = S.P.rm, lm = S.P.lm;
    return '<table class="lt"><tr data-k="rm"><th>Bunkers right</th><td>' + dirTxt(rm) + ' kt</td></tr><tr data-k="lm"><th>Bunkers left</th><td>' + dirTxt(lm) + ' kt</td></tr><tr data-k="mean"><th>0-6 km mean wind</th><td>' + dirTxt(L.mean06) + ' kt</td></tr>' +
      '<tr data-k="corfidi"><th>Corfidi upshear</th><td>' + dirTxt(L.corfidi.up) + ' kt</td></tr><tr data-k="corfidi"><th>Corfidi downshear</th><td>' + dirTxt(L.corfidi.down) + ' kt</td></tr><tr data-k="brn"><th>BRN shear</th><td>' + f0(L.brn) + ' m2/s2</td></tr></table>';
  }
  function gauge(k, name, v, cuts, max, words) {
    let now = 0; cuts.forEach((c, i) => { if (v >= c) now = i + 1; });
    const pct = Math.min(100, v / max * 100);
    return '<div class="gg" data-k="' + k + '"><div class="gn">' + name + '<b>' + f1(v) + '</b></div><div class="gb"><i style="width:' + Math.max(1.5, pct) + '%"></i>' + cuts.map((c) => '<u style="left:' + Math.min(100, c / max * 100) + '%"></u>').join('') + '</div><div class="gw">' + words[now] + '</div></div>';
  }
  function composites(L) {
    return gauge('stp', 'Significant tornado (STP)', L.stpEff, [1, 3, 6], 8, ['Not lined up', 'Lined up', 'High', 'Extreme']) +
      gauge('scp', 'Supercell composite (SCP)', L.scp, [1, 4, 10], 14, ['Weak', 'Supercells possible', 'Favourable', 'Very favourable']) +
      gauge('ship', 'Significant hail (SHIP)', L.ship, [0.5, 1, 2], 3, ['Unlikely', 'Marginal', 'Favourable', 'Very favourable']);
  }

  // ---------------------------------------------------------------- explanations
  const tbl = (rows, v) => { let now = 0; rows.forEach((r, i) => { if (v >= r[0]) now = i; }); return '<table class="sc">' + rows.map((r, i) => '<tr' + (i === now ? ' class="now"' : '') + '><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>').join('') + '</table>'; };
  const you = (txt) => '<div class="you">' + txt + '</div>';
  function EXP(L) {
    const par = L[S.par] || L.sb, P = S.P, sfcT = L.E.lev[0].te, sfcTd = L.E.lev[0].td;
    const e = {
      temp: ['Temperature (red line)', 'The air temperature at every height, from the ground up.', '<p>This is the actual temperature the balloon measured as it rose. It almost always drops with height. The faster it drops, the more unstable the air is, because warm air near the ground wants to rise through colder air above.</p><p>The chart is "skewed": lines of equal temperature slant to the right as you go up, which spreads the lines out so they are easier to read.</p>' + you('Ground temperature here is ' + f1(sfcT) + ' &deg;C (' + f0(F(sfcT)) + ' &deg;F). At 500 hPa (about 18,000 ft) it is ' + f0(L.E.te(500)) + ' &deg;C.')],
      dew: ['Dew point (green line)', 'How much moisture is in the air. The closer to red, the wetter.', '<p>The dew point is the temperature the air would need to cool to before water starts to condense into cloud. Where the green and red lines are close together the air is nearly saturated (cloud or fog). Where they are far apart the air is dry.</p><p>A big gap near the ground and a moist layer above is the classic "loaded gun" shape for storms.</p>' + you('At the ground the gap between temperature and dew point is ' + f1(sfcT - sfcTd) + ' &deg;C.')],
      wetbulb: ['Wet-bulb (blue dotted line)', 'The coldest a wet surface can cool by evaporation.', '<p>When rain falls through dry air it evaporates and cools the air toward the wet-bulb temperature. Forecasters use it for two things: whether falling snow melts, and how cold a downdraft can get.</p>'],
      par: ['Lifted parcel (dashed white line)', 'The path a bubble of air would follow if pushed upward: ' + par.label + ' parcel.', '<p>Imagine a bubble of air from the ground pushed up. It cools as it rises, first at a fast steady rate (dry), then slower once the water in it starts to condense and release heat (moist). Wherever the dashed line is <b>right of</b> the red line the bubble is warmer than its surroundings and keeps rising on its own.</p><p>You can switch parcels: click SFC, ML or MU in the parcel table. SFC starts from the ground. ML averages the lowest 100 hPa, which is more realistic on a hot afternoon. MU starts from the most buoyant air in the lowest 300 hPa.</p>' + you('Showing the ' + par.label + ' parcel, starting at ' + f1(par.t0) + ' &deg;C.')],
      cape: ['CAPE (orange area)', 'Storm fuel: the energy a rising bubble gains. Bigger area = stronger updraft.', '<p>The orange area is Convective Available Potential Energy. It is the total push a parcel gets between where it becomes buoyant (LFC) and where it stops (EL). Updraft speed scales roughly with the square root of CAPE.</p>' + tbl([[0, 'Under 250', 'Little fuel'], [250, '250 to 1,000', 'Marginal'], [1000, '1,000 to 2,500', 'Moderate'], [2500, '2,500 to 4,000', 'Large'], [4000, '4,000 and up', 'Extreme']], par.cape) + you(par.label + ' CAPE here is ' + par.cape + ' J/kg.')],
      cin: ['CINH / the cap (blue area)', 'The lid: energy a parcel has to climb over before it can rise freely.', '<p>Below the LFC the parcel is colder than the air around it, so it sinks back unless something forces it up (a front, outflow, hills). That blue area is Convective Inhibition. A bit of cap is good, because it lets fuel build all day. A huge cap means storms probably will not start at all.</p>' + tbl([[-1000, 'Below -200', 'Very strong cap'], [-200, '-200 to -100', 'Strong cap'], [-100, '-100 to -50', 'Moderate cap'], [-50, '-50 to 0', 'Weak cap']], par.cin) + you(par.label + ' CINH is ' + par.cin + ' J/kg.')],
      lcl: ['LCL: where cloud base forms', 'The height where a lifted parcel becomes cloud.', '<p>The Lifting Condensation Level is where rising air has cooled enough for its moisture to condense. It is your cloud base. For tornadoes, a lower LCL (under about 1,000 m) is better, because it means moist air near the ground and less cold air to mix out the rotation.</p>' + you('LCL is about ' + ft(par.lcl) + ' ft (' + f0(par.lcl) + ' m) above ground.')],
      lfc: ['LFC: where it takes off', 'The height above which the parcel is warmer than its surroundings.', '<p>The Level of Free Convection is where the dashed line crosses to the right of the red line. Once a parcel is lifted this high, it rises by itself. The lower the LFC, the easier storms start.</p>' + you(par.lfc ? 'LFC is about ' + ft(par.lfc.z) + ' ft above ground.' : 'This parcel never becomes buoyant, so there is no LFC.')],
      el: ['EL: the top of the storm', 'The height where the parcel stops being warmer than the air.', '<p>The Equilibrium Level is where the dashed line crosses back to the left of the red line. A storm updraft overshoots it a little, so it marks roughly the cloud top. The taller the buoyant layer, the stronger the storm can get.</p>' + you(par.el ? 'EL is about ' + ft(par.el.z) + ' ft above ground.' : 'No equilibrium level: the parcel is never buoyant.')],
      fzl: ['Freezing level', 'The height where the air temperature is 0 &deg;C (32 &deg;F).', '<p>Above this height water freezes. For hail it matters because hailstones melt as they fall below it: a lower freezing level means more hail reaches the ground. For winter weather it tells you whether precipitation falls as rain or snow.</p>' + you(L.fzl ? 'Freezing level is about ' + ft(L.fzl.z) + ' ft above ground.' : 'The whole sounding is below freezing at the ground, so there is no freezing level above it.')],
      wbz: ['Wet-bulb zero', 'The height where the wet-bulb temperature reaches 0 &deg;C.', '<p>Falling ice only starts to melt at this height, not at the freezing level, because evaporation cools the air around it. Forecasters use WBZ to guess the size of hail at the ground: a WBZ between roughly 7,000 and 12,000 ft is a good setup for large hail.</p>' + you(L.wbz ? 'WBZ is about ' + ft(L.wbz.z) + ' ft above ground.' : 'No wet-bulb zero level found.')],
      hail: ['Hail growth zone', 'The air between -10 and -30 &deg;C, where hail grows fastest.', '<p>In this cold layer, supercooled water droplets freeze on hailstones as they ride the updraft. The stronger the updraft inside this zone, the bigger the stones. It is highlighted as a cyan strip on the left edge.</p>' + you(L.hail.m10 && L.hail.m30 ? 'Here it spans about ' + ft(L.hail.m10.z) + ' to ' + ft(L.hail.m30.z) + ' ft above ground.' : 'This sounding is not cold enough to reach it.')],
      eff: ['Effective inflow layer', 'The air a storm would actually pull in from.', '<p>It is the stack of low-level air that has a meaningful amount of buoyancy (CAPE of at least 100 J/kg and not too strong a cap). Effective SRH and shear are measured over this layer instead of an arbitrary one, which is why they work better than the older fixed 0-1 km numbers on nights and elevated-storm days.</p>' + you(L.eff ? 'Here: ' + ft(L.eff.bot) + ' to ' + ft(L.eff.top) + ' ft above ground.' : 'No layer has enough buoyancy here, so no storm has anything to pull in.')],
      km: ['Height scale (km)', 'Height above the ground in kilometres.', '<p>The left axis is pressure, which falls roughly in half every 5.5 km. The small labels inside the chart show the matching height above the ground in kilometres (1 km is about 3,300 ft).</p>'],
      barbs: ['Wind barbs', 'The wind at each height. Staff points to where the wind comes from.', '<p>Each symbol shows the wind every 500 m. The staff points <b>toward the direction the wind blows from</b>. A short feather is 5 kt, a long feather 10 kt, a triangle 50 kt. Barbs that change direction or get longer with height mean wind shear, which is what organises storms.</p>'],
      bgdry: ['Dry adiabats (brown lines)', 'How a dry bubble of air cools as it rises.', '<p>These faint curved lines show the path of a rising unsaturated parcel. Warm air from the ground rises along them until it hits its condensation level.</p>'],
      bgmoist: ['Moist adiabats (green curves)', 'How a cloudy bubble of air cools as it rises.', '<p>Once a parcel is cloudy, condensation releases heat, so it cools more slowly. These curves are what the dashed parcel follows above the LCL.</p>'],
      bgmix: ['Mixing ratio lines (dashed)', 'Grams of water vapour per kilogram of air.', '<p>The dashed lines mark how much water is in the air (labelled 1 to 20 g/kg). The dew point line sits along them near the ground. More moisture means more latent heat to fuel a storm.</p>'],
      bgiso: ['Isotherms (slanted lines)', 'Lines of equal temperature, every 10 &deg;C.', '<p>The slanted grid lines connect points with the same temperature. The bold blue one is 0 &deg;C, the freezing line.</p>'],
      wspd: ['Wind speed by height', 'How fast the wind blows at each height.', '<p>Strong winds aloft over weak winds near the ground mean strong shear, which is good for organised storms. Colour ranges from blue (calm) through yellow to red (very strong).</p>' + you('Top speed in this sounding is about ' + f0(Math.max.apply(null, L.W.GU.map((u, i) => Math.hypot(u, L.W.GV[i])))) + ' kt.')],
      srw: ['Storm-relative wind', 'The wind as a storm moving with the Bunkers right-mover would feel it.', '<p>Storms move, so the wind they feel is the actual wind minus their motion. Strong storm-relative winds (over about 40 kt) at 9-11 km help keep precipitation away from the updraft, which favours a classic supercell. Weak ones tend to make heavy-precip supercells that are harder to see.</p>'],
      adv: ['Inferred temperature advection', 'Is warm or cold air arriving at each height?', '<p>When the wind turns clockwise with height (veers), warm air is being carried in. When it turns counter-clockwise (backs), cold air is arriving. This is computed from the wind alone (the "thermal wind" relation), so treat it as a rough guide. Red bars = warm advection, blue = cold. Warm advection through the lowest few km tends to lift air and help storms start.</p>'],
      thetae: ['Theta-e (equivalent potential temperature)', 'A single number for how much heat and moisture the air holds.', '<p>Theta-e combines temperature and moisture into one measure of an air parcel\'s energy. Where theta-e <b>drops</b> with height, the air is potentially unstable and can overturn. A big drop between the ground and the mid-levels means a lot of storm fuel and a strong downdraft potential.</p>'],
      tei: ['Theta-e index (TEI)', 'The drop in theta-e in the low levels.', '<p>The difference between the highest and lowest theta-e in the lowest few kilometres. Large values (over about 20 K) point to a deep layer of unstable air, a risk for strong downdraft winds.</p>' + you('TEI here is ' + f0(L.tei) + ' K.')],
      hodo: ['The hodograph', 'The wind profile drawn as one line.', '<p>Start at the centre (no wind) and plot the wind at each height as a point: direction from the centre, speed as distance. Joining the points gives the line. Red is the lowest kilometre, then orange, yellow, green and blue going up. A long, curved line means strong, turning wind, the shape that makes rotating storms.</p><p>The coloured dots are the storm motions. RM is the Bunkers right-mover, LM the left-mover, MW the 0-6 km mean wind. Purple is the Corfidi vectors.</p>'],
      srh: ['Storm-relative helicity (SRH)', 'How much a storm\'s inflow spins as it enters. The orange area on the hodograph.', '<p>SRH measures the twisting of the wind relative to a moving storm. It is the area swept between the hodograph line and the storm motion point (the orange triangle). Higher means more spin available to an updraft.</p>' + tbl([[-9999, 'Under 50', 'Weak'], [50, '50 to 150', 'Supports rotating storms'], [150, '150 to 300', 'Tornado-supporting'], [300, '300 and up', 'Very high']], L.layers[1].srh) + you('0-1 km SRH is ' + f0(L.srhFx.s1) + ' and 0-3 km SRH is ' + f0(L.srhFx.s3) + ' m2/s2 (right-mover).')],
      shear: ['Bulk wind shear', 'How much the wind changes between two heights.', '<p>It is the straight-line difference between the wind at the top and bottom of a layer. 0-6 km shear above about 35 kt is the usual threshold for supercells; below 20 kt storms stay short-lived.</p>' + tbl([[0, 'Under 20 kt', 'Ordinary storms'], [20, '20 to 35 kt', 'Organised clusters'], [35, '35 to 50 kt', 'Supercells possible'], [50, '50 kt and up', 'Long-lived supercells']], L.layers[2].shear) + you('0-6 km shear is ' + f0(L.layers[2].shear) + ' kt.')],
      mnwind: ['Mean wind', 'The average wind through a layer.', '<p>Shown as direction/speed in knots. Storms generally drift along with the 0-6 km mean wind (with a deviation for supercells).</p>'],
      srwind: ['Storm-relative wind (SRW)', 'Mean wind inside a layer after removing storm motion.', '<p>A strong storm-relative wind keeps rain from falling into the updraft. Shown as direction/speed in knots for the layer in that row.</p>'],
      rm: ['Bunkers right-mover', 'Where a right-turning supercell is expected to move.', '<p>The Bunkers method estimates supercell motion from the wind profile. Right-movers (the common type in the Northern Hemisphere) go right of the mean wind and are the ones that usually produce tornadoes.</p>' + you('Right-mover: ' + dirTxt(S.P.rm) + ' kt (from direction / speed).')],
      lm: ['Bunkers left-mover', 'Where a left-turning supercell would move.', '<p>Left-movers go left of the mean wind. They are rarer and usually favoured only when the hodograph curves counter-clockwise or in large-hail setups.</p>'],
      mean: ['0-6 km mean wind (MW)', 'The average steering wind through the lowest 6 km.', '<p>Ordinary storms move roughly with this wind.</p>'],
      corfidi: ['Corfidi vectors', 'Which way storm clusters build and move.', '<p>Corfidi vectors predict how a cluster of storms (a "MCS") moves. The <b>upshear</b> vector shows how fast new cells form against the wind; <b>downshear</b> is the overall motion. When the two nearly cancel, the cluster stays put and floods.</p>'],
      brn: ['Bulk Richardson number shear', 'The wind half of the BRN ratio.', '<p>BRN compares CAPE (fuel) to this shear term. Values here of 40 m2/s2 or more mean enough shear to organise storms.</p>' + you('BRN shear: ' + f0(L.brn) + ' m2/s2.')],
      pw: ['Precipitable water', 'Total water vapour in the air column.', '<p>If all the water vapour above one spot were squeezed out as rain, it would form a layer this deep. Over about 1.5 in in summer is a flood-rain setup.</p>' + you('PW here is ' + f2(L.pw) + ' in.')],
      kidx: ['K index', 'Thunderstorm potential from moisture and instability.', '<p>Uses temperatures and moisture at 850, 700 and 500 hPa. Above about 30 supports air-mass thunderstorms; below 20 is quiet.</p>' + you('K index: ' + f0(L.k) + '.')],
      lapse: ['Lapse rates', 'How fast the air cools with height (&deg;C per kilometre).', '<p>About 6 &deg;C/km is typical. Over 8 &deg;C/km is steep and unstable; a steep lapse rate over 700-500 hPa especially favours large hail. Under 5 is stable.</p>' + you('0-3 km: ' + f1(L.lr.s3) + ', 3-6 km: ' + f1(L.lr.m36) + ', 700-500 hPa: ' + f1(L.lr.p75) + ' &deg;C/km.')],
      dcape: ['DCAPE', 'Fuel for the storm\'s downdraft (damaging wind).', '<p>Downdraft CAPE measures how fast air could plunge to the ground if rain-cooled air sinks from mid-levels. Above about 1,000 J/kg is a damaging-wind risk. (This is our own calculation and can differ from SHARPpy by a good margin.)</p>' + you('DCAPE: ' + f0(L.dcape) + ' J/kg.')],
      convt: ['Convective temperature', 'The temperature the ground needs to reach for storms to start on their own.', '<p>If the surface heats to this value, the air can rise unaided to its condensation level. If the day\'s high stays below it, storms need a trigger. (Approximate estimate.)</p>' + you('ConvT: ' + f0(F(L.convT)) + ' &deg;F.')],
      maxt: ['Maximum temperature', 'Today\'s likely high from this sounding.', '<p>Take the 850 hPa temperature and bring it down to the surface along a dry adiabat. A rough forecast of the afternoon high.</p>'],
      ncape: ['NCAPE', 'CAPE per unit height (how skinny or fat the CAPE is).', '<p>CAPE divided by the depth of the buoyant layer. "Skinny" CAPE (small value) means slow acceleration; "fat" CAPE means fast, intense updrafts.</p>'],
      stp: ['Significant Tornado Parameter', 'A combined score for strong-tornado ingredients.', '<p>It multiplies CAPE, low cloud base, effective SRH, effective shear and the cap. A value of 1 or more means the ingredients line up, and strong tornadoes are more common in those setups. It is still not a forecast.</p>' + you('STP (effective) is ' + f1(L.stpEff) + '.')],
      scp: ['Supercell Composite Parameter', 'How well this sounding supports supercells.', '<p>Combines most-unstable CAPE, effective SRH and effective shear. Over about 1 favours supercells; over 4 is very favourable.</p>' + you('SCP: ' + f1(L.scp) + '.')],
      ship: ['Significant Hail Parameter', 'Hail potential score.', '<p>Combines CAPE, moisture, mid-level lapse rate, cold temperature at 500 hPa and shear. Over 1 supports significant (2 in+) hail. (Our approximation of the SPC formula.)</p>' + you('SHIP: ' + f1(L.ship) + '.')],
      li: ['Lifted index', 'Parcel minus environment temperature at 500 hPa.', '<p>Positive means stable, negative means unstable. Under -3 is unstable; under -6 very unstable.</p>' + you(par.label + ' LI is ' + f0(par.li) + '.')],
      ptype: ['Best-guess precipitation type', 'A rule-of-thumb guess for what falls at the ground.', '<p>Looks at the ground temperature and whether warm air sits above freezing aloft. Snow needs cold air all the way down; freezing rain needs a warm layer aloft over a sub-freezing ground. It is a quick guess, not a forecast.</p>' + you('Best guess: ' + L.ptype + '.')]
    };
    ['sb', 'ml', 'mu'].forEach((k) => { const q = L[k]; if (q) e['par_' + k] = [q.label + ' parcel', 'Click to lift this parcel on the skew-T.', '<p>' + ({ sb: 'The surface-based parcel starts at the ground. Best when storms form from surface air (afternoon heating).', ml: 'The mixed-layer parcel averages the lowest 100 hPa, like daytime turbulence mixes the air. Most representative of a typical afternoon.', mu: 'The most-unstable parcel starts from the most buoyant air in the lowest 300 hPa. This captures elevated storms that tap air above a cold surface layer.' }[k]) + '</p>' + you('CAPE ' + q.cape + ' J/kg, CINH ' + q.cin + ' J/kg, LCL ' + ft(q.lcl) + ' ft.')]; });
    return e;
  }

  // ---------------------------------------------------------------- layout
  function html(L) {
    const P = S.P, st = P.station || {};
    return '<div id="labBar"><div class="lt0"><b>' + esc((st.name || P.id)) + (st.state ? ', ' + esc(st.state) : '') + '</b> <span>' + esc(P.id) + ' - ' + esc(cycTxt(P.cycle)) + '</span></div>' +
      '<div class="lb2"><span class="chipk"><i style="background:' + COL.t + '"></i>Temp</span><span class="chipk"><i style="background:' + COL.td + '"></i>Dew point</span><span class="chipk"><i style="background:' + COL.par + '"></i>Parcel</span><span class="chipk"><i style="background:' + COL.cape + '"></i>CAPE</span><span class="chipk"><i style="background:' + COL.cin + '"></i>CIN</span></div>' +
      '<label class="lsw"><input type="checkbox" id="labBg"><span class="sw"></span>Guide lines</label><label class="lsw"><input type="checkbox" id="labWb"><span class="sw"></span>Wet-bulb</label><button class="btn" id="labTour">Walk me through it</button><button class="btn" id="labClose" aria-label="Close">Close</button></div>' +
      '<div id="labBody"><div id="labMain">' +
      '<div class="lcol"><div class="lc c-sk"><h4>Skew-T <small>hover anything, click for the explanation</small></h4><div id="labSkWrap">' + skewT(L) + '</div></div>' +
      '<div class="lc"><h4>Kinematics</h4>' + kinTable(L) + '</div></div>' +
      '<div class="lcol">' +
      '<div class="lc"><h4>Hodograph</h4>' + hodoChart(L) + '</div>' +
      '<div class="lc"><h4>Theta-e vs pressure</h4>' + thetaEChart(L) + '</div>' +
      '<div class="lc"><h4>Composite scores</h4>' + composites(L) + '</div>' +
      '</div>' +
      '<div class="lcol"><div class="lc"><h4>Wind speed (kt) by height</h4>' + windSpeedChart(L) + '</div><div class="lc"><h4>Storm-relative wind (kt)</h4>' + srChart(L) + '</div><div class="lc"><h4>Inferred temp advection (&deg;C/hr)</h4>' + advChart(L) + '</div></div>' +
      '<div class="lcol"><div class="lc" id="labPar"><h4>Parcels</h4>' + parcelTable(L) + '</div><div class="lc"><h4>Thermodynamics</h4>' + thermoTable(L) + '</div><div class="lc"><h4>Storm motion</h4>' + motionTable(L) + '</div><div class="lc" data-k="ptype"><h4>Best-guess precipitation</h4><div class="ptype">' + esc(L.ptype) + '</div></div></div>' +
      '</div><aside id="labLearn"><div id="labL"></div></aside></div><div id="labTip" class="hidden"></div>';
  }
  function cycTxt(c) { if (!c || c.length < 10) return c || ''; return c.slice(0, 4) + '-' + c.slice(4, 6) + '-' + c.slice(6, 8) + ' ' + c.slice(8, 10) + 'Z'; }

  let EX = {};
  function learnHtml(k, tour) {
    const x = EX[k]; if (!x) return '';
    return '<h3>' + x[0] + '</h3><div class="lsub">' + x[1] + '</div>' + x[2] + (tour ? '<div class="lnav"><button class="btn" id="labPrev">Back</button><span>' + (S.tour + 1) + ' / ' + S.tourIds.length + '</span><button class="btn" id="labNext">Next</button></div>' : '');
  }
  function pin(k, tour) {
    S.pin = k;
    $('#labL').innerHTML = learnHtml(k, tour);
    hl(k);
    if (tour) { $('#labPrev').onclick = () => go(S.tour - 1); $('#labNext').onclick = () => go(S.tour + 1); $('#labPrev').disabled = S.tour === 0; $('#labNext').textContent = S.tour === S.tourIds.length - 1 ? 'Done' : 'Next'; }
  }
  function hl(k) {
    const root = $('#lab'); if (!root) return;
    root.querySelectorAll('.hl').forEach((e) => e.classList.remove('hl'));
    root.classList.toggle('dimming', !!k);
    if (k) root.querySelectorAll('[data-k="' + k + '"]').forEach((e) => e.classList.add('hl'));
  }
  function go(i) {
    if (i >= S.tourIds.length) { S.tour = -1; pin(S.pin); $('#labL').innerHTML = learnHtml(S.pin, false); return; }
    S.tour = Math.max(0, i);
    const k = S.tourIds[S.tour]; pin(k, true);
    const el = $('#lab [data-k="' + k + '"]'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function redraw() {
    const L = S.L;
    $('#labSkWrap').innerHTML = skewT(L);
    $('#labPar').innerHTML = '<h4>Parcels</h4>' + parcelTable(L);
    EX = EXP(L);
    hl(S.pin);
  }

  function open(P) {
    if (!window.HodoCalc) return;
    const L = C.compute(P); if (!L) return;
    S.P = P; S.L = L; S.par = 'sb'; S.bg = false; S.wb = false; S.pin = null; S.tour = -1; EX = EXP(L);
    let root = $('#lab'); if (root) root.remove();
    root = document.createElement('div'); root.id = 'lab'; root.innerHTML = html(L);
    document.body.appendChild(root); document.body.classList.add('labopen');
    $('#labL').innerHTML = '<h3>Learn as you go</h3><div class="lsub">Everything on this page is live and clickable.</div><p><b>Hover</b> any line, area, number or box to see what it is.</p><p><b>Click</b> it to pin the full explanation here, with this sounding\'s real values.</p><p>In the parcel table, <b>click SFC, ML or MU</b> to change which bubble of air the skew-T lifts.</p><p>Or press <b>Walk me through it</b> for a guided tour.</p><p class="muted">Data: National Weather Service balloon sounding (public domain) via the Iowa State Mesonet. Educational only: not a forecast.</p>';
    const tip = $('#labTip');
    const mv = (ev, k) => {
      const x = EX[k]; if (!x) { tip.classList.add('hidden'); return; }
      tip.innerHTML = '<b>' + x[0] + '</b>' + x[1] + '<div class="tc">Click for the full explanation</div>';
      tip.classList.remove('hidden');
      const w = tip.offsetWidth, h = tip.offsetHeight; let xx = ev.clientX + 16, yy = ev.clientY + 16;
      if (xx + w > innerWidth - 8) xx = ev.clientX - w - 16; if (yy + h > innerHeight - 8) yy = ev.clientY - h - 16;
      tip.style.left = Math.max(8, xx) + 'px'; tip.style.top = Math.max(8, yy) + 'px';
    };
    root.addEventListener('mousemove', (e) => {
      const g = e.target.closest('[data-k]');
      if (!g || !root.contains(g) || g.closest('#labLearn')) { tip.classList.add('hidden'); hl(S.tour >= 0 || S.pin ? S.pin : null); return; }
      hl(g.dataset.k); mv(e, g.dataset.k);
    });
    root.addEventListener('mouseleave', () => { tip.classList.add('hidden'); hl(S.pin); });
    root.addEventListener('change', (e) => { if (e.target.id === 'labBg') { S.bg = e.target.checked; redraw(); } if (e.target.id === 'labWb') { S.wb = e.target.checked; redraw(); } });
    root.addEventListener('click', (e) => {
      if (e.target.closest('#labClose')) { close(); return; }
      if (e.target.closest('#labTour')) { startTour(); return; }
      if (e.target.closest('#labLearn')) return;
      const g = e.target.closest('[data-k]'); if (!g) return;
      const k = g.dataset.k;
      S.tour = -1;
      if (k.indexOf('par_') === 0) { S.par = k.slice(4); redraw(); }
      pin(k, false);
    });
    document.addEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape' && $('#lab')) close(); }
  function startTour() {
    const ids = ['temp', 'dew', 'wetbulb', 'par', 'lcl', 'lfc', 'el', 'cape', 'cin', 'fzl', 'hail', 'barbs', 'hodo', 'rm', 'srh', 'shear', 'wspd', 'srw', 'adv', 'thetae', 'par_sb', 'pw', 'lapse', 'dcape', 'stp', 'scp', 'ship', 'ptype'];
    S.tourIds = ids.filter((k) => EX[k] && $('#lab [data-k="' + k + '"]'));
    S.tour = 0; go(0);
  }
  function close() {
    const r = $('#lab'); if (r) r.remove();
    document.body.classList.remove('labopen'); document.removeEventListener('keydown', onKey);
  }
  window.HodoLab = { open: open, close: close };
})();
