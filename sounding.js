/* Sounding reader: a skew-T drawn from P.snd, with plain-English hover/click explanations.
 * window.HodoSnd.draw(P) -> svg markup; .info(P, H) -> {id: {title,col,sub,tip,html}}; .summary(P); .tour(P) -> ids.
 * H = helpers from hodograph.js: { feet, esc, scaleTable, facts }. ASCII only (use \u escapes). */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const C = { temp: '#ff6b5e', dew: '#3ddc84', parcel: '#ffd23f', cape: '#ffb13d', cin: '#38bdf8', frz: '#7fd4ff', lcl: '#e7eef8', lfc: '#ffb13d', el: '#b48cff' };
  const tf = (c) => Math.round(c * 9 / 5 + 32);
  const tfs = (c) => tf(c) + '°F (' + Math.round(c) + '°C)';
  const ft = (z) => (Math.round(z * 3.28084 / 100) * 100).toLocaleString('en-US');

  // geometry
  const W = 560, HT = 600, L0 = 80, T0 = 14, PW = 456, PH = 540;
  const PB = 1050, PT = 100, SK = 0.52, TMIN = -46, KX = 4.7;
  const Y = (p) => T0 + (Math.log(p) - Math.log(PT)) / (Math.log(PB) - Math.log(PT)) * PH;
  const X = (t, p) => L0 + (t - TMIN) * KX + (T0 + PH - Y(p)) * SK;
  const pt = (t, p) => X(t, p).toFixed(1) + ',' + Y(p).toFixed(1);

  function polyline(rows, iT, iP) { return rows.filter((r) => r[iT] != null).map((r) => pt(r[iT], r[iP])).join(' '); }

  function draw(P) {
    const S = P.snd;
    if (!S) return '<div class="muted small">No temperature data for this sounding.</div>';
    const lev = S.lev, grid = S.grid;
    let s = '<svg viewBox="0 0 ' + W + ' ' + HT + '" xmlns="' + NS + '" role="img" aria-label="Skew-T sounding">';
    s += '<defs><clipPath id="sclip"><rect x="' + L0 + '" y="' + T0 + '" width="' + PW + '" height="' + PH + '"/></clipPath></defs>';
    s += '<rect x="' + L0 + '" y="' + T0 + '" width="' + PW + '" height="' + PH + '" fill="#0a1017" stroke="#223148"/>';
    s += '<g clip-path="url(#sclip)">';
    // isotherms
    for (let t = -100; t <= 50; t += 10) {
      s += '<line class="sk-iso' + (t === 0 ? ' z' : '') + '" x1="' + X(t, PB).toFixed(1) + '" y1="' + Y(PB).toFixed(1) + '" x2="' + X(t, PT).toFixed(1) + '" y2="' + Y(PT).toFixed(1) + '"/>';
    }
    // pressure lines
    [1000, 900, 800, 700, 600, 500, 400, 300, 200, 150, 100].forEach((p) => {
      s += '<line class="sk-p" x1="' + L0 + '" y1="' + Y(p).toFixed(1) + '" x2="' + (L0 + PW) + '" y2="' + Y(p).toFixed(1) + '"/>';
    });
    // buoyancy shading (fuel above, cap below the take-off height)
    if (grid) {
      const lfcZ = S.lfc ? S.lfc.z : null;
      const seg = (cond) => {
        let out = '', run = [];
        const flush = () => {
          if (run.length > 1) {
            const fwd = run.map((r) => pt(r[2], r[0])), back = run.slice().reverse().map((r) => pt(r[3], r[0]));
            out += 'M' + fwd.join('L') + 'L' + back.join('L') + 'Z';
          }
          run = [];
        };
        for (let i = 0; i < grid.length; i++) {
          if (cond(grid[i])) { if (!run.length && i > 0) run.push(grid[i - 1]); run.push(grid[i]); } else { if (run.length) run.push(grid[i]); flush(); }
        }
        flush();
        return out;
      };
      const capeD = seg((r) => r[4] > 0 && (lfcZ == null || r[1] >= lfcZ - 50));
      const cinD = seg((r) => r[4] <= 0 && (lfcZ == null || r[1] < lfcZ) && r[1] > 0);
      if (cinD) s += '<g class="hg" data-id="s_cin"><path d="' + cinD + '" fill="' + C.cin + '" fill-opacity=".38" stroke="' + C.cin + '" stroke-opacity=".6"/></g>';
      if (capeD) s += '<g class="hg" data-id="s_cape"><path d="' + capeD + '" fill="' + C.cape + '" fill-opacity=".34" stroke="' + C.cape + '" stroke-opacity=".6"/></g>';
    }
    // freezing level
    if (S.frz) {
      s += '<g class="hg" data-id="s_frz"><line class="sk-frz" x1="' + L0 + '" y1="' + Y(S.frz.p).toFixed(1) + '" x2="' + (L0 + PW) + '" y2="' + Y(S.frz.p).toFixed(1) + '"/><line class="hhit" x1="' + L0 + '" y1="' + Y(S.frz.p).toFixed(1) + '" x2="' + (L0 + PW) + '" y2="' + Y(S.frz.p).toFixed(1) + '"/></g>';
    }
    // parcel
    if (grid) {
      const d = grid.map((r) => pt(r[2], r[0])).join(' ');
      s += '<g class="hg" data-id="s_parcel"><polyline class="sk-parcel" points="' + d + '"/><polyline class="hhit" points="' + d + '"/></g>';
    }
    // dew point + temperature
    const dd = polyline(lev, 3, 0), td = polyline(lev, 2, 0);
    if (dd) s += '<g class="hg" data-id="s_dew"><polyline class="sk-dew" points="' + dd + '"/><polyline class="hhit" points="' + dd + '"/></g>';
    s += '<g class="hg" data-id="s_temp"><polyline class="sk-temp" points="' + td + '"/><polyline class="hhit" points="' + td + '"/></g>';
    s += '</g>';
    // markers on the right edge of the plot
    const mk = (id, z, p, col, label) => {
      if (z == null) return '';
      const y = Y(p).toFixed(1), x = L0 + PW;
      return '<g class="hg sk-mk" data-id="' + id + '"><line x1="' + (x - 26) + '" y1="' + y + '" x2="' + x + '" y2="' + y + '" stroke="' + col + '" stroke-width="2"/><circle cx="' + (x - 26) + '" cy="' + y + '" r="4.5" fill="#0c131d" stroke="' + col + '" stroke-width="2"/>' +
        '<text x="' + (x - 33) + '" y="' + (Number(y) - 6) + '" text-anchor="end">' + label + '</text><rect class="hhit-fill" x="' + (x - 160) + '" y="' + (Number(y) - 16) + '" width="160" height="22"/></g>';
    };
    s += mk('s_el', S.el && S.el.z, S.el && S.el.p, C.el, 'Storm top');
    s += mk('s_lfc', S.lfc && S.lfc.z, S.lfc && S.lfc.p, C.lfc, 'Take-off height');
    if (S.plcl) s += mk('s_lcl', S.zlcl, S.plcl, C.lcl, 'Cloud base');

    // axes labels (pressure + height)
    const zAt = (p) => {
      for (let i = 1; i < lev.length; i++) if (lev[i][0] <= p) { const w = (Math.log(lev[i - 1][0]) - Math.log(p)) / (Math.log(lev[i - 1][0]) - Math.log(lev[i][0])); return lev[i - 1][1] + w * (lev[i][1] - lev[i - 1][1]); }
      return null;
    };
    [1000, 850, 700, 500, 300, 200].forEach((p) => {
      if (p > lev[0][0] + 1) return;
      const z = zAt(p);
      s += '<text class="hlab" x="' + (L0 - 5) + '" y="' + (Y(p) + 3).toFixed(1) + '" text-anchor="end">' + p + '</text>';
      if (z != null) s += '<text class="hlab" x="' + (L0 - 5) + '" y="' + (Y(p) + 13).toFixed(1) + '" text-anchor="end" style="fill:#47607f">' + (z < 150 ? 'ground' : (ft(z / 1000 * 1000 >= 0 ? z : 0) + ' ft')) + '</text>';
    });
    for (let t = -40; t <= 40; t += 20) {
      s += '<text class="hlab" x="' + X(t, PB).toFixed(1) + '" y="' + (T0 + PH + 14) + '" text-anchor="middle">' + tf(t) + '°F</text>';
    }
    s += '<text class="hlab" x="' + (L0 + PW / 2) + '" y="' + (HT - 4) + '" text-anchor="middle">warmer to the right, higher up the chart</text>';
    s += '</svg>';
    return s;
  }

  // ------------------------------------------------------------------ explanations
  function info(P, H) {
    const S = P.snd, I = {};
    if (!S) return I;
    const lev = S.lev, sT = lev[0][2], sD = lev[0][3];
    const cape = P.cape == null ? 0 : P.cape, cin = P.cin == null ? 0 : Math.abs(P.cin);
    const f = H.facts, tbl = H.scaleTable;
    const top = lev[lev.length - 1];
    const zAt = (p) => { for (let i = 1; i < lev.length; i++) if (lev[i][0] <= p) { const w = (Math.log(lev[i - 1][0]) - Math.log(p)) / (Math.log(lev[i - 1][0]) - Math.log(lev[i][0])); return lev[i - 1][1] + w * (lev[i][1] - lev[i - 1][1]); } return null; };
    const tAt = (p) => { for (let i = 1; i < lev.length; i++) if (lev[i][0] <= p) { const w = (Math.log(lev[i - 1][0]) - Math.log(p)) / (Math.log(lev[i - 1][0]) - Math.log(lev[i][0])); return lev[i - 1][2] + w * (lev[i][2] - lev[i - 1][2]); } return null; };
    const t500 = tAt(500);
    // average gap between temperature and dew point in the lowest 3 km
    let gsum = 0, gn = 0;
    lev.forEach((q) => { if (q[1] <= 3000 && q[3] != null) { gsum += q[2] - q[3]; gn++; } });
    const gap = gn ? gsum / gn : null;
    const dpF = sD == null ? null : tf(sD);
    const moistWord = dpF == null ? 'unknown' : dpF >= 70 ? 'very humid' : dpF >= 60 ? 'humid' : dpF >= 50 ? 'moderately moist' : dpF >= 40 ? 'fairly dry' : 'dry';

    I.s_temp = {
      title: 'Air temperature', col: C.temp, sub: 'The red line',
      tip: 'Ground ' + tfs(sT) + (t500 != null ? ', ' + tfs(t500) + ' at 18,000 ft.' : '.'),
      html: '<h4>In plain words</h4><p>The red line is how warm the air is at every height. It starts at the ground on the right (warm) and leans left as it climbs, because air gets colder with height.</p>' +
        '<h4>At this station</h4><p>It is ' + tfs(sT) + ' at the ground' + (t500 != null ? ' and ' + tfs(t500) + ' about 18,000 feet up' : '') + '.' + (S.frz ? ' It drops below freezing around ' + ft(S.frz.z) + ' feet.' : sT <= 0 ? ' The ground is already at or below freezing.' : '') + '</p>' +
        '<h4>Why it matters</h4><p>Storms are about the <b>difference</b> between this line and a rising bubble of air (the yellow dashed line). The faster the red line cools with height, the more room a storm has to grow. A red line that bends back to the right (warmer) is a warm layer, which acts like a lid on storms: the "cap".</p>',
    };
    I.s_dew = {
      title: 'Moisture (dew point)', col: C.dew, sub: 'The green line',
      tip: 'Ground dew point ' + (sD == null ? 'unknown' : tfs(sD)) + ': ' + moistWord + '.',
      html: '<h4>In plain words</h4><p>The green line is the dew point: the temperature at which the air would be full of moisture and a cloud would form. The <b>closer</b> the green line is to the red line, the more humid the air. A wide gap means dry air.</p>' +
        '<h4>At this station</h4><p>The dew point at the ground is ' + (sD == null ? 'unknown' : '<b>' + tfs(sD) + '</b>') + ', which is ' + moistWord + '.' + (gap != null ? ' On average the lowest 10,000 feet are ' + Math.round(gap * 9 / 5) + '°F drier than saturated.' : '') + '</p>' +
        (dpF == null ? '' : '<h4>How to read the number (ground dew point)</h4>' + tbl([[0, 'Under 40°F', 'Dry. Storms struggle for fuel.'], [40, '40 to 50°F', 'Fairly dry.'], [50, '50 to 60°F', 'Moderate moisture. Enough for some storms.'], [60, '60 to 70°F', 'Humid. This is classic storm fuel.'], [70, '70°F and up', 'Very humid, tropical air.']], dpF)) +
        '<h4>Why it matters</h4><p>Moisture is half of storm fuel. Warm, humid air near the ground is what rises into a storm. Dry air aloft (a wide gap high up) can also make storm winds stronger and help hail.</p>',
    };
    const capeFacts = f([[cape + ' J/kg', 'Fuel (CAPE)'], [cin ? '-' + cin + ' J/kg' : '0', 'The cap (CIN)']]);
    I.s_parcel = {
      title: 'Rising air bubble', col: C.parcel, sub: 'The yellow dashed line',
      tip: 'Where this line is right of the red line, a rising bubble of air is warmer than its surroundings and keeps rising.',
      html: '<h4>In plain words</h4><p>Imagine a bubble of air at the ground that gets pushed upward. The yellow dashed line shows how warm that bubble stays as it rises. If it is <b>warmer than the air around it</b> (to the right of the red line) it floats upward like a hot-air balloon. That is a thunderstorm updraft.</p>' +
        '<h4>At this station</h4><p>' + (cape >= 10 ? 'The bubble becomes warmer than its surroundings ' + (S.lfc ? 'above about <b>' + ft(S.lfc.z) + ' feet</b> and stays warmer' + (S.el ? ' up to about <b>' + ft(S.el.z) + ' feet</b>' : '') + '.' : 'for part of its trip.') : 'The bubble never becomes warmer than the air around it, so it would not rise on its own.') + '</p>' + capeFacts +
        '<div class="note">This assumes a bubble from the ground. Real storms can also draw air from a bit above the ground, and they need a trigger (a front, a dry line or heating) to lift the bubble in the first place.</div>',
    };
    I.s_cape = {
      title: 'Storm fuel (CAPE)', col: C.cape, sub: 'The orange shaded area',
      tip: cape + ' J/kg of fuel. A bigger orange area means a stronger updraft.',
      html: '<h4>In plain words</h4><p>The orange area sits between the red line and the yellow dashed line, where the rising bubble is warmer than its surroundings. <b>Its size is the fuel for a storm</b>: the bigger and fatter the area, the stronger the updraft can get. Meteorologists call it CAPE.</p>' +
        '<h4>At this station</h4><p>The fuel is <b>' + cape + ' J/kg</b>.' + (cape < 250 ? ' That is very little: storms would struggle.' : cape < 1000 ? ' That is modest: storms can form but stay on the weak side.' : cape < 2500 ? ' That is moderate: strong storms are possible.' : cape < 4000 ? ' That is large: powerful updrafts and big hail are possible.' : ' That is extreme.') + '</p>' + capeFacts +
        '<h4>How to read the number</h4>' + tbl(H.cape, cape) +
        '<h4>Tall and skinny or short and fat</h4><p>The same CAPE can come from a tall, thin area (a gentle updraft through a deep layer) or a short, fat one (a violent updraft through a shallow layer). Fat areas low down are what produce the strongest updrafts.</p>' +
        '<div class="note">CAPE alone does not make a storm. It needs a trigger to lift the air, and wind shear (see the hodograph) decides how organised the storm becomes.</div>',
    };
    I.s_cin = {
      title: 'The cap (CIN)', col: C.cin, sub: 'The blue shaded area',
      tip: cin ? 'A lid worth ' + cin + ' J/kg that storms have to break through.' : 'No real cap here.',
      html: '<h4>In plain words</h4><p>Near the ground the rising bubble is actually <b>cooler</b> than the air around it (the blue area), so it wants to sink back down. That is the "cap": a lid of warm air that keeps storms from forming. Meteorologists call it CIN.</p>' +
        '<h4>At this station</h4><p>The cap is <b>' + (cin ? '-' + cin + ' J/kg' : 'about zero') + '</b>. ' + (cin < 25 ? 'That is weak or nonexistent: storms can form easily wherever there is lift.' : cin < 50 ? 'That is a moderate cap: it holds storms back until something strong lifts the air, then they pop.' : cin < 100 ? 'That is a strong cap: storms are held back, and the ones that finally break through can be explosive.' : 'That is a very strong cap: it is very hard for storms to form at all.') + '</p>' +
        '<h4>How to read the number (size of the lid)</h4>' + tbl([[0, 'Under 25', 'Weak: storms form easily.'], [25, '25 to 50', 'Moderate: holds storms back a while.'], [50, '50 to 100', 'Strong: holds storms until late in the day.'], [100, '100 and up', 'Very strong: few or no storms.']], cin) +
        '<h4>Why it matters</h4><p>A little cap can be good for severe weather: it lets fuel build up all day under the lid, and storms that finally break through are strong. Too much cap and nothing forms.</p>',
    };
    if (S.plcl) I.s_lcl = {
      title: 'Cloud base (LCL)', col: C.lcl, sub: 'Where the rising bubble turns into cloud',
      tip: 'Clouds would start about ' + ft(S.zlcl) + ' feet above the ground.',
      html: '<h4>In plain words</h4><p>As the bubble rises it cools. At this height it gets cool enough that its water vapour turns to cloud. That is where the bottom of a storm cloud would be. Meteorologists call it the LCL.</p>' +
        '<h4>At this station</h4><p>Cloud bases would sit about <b>' + ft(S.zlcl) + ' feet</b> (' + Math.round(S.zlcl) + ' m) above the ground.</p>' +
        '<h4>How to read the number</h4>' + tbl([[0, 'Under 3,300 ft', 'Low base. Tornadoes are more likely with a low base.'], [1000, '3,300 to 5,000 ft', 'Moderate.'], [1500, '5,000 to 6,600 ft', 'Highish.'], [2000, 'Over 6,600 ft', 'High base. Tornadoes are less likely; storm winds can be stronger.']], S.zlcl) +
        '<h4>Why it matters</h4><p>A low cloud base lets a rotating storm reach the ground more easily. Humid air near the ground gives a low base; dry air gives a high one.</p>',
    };
    if (S.lfc) I.s_lfc = {
      title: 'Storm take-off height (LFC)', col: C.lfc, sub: 'Where the bubble starts to rise by itself',
      tip: 'Above about ' + ft(S.lfc.z) + ' feet the rising air takes off on its own.',
      html: '<h4>In plain words</h4><p>Below this height the rising bubble is still cooler than its surroundings, so it needs a push. Above it, the bubble is warmer and rises by itself, like a balloon that has been let go. That is the point of no return for a storm. Meteorologists call it the LFC.</p>' +
        '<h4>At this station</h4><p>It is about <b>' + ft(S.lfc.z) + ' feet</b> above the ground. ' + (S.lfc.z < 1500 ? 'That is low, so even a small push can set off storms.' : S.lfc.z < 3000 ? 'That is a moderate height: a front, dry line or other lift is needed.' : 'That is high, so storms need strong lift.') + '</p>' +
        '<h4>Why it matters</h4><p>The distance between the ground and this height is the cap. A low take-off height means an easy start; a high one means storms need a strong push.</p>',
    };
    if (S.el) I.s_el = {
      title: 'Storm top (EL)', col: C.el, sub: 'Where the rising bubble stops',
      tip: 'The updraft would top out near ' + ft(S.el.z) + ' feet.',
      html: '<h4>In plain words</h4><p>Higher up, the air around the bubble finally gets warmer than the bubble. It stops accelerating there. That is about where the top of the storm cloud would be (the updraft can overshoot a bit). Meteorologists call it the EL.</p>' +
        '<h4>At this station</h4><p>It is about <b>' + ft(S.el.z) + ' feet</b> (' + (S.el.z / 1000).toFixed(1) + ' km) above the ground.' + (S.el.z >= 9000 ? ' That is a deep storm that can reach the jet stream and make an anvil.' : ' That is a fairly shallow storm.') + '</p>' +
        '<h4>Why it matters</h4><p>Tall storms, with the top well above freezing and into the cold air, make hail and lightning. Shallow ones mostly make rain.</p>',
    };
    if (S.frz) I.s_frz = {
      title: 'Freezing level', col: C.frz, sub: 'Where the air reaches 32°F',
      tip: 'Air is below freezing above about ' + ft(S.frz.z) + ' feet.',
      html: '<h4>In plain words</h4><p>Above this height the air is colder than 32°F (0°C). Raindrops there freeze into ice, and ice is what makes hail.</p>' +
        '<h4>At this station</h4><p>The freezing level is about <b>' + ft(S.frz.z) + ' feet</b>.' + (S.m20 ? ' The very cold air (-4°F, -20°C), where hail grows fastest, begins around ' + ft(S.m20.z) + ' feet.' : '') + '</p>' +
        '<h4>Why it matters</h4><p>A <b>lower</b> freezing level gives hail less distance to melt on the way down, so more of it reaches the ground. In summer it is usually high (13,000 ft or more); a low one in a storm setup is a hail flag.</p>' +
        '<div class="note">In winter, this line (and the temperature just above and below it) is also what decides rain versus snow, but this tool is built for storm setups.</div>',
    };
    return I;
  }

  function summary(P) {
    const S = P.snd;
    if (!S) return '';
    const lev = S.lev, sD = lev[0][3], cape = P.cape == null ? 0 : P.cape, cin = P.cin == null ? 0 : Math.abs(P.cin);
    const row = (k, v) => '<div class="srow"><b>' + k + '</b><span>' + v + '</span></div>';
    const dpF = sD == null ? null : tf(sD);
    let o = '';
    o += row('Moisture', dpF == null ? 'unknown' : dpF >= 65 ? 'Very humid (dew point ' + dpF + '°F): lots of storm fuel at the ground.' : dpF >= 55 ? 'Humid (dew point ' + dpF + '°F): decent fuel.' : dpF >= 45 ? 'Moderate (dew point ' + dpF + '°F): limited fuel.' : 'Dry (dew point ' + dpF + '°F): little fuel.');
    o += row('Fuel', cape < 250 ? 'Almost none (' + cape + ' J/kg).' : cape < 1000 ? 'Modest (' + cape + ' J/kg).' : cape < 2500 ? 'Moderate (' + cape + ' J/kg).' : 'Large (' + cape + ' J/kg).');
    o += row('Cap', cape < 250 ? 'Not relevant without fuel.' : cin < 25 ? 'Little or none: storms start easily.' : cin < 100 ? 'Moderate to strong (-' + cin + ' J/kg): storms need strong lift.' : 'Very strong (-' + cin + ' J/kg): storms are unlikely to form.');
    if (S.plcl) o += row('Cloud base', 'About ' + ft(S.zlcl) + ' ft' + (S.zlcl < 1000 ? ' (low).' : S.zlcl > 2000 ? ' (high).' : '.'));
    if (S.frz) o += row('Freezing level', 'About ' + ft(S.frz.z) + ' ft.');
    return o;
  }
  function tour(P) {
    const S = P.snd;
    if (!S) return [];
    const ids = ['s_temp', 's_dew', 's_parcel'];
    if (S.plcl) ids.push('s_lcl');
    if (S.lfc) ids.push('s_lfc');
    ids.push('s_cin');
    ids.push('s_cape');
    if (S.el) ids.push('s_el');
    if (S.frz) ids.push('s_frz');
    return ids;
  }
  window.HodoSnd = { draw: draw, info: info, summary: summary, tour: tour };
})();
