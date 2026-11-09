// CellScope Flight coming-soon hero: a constellation flight route with procedural
// radar-style storm cells drifting into it, plus spider lightning. Canvas 2D, no deps.
(function () {
  'use strict';
  const cv = document.querySelector('canvas.flightfx');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = 760, H = 300;                 // world units (css px at full width)
  const G = 2;                            // radar grid cell size in world units
  const GW = W / G, GH = H / G;
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- seeded random + value noise
  let seed = 20261109;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const perm = new Uint8Array(512);
  { const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; }
  function vn(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = perm[(perm[xi & 255] + yi) & 255], b = perm[(perm[(xi + 1) & 255] + yi) & 255];
    const c = perm[(perm[xi & 255] + yi + 1) & 255], d = perm[(perm[(xi + 1) & 255] + yi + 1) & 255];
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return ((a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v) / 255;
  }
  function fbm(x, y, oct) {
    let s = 0, a = 0.5, n = 0;
    for (let i = 0; i < oct; i++) { s += a * vn(x, y); n += a; a *= 0.5; x = x * 2.03 + 17.1; y = y * 2.03 + 9.7; }
    return s / n;
  }

  // ---------------------------------------------------------------- reflectivity palette (dBZ -> rgba)
  const STOPS = [[5, 90, 120, 170, 0], [12, 110, 140, 185, .10], [18, 40, 150, 120, .35], [22, 20, 175, 70, .62],
    [30, 10, 205, 40, .78], [35, 0, 150, 0, .88], [40, 245, 230, 0, .93], [45, 255, 165, 0, .96],
    [50, 255, 60, 0, 1], [55, 205, 0, 0, 1], [60, 190, 0, 160, 1], [66, 250, 235, 255, 1]];
  const LUT = new Uint8ClampedArray(81 * 4);
  for (let z = 0; z <= 80; z++) {
    let k = 0; while (k < STOPS.length - 2 && z > STOPS[k + 1][0]) k++;
    const A = STOPS[k], B = STOPS[k + 1], t = Math.max(0, Math.min(1, (z - A[0]) / (B[0] - A[0])));
    for (let c = 0; c < 4; c++) LUT[z * 4 + c] = (c < 3 ? A[c + 1] + (B[c + 1] - A[c + 1]) * t : (A[4] + (B[4] - A[4]) * t) * 255);
  }

  // ---------------------------------------------------------------- the route (constellation)
  const ROUTE = [[40, 238], [98, 212], [158, 182], [222, 150], [292, 124], [366, 112], [440, 116],
    [510, 136], [574, 164], [634, 196], [692, 222], [724, 236]];
  const cum = [0]; for (let i = 1; i < ROUTE.length; i++) cum.push(cum[i - 1] + Math.hypot(ROUTE[i][0] - ROUTE[i - 1][0], ROUTE[i][1] - ROUTE[i - 1][1]));
  const RL = cum[cum.length - 1];
  const CYCLE = 9, TRAVEL = 4.2;

  // ---------------------------------------------------------------- storm cells
  const MV = { x: -7.5, y: -2.6 };            // mean storm motion, world units / s (toward the route)
  function spawn(initial) {
    const line = rnd() < 0.22;
    const c = {
      line,
      x: initial ? 120 + rnd() * 640 : W + 60 + rnd() * 120,
      y: initial ? 150 + rnd() * 150 : 190 + rnd() * 140,
      rx: line ? 110 + rnd() * 60 : 34 + rnd() * 34,
      ry: line ? 13 + rnd() * 6 : 22 + rnd() * 16,
      ang: line ? -1.05 + rnd() * 0.35 : -0.5 + rnd() * 0.5,
      vx: MV.x * (0.8 + rnd() * 0.45), vy: MV.y * (0.6 + rnd() * 0.8),
      life: 70 + rnd() * 60, peak: 0.8 + rnd() * 0.3,
      hook: !line && rnd() < 0.55,
    };
    c.age = initial ? rnd() * c.life * 0.7 : 0;
    c.ca = Math.cos(c.ang); c.sa = Math.sin(c.ang);
    return c;
  }
  const cells = []; for (let i = 0; i < 6; i++) cells.push(spawn(true));
  const inten = c => { const p = c.age / c.life; return c.peak * Math.min(1, Math.sin(Math.PI * Math.min(1, p)) * 1.6); };

  // radar field on a coarse grid
  const dbz = new Uint8Array(GW * GH);
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const edge = (x, y) => sm(0, 110, x) * sm(W, W - 110, x) * sm(0, 70, y) * sm(H, H - 80, y);
  const EF = new Float32Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) EF[gy * GW + gx] = edge(gx * G + 1, gy * G + 1);
  const off = document.createElement('canvas'); off.width = GW; off.height = GH;
  const octx = off.getContext('2d'), img = octx.createImageData(GW, GH);
  function field(t) {
    const px = img.data;
    const ox = -MV.x * t, oy = -MV.y * t;          // advect texture with the storms
    const live = cells.map(c => ({ c, I: inten(c), r2: Math.pow(Math.max(c.rx, c.ry) * 1.9, 2) })).filter(o => o.I > 0.03);
    for (let gy = 0; gy < GH; gy++) {
      const y = gy * G + 1;
      for (let gx = 0; gx < GW; gx++) {
        const x = gx * G + 1;
        let v = 0;
        for (let k = 0; k < live.length; k++) {
          const o = live[k], c = o.c, dx = x - c.x, dy = y - c.y;
          if (dx * dx + dy * dy > o.r2) continue;
          const u = (dx * c.ca + dy * c.sa) / c.rx, w = (-dx * c.sa + dy * c.ca) / c.ry;
          const d = u * u + w * w;
          let b = 0.55 * Math.exp(-d * 1.6) + 0.45 * Math.exp(-d * 5) + 0.42 * Math.exp(-d * 0.45);
          if (c.hook) {                                 // a curled appendage at the rear flank
            const hu = u + 0.55, hw = w - 0.85, hd = hu * hu * 5 + hw * hw * 9;
            b += 0.55 * Math.exp(-hd) * (hu > -0.2 ? 1 : 0.4);
            const nu = u + 0.1, nw = w - 0.35; b -= 0.35 * Math.exp(-(nu * nu * 22 + nw * nw * 30)); // inflow notch
          }
          if (c.line) b *= 0.75 + 0.25 * Math.cos(u * 5.5);   // embedded cores along the line
          v += Math.max(0, b) * o.I;
        }
        let z = 0;
        if (v > 0.02) {
          const sx = (x + ox) * 0.024, sy = (y + oy) * 0.024;
          const q = fbm(sx + t * 0.01, sy, 3);
          const n = fbm(sx + 2.2 * q, sy + 2.2 * q + 3.3 + t * 0.006, 5);
          const m = 0.5 + 2.3 * (n - 0.5);
          z = 58 * Math.pow(v, 0.85) * (m < 0.05 ? 0.05 : m) + 6 * v;
          z = z < 0 ? 0 : z > 80 ? 80 : z | 0;
        }
        const i = gy * GW + gx; dbz[i] = z;
        const j = i * 4, L = z * 4;
        px[j] = LUT[L]; px[j + 1] = LUT[L + 1]; px[j + 2] = LUT[L + 2]; px[j + 3] = LUT[L + 3] * EF[i];
      }
    }
    octx.putImageData(img, 0, 0);
  }
  const zAt = (x, y) => { const gx = Math.floor(x / G), gy = Math.floor(y / G); return gx < 0 || gy < 0 || gx >= GW || gy >= GH ? 0 : dbz[gy * GW + gx]; };

  // ---------------------------------------------------------------- lightning
  const bolts = [];
  function crawl(x, y, ang, len, depth, out) {
    let px = x, py = y;
    while (len > 0) {
      const s = 2.5 + rnd() * 4.5; ang += (rnd() - 0.5) * 1.15;
      const nx = px + Math.cos(ang) * s, ny = py + Math.sin(ang) * s;
      out.push([px, py, nx, ny, depth]); px = nx; py = ny; len -= s;
      if (depth < 3 && rnd() < 0.16) crawl(px, py, ang + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.7), len * (0.35 + rnd() * 0.35), depth + 1, out);
    }
  }
  function strike(t) {
    const hot = cells.filter(c => inten(c) > 0.55 && c.x > 10 && c.x < W - 10 && c.y > 10 && c.y < H - 10);
    if (!hot.length) return;
    const c = hot[Math.floor(rnd() * hot.length)];
    const ox = c.x + (rnd() - 0.5) * c.rx * 0.5, oy = c.y + (rnd() - 0.5) * c.ry * 0.5;
    const segs = [], arms = 1 + Math.floor(rnd() * 3);
    for (let a = 0; a < arms; a++) crawl(ox, oy, rnd() * Math.PI * 2, 30 + rnd() * (c.line ? 110 : 80), 0, segs);
    bolts.push({ segs, x: ox, y: oy, t0: t, dur: 0.55 + rnd() * 0.35, flick: rnd() * 10 });
  }
  const boltA = (b, t) => {             // return strokes: bright, dim, re-strike, fade
    const p = (t - b.t0) / b.dur; if (p > 1) return 0;
    const f = p < 0.08 ? 1 : p < 0.18 ? 0.25 : p < 0.3 ? 0.95 : p < 0.38 ? 0.35 : 0.8 * (1 - p);
    return f * (0.85 + 0.15 * Math.sin(b.flick + t * 90));
  };

  // ---------------------------------------------------------------- background stars
  const stars = []; for (let i = 0; i < 90; i++) stars.push({ x: rnd() * W, y: rnd() * H, r: 0.4 + rnd() * 0.9, p: rnd() * 6.3, s: 0.6 + rnd() * 1.6 });

  // ---------------------------------------------------------------- sizing
  let dpr = 1, scale = 1;
  function size() {
    const w = cv.clientWidth || W;
    dpr = Math.min(2, window.devicePixelRatio || 1); scale = w / W;
    cv.width = Math.round(w * dpr); cv.height = Math.round(w * H / W * dpr);
  }
  size(); window.addEventListener('resize', size);

  // ---------------------------------------------------------------- draw
  let last = 0, lastField = -1, nextStrike = 0, simT = 0;
  function frame(now) {
    const t = now / 1000;
    const dt = last ? Math.min(0.1, t - last) : 0; last = t; simT += dt;

    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]; c.x += c.vx * dt; c.y += c.vy * dt; c.age += dt;
      if (c.age > c.life || c.x < -160 || c.y < -120) cells[i] = spawn(false);
    }
    if (simT - lastField > 0.06 || lastField < 0) { field(simT); lastField = simT; }
    if (!still && simT > nextStrike) { strike(simT); nextStrike = simT + 0.25 + rnd() * 1.6; }

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // sky
    for (const s of stars) {
      ctx.globalAlpha = (0.18 + 0.5 * (0.5 + 0.5 * Math.sin(s.p + simT * s.s))) * (0.25 + 0.75 * edge(s.x, s.y));
      ctx.fillStyle = '#c9d8ff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // radar: soft glow pass, then the crisp field
    ctx.imageSmoothingEnabled = true;
    ctx.save(); ctx.filter = 'blur(5px)'; ctx.globalAlpha = 0.3; ctx.drawImage(off, 0, 0, W, H); ctx.restore();
    ctx.drawImage(off, 0, 0, W, H);

    // lightning flashes + crawlers
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i], a = boltA(b, simT) * edge(b.x, b.y);
      if (a <= 0 && simT - b.t0 > b.dur) { bolts.splice(i, 1); continue; }
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 90);
      g.addColorStop(0, 'rgba(210,220,255,' + 0.45 * a + ')'); g.addColorStop(1, 'rgba(210,220,255,0)');
      ctx.fillStyle = g; ctx.fillRect(b.x - 90, b.y - 90, 180, 180);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const pass of [[5, 0.22], [2.2, 0.55], [1, 1]]) {
        ctx.strokeStyle = pass[0] > 2 ? 'rgba(150,180,255,' + pass[1] * a + ')' : 'rgba(255,250,235,' + pass[1] * a + ')';
        for (let d = 0; d < 4; d++) {
          ctx.lineWidth = pass[0] / (1 + d * 0.6); ctx.beginPath();
          for (const s of b.segs) if (s[4] === d) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); }
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // route: base line, hazard-tinted lit segments, stars
    const wave = still ? 1e9 : (simT % CYCLE);
    const litAt = i => {                   // 0..1 brightness of route point i
      if (still) return 0.8;
      const ti = cum[i] / RL * TRAVEL, e = wave - ti;
      if (e < 0) return 0.25 * Math.max(0, 1 - (wave + CYCLE - ti - 5.6) / 1.4) ; // tail of the previous pass
      if (e < 0.25) return 0.3 + 0.7 * e / 0.25;
      if (e < 5.6) return 1 - 0.25 * (e - 0.25) / 5.35;
      return Math.max(0.2, 0.75 - (e - 5.6) / 1.4 * 0.55);
    };
    const routePath = () => { ctx.beginPath(); ROUTE.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(4,6,12,.55)'; ctx.lineWidth = 9; routePath(); ctx.stroke();      // soft dark halo
    ctx.strokeStyle = 'rgba(4,6,12,.85)'; ctx.lineWidth = 5; routePath(); ctx.stroke();      // casing
    ctx.strokeStyle = 'rgba(190,215,255,.55)'; ctx.lineWidth = 1.6; routePath(); ctx.stroke(); // always-visible core
    const hz = [];
    for (let i = 0; i < ROUTE.length - 1; i++) {
      const [x1, y1] = ROUTE[i], [x2, y2] = ROUTE[i + 1];
      let zmax = 0; for (let k = 0; k <= 6; k++) zmax = Math.max(zmax, zAt(x1 + (x2 - x1) * k / 6, y1 + (y2 - y1) * k / 6));
      hz.push(zmax);
      const a = Math.min(litAt(i), litAt(i + 1));
      const col = zmax >= 50 ? '255,80,70' : zmax >= 40 ? '255,190,60' : '156,194,255';
      ctx.strokeStyle = 'rgba(' + col + ',' + (0.45 + 0.55 * a) + ')'; ctx.lineWidth = zmax >= 40 ? 3 : 2.4;
      ctx.shadowColor = 'rgba(' + col + ',.95)'; ctx.shadowBlur = 4 + 10 * a;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ROUTE.forEach((p, i) => {
      const a = litAt(i), end = i === 0 || i === ROUTE.length - 1;
      const z = Math.max(hz[i - 1] || 0, hz[i] || 0);
      const col = z >= 50 ? '255,90,80' : z >= 40 ? '255,195,70' : '96,150,255';
      const flare = !still && (wave - cum[i] / RL * TRAVEL) >= 0 && (wave - cum[i] / RL * TRAVEL) < 0.35 ? 1 - (wave - cum[i] / RL * TRAVEL) / 0.35 : 0;
      const r = (end ? 5 : 3) * (1 + 0.7 * flare);
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 5);
      g.addColorStop(0, 'rgba(' + col + ',' + 0.7 * a + ')'); g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], r * 5, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 0.7 + 0.3 * a;
      ctx.fillStyle = 'rgba(4,6,12,.9)'; ctx.beginPath(); ctx.arc(p[0], p[1], r + 2.2, 0, 6.283); ctx.fill();
      if (end) { ctx.fillStyle = '#05070d'; ctx.strokeStyle = '#eaf2ff'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.283); ctx.fill(); ctx.stroke(); }
      else { ctx.fillStyle = '#f2f7ff'; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.283); ctx.fill(); }
      if (!end && z >= 40) {               // storm on the route: a slow warning ring
        const ph = (simT * 0.8 + i * 0.3) % 1;
        ctx.globalAlpha = (1 - ph) * 0.8; ctx.strokeStyle = 'rgb(' + col + ')'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p[0], p[1], 4 + ph * 12, 0, 6.283); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
    // travelling spark at the head of the wave
    if (!still && wave < TRAVEL) {
      const d = wave / TRAVEL * RL; let k = 1; while (k < cum.length - 1 && cum[k] < d) k++;
      const f = (d - cum[k - 1]) / (cum[k] - cum[k - 1]);
      const sx = ROUTE[k - 1][0] + (ROUTE[k][0] - ROUTE[k - 1][0]) * f, sy = ROUTE[k - 1][1] + (ROUTE[k][1] - ROUTE[k - 1][1]) * f;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 14);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(170,205,255,.7)'); g.addColorStop(1, 'rgba(120,170,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 14, 0, 6.283); ctx.fill();
    }
    ctx.fillStyle = '#8a98b8'; ctx.font = '500 11px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText('DEP', ROUTE[0][0], ROUTE[0][1] + 24); ctx.fillText('ARR', ROUTE[ROUTE.length - 1][0], ROUTE[ROUTE.length - 1][1] + 24);

    if (!still && visible) requestAnimationFrame(frame); else running = false;
  }

  let visible = true, running = false;
  const go = () => { if (!running) { running = true; last = 0; requestAnimationFrame(frame); } };
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) go(); }).observe(cv);
  if (still) { simT = 40; for (const c of cells) c.age = c.life * 0.4; requestAnimationFrame(frame); } else go();
  window.__flightFxDiag = () => ({ cells: cells.length, live: cells.filter(c => inten(c) > 0.03).length, bolts: bolts.length, maxDbz: Math.max(...dbz), t: +simT.toFixed(1) });
})();
