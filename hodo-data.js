/* Hodograph data: NWS balloon soundings (public domain) via the Iowa State Mesonet, analysed in the browser.
   No server of ours is involved. HodoData.overview(cycle?) / profile(station, cycle) / cycles(n). Winds in knots,
   heights in metres above ground. Analysis: Bunkers storm motion, SRH, bulk shear, surface-parcel CAPE, fixed-layer STP. */
(function () {
  'use strict';
  const IEM = 'https://mesonet.agron.iastate.edu';
  const KT = 0.514444;
  const es = (tc) => 6.112 * Math.exp(17.67 * tc / (tc + 243.5));
  const uv = (d, s) => { const r = d * Math.PI / 180; return [-s * Math.sin(r), -s * Math.cos(r)]; };
  const R = (x) => Math.round(x);
  const R1 = (x) => Math.round(x * 10) / 10;

  function interp(zs, vs, z) {
    if (z <= zs[0]) return vs[0];
    if (z >= zs[zs.length - 1]) return vs[vs.length - 1];
    let lo = 0, hi = zs.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (zs[m] <= z) lo = m; else hi = m; }
    return vs[lo] + (z - zs[lo]) / (zs[hi] - zs[lo]) * (vs[hi] - vs[lo]);
  }
  function moistT(pStart, tStart, pEnd) {
    let p = pStart, t = tStart;
    const step = pEnd < pStart ? -5 : 5;
    const n = Math.floor(Math.abs(pEnd - pStart) / 5) + 1;
    for (let i = 0; i < n; i++) {
      const dp = Math.abs(pEnd - p) > 5 ? step : (pEnd - p);
      const tk = t + 273.15, e = es(t), rs = 0.622 * e / (p - e);
      const num = 287.04 * tk + 2.5e6 * rs;
      const den = 1004 + (2.5e6 * 2.5e6 * rs * 0.622) / (287.04 * tk * tk);
      t += (num / den) * (dp / p); p += dp;
      if (Math.abs(p - pEnd) < 1e-6) break;
    }
    return t;
  }
  function cape(levels) {
    const L = levels.filter((l) => l.tmpc != null && l.dwpc != null && l.pres && l.hght != null);
    if (L.length < 8) return null;
    L.sort((a, b) => b.pres - a.pres);
    const s = L[0];
    const p0 = s.pres, t0 = s.tmpc, z0 = s.hght;
    const td0 = Math.min(s.dwpc, t0);
    const tk = t0 + 273.15, tdk = td0 + 273.15;
    const tl = 1 / (1 / (tdk - 56) + Math.log(tk / tdk) / 800) + 56;
    const plcl = p0 * Math.pow(tl / tk, 3.5);
    const zlcl = 125 * (t0 - td0);
    const r0 = 0.622 * es(td0) / (p0 - es(td0));
    const th = tk * Math.pow(1000 / p0, 0.2854);
    let cp = 0, cin = 0, prev = null, lfc = false;
    const par = [];
    for (const l of L) {
      const p = l.pres, z = l.hght;
      if (p > p0 || p < 100) continue;
      let tp, rp;
      if (p >= plcl) { tp = th * Math.pow(p / 1000, 0.2854) - 273.15; rp = r0; }
      else { tp = moistT(plcl, tl - 273.15, p); rp = 0.622 * es(tp) / (p - es(tp)); }
      const te = l.tmpc, tde = l.dwpc != null ? l.dwpc : te - 15;
      const re = 0.622 * es(Math.min(tde, te)) / (p - es(Math.min(tde, te)));
      const tvp = (tp + 273.15) * (1 + 0.61 * rp), tve = (te + 273.15) * (1 + 0.61 * re);
      const buoy = 9.80665 * (tvp - tve) / tve;
      par.push({ p: p, z: z - z0, tp: tp, te: te, td: Math.min(tde, te), b: buoy });
      if (prev) {
        const dz = z - prev[0], b = 0.5 * (buoy + prev[1]);
        if (b > 0) { cp += b * dz; lfc = true; } else if (!lfc && p >= 500) cin += b * dz;
      }
      prev = [z, buoy];
    }
    // LFC / EL by buoyancy crossings (interpolated), only meaningful when there is real CAPE
    const cross = (a, b) => { const w = (0 - a.b) / (b.b - a.b); return { z: a.z + w * (b.z - a.z), p: Math.exp(Math.log(a.p) + w * (Math.log(b.p) - Math.log(a.p))) }; };
    let lfcPt = null, elPt = null;
    if (cp >= 10) {
      const up = par.filter((q) => q.z >= zlcl - 1);
      for (let i = 0; i < up.length; i++) {
        if (up[i].b > 0) { lfcPt = i === 0 ? { z: zlcl, p: plcl } : cross(up[i - 1], up[i]); break; }
      }
      if (lfcPt) {
        let last = -1;
        for (let i = 0; i < up.length; i++) if (up[i].z >= lfcPt.z && up[i].b > 0) last = i;
        if (last >= 0) elPt = last < up.length - 1 ? cross(up[last], up[last + 1]) : { z: up[last].z, p: up[last].p };
      }
    }
    const ptemp = (p) => {
      if (p >= plcl) return { tp: th * Math.pow(p / 1000, 0.2854) - 273.15, rp: r0 };
      const tp = moistT(plcl, tl - 273.15, p);
      return { tp: tp, rp: 0.622 * es(tp) / (p - es(tp)) };
    };
    return { cape: R(cp), cin: R(cin), lcl: R(zlcl), sfcT: t0, sfcTd: td0, sfcP: p0, plcl: plcl, par: par, lfc: lfcPt, el: elPt, ptemp: ptemp };
  }

  // level where the temperature profile crosses a value (first crossing going up)
  function crossT(L, target) {
    for (let i = 1; i < L.length; i++) {
      const a = L[i - 1], b = L[i];
      if ((a.te - target) * (b.te - target) <= 0 && a.te !== b.te) {
        const w = (target - a.te) / (b.te - a.te);
        return { z: Math.round(a.z + w * (b.z - a.z)), p: Math.exp(Math.log(a.p) + w * (Math.log(b.p) - Math.log(a.p))) };
      }
    }
    return null;
  }
  function sounding(lv, cp, zsfc) {
    const L = lv.filter((l) => l.tmpc != null && l.pres && l.hght != null && l.pres >= 100).sort((a, b) => b.pres - a.pres);
    if (L.length < 8) return null;
    const lev = L.map((l) => ({ p: l.pres, z: l.hght - zsfc, te: l.tmpc, td: l.dwpc != null ? Math.min(l.dwpc, l.tmpc) : null }));
    const sfc0 = lev[0].te;
    const frz = sfc0 > 0 ? crossT(lev, 0) : null;
    const m20 = crossT(lev, -20);
    // regular 10 hPa grid: environment, parcel and buoyancy (drives the shading)
    const lerpLog = (p, key) => {
      for (let i = 1; i < lev.length; i++) {
        if (lev[i].p <= p && lev[i][key] != null && lev[i - 1][key] != null) {
          const w = (Math.log(lev[i - 1].p) - Math.log(p)) / (Math.log(lev[i - 1].p) - Math.log(lev[i].p));
          return lev[i - 1][key] + w * (lev[i][key] - lev[i - 1][key]);
        }
      }
      return null;
    };
    let grid = null, lfcG = null, elG = null;
    if (cp) {
      grid = [];
      for (let p = lev[0].p; p >= 100; p -= (p > 120 ? 10 : 5)) {
        const te = lerpLog(p, 'te'), td = lerpLog(p, 'td'), z = lerpLog(p, 'z');
        if (te == null || z == null) continue;
        const pt = cp.ptemp(p), tde = td == null ? te - 15 : Math.min(td, te);
        const re = 0.622 * es(tde) / (p - es(tde));
        const tvp = (pt.tp + 273.15) * (1 + 0.61 * pt.rp), tve = (te + 273.15) * (1 + 0.61 * re);
        grid.push({ p: p, z: z, tp: pt.tp, te: te, b: 9.80665 * (tvp - tve) / tve });
      }
      const cr = (a, b) => { const w = (0 - a.b) / (b.b - a.b); return { z: Math.round(a.z + w * (b.z - a.z)), p: R1(Math.exp(Math.log(a.p) + w * (Math.log(b.p) - Math.log(a.p)))) }; };
      if (cp.cape >= 10) {
        const up = grid.filter((q) => q.z >= cp.lcl - 1);
        for (let i = 0; i < up.length; i++) if (up[i].b > 0) { lfcG = i === 0 ? { z: cp.lcl, p: R1(cp.plcl) } : cr(up[i - 1], up[i]); break; }
        if (lfcG) {
          let last = -1;
          for (let i = 0; i < up.length; i++) if (up[i].z >= lfcG.z - 1 && up[i].b > 0) last = i;
          if (last >= 0) elG = last < up.length - 1 ? cr(up[last], up[last + 1]) : { z: Math.round(up[last].z), p: R1(up[last].p) };
        }
      }
    }
    return {
      lev: lev.map((q) => [R1(q.p), Math.round(q.z), R1(q.te), q.td == null ? null : R1(q.td)]),
      grid: grid ? grid.map((q) => [R1(q.p), Math.round(q.z), R1(q.tp), R1(q.te), Math.round(q.b * 100) / 100]) : null,
      plcl: cp ? R1(cp.plcl) : null, zlcl: cp ? cp.lcl : null,
      lfc: lfcG, el: elG,
      frz: frz ? { z: frz.z, p: R1(frz.p) } : null,
      m20: m20 ? { z: m20.z, p: R1(m20.p) } : null,
      sfcP: cp ? cp.sfcP : lev[0].p,
    };
  }

  function tier(a) {
    const s1 = a.srh1, s6 = a.sh6 * KT;
    if (a.cape == null || a.cape < 250) return 'x';
    if (s1 >= 250 && s6 >= 18) return '4';
    if (s1 >= 150 && s6 >= 15) return '3';
    if (s1 >= 100 || (a.srh3 >= 250 && s6 >= 15)) return '2';
    if (s1 >= 40 || a.srh3 >= 120 || s6 >= 15) return '1';
    return '0';
  }

  function analyse(prof) {
    const lv = prof.profile || [];
    let zsfc = null;
    for (const l of lv) if (l.hght != null && l.tmpc != null) { zsfc = l.hght; break; }
    if (zsfc == null) return null;
    const wl = lv.filter((l) => l.drct != null && l.sknt != null && l.hght != null && l.hght >= zsfc - 1).sort((a, b) => a.hght - b.hght);
    const zs = [], us = [], vs = [];
    for (const l of wl) {
      const z = l.hght - zsfc;
      if (zs.length && z <= zs[zs.length - 1]) continue;
      const w = uv(l.drct, l.sknt);
      zs.push(z); us.push(w[0]); vs.push(w[1]);
    }
    if (zs.length < 6 || zs[zs.length - 1] < 6000) return null;
    if (zs[0] > 0) { zs.unshift(0); us.unshift(us[0]); vs.unshift(vs[0]); }
    const top = Math.min(12000, Math.floor(zs[zs.length - 1] / 250) * 250);
    const H = [], G = [];
    for (let h = 0; h <= top; h += 250) H.push(h);
    for (let h = 0; h <= top; h += 100) G.push(h);
    const U = H.map((h) => interp(zs, us, h)), V = H.map((h) => interp(zs, vs, h));
    const GU = G.map((h) => interp(zs, us, h)), GV = G.map((h) => interp(zs, vs, h));
    const at = (h) => [interp(G, GU, h), interp(G, GV, h)];
    const mean = (a, b) => {
      const i = Math.floor(a / 100), j = Math.floor(b / 100), n = j - i + 1;
      let su = 0, sv = 0;
      for (let k = i; k <= j; k++) { su += GU[k]; sv += GV[k]; }
      return [su / n, sv / n];
    };
    const m6 = mean(0, 6000), lo = mean(0, 500), hi = mean(5500, 6000);
    const mu = m6[0], mv = m6[1];
    const sx = hi[0] - lo[0], sy = hi[1] - lo[1], sm = Math.hypot(sx, sy) || 1, dev = 7.5 / KT;
    const rx = mu + dev * sy / sm, ry = mv - dev * sx / sm, lx = mu - dev * sy / sm, ly = mv + dev * sx / sm;
    const srh = (topM, cx, cy) => {
      const k = Math.floor(topM / 100); let tot = 0;
      for (let i = 0; i < k; i++) {
        const u1 = GU[i] * KT, v1 = GV[i] * KT, u2 = GU[i + 1] * KT, v2 = GV[i + 1] * KT;
        tot += (u2 - cx * KT) * (v1 - cy * KT) - (u1 - cx * KT) * (v2 - cy * KT);
      }
      return tot;
    };
    const shear = (a, b) => { const p = at(a), q = at(b); return Math.hypot(q[0] - p[0], q[1] - p[1]); };
    const dirFrom = (w) => (Math.atan2(-w[0], -w[1]) * 180 / Math.PI + 360) % 360;
    const turn = (a, b) => ((dirFrom(at(b)) - dirFrom(at(a)) + 540) % 360) - 180;
    const srh1 = srh(1000, rx, ry), srh3 = srh(3000, rx, ry), l1 = srh(1000, lx, ly), l3 = srh(3000, lx, ly);
    const sh1 = shear(0, 1000), sh3 = shear(0, 3000), sh6 = shear(0, 6000), sh05 = shear(0, 500);
    const cp = cape(lv);
    let stp = null;
    if (cp) {
      const lcl = cp.lcl, lclt = lcl < 1000 ? 1 : (lcl > 2000 ? 0 : (2000 - lcl) / 1000);
      const capT = Math.min(cp.cape / 1500, 3), sh6m = sh6 * KT, sht = sh6m < 12.5 ? 0 : Math.min(sh6m, 30) / 20;
      stp = Math.round(capT * lclt * Math.max(srh1, 0) / 150 * sht * 100) / 100;
    }
    let jet = null;
    H.forEach((h, i) => { if (h >= 6000) { const s = Math.hypot(U[i], V[i]); if (!jet || s > jet[0]) jet = [s, h]; } });
    const snd = sounding(lv, cp, zsfc);
    const a = {
      valid: prof.valid, zsfc: R(zsfc), snd: snd,
      wnd: zs.map((z, i) => [Math.round(z), R1(us[i]), R1(vs[i])]).filter((q) => q[0] <= 13000),
      pts: H.map((h, i) => [h, R1(U[i]), R1(V[i])]),
      rm: [R1(rx), R1(ry)], lm: [R1(lx), R1(ly)], mean: [R1(mu), R1(mv)],
      srh1: R(srh1), srh3: R(srh3), srh1L: R(l1), srh3L: R(l3),
      sh05: R(sh05), sh1: R(sh1), sh3: R(sh3), sh6: R(sh6),
      turn1: R(turn(0, 1000)), turn3: R(turn(0, 3000)), turn6: R(turn(0, 6000)),
      sfc: [R(Math.hypot(U[0], V[0])), R(dirFrom([U[0], V[0]]))],
      jet: jet ? [R(jet[0]), R(jet[1])] : null, top: top,
      cape: cp ? cp.cape : null, cin: cp ? cp.cin : null, lcl: cp ? cp.lcl : null,
      sfcT: cp ? cp.sfcT : null, sfcTd: cp ? cp.sfcTd : null, stp: stp,
    };
    a.tier = tier(a);
    return a;
  }

  // ---- stations (IEM RAOB network, US only)
  let stP = null;
  function stations() {
    if (stP) return stP;
    stP = fetch(IEM + '/geojson/network/RAOB.geojson').then((r) => r.json()).then((j) => {
      const best = {};
      j.features.forEach((ft) => {
        const p = ft.properties;
        if (p.country !== 'US' || !p.online) return;
        let sid = ft.id.replace(/^_+/, '');
        if (sid.length === 4 && sid[0] === 'K') sid = sid.slice(1);
        const toks = p.sname.split('--').pop().split(/\s+/).filter((t) => t.length === 4);
        let icao = toks.find((t) => t.endsWith(sid));
        if (!icao) icao = (sid.length === 4 && 'KPTM'.indexOf(sid[0]) >= 0) ? sid : 'K' + sid;
        let name = p.sname.split('--')[0].replace(' Area', '').trim();
        let state = p.state;
        const m = name.match(/^(.*?)\s+([A-Z]{2})\/[A-Z]{2}$/);
        if (m) { name = m[1]; state = state || m[2]; }
        const o = { id: icao, name: name, state: state, lat: ft.geometry.coordinates[1], lon: ft.geometry.coordinates[0] };
        if (!best[icao] || (o.state && !best[icao].state)) best[icao] = o;
      });
      return Object.keys(best).map((k) => best[k]).filter((o) => o.state);
    });
    stP.catch(() => { stP = null; });
    return stP;
  }

  function cycles(n) {
    n = n || 8;
    let t = new Date(Date.now() - 75 * 60000);
    t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), t.getUTCHours() >= 12 ? 12 : 0));
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(t.getUTCFullYear() + String(t.getUTCMonth() + 1).padStart(2, '0') + String(t.getUTCDate()).padStart(2, '0') + String(t.getUTCHours()).padStart(2, '0'));
      t = new Date(t.getTime() - 12 * 3600000);
    }
    return out;
  }

  const CYC = {};
  function load(cyc) {
    const old = CYC[cyc];
    const ageH = (Date.now() - Date.UTC(+cyc.slice(0, 4), +cyc.slice(4, 6) - 1, +cyc.slice(6, 8), +cyc.slice(8, 10))) / 3600000;
    if (old && (ageH >= 5 || Date.now() - old.t < 600000)) return old.p;
    const p = fetch(IEM + '/json/raob.py?ts=' + cyc + '00').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then((j) => {
      const prof = {};
      (j.profiles || []).forEach((q) => { let a = null; try { a = analyse(q); } catch (e) { a = null; if (window.HODO_DEBUG) console.error(q.station, e); } if (a) prof[q.station] = a; });
      return prof;
    });
    CYC[cyc] = { t: Date.now(), p: p };
    p.catch(() => { delete CYC[cyc]; });
    return p;
  }

  async function overview(cyc) {
    const sts = {};
    (await stations()).forEach((s) => { sts[s.id] = s; });
    const tried = cyc ? [cyc] : cycles(3);
    for (const c of tried) {
      let prof = {};
      try { prof = await load(c); } catch (e) { prof = {}; }
      if (Object.keys(prof).length >= (cyc ? 5 : 40) || c === tried[tried.length - 1]) {
        const rows = [];
        Object.keys(prof).forEach((id) => {
          const s = sts[id], a = prof[id];
          if (!s) return;
          rows.push({ id: id, name: s.name, state: s.state, lat: s.lat, lon: s.lon, tier: a.tier, srh1: a.srh1, srh3: a.srh3, sh6: a.sh6, cape: a.cape, stp: a.stp,
            pts: a.pts.filter((_, i) => i % 2 === 0) });
        });
        return { cycle: c, cycles: cycles(8), stations: rows };
      }
    }
    return { cycle: null, cycles: cycles(8), stations: [] };
  }
  async function profile(st, cyc) {
    const prof = await load(cyc), a = prof[st];
    if (!a) return null;
    const s = (await stations()).find((x) => x.id === st) || null;
    return Object.assign({ id: st, cycle: cyc, station: s }, a);
  }
  window.HodoData = { overview: overview, profile: profile, cycles: cycles };
})();
