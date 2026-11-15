/* Sounding lab: the numbers. Everything in a full SPC-style sounding display, computed in plain code from one balloon
 * profile (P.snd.lev = [p, zAGL, T, Td], P.wnd = raw winds [zAGL m, u kt, v kt]). No models, no database.
 * window.HodoCalc.compute(P) -> L. Winds are kt (u east, v north); physics runs in m/s. */
(function () {
  'use strict';
  const KT = 0.514444, G = 9.80665;
  const es = (t) => 6.112 * Math.exp(17.67 * t / (t + 243.5));
  const mixr = (td, p) => { const e = es(td); return 0.622 * e / (p - e); };
  const tdFromR = (r, p) => { const e = r * p / (0.622 + r); const l = Math.log(e / 6.112); return 243.5 * l / (17.67 - l); };
  const theta = (t, p) => (t + 273.15) * Math.pow(1000 / p, 0.2854);
  const thetaE = (t, td, p) => {
    const tk = t + 273.15, tdk = td + 273.15;
    const tl = 1 / (1 / (tdk - 56) + Math.log(tk / tdk) / 800) + 56;
    const r = mixr(td, p) * 1000;
    return tk * Math.pow(1000 / p, 0.2854 * (1 - 0.00028 * r)) * Math.exp((3.376 / tl - 0.00254) * r * (1 + 0.00081 * r));
  };
  function moistStep(p, t, pEnd) {          // saturated parcel p,t(C) -> pEnd (either direction)
    const dir = pEnd < p ? -1 : 1;
    while (Math.abs(pEnd - p) > 1e-6) {
      const dp = dir * Math.min(5, Math.abs(pEnd - p));
      const tk = t + 273.15, e = es(t), rs = 0.622 * e / (p - e);
      const num = 287.04 * tk + 2.5e6 * rs, den = 1004 + (2.5e6 * 2.5e6 * rs * 0.622) / (287.04 * tk * tk);
      t += (num / den) * (dp / p); p += dp;
    }
    return t;
  }
  function wetbulb(t, td, p) {
    if (td >= t) return t;
    let lo = td - 1, hi = t;
    for (let i = 0; i < 40; i++) {
      const tw = (lo + hi) / 2, e = es(tw) - 6.6e-4 * (1 + 0.00115 * tw) * p * (t - tw);
      const ea = es(td);
      if (e > ea) hi = tw; else lo = tw;
    }
    return (lo + hi) / 2;
  }

  // ---------------------------------------------------------------- environment from the levels
  function makeEnv(lev) {                   // lev: [{p,z,te,td}] descending p
    const n = lev.length;
    const at = (p, key) => {
      if (p >= lev[0].p) return lev[0][key];
      for (let i = 1; i < n; i++) {
        if (lev[i].p <= p) {
          const a = lev[i - 1], b = lev[i];
          if (a[key] == null || b[key] == null) return b.p === p ? b[key] : (Math.abs(a.p - p) < Math.abs(b.p - p) ? a[key] : b[key]);
          const w = (Math.log(a.p) - Math.log(p)) / (Math.log(a.p) - Math.log(b.p));
          return a[key] + w * (b[key] - a[key]);
        }
      }
      return lev[n - 1][key];
    };
    const pOfZ = (z) => {
      if (z <= lev[0].z) return lev[0].p;
      for (let i = 1; i < n; i++) {
        if (lev[i].z >= z) {
          const a = lev[i - 1], b = lev[i], w = (z - a.z) / (b.z - a.z);
          return Math.exp(Math.log(a.p) + w * (Math.log(b.p) - Math.log(a.p)));
        }
      }
      return lev[n - 1].p;
    };
    const tAtZ = (z) => at(pOfZ(z), 'te');
    return { lev: lev, te: (p) => at(p, 'te'), td: (p) => at(p, 'td'), z: (p) => at(p, 'z'), pOfZ: pOfZ, tAtZ: tAtZ, p0: lev[0].p, z0: lev[0].z, top: lev[n - 1].p };
  }

  // ---------------------------------------------------------------- parcel lift
  function lift(E, p0, t0, td0, label) {
    td0 = Math.min(td0, t0);
    const tk = t0 + 273.15, tdk = td0 + 273.15;
    const tl = 1 / (1 / (tdk - 56) + Math.log(tk / tdk) / 800) + 56;
    const plcl = p0 * Math.pow(tl / tk, 3.5);
    const r0 = mixr(td0, p0), th = tk * Math.pow(1000 / p0, 0.2854);
    const zStart = E.z(p0);
    const grid = [];
    let pp = plcl, tt = tl - 273.15, started = false;
    const ptop = Math.max(E.top, 100);
    for (let p = p0; p >= ptop - 1e-6; p -= 5) {
      let tp, rp;
      if (p >= plcl) { tp = th * Math.pow(p / 1000, 0.2854) - 273.15; rp = r0; }
      else {
        if (!started) { pp = plcl; tt = tl - 273.15; started = true; }
        tt = moistStep(pp, tt, p); pp = p; tp = tt; rp = mixr(tp, p);
      }
      const te = E.te(p), tdE = E.td(p), z = E.z(p) - E.z0;
      const re = tdE == null ? 0 : mixr(Math.min(tdE, te), p);
      const tvp = (tp + 273.15) * (1 + 0.61 * rp), tve = (te + 273.15) * (1 + 0.61 * re);
      grid.push({ p: p, z: z, tp: tp, te: te, b: G * (tvp - tve) / tve });
    }
    let cape = 0, cin = 0, c3 = 0, lfc = null, el = null, seen = false;
    const cross = (a, b) => { const w = (0 - a.b) / (b.b - a.b); return { z: a.z + w * (b.z - a.z), p: Math.exp(Math.log(a.p) + w * (Math.log(b.p) - Math.log(a.p))) }; };
    const zl = E.z(plcl) - E.z0;
    for (let i = 1; i < grid.length; i++) {
      const a = grid[i - 1], b = grid[i], dz = b.z - a.z, bb = 0.5 * (a.b + b.b);
      const above = b.p <= plcl;
      if (above && bb > 0) {
        if (!seen) { seen = true; lfc = a.p > plcl ? { z: zl, p: plcl } : (a.b <= 0 ? cross(a, b) : { z: a.z, p: a.p }); }
        cape += bb * dz; if (b.z <= 3000) c3 += bb * dz;
        el = b.b <= 0 || i === grid.length - 1 ? (i === grid.length - 1 && b.b > 0 ? { z: b.z, p: b.p } : null) : null;
      } else if (above && bb <= 0 && seen) {
        if (!el || el.z < a.z) el = a.b > 0 ? cross(a, b) : el;
      } else if (!seen && bb <= 0 && b.z <= 6000) cin += bb * dz;
    }
    if (seen) {   // EL = last positive crossing
      let last = -1;
      for (let i = 0; i < grid.length; i++) if (grid[i].z >= lfc.z - 1 && grid[i].b > 0) last = i;
      if (last >= 0) el = last < grid.length - 1 ? cross(grid[last], grid[last + 1]) : { z: grid[last].z, p: grid[last].p };
    }
    let li = null;
    { const g5 = grid.find((q) => Math.abs(q.p - 500) < 2.6); if (g5) li = g5.te - g5.tp; }
    return { label: label, p0: p0, t0: t0, td0: td0, z0: zStart - E.z0, cape: Math.round(cape), cin: Math.round(Math.max(cin, -999)), c3: Math.round(c3),
      lcl: Math.max(0, Math.round(zl)), plcl: plcl, lfc: lfc, el: el, li: li, grid: grid, r0: r0 * 1000 };
  }

  function mixedParcel(E) {
    const p0 = E.p0; let th = 0, r = 0, n = 0;
    for (let p = p0; p >= p0 - 100; p -= 5) {
      const t = E.te(p), td = E.td(p);
      if (td == null) continue;
      th += theta(t, p); r += mixr(Math.min(td, t), p); n++;
    }
    if (!n) return null;
    th /= n; r /= n;
    const t = th * Math.pow(p0 / 1000, 0.2854) - 273.15;
    return lift(E, p0, t, Math.min(tdFromR(r, p0), t), 'ML');
  }
  function mostUnstable(E) {
    const p0 = E.p0; let best = null;
    for (let p = p0; p >= p0 - 300; p -= 5) {
      const t = E.te(p), td = E.td(p);
      if (td == null) continue;
      const te = thetaE(t, Math.min(td, t), p);
      if (!best || te > best.te) best = { te: te, p: p, t: t, td: Math.min(td, t) };
    }
    if (!best) return null;
    let r = lift(E, best.p, best.t, best.td, 'MU');
    if (r.cape < 1) {   // nothing above is buoyant: report the best parcel we can find instead of a dead one
      let alt = null;
      for (let p = p0; p >= p0 - 300; p -= 25) {
        const t = E.te(p), td = E.td(p); if (td == null) continue;
        const q = lift(E, p, t, Math.min(td, t), 'MU');
        if (!alt || q.cape > alt.cape || (q.cape === alt.cape && q.cin > alt.cin)) alt = q;
      }
      if (alt) r = alt;
    }
    return Object.assign(r, { thetaE: best.te });
  }

  // ---------------------------------------------------------------- winds
  function windKit(wnd) {
    const zs = wnd.map((q) => q[0]), us = wnd.map((q) => q[1]), vs = wnd.map((q) => q[2]);
    const lerp = (arr, z) => {
      if (z <= zs[0]) return arr[0];
      if (z >= zs[zs.length - 1]) return arr[arr.length - 1];
      let lo = 0, hi = zs.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (zs[m] <= z) lo = m; else hi = m; }
      return arr[lo] + (z - zs[lo]) / (zs[hi] - zs[lo]) * (arr[hi] - arr[lo]);
    };
    const top = Math.min(zs[zs.length - 1], 12000);
    const GU = [], GV = [];
    for (let z = 0; z <= top; z += 100) { GU.push(lerp(us, z)); GV.push(lerp(vs, z)); }
    const at = (z) => [lerp(us, z), lerp(vs, z)];
    const mean = (a, b) => {
      b = Math.min(b, top); const i = Math.round(a / 100), j = Math.round(b / 100); let su = 0, sv = 0, n = 0;
      for (let k = i; k <= j; k++) { su += GU[k]; sv += GV[k]; n++; }
      return [su / n, sv / n];
    };
    const srh = (a, b, c) => {          // c = storm motion (kt) ; result m2/s2
      b = Math.min(b, top); const i = Math.round(a / 100), j = Math.round(b / 100); let tot = 0;
      for (let k = i; k < j; k++) {
        const u1 = GU[k] * KT, v1 = GV[k] * KT, u2 = GU[k + 1] * KT, v2 = GV[k + 1] * KT;
        tot += (u2 - c[0] * KT) * (v1 - c[1] * KT) - (u1 - c[0] * KT) * (v2 - c[1] * KT);
      }
      return tot;
    };
    const shear = (a, b) => { const p = at(a), q = at(Math.min(b, top)); return [q[0] - p[0], q[1] - p[1]]; };
    return { at: at, mean: mean, srh: srh, shear: shear, top: top, zs: zs, us: us, vs: vs, GU: GU, GV: GV };
  }
  const spdOf = (w) => Math.hypot(w[0], w[1]);
  const dirFrom = (w) => (Math.atan2(-w[0], -w[1]) * 180 / Math.PI + 360) % 360;

  // ---------------------------------------------------------------- the lot
  function compute(P) {
    const S = P.snd;
    if (!S || !P.wnd || !P.wnd.length) return null;
    const lev = S.lev.map((q) => ({ p: q[0], z: q[1], te: q[2], td: q[3] }));
    const E = makeEnv(lev), W = windKit(P.wnd);
    const L = { E: E, W: W, lat: P.station && P.station.lat != null ? P.station.lat : 38 };
    const sT = lev[0].te, sTd = lev[0].td == null ? lev[0].te - 10 : lev[0].td;
    L.sb = lift(E, E.p0, sT, sTd, 'SFC');
    L.ml = mixedParcel(E);
    L.mu = mostUnstable(E);
    L.parcels = { sb: L.sb, ml: L.ml, mu: L.mu };

    // wet bulb profile + zero levels
    L.tw = lev.map((q) => ({ p: q.p, z: q.z, t: q.td == null ? null : wetbulb(q.te, Math.min(q.td, q.te), q.p) }));
    const zeroAt = (arr, key) => {
      for (let i = 1; i < arr.length; i++) {
        const a = arr[i - 1], b = arr[i], va = key(a), vb = key(b);
        if (va == null || vb == null) continue;
        if (va > 0 && vb <= 0) { const w = va / (va - vb); return { z: a.z + w * (b.z - a.z), p: Math.exp(Math.log(a.p) + w * (Math.log(b.p) - Math.log(a.p))) }; }
      }
      return null;
    };
    L.fzl = sT > 0 ? zeroAt(lev, (q) => q.te) : null;
    L.wbz = zeroAt(L.tw, (q) => q.t);
    const m10 = zeroAt(lev, (q) => q.te + 10), m30 = zeroAt(lev, (q) => q.te + 30);
    L.hail = { m10: m10, m30: m30 };

    // moisture
    let pw = 0;
    for (let i = 1; i < lev.length; i++) {
      const a = lev[i - 1], b = lev[i];
      if (a.td == null || b.td == null || b.p < 300) continue;
      const ra = mixr(Math.min(a.td, a.te), a.p), rb = mixr(Math.min(b.td, b.te), b.p);
      pw += 0.5 * (ra + rb) * (a.p - b.p) * 100 / G;
    }
    L.pw = pw / 25.4;
    const tAt = (p) => E.te(p), tdAt = (p) => E.td(p);
    L.k = (E.p0 >= 850 && tdAt(850) != null && tdAt(700) != null) ? (tAt(850) - tAt(500) + tdAt(850) - (tAt(700) - tdAt(700))) : null;
    // lapse rates (C/km)
    const lr = (z1, z2) => (E.tAtZ(z1) - E.tAtZ(z2)) / ((z2 - z1) / 1000);
    const zp = (p) => E.z(p) - E.z0;
    L.lr = { s3: lr(0, 3000), m36: lr(3000, 6000), p85: E.p0 >= 850 ? (E.te(850) - E.te(500)) / ((zp(500) - zp(850)) / 1000) : null, p75: (E.te(700) - E.te(500)) / ((zp(500) - zp(700)) / 1000) };
    // theta-e profile, TEI
    L.te = lev.filter((q) => q.td != null).map((q) => ({ p: q.p, z: q.z, v: thetaE(q.te, Math.min(q.td, q.te), q.p) }));
    if (L.te.length > 4) {
      const low = L.te.filter((q) => q.p >= E.p0 - 300 && q.z <= 4000);
      L.tei = Math.max.apply(null, low.map((q) => q.v)) - Math.min.apply(null, low.map((q) => q.v));
    }
    // DCAPE: coldest-theta-e level in the lowest 400 hPa, descend saturated
    L.dcape = null;
    {
      let best = null;
      for (let p = E.p0; p >= E.p0 - 400 && p >= 300; p -= 5) {
        const t = E.te(p), td = E.td(p); if (td == null) continue;
        const v = thetaE(t, Math.min(td, t), p);
        if (!best || v < best.v) best = { v: v, p: p, t: t, td: Math.min(td, t) };
      }
      if (best) {
        let tp = wetbulb(best.t, best.td, best.p), pp = best.p, sum = 0, zPrev = E.z(best.p), buoyPrev = null;
        for (let p = best.p + 5; p <= E.p0 + 1e-6; p += 5) {
          const pc = Math.min(p, E.p0);
          tp = moistStep(pp, tp, pc); pp = pc;
          const te = E.te(pc), td = E.td(pc), z = E.z(pc);
          const re = td == null ? 0 : mixr(Math.min(td, te), pc);
          const tvp = (tp + 273.15) * (1 + 0.61 * mixr(tp, pc)), tve = (te + 273.15) * (1 + 0.61 * re);
          const b = G * (tve - tvp) / tve;
          if (buoyPrev != null) sum += 0.5 * (b + buoyPrev) * (zPrev - z);
          buoyPrev = b; zPrev = z;
        }
        L.dcape = Math.max(0, Math.round(sum));
      }
    }
    // convective temperature + max temperature
    {
      const r0 = (L.ml ? L.ml.r0 / 1000 : mixr(Math.min(sTd, sT), E.p0));
      let ccl = null;
      for (let i = 1; i < lev.length && lev[i].p > 500; i++) {
        const a = lev[i - 1], b = lev[i];
        const da = a.te - tdFromR(r0, a.p), db = b.te - tdFromR(r0, b.p);
        if (da > 0 && db <= 0) { const w = da / (da - db); ccl = { p: Math.exp(Math.log(a.p) + w * (Math.log(b.p) - Math.log(a.p))), t: a.te + w * (b.te - a.te) }; break; }
      }
      L.convT = ccl ? (ccl.t + 273.15) * Math.pow(E.p0 / ccl.p, 0.2854) - 273.15 : null;
      const pm = E.p0 >= 870 ? 850 : E.p0 - 100;
      L.maxT = (E.te(pm) + 273.15) * Math.pow(E.p0 / pm, 0.2854) - 273.15;
    }
    L.ncape = L.sb.cape > 0 && L.sb.lfc && L.sb.el ? L.sb.cape / Math.max(1, L.sb.el.z - L.sb.lfc.z) : 0;

    // storm motion + kinematics
    L.rm = P.rm; L.lm = P.lm; L.mean06 = W.mean(0, 6000);
    L.srhFx = {
      s1: W.srh(0, 1000, P.rm), s3: W.srh(0, 3000, P.rm), s1L: W.srh(0, 1000, P.lm), s3L: W.srh(0, 3000, P.lm),
    };
    const lay = (a, b) => {
      const sh = W.shear(a, b), mn = W.mean(a, b), sr = [mn[0] - P.rm[0], mn[1] - P.rm[1]];
      return { a: a, b: b, shear: spdOf(sh), shearV: sh, mean: mn, sr: sr, srh: W.srh(a, b, P.rm) };
    };
    L.layers = [lay(0, 1000), lay(0, 3000), lay(0, 6000), lay(0, 8000)];
    L.l46 = lay(4000, 6000);
    const ref = L.sb.el ? L.sb : (L.mu && L.mu.el ? L.mu : null);
    L.cloud = ref ? lay(Math.max(0, ref.lcl), Math.min(ref.el.z, W.top)) : null;
    // BRN shear
    const m6 = W.mean(0, 6000), m05 = W.mean(0, 500);
    L.brn = 0.5 * (Math.pow((m6[0] - m05[0]) * KT, 2) + Math.pow((m6[1] - m05[1]) * KT, 2));
    // Corfidi vectors (cloud layer 850-300 hPa mean wind, low-level jet 0-1.5 km max)
    {
      const z850 = Math.max(0, E.p0 >= 850 ? zp(850) : 0), z300 = Math.min(W.top, zp(300));
      const cl = W.mean(z850, z300);
      let jet = W.at(0), js = -1;
      for (let z = 0; z <= 1500; z += 100) { const w = W.at(z); if (spdOf(w) > js) { js = spdOf(w); jet = w; } }
      const up = [cl[0] - jet[0], cl[1] - jet[1]];
      L.corfidi = { up: up, down: [cl[0] + up[0], cl[1] + up[1]], cl: cl, jet: jet };
    }
    // effective inflow layer (parcels from each level: CAPE >= 100 and CIN > -250)
    {
      let base = null, topz = null;
      for (let i = 0; i < lev.length; i++) {
        const q = lev[i];
        if (q.z > 4000 || q.td == null) { if (base != null) break; continue; }
        const r = lift(E, q.p, q.te, Math.min(q.td, q.te), 'x');
        const ok = r.cape >= 100 && r.cin > -250;
        if (ok) { if (base == null) base = q; topz = q; } else if (base != null) break;
      }
      L.eff = base ? { bot: base.z, top: topz.z, pbot: base.p, ptop: topz.p } : null;
      if (L.eff && L.mu && L.mu.el) {
        const half = L.eff.bot + 0.5 * Math.max(0, L.mu.el.z - L.eff.bot);
        L.eff.esrh = W.srh(L.eff.bot, Math.max(L.eff.top, L.eff.bot + 100), P.rm);
        L.eff.ebwd = spdOf(W.shear(L.eff.bot, half)) * KT;      // m/s
        L.eff.half = half;
      }
    }
    // composite numbers
    const ml = L.ml;
    if (L.eff && L.eff.esrh != null && ml) {
      const lclT = ml.lcl < 1000 ? 1 : ml.lcl > 2000 ? 0 : (2000 - ml.lcl) / 1000;
      const bw = L.eff.ebwd < 12.5 ? 0 : Math.min(L.eff.ebwd, 30) / 20;
      const cinT = ml.cin > -50 ? 1 : ml.cin < -200 ? 0 : (200 + ml.cin) / 150;
      L.stpEff = (ml.cape / 1500) * lclT * (Math.max(0, L.eff.esrh) / 150) * bw * cinT;
    } else L.stpEff = 0;
    L.stpFix = P.stp == null ? 0 : P.stp;
    if (L.eff && L.eff.esrh != null && L.mu) {
      const cinT = L.mu.cin > -40 ? 1 : -40 / L.mu.cin;
      L.scp = (L.mu.cape / 1000) * (Math.max(0, L.eff.esrh) / 50) * Math.min(Math.max(L.eff.ebwd, 0) / 20, 1.5) * (L.eff.ebwd < 10 ? 0 : 1) * cinT;
    } else L.scp = 0;
    if (L.mu && L.mu.cape > 0) {
      const mr = L.mu.r0, t500 = Math.min(E.te(500), -5.5), s06 = Math.min(Math.max(spdOf(W.shear(0, 6000)) * KT, 7), 27);
      let ship = (L.mu.cape * mr * L.lr.p75 * (-t500) * s06) / 42000000;
      if (L.mu.cape < 1300) ship *= L.mu.cape / 1300;
      if (L.lr.p75 < 5.8) ship *= L.lr.p75 / 5.8;
      const fz = L.fzl ? L.fzl.z : 0; if (fz < 2400) ship *= fz / 2400;
      L.ship = Math.max(0, ship);
    } else L.ship = 0;

    // precipitation type (surface-based guess from the temperature profile)
    {
      const warmAloft = Math.max.apply(null, lev.filter((q) => q.z > 100 && q.p >= 600).map((q) => q.te).concat([-99]));
      let ty;
      if (sT >= 3) ty = 'Rain';
      else if (sT >= 0.5) ty = warmAloft > 0.5 ? 'Rain, or a rain and sleet mix' : 'Rain and snow mix';
      else if (warmAloft > 0.5) ty = sT <= -0.5 ? 'Freezing rain or sleet' : 'Rain, sleet or freezing rain';
      else ty = 'Snow';
      L.ptype = ty;
    }
    // hodograph inferred temperature advection (thermal wind), per 1 km layer, C/hr
    {
      const f = 2 * 7.292e-5 * Math.sin(L.lat * Math.PI / 180), out = [];
      for (let z = 0; z < 10000 && z + 1000 <= W.top; z += 1000) {
        const a = W.at(z), b = W.at(z + 1000), mid = W.at(z + 500);
        const Su = (b[0] - a[0]) * KT / 1000, Sv = (b[1] - a[1]) * KT / 1000, u = mid[0] * KT, v = mid[1] * KT;
        const T = E.tAtZ(z + 500) + 273.15;
        out.push({ z0: z, z1: z + 1000, v: -(f * T / G) * (u * Sv - v * Su) * 3600 });
      }
      L.adv = out;
    }
    // storm-relative wind speed by height
    L.sr = []; for (let z = 0; z <= W.top; z += 250) { const w = W.at(z); L.sr.push([z, Math.hypot(w[0] - P.rm[0], w[1] - P.rm[1])]); }
    return L;
  }
  window.HodoCalc = { compute: compute, thetaE: thetaE, theta: theta, es: es, mixr: mixr, moistStep: moistStep, wetbulb: wetbulb, dirFrom: dirFrom, spdOf: spdOf };
})();
