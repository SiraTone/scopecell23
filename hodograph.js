/* Sounding Reader (hodograph + skew-T): NWS balloon soundings, explained in plain English.
 * Data: /api/hodo/overview (all stations for a cycle) and /api/hodo/profile.
 * Every drawn thing is a registered item in INFO: hover = tooltip, click = pop-out.
 * Keep UI strings ASCII (use \u escapes or HTML entities). Diag: __hodoDiag().
 */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const TIER = { x: '#8394ad', 0: '#4fd8c8', 1: '#ffd23f', 2: '#ff9a3c', 3: '#ff4d4d', 4: '#e040fb' };
  const TIER_NAME = { x: 'No storm fuel', 0: 'Weak setup', 1: 'Some support', 2: 'Organised storms possible', 3: 'Strong setup', 4: 'Extreme setup' };
  const COMP = ['north', 'north-northeast', 'northeast', 'east-northeast', 'east', 'east-southeast', 'southeast', 'south-southeast',
    'south', 'south-southwest', 'southwest', 'west-southwest', 'west', 'west-northwest', 'northwest', 'north-northwest'];
  const LAYERS = [
    { id: 'l0', a: 0, b: 1000, name: 'Ground level', rng: '0-1 km', ftr: '0 to 3,300 ft', col: '#ff5a4e' },
    { id: 'l1', a: 1000, b: 3000, name: 'Low levels', rng: '1-3 km', ftr: '3,300 to 10,000 ft', col: '#ffb13d' },
    { id: 'l2', a: 3000, b: 6000, name: 'Middle levels', rng: '3-6 km', ftr: '10,000 to 20,000 ft', col: '#3ddc84' },
    { id: 'l3', a: 6000, b: 9000, name: 'Upper levels', rng: '6-9 km', ftr: '20,000 to 30,000 ft', col: '#38bdf8' },
    { id: 'l4', a: 9000, b: 12000, name: 'Jet-stream level', rng: '9-12 km', ftr: '30,000 to 40,000 ft', col: '#b48cff' },
  ];
  const S = { map: null, group: null, mk: {}, ov: null, cyc: null, sel: null, P: null, INFO: {}, tour: -1, tourIds: [], svg: null };
  let unit = localStorage.getItem('hodo-unit') === 'mph' ? 'mph' : 'kt';
  let opt = { srh: true, shear: true, km: true };

  // ---------------------------------------------------------------- helpers
  const F = () => (unit === 'mph' ? 1.15078 : 1);
  const spd = (kt) => Math.round(kt * F()) + ' ' + unit;
  const feet = (m) => (Math.round(m * 3.28084 / 100) * 100).toLocaleString('en-US');
  const fromDir = (u, v) => (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
  const compass = (d) => COMP[Math.round(d / 22.5) % 16];
  const windTxt = (u, v) => (Math.hypot(u, v) < 1.5 ? 'calm' : spd(Math.hypot(u, v)) + ' from the ' + compass(fromDir(u, v)));
  const moveTxt = (u, v) => spd(Math.hypot(u, v)) + ' toward the ' + compass((fromDir(u, v) + 180) % 360);
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const cycDate = (c) => new Date(Date.UTC(+c.slice(0, 4), +c.slice(4, 6) - 1, +c.slice(6, 8), +c.slice(8, 10)));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const cycLabel = (c) => MON[+c.slice(4, 6) - 1] + ' ' + (+c.slice(6, 8)) + ', ' + c.slice(8, 10) + 'Z';
  const cycLocal = (c) => cycDate(c).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

  function interp(P, h) {
    const p = P.pts;
    if (h <= p[0][0]) return [p[0][1], p[0][2]];
    for (let i = 1; i < p.length; i++) {
      if (h <= p[i][0]) {
        const w = (h - p[i - 1][0]) / (p[i][0] - p[i - 1][0]);
        return [p[i - 1][1] + w * (p[i][1] - p[i - 1][1]), p[i - 1][2] + w * (p[i][2] - p[i - 1][2])];
      }
    }
    const l = p[p.length - 1];
    return [l[1], l[2]];
  }
  function layerStats(P, a, b) {
    b = Math.min(b, P.top);
    const w0 = interp(P, a), w1 = interp(P, b);
    const sh = Math.hypot(w1[0] - w0[0], w1[1] - w0[1]);
    const turn = ((fromDir(w1[0], w1[1]) - fromDir(w0[0], w0[1]) + 540) % 360) - 180;
    const sp = P.pts.filter((q) => q[0] >= a && q[0] <= b).map((q) => Math.hypot(q[1], q[2]));
    return { w0, w1, sh, turn, b, min: Math.min(...sp), max: Math.max(...sp), mean: sp.reduce((x, y) => x + y, 0) / sp.length };
  }
  function turnTxt(st) {
    if (st.sh < 5) return 'the wind barely changes through this layer';
    if (Math.abs(st.turn) < 15) return 'the wind keeps blowing from nearly the same direction';
    return st.turn > 0
      ? 'the wind direction turns clockwise (veers) by about ' + Math.round(Math.abs(st.turn)) + ' degrees'
      : 'the wind direction turns counter-clockwise (backs) by about ' + Math.round(Math.abs(st.turn)) + ' degrees';
  }
  function scaleTable(rows, val) {
    let now = 0;
    rows.forEach((r, i) => { if (val >= r[0]) now = i; });
    return '<table>' + rows.map((r, i) => '<tr' + (i === now ? ' class="now"' : '') + '><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>').join('') + '</table>';
  }
  const facts = (arr) => '<div class="facts">' + arr.map((f) => '<div class="fact"><b>' + f[0] + '</b><span>' + f[1] + '</span></div>').join('') + '</div>';

  const SCALES = {
    cape: [[0, 'Under 250', 'Little or no fuel. Storms struggle to grow.'], [250, '250 to 1,000', 'Marginal. Storms can form but stay modest.'],
      [1000, '1,000 to 2,500', 'Moderate. Strong storms are possible.'], [2500, '2,500 to 4,000', 'Large. Powerful updrafts and big hail.'],
      [4000, '4,000 and up', 'Extreme fuel.']],
    sh6: [[0, 'Under 20 kt', 'Too weak to organise storms. Ordinary, short-lived ones.'], [20, '20 to 35 kt', 'Organised clusters and lines possible.'],
      [35, '35 to 50 kt', 'Supercells possible if storms form.'], [50, '50 kt and up', 'Strongly supports long-lived supercells.']],
    srh1: [[0, 'Under 50', 'Weak low-level spin.'], [50, '50 to 100', 'Modest. Tornadoes unlikely.'], [100, '100 to 150', 'Supports rotating storms. Weak tornadoes possible.'],
      [150, '150 to 250', 'Tornado-supporting environment.'], [250, '250 and up', 'Very high. Strong tornadoes become more likely if a storm forms.']],
    srh3: [[0, 'Under 100', 'Weak.'], [100, '100 to 250', 'Supports supercells.'], [250, '250 to 400', 'Strong. Favours supercells.'], [400, '400 and up', 'Extreme.']],
    stp: [[0, 'Under 1', 'Ingredients not lined up for strong tornadoes.'], [1, '1 to 3', 'Ingredients lined up. Strong tornadoes are more common in these setups.'],
      [3, '3 to 6', 'High.'], [6, '6 and up', 'Rare, extreme alignment.']],
  };

  // ---------------------------------------------------------------- tooltip + modal
  const tip = $('#tip');
  function showTip(id, ev) {
    const it = S.INFO[id];
    if (!it) return;
    tip.innerHTML = '<b><i style="background:' + it.col + '"></i>' + it.title + '</b>' + it.tip + '<div class="tc">Click for the full explanation</div>';
    tip.classList.remove('hidden');
    moveTip(ev);
  }
  function moveTip(ev) {
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.clientX + 16, y = ev.clientY + 16;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 16;
    if (y + h > innerHeight - 8) y = ev.clientY - h - 16;
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = Math.max(8, y) + 'px';
  }
  const hideTip = () => tip.classList.add('hidden');

  function setHl(id) {
    [S.svg, S.snd].forEach((svg) => {
      if (!svg) return;
      svg.querySelectorAll('.hl').forEach((e) => e.classList.remove('hl'));
      const has = id && svg.querySelector('.hg[data-id="' + id + '"]');
      svg.classList.toggle('dim', !!has);
      if (has) svg.querySelectorAll('.hg[data-id="' + id + '"]').forEach((e) => e.classList.add('hl'));
    });
  }

  function openInfo(id, tour) {
    const it = S.INFO[id];
    if (!it) return;
    $('#mBody').innerHTML = '<h2><i style="background:' + it.col + '"></i>' + it.title + '</h2><div class="msub">' + it.sub + '</div>' + it.html;
    $('#modal').classList.remove('hidden');
    $('#modal').classList.toggle('tour', !!tour);
    $('#mNav').classList.toggle('hidden', !tour);
    $('#mBox').scrollTop = 0;
    setHl(id);
    hideTip();
  }
  function closeInfo() {
    $('#modal').classList.add('hidden');
    S.tour = -1;
    setHl(null);
  }
  function tourGo(i) {
    if (!S.tourIds.length) return;
    S.tour = Math.max(0, Math.min(S.tourIds.length - 1, i));
    openInfo(S.tourIds[S.tour], true);
    $('#mStep').innerHTML = '<span class="tdots">' + S.tourIds.map((_, k) => '<i class="' + (k === S.tour ? 'on' : k < S.tour ? 'done' : '') + '"></i>').join('') + '</span><span class="tn">' + (S.tour + 1) + ' / ' + S.tourIds.length + '</span>';
    $('#mPrev').disabled = S.tour === 0;
    $('#mNext').textContent = S.tour === S.tourIds.length - 1 ? 'Finish' : 'Next';
  }
  $('#mClose').onclick = closeInfo;
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeInfo(); });
  document.addEventListener('keydown', (e) => {
    if ($('#modal').classList.contains('hidden')) return;
    if (e.key === 'Escape') closeInfo();
    else if (S.tour >= 0 && e.key === 'ArrowRight') $('#mNext').click();
    else if (S.tour >= 0 && e.key === 'ArrowLeft') $('#mPrev').click();
  });
  $('#mPrev').onclick = () => tourGo(S.tour - 1);
  $('#mNext').onclick = () => { if (S.tour >= S.tourIds.length - 1) closeInfo(); else tourGo(S.tour + 1); };

  // ---------------------------------------------------------------- explanations
  function buildInfo(P) {
    const I = {};
    const tz = P.top;
    const STATIC = {
      l0: {
        what: 'The wind in the lowest kilometre: the air a storm actually breathes in.',
        why: 'This layer matters most for tornadoes. When the wind speeds up and turns clockwise as you go up, the air near the ground starts to roll like a horizontal tube. A storm updraft can tip that tube upright, and that is where tornado-strength rotation comes from. A long, strongly curved red line is the classic warning sign.',
      },
      l1: {
        what: 'Winds from about 3,300 to 10,000 feet. This is the layer just above the ground, where a storm builds its base.',
        why: 'Steady winds here that keep increasing with height help a storm stay organised and rotate. This layer also decides how much spin the storm can pull in (see the shaded 0-3 km spin area).',
      },
      l2: {
        what: 'Winds from about 10,000 to 20,000 feet. This is the layer that mostly steers storms.',
        why: 'The average wind here decides which way a storm moves. The speed difference between the ground and this layer (the 0-6 km shear) decides how organised a storm gets. Big difference: the updraft leans, rain falls away from it, and the storm can live for hours. Small difference: rain falls into the updraft and the storm chokes itself in under an hour.',
      },
      l3: {
        what: 'Winds from about 20,000 to 30,000 feet, up around the anvil of a storm.',
        why: 'Strong winds up high blow the top of a storm away from its updraft and carry rain away from it. That helps the updraft stay clean and strong. Weak winds up here let rain and cold air pile up and weaken the storm.',
      },
      l4: {
        what: 'Winds from about 30,000 to 40,000 feet: the jet stream.',
        why: 'The jet stream is the engine behind big storm systems. It adds shear to the whole profile and shows where a strong disturbance sits. It matters less for tornadoes by itself, and more for how organised the storms are overall.',
      },
    };
    LAYERS.forEach((L) => {
      if (L.a >= tz) return;
      const st = layerStats(P, L.a, L.b);
      const T = STATIC[L.id];
      const fullTop = L.b <= tz;
      I[L.id] = {
        title: L.name, col: L.col, sub: L.rng + ' above the ground (' + L.ftr + ')',
        tip: 'Wind goes from ' + windTxt(st.w0[0], st.w0[1]) + ' to ' + windTxt(st.w1[0], st.w1[1]) + '. ' + spd(st.sh) + ' of change.',
        html: '<h4>In plain words</h4><p>' + T.what + '</p>' +
          '<h4>At ' + esc(P.station ? P.station.name : P.id) + '</h4>' +
          '<p>At the bottom of this layer the wind is ' + windTxt(st.w0[0], st.w0[1]) + '. ' + (fullTop ? 'At the top' : 'At the highest point the balloon reported') +
          ' it is ' + windTxt(st.w1[0], st.w1[1]) + '. Through this layer ' + turnTxt(st) + '.</p>' +
          facts([[spd(st.sh), 'Total change in wind (shear)'], [Math.round(st.turn) + '°', st.turn >= 0 ? 'Clockwise turn (veering)' : 'Counter-clockwise turn (backing)'], [spd(st.max), 'Fastest wind in layer']]) +
          '<h4>Why it matters</h4><p>' + T.why + '</p>' +
          '<h4>How to read it on the chart</h4><p>This coloured line is the wind at every height in the layer. A long line means the wind changes a lot. A curve means the direction changes.</p>',
      };
    });
    const top1 = interp(P, 1000), top3 = interp(P, 3000), top6 = interp(P, Math.min(6000, tz)), sfc = interp(P, 0);
    I.sfc = {
      title: 'Start: the ground', col: '#ffffff', sub: 'Where the line begins',
      tip: 'Wind at the surface: ' + windTxt(sfc[0], sfc[1]) + '.',
      html: '<h4>In plain words</h4><p>The line starts here, at the wind measured at the ground. It then climbs through the atmosphere, one point per height, up to about 40,000 feet.</p>' +
        '<h4>At this station</h4><p>The surface wind is ' + windTxt(sfc[0], sfc[1]) + '.</p>' +
        '<h4>How to read the chart</h4><p>Every point is the wind at one height. The distance from the centre is the speed (the rings mark 20 ' + unit + ' steps). A point up and to the right means a wind from the southwest, blowing toward the northeast. A point below and left means a wind from the northeast.</p>',
    };
    for (let k = 1; k <= Math.floor(tz / 1000); k++) {
      const w = interp(P, k * 1000);
      const L = LAYERS.find((q) => k * 1000 > q.a && k * 1000 <= q.b) || LAYERS[4];
      I['k' + k] = {
        title: k + ' km up (' + feet(k * 1000) + ' ft)', col: L.col, sub: 'Wind at one height',
        tip: windTxt(w[0], w[1]) + '.',
        html: '<h4>In plain words</h4><p>This dot is the wind about ' + feet(k * 1000) + ' feet above the ground (' + k + ' km).</p>' +
          '<h4>At this station</h4><p>The wind there is ' + windTxt(w[0], w[1]) + '.</p>' +
          facts([[spd(Math.hypot(w[0], w[1])), 'Wind speed'], [Math.round(fromDir(w[0], w[1])) + '°', 'Direction it comes from']]),
      };
    }
    const rmSp = Math.hypot(P.rm[0], P.rm[1]);
    I.rm = {
      title: 'Likely storm motion (right-mover)', col: '#ff7ad9', sub: 'The star',
      tip: 'A storm that forms here should move ' + moveTxt(P.rm[0], P.rm[1]) + '.',
      html: '<h4>In plain words</h4><p>The star is where we estimate a rotating storm would travel, as a wind. A strong storm does not simply drift with the wind: it tends to move off to the right of the average wind (in the northern hemisphere).</p>' +
        '<h4>At this station</h4><p>The star is at ' + moveTxt(P.rm[0], P.rm[1]) + '. Everything shaded around it measures how much the wind blows <i>into</i> a storm moving at that speed and direction.</p>' +
        facts([[spd(rmSp), 'Estimated storm speed'], [compass((fromDir(P.rm[0], P.rm[1]) + 180) % 360), 'Estimated direction of travel']]) +
        '<h4>Why it matters</h4><p>The farther the wind line sits from the star, and the more the line wraps around it, the more spin the storm can ingest. That is what the red and orange shaded areas measure.</p>' +
        '<div class="note">This is the standard "Bunkers" estimate used by forecasters. A real storm can move differently, especially if it joins another storm or runs along a boundary.</div>',
    };
    I.lm = {
      title: 'Left-mover storm motion', col: '#9aa7ff', sub: 'The hollow marker',
      tip: 'A storm that splits and turns left would move ' + moveTxt(P.lm[0], P.lm[1]) + '.',
      html: '<h4>In plain words</h4><p>When a big storm splits in two, one half goes right of the wind (the star) and the other goes left (this marker). Left-movers usually rotate the opposite way and are less likely to make tornadoes.</p>' +
        '<h4>At this station</h4><p>The left-mover would travel ' + moveTxt(P.lm[0], P.lm[1]) + '. A hodograph that is mostly straight favours both halves. A curved one favours the right-mover.</p>',
    };
    I.mean = {
      title: 'Average wind (0-6 km)', col: '#e7eef8', sub: 'The diamond',
      tip: 'The average wind from the ground to 6 km is ' + windTxt(P.mean[0], P.mean[1]) + '.',
      html: '<h4>In plain words</h4><p>If you averaged every wind from the ground to about 20,000 feet, you would land on this diamond. Plain storms tend to follow this wind. Rotating storms drift off to the side of it.</p>' +
        '<h4>At this station</h4><p>' + windTxt(P.mean[0], P.mean[1]) + '.</p>',
    };
    const s3 = P.srh3, s1 = P.srh1;
    I.srh1 = {
      title: 'Low-level spin area (0-1 km)', col: '#ff5a4e', sub: 'The red shaded region: storm-relative helicity',
      tip: 'Spin score ' + s1 + ' (' + srhWord(s1) + '). Bigger area means more spin near the ground.',
      html: '<h4>In plain words</h4><p>This red shape is the area between the wind line in the lowest kilometre and the storm star. Its size is the amount of spin a storm moving along would pull in close to the ground. Meteorologists call it low-level storm-relative helicity, or SRH.</p>' +
        '<h4>At this station</h4><p>The score is <b>' + s1 + '</b> (units m&sup2;/s&sup2;). ' + srhSentence(s1) + '</p>' +
        facts([[String(s1), '0-1 km spin score'], [String(P.srh1L), 'Same score for a left-mover']]) +
        '<h4>How to read the score</h4>' + scaleTable(SCALES.srh1, s1) +
        '<div class="note">This describes the air around the balloon at launch time. Storms also need fuel (CAPE) and something to start them, so a high score is not a prediction of a tornado.</div>',
    };
    I.srh3 = {
      title: 'Spin area (0-3 km)', col: '#ffb13d', sub: 'The larger orange shaded region',
      tip: 'Spin score ' + s3 + ' through the lowest 10,000 ft.',
      html: '<h4>In plain words</h4><p>The same idea as the red area, but through the lowest three kilometres (about 10,000 feet). It tells you whether a storm can sustain rotation through its lower half, which is what separates a short-lived spin-up from a long-lived supercell.</p>' +
        '<h4>At this station</h4><p>The score is <b>' + s3 + '</b>. ' + (s3 >= 250 ? 'That is strong rotation potential for supercells.' : s3 >= 100 ? 'That supports rotating storms.' : 'That is not much storm rotation.') + '</p>' +
        facts([[String(s3), '0-3 km spin score'], [String(P.srh3L), 'Same score for a left-mover']]) +
        '<h4>How to read the score</h4>' + scaleTable(SCALES.srh3, s3),
    };
    const sh6 = P.sh6;
    I.shear6 = {
      title: 'Wind shear (0-6 km)', col: '#e7eef8', sub: 'The dashed arrow',
      tip: 'The wind changes by ' + spd(sh6) + ' between the ground and 20,000 ft.',
      html: '<h4>In plain words</h4><p>The dashed arrow connects the wind at the ground to the wind at about 20,000 feet. Its length is how much the wind changes over that depth: this is called bulk shear. More shear means a storm can organise, tilt, and last longer.</p>' +
        '<h4>At this station</h4><p>The wind changes by <b>' + spd(sh6) + '</b>. ' + shearSentence(sh6) + '</p>' +
        facts([[spd(P.sh1), 'Change 0-1 km'], [spd(P.sh3), 'Change 0-3 km'], [spd(sh6), 'Change 0-6 km']]) +
        '<h4>How to read the number</h4>' + scaleTable(SCALES.shear6(), sh6 * F()),
    };
    return I;
  }
  SCALES.shear6 = () => (unit === 'mph'
    ? [[0, 'Under 23 mph', SCALES.sh6[0][2]], [23, '23 to 40 mph', SCALES.sh6[1][2]], [40, '40 to 58 mph', SCALES.sh6[2][2]], [58, '58 mph and up', SCALES.sh6[3][2]]]
    : SCALES.sh6);
  const srhWord = (v) => (v >= 250 ? 'very high' : v >= 150 ? 'high' : v >= 100 ? 'supportive' : v >= 50 ? 'modest' : 'low');
  const srhSentence = (v) => (v >= 250 ? 'That is very high: if a storm forms, it has plenty of spin to work with.'
    : v >= 150 ? 'That is in the range where tornadoes are more common if a storm forms.'
    : v >= 100 ? 'That is enough to support rotating storms.'
    : v >= 50 ? 'That is modest. Rotation is possible but tornadoes are unlikely from the wind alone.' : 'That is low: not much spin is available near the ground.');
  const shearSentence = (v) => (v >= 50 ? 'That is very strong shear.' : v >= 35 ? 'That is enough to support supercells.' : v >= 20 ? 'That is enough to organise storms into clusters and lines.' : 'That is weak: storms would be ordinary and short-lived.');

  // ---------------------------------------------------------------- meters, verdict, shape
  function ingredients(P) {
    const fuel = P.cape == null ? 0 : P.cape;
    const stpv = P.stp == null ? 0 : P.stp;
    const lv = (v, cuts) => cuts.filter((c) => v >= c).length;
    const rows = [
      { id: 'cape', n: 'Fuel', s: 'CAPE: warm humid air', v: fuel, max: 4000, cuts: [250, 1000, 2500], lab: ['None', 'Marginal', 'Moderate', 'Large'], txt: Math.round(fuel) + ' J/kg', tbl: SCALES.cape },
      { id: 'sh6', n: 'Organisation', s: 'Shear 0-6 km', v: P.sh6, max: 60, cuts: [20, 35, 50].map((x) => x / 1), lab: ['Weak', 'Moderate', 'Strong', 'Very strong'], txt: spd(P.sh6), tbl: SCALES.sh6 },
      { id: 'srh1', n: 'Low-level spin', s: 'SRH 0-1 km', v: P.srh1, max: 350, cuts: [50, 100, 150, 250], lab: ['Low', 'Modest', 'Supportive', 'High', 'Very high'], txt: String(P.srh1), tbl: SCALES.srh1 },
      { id: 'stp', n: 'Tornado score', s: 'Combined (STP)', v: stpv, max: 8, cuts: [1, 3, 6], lab: ['Low', 'Elevated', 'High', 'Extreme'], txt: stpv.toFixed(1), tbl: SCALES.stp },
    ];
    rows.forEach((r) => { r.lvl = lv(r.v, r.cuts); r.word = r.lab[r.lvl]; });
    return rows;
  }
  const LVCOL = ['#5b6b82', '#4fd8c8', '#ffd23f', '#ff9a3c', '#ff4d4d', '#e040fb'];

  function registerMeters(P, rows) {
    const I = S.INFO;
    const base = {
      cape: ['Fuel (CAPE)', 'Convective available potential energy', 'Think of CAPE as fuel in the tank. Storms are powered by warm, humid air near the ground that wants to rise. CAPE measures how much energy that rising air would have. No fuel, no storm, however strong the wind.', 'We lift a parcel of surface air and add up how much warmer than its surroundings it stays (units J/kg).'],
      sh6: ['Organisation (shear)', 'Bulk shear, ground to 6 km', 'Shear is how much the wind changes with height. It is what turns a plain storm into an organised, long-lived one, because it tilts the updraft so rain falls away from it.', 'It is the length of the dashed arrow on the chart.'],
      srh1: ['Low-level spin', 'Storm-relative helicity, 0-1 km', 'This is the amount of spin available near the ground to a storm moving along. It is the red area on the chart.', ''],
      stp: ['Tornado score', 'Significant Tornado Parameter (fixed layer)', 'A forecaster shortcut that multiplies the key ingredients together: fuel, low cloud bases, low-level spin and shear. All must be present for the score to be high: if any one is missing, it falls to zero.', 'It is a way to spot a setup, not a forecast. It cannot tell you whether a storm will actually form.'],
    };
    rows.forEach((r) => {
      const b = base[r.id];
      const show = r.id === 'sh6' ? spd(P.sh6) : r.txt;
      I['m_' + r.id] = {
        title: b[0], col: LVCOL[r.lvl], sub: b[1],
        tip: show + ' - ' + r.word + '.',
        html: '<h4>In plain words</h4><p>' + b[2] + '</p>' + (b[3] ? '<p>' + b[3] + '</p>' : '') +
          '<h4>At this station</h4><p>Reading: <b>' + show + '</b> (' + r.word.toLowerCase() + ').' +
          (r.id === 'cape' && P.lcl != null ? ' Cloud bases would sit about ' + feet(P.lcl) + ' ft up' + (P.lcl < 1000 ? ', low enough to help tornadoes.' : P.lcl > 2000 ? ', which is high and makes tornadoes less likely.' : '.') : '') + '</p>' +
          '<h4>How to read the number</h4>' + (r.id === 'sh6' ? scaleTable(SCALES.shear6(), P.sh6 * F()) : scaleTable(r.tbl, r.v)) +
          '<div class="note">Computed from one balloon launch. Real storm environments change by the hour and over short distances.</div>',
      };
    });
  }

  function verdict(P, rows) {
    const f = P.cape == null ? 0 : P.cape, sh6k = P.sh6, s1 = P.srh1;
    let h, col, body;
    if (f < 250) {
      h = 'Not much storm fuel'; col = TIER.x;
      body = (sh6k >= 35 || s1 >= 150 ? 'The wind profile has a shape that can spin storms up, but ' : 'The air ') +
        'does not have the warm, humid fuel storms need, so big thunderstorms are unlikely here right now. Strong winds can still happen without storms.';
    } else if (sh6k < 20) {
      h = 'Fuel, but little organisation'; col = TIER[0];
      body = 'There is fuel for storms, but the wind barely changes with height. Storms that form tend to be ordinary and short-lived, and can pop up and collapse within an hour.';
    } else if (sh6k >= 35 && s1 >= 150 && f >= 1000) {
      h = 'Supercell and tornado-supportive'; col = P.tier === '4' ? TIER[4] : TIER[3];
      body = 'Fuel, strong shear and strong low-level spin all line up. If a storm forms here it can become a long-lived rotating supercell, and tornadoes are a real possibility.';
    } else if (sh6k >= 35) {
      h = 'Supercells possible'; col = TIER[2];
      body = 'There is enough fuel and shear for rotating, long-lived storms with hail and damaging wind. Low-level spin is ' + srhWord(s1) + ', so the tornado threat from the wind profile alone is ' + (s1 >= 100 ? 'present' : 'limited') + '.';
    } else {
      h = 'Organised storms possible'; col = TIER[1];
      body = 'Fuel and a moderate amount of shear can support clusters and lines of storms, but not long-lived rotating ones.';
    }
    return '<div class="vh" style="--vc:' + col + '">' + h + '</div><p>' + body + '</p><p class="vsub">One balloon, one place, one moment: this describes the air at launch. It is a snapshot, not a forecast.</p>';
  }

  function shapeInfo(P) {
    const t3 = P.turn3, t1 = P.turn1;
    let n, d;
    if (P.sh6 < 18 && P.sh3 < 12) {
      n = 'Short and tight';
      d = 'The line stays close to the centre, so the wind barely changes with height. Storms in this kind of air have little help from the wind.';
    } else if (t3 >= 45) {
      n = 'Curved clockwise';
      d = 'The line bends to the right as it climbs. This is the classic shape for right-moving rotating storms, and the one forecasters look for on tornado days.' + (t1 >= 40 ? ' There is also a sharp bend near the ground, which is the most important place for it.' : '');
    } else if (t3 <= -45) {
      n = 'Curved counter-clockwise';
      d = 'The line bends to the left as it climbs. This favours left-moving storms that spin the opposite way, which are less likely to produce tornadoes.';
    } else {
      n = 'Mostly straight';
      d = 'The line is long and runs in a mostly straight path. This gives lots of shear for organised storms, and favours splitting supercells (both a right-mover and a left-mover).';
    }
    return '<div class="sname">' + n + '</div><p>' + d + '</p><p class="muted small">Turning from the ground to 3 km: ' + (t3 >= 0 ? '+' : '') + t3 + ' degrees (clockwise is positive).</p>';
  }

  // ---------------------------------------------------------------- the SVG
  const NS = 'http://www.w3.org/2000/svg';
  function drawHodo(P) {
    const SZ = 560, C = 280, RP = 245;
    const maxSp = Math.max(...P.pts.map((q) => Math.hypot(q[1], q[2])), Math.hypot(P.rm[0], P.rm[1]), Math.hypot(P.lm[0], P.lm[1]));
    const f = F();
    const Rd = Math.max(60, Math.ceil(maxSp * f / 20) * 20);
    const k = RP / (Rd / f);
    const X = (u) => C + u * k, Y = (v) => C - v * k;
    const pt = (u, v) => X(u).toFixed(1) + ',' + Y(v).toFixed(1);
    let s = '<svg viewBox="0 0 ' + SZ + ' ' + SZ + '" xmlns="' + NS + '" role="img" aria-label="Hodograph">';
    s += '<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#e7eef8"/></marker></defs>';
    for (let d = 20; d <= Rd; d += 20) {
      const r = d / f * k;
      s += '<circle class="hring" cx="' + C + '" cy="' + C + '" r="' + r.toFixed(1) + '"/><text class="hlab" x="' + (C + r + 3).toFixed(1) + '" y="' + (C + 11) + '">' + d + (d === 20 ? ' ' + unit : '') + '</text>';
    }
    s += '<line class="haxis" x1="' + (C - RP - 8) + '" y1="' + C + '" x2="' + (C + RP + 8) + '" y2="' + C + '"/><line class="haxis" x1="' + C + '" y1="' + (C - RP - 8) + '" x2="' + C + '" y2="' + (C + RP + 8) + '"/>';
    s += '<text class="hlab" x="' + C + '" y="12" text-anchor="middle">wind blowing toward N</text><text class="hlab" x="' + C + '" y="' + (SZ - 3) + '" text-anchor="middle">S</text>' +
      '<text class="hlab" x="' + (SZ - 4) + '" y="' + (C - 5) + '" text-anchor="end">E</text><text class="hlab" x="4" y="' + (C - 5) + '">W</text>';
    const smooth = (q) => 'M' + q.map((p) => X(p[1]).toFixed(1) + ' ' + Y(p[2]).toFixed(1)).join('L');
    // spin areas (drawn first so lines sit on top)
    const area = (top, col, id) => {
      const q = P.pts.filter((p) => p[0] <= top && p[0] <= P.top);
      if (q.length < 2) return '';
      const pts = [pt(P.rm[0], P.rm[1])].concat(q.map((p) => pt(p[1], p[2])));
      return '<g class="hg hsrh srh" data-id="' + id + '"><path d="M' + pts.join('L') + 'Z" fill="' + col + '" stroke="' + col + '" stroke-opacity=".5" stroke-width="1"/></g>';
    };
    if (opt.srh) s += area(3000, 'rgba(255,177,61,.16)', 'srh3') + area(1000, 'rgba(255,90,78,.34)', 'srh1');
    // layer segments
    LAYERS.forEach((L) => {
      const top = Math.min(L.b, P.top);
      if (L.a >= P.top || top - L.a < 250) return;
      const q = P.pts.filter((p) => p[0] >= L.a && p[0] <= top);
      if (top - q[q.length - 1][0] > 60) { const e = interp(P, top); q.push([top, e[0], e[1]]); }
      const d = smooth(q);
      s += '<g class="hg" data-id="' + L.id + '"><path class="hseg" d="' + d + '" stroke="' + L.col + '"/><path class="hhit" d="' + d + '"/></g>';
    });
    if (opt.shear) {
      const t6 = interp(P, Math.min(6000, P.top)), w0 = interp(P, 0);
      s += '<g class="hg" data-id="shear6"><line class="hshear" x1="' + X(w0[0]).toFixed(1) + '" y1="' + Y(w0[1]).toFixed(1) + '" x2="' + X(t6[0]).toFixed(1) + '" y2="' + Y(t6[1]).toFixed(1) + '" marker-end="url(#ah)"/>' +
        '<line class="hhit" x1="' + X(w0[0]).toFixed(1) + '" y1="' + Y(w0[1]).toFixed(1) + '" x2="' + X(t6[0]).toFixed(1) + '" y2="' + Y(t6[1]).toFixed(1) + '"/></g>';
    }
    // storm motion + mean wind
    const star = (cx, cy, r) => { let p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; p.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1)); } return p.join(' '); };
    const rx = X(P.rm[0]), ry = Y(P.rm[1]);
    s += '<g class="hg hmk" data-id="rm"><circle class="pulse" cx="' + rx.toFixed(1) + '" cy="' + ry.toFixed(1) + '" r="10" fill="#ff7ad9" opacity=".5"/><polygon points="' + star(rx, ry, 9) + '" fill="#ff7ad9" stroke="#0c131d" stroke-width="1.5"/></g>';
    const lx = X(P.lm[0]), ly = Y(P.lm[1]);
    s += '<g class="hg hmk" data-id="lm"><circle cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="4.5" fill="none" stroke="#9aa7ff" stroke-width="1.5"/></g>';
    const mx = X(P.mean[0]), my = Y(P.mean[1]);
    s += '<g class="hg hmk" data-id="mean"><rect x="' + (mx - 4).toFixed(1) + '" y="' + (my - 4).toFixed(1) + '" width="8" height="8" transform="rotate(45 ' + mx.toFixed(1) + ' ' + my.toFixed(1) + ')" fill="none" stroke="#e7eef8" stroke-width="2"/></g>';
    // height dots
    if (opt.km) {
      const placed = [[X(interp(P, 0)[0]), Y(interp(P, 0)[1])], [rx, ry], [lx, ly], [mx, my]];
      for (let kk = 1; kk <= Math.floor(P.top / 1000); kk++) {
        const w = interp(P, kk * 1000), L = LAYERS.find((q) => kk * 1000 > q.a && kk * 1000 <= q.b) || LAYERS[4];
        const cx = X(w[0]), cy = Y(w[1]);
        if (placed.some((p) => Math.hypot(p[0] - cx, p[1] - cy) < 17)) continue;
        placed.push([cx, cy]);
        s += '<g class="hg hdot" data-id="k' + kk + '"><circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="7" stroke="' + L.col + '"/><text x="' + cx.toFixed(1) + '" y="' + (cy + 3.2).toFixed(1) + '" text-anchor="middle">' + kk + '</text></g>';
      }
    }
    const w0 = interp(P, 0);
    s += '<g class="hg hdot" data-id="sfc"><circle cx="' + X(w0[0]).toFixed(1) + '" cy="' + Y(w0[1]).toFixed(1) + '" r="3.5" fill="#fff" stroke="#0c131d" stroke-width="1.5" style="fill:#fff"/></g>';
    s += '</svg>';
    $('#svgWrap').innerHTML = s + '<div class="muted small">Numbered dots are the wind every kilometre up (1 km is about 3,300 ft); where dots would crowd, some are hidden. Distance from the centre is wind speed; a point up and right means a wind from the southwest.</div>';
    S.svg = $('#svgWrap svg');
    wireSvg(S.svg);
  }

  function wireSvg(svg) {
    svg.addEventListener('mousemove', (e) => {
      const g = e.target.closest('.hg');
      if (!g) { hideTip(); setHl(null); return; }
      const id = g.dataset.id;
      if (!svg.querySelector('.hg.hl[data-id="' + id + '"]')) setHl(id);
      showTip(id, e);
    });
    svg.addEventListener('mouseleave', () => { hideTip(); if ($('#modal').classList.contains('hidden')) setHl(null); });
    svg.addEventListener('click', (e) => {
      const g = e.target.closest('.hg');
      if (g) { S.tour = -1; openInfo(g.dataset.id, false); }
    });
  }

  // ---------------------------------------------------------------- render a station
  function render(P) {
    S.P = P;
    S.INFO = buildInfo(P);
    Object.assign(S.INFO, HodoSnd.info(P, { esc: esc, scaleTable: scaleTable, facts: facts, cape: SCALES.cape }));
    const rows = ingredients(P);
    registerMeters(P, rows);
    const st = P.station || {};
    $('#welcome').classList.add('hidden');
    $('#stationView').classList.remove('hidden');
    $('#stName').textContent = (st.name || P.id) + (st.state ? ', ' + st.state : '') + '  (' + P.id + ')';
    $('#stWhen').textContent = cycLabel(P.cycle) + '  -  ' + cycLocal(P.cycle) + ' your time';
    $('#verdict').innerHTML = verdict(P, rows);
    drawHodo(P);
    $('#layerKey').innerHTML = LAYERS.filter((L) => L.a < P.top).map((L) =>
      '<button data-id="' + L.id + '"><i style="background:' + L.col + '"></i>' + L.name + ' <span class="muted">' + L.rng + '</span></button>').join('');
    $('#layerKey').querySelectorAll('button').forEach((b) => {
      b.onmouseenter = () => setHl(b.dataset.id);
      b.onmouseleave = () => setHl(null);
      b.onclick = () => { S.tour = -1; openInfo(b.dataset.id, false); };
    });
    $('#meterRows').innerHTML = rows.map((r) => {
      const pct = Math.min(100, Math.max(3, r.v / r.max * 100));
      const ticks = r.cuts.map((c) => '<u style="left:' + Math.min(100, c / r.max * 100) + '%"></u>').join('');
      return '<div class="mrow" data-id="m_' + r.id + '"><div class="mn">' + r.n + '<small>' + r.s + '</small></div>' +
        '<div class="mbar"><i style="width:' + pct + '%;background:' + LVCOL[r.lvl] + '"></i>' + ticks + '</div>' +
        '<div class="mv" style="color:' + LVCOL[r.lvl] + '">' + (r.id === 'sh6' ? spd(P.sh6) : r.txt) + '<small>' + r.word + '</small></div></div>';
    }).join('');
    $('#meterRows').querySelectorAll('.mrow').forEach((el) => {
      el.onclick = () => { S.tour = -1; openInfo(el.dataset.id, false); };
      el.onmousemove = (e) => showTip(el.dataset.id, e);
      el.onmouseleave = hideTip;
    });
    $('#shapeBody').innerHTML = shapeInfo(P);
    $('#foot').textContent = 'Sounding from the ' + (st.name || P.id) + ' balloon launch, ' + cycLabel(P.cycle) + '. Heights are above the ground (station elevation ' + P.zsfc + ' m). Educational only: for severe weather decisions use the National Weather Service.';
    $('#sndWrap').innerHTML = HodoSnd.draw(P);
    S.snd = $('#sndWrap svg');
    if (S.snd && P.snd) wireSvg(S.snd);
    $('#sndSum').innerHTML = HodoSnd.summary(P);
    S.sndTourIds = HodoSnd.tour(P);
    $('#sndTourBtn').disabled = !S.sndTourIds.length;
    $('#labBtn').disabled = !(P.snd && P.wnd && window.HodoLab);
    $('#labBtn').onclick = () => HodoLab.open(P);
    if (/[?&]lab=1/.test(location.search) && !S.labDone && P.snd && P.wnd && window.HodoLab) { S.labDone = true; HodoLab.open(P); }
    S.hodoTourIds = ['sfc'].concat(LAYERS.filter((L) => L.a < P.top).map((L) => L.id), ['rm', 'srh1', 'shear6']);
    S.tourIds = S.hodoTourIds;
    $('#tourBtn0').disabled = false;
    $('#tourBtn0').textContent = 'Walk me through this one';
  }

  function applyOpts() {
    if (S.P) { const hl = null; drawHodo(S.P); void hl; }
  }

  // ---------------------------------------------------------------- map + data
  function markerIcon(r) {
    const col = TIER[r.tier] || TIER.x;
    const sel = S.sel === r.id;
    const z = S.map ? S.map.getZoom() : 4;
    if (z < 5.5) {
      const n = sel ? 20 : 14;
      return L.divIcon({ className: 'hmark dot' + (sel ? ' sel' : ''), iconSize: [n, n], iconAnchor: [n / 2, n / 2],
        html: '<svg width="' + n + '" height="' + n + '" viewBox="0 0 ' + n + ' ' + n + '"><circle class="ring" cx="' + n / 2 + '" cy="' + n / 2 + '" r="' + (n / 2 - 2) + '" fill="' + col + '" fill-opacity=".85" stroke="#0a1017" stroke-width="2"/></svg>' });
    }
    let mx = 15;
    r.pts.forEach((q) => { if (q[0] <= 6000) mx = Math.max(mx, Math.hypot(q[1], q[2])); });
    const k = 14 / mx;
    const d = r.pts.filter((q) => q[0] <= 6000).map((q) => (22 + q[1] * k).toFixed(1) + ',' + (22 - q[2] * k).toFixed(1)).join(' ');
    return L.divIcon({
      className: 'hmark' + (sel ? ' sel' : ''), iconSize: [44, 44], iconAnchor: [22, 22],
      html: '<svg width="44" height="44" viewBox="0 0 44 44"><circle class="ring" cx="22" cy="22" r="20" fill="rgba(10,16,23,.82)" stroke="' + col + '" stroke-width="1.5"/>' +
        '<polyline points="' + d + '" fill="none" stroke="' + col + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    });
  }

  // ---------------------------------------------------------------- city labels (HTML, halo, zoom priority, no overlaps)
  function initLabels() {
    const D = window.HodoCities;
    if (!D) return;
    const pane = S.map.createPane('cityLabels'); pane.style.zIndex = 450; pane.style.pointerEvents = 'none';
    const grp = L.layerGroup().addTo(S.map);
    const minZ = { 1: 3, 2: 4, 3: 5 };
    function refresh() {
      grp.clearLayers();
      const z = S.map.getZoom(), b = S.map.getBounds().pad(0.05), taken = [];
      const hit = (r) => taken.some((t) => r[0] < t[2] && r[2] > t[0] && r[1] < t[3] && r[3] > t[1]);
      Object.values(S.mk).forEach((o) => { const p = S.map.latLngToLayerPoint([o.r.lat, o.r.lon]), k = z < 5.5 ? 9 : 24; taken.push([p.x - k, p.y - k, p.x + k, p.y + k]); });
      D.areas.forEach((a) => {
        if (z > a[4] + 1 || z < a[3]) return;
        const p = S.map.latLngToLayerPoint([a[1], a[2]]), w = a[0].length * 9 + 10;
        const r = [p.x - w / 2, p.y - 8, p.x + w / 2, p.y + 8];
        if (!b.contains([a[1], a[2]]) || hit(r)) return;
        taken.push(r);
        L.marker([a[1], a[2]], { interactive: false, pane: 'cityLabels', icon: L.divIcon({ className: 'cl-area', iconSize: [0, 0], html: '<span>' + a[0] + '</span>' }) }).addTo(grp);
      });
      D.cities.slice().sort((p, q) => p[3] - q[3]).forEach((c) => {
        if (z < minZ[c[3]] || !b.contains([c[1], c[2]])) return;
        const p = S.map.latLngToLayerPoint([c[1], c[2]]), w = c[0].length * 6.6 + 8, h = 15;
        const R = [p.x + 5, p.y - h / 2, p.x + 5 + w, p.y + h / 2], Lf = [p.x - 5 - w, p.y - h / 2, p.x - 5, p.y + h / 2];
        const dotBox = [p.x - 3, p.y - 3, p.x + 3, p.y + 3];
        let side = null;
        if (!hit(R)) side = 'r'; else if (!hit(Lf)) side = 'l'; else return;
        taken.push(side === 'r' ? R : Lf, dotBox);
        L.marker([c[1], c[2]], { interactive: false, pane: 'cityLabels', icon: L.divIcon({ className: 'cl-city t' + c[3] + ' ' + side, iconSize: [0, 0], html: '<i></i><span>' + c[0] + '</span>' }) }).addTo(grp);
      });
    }
    S.refreshLabels = refresh;
    S.map.on('moveend zoomend', refresh);
    refresh();
  }

  // ---------------------------------------------------------------- national "soundings support" summary
  const SUP = [
    { id: 'quiet', name: 'Quiet day', col: '#5b6b82', line: 'Almost no balloon shows enough fuel and wind together for organised storms.' },
    { id: 'ordinary', name: 'Ordinary storms', col: '#4fd8c8', line: 'Some fuel in places, but the wind is too weak to organise it. Short-lived, pop-up style storms at most.' },
    { id: 'organised', name: 'Organised storms possible', col: '#ffd23f', line: 'A few regions have fuel plus enough wind change for stronger, longer-lived storms if something triggers them.' },
    { id: 'active', name: 'Active severe setup', col: '#ff9a3c', line: 'Several balloons show the fuel and spinning wind that support supercells in at least one region.' },
    { id: 'outbreak', name: 'Outbreak-type setup', col: '#ff4d4d', line: 'Many balloons show strong fuel and strong spin at once. This is the kind of pattern that has produced widespread severe weather.' },
  ];
  function supportLevel(rows) {
    const c = { fuel: 0, t1: 0, t2: 0, t3: 0, t4: 0 };
    rows.forEach((r) => {
      if (r.tier === 'x') return;
      c.fuel++;
      const t = +r.tier;
      if (t >= 1) c.t1++;
      if (t >= 2) c.t2++;
      if (t >= 3) c.t3++;
      if (t >= 4) c.t4++;
    });
    let i = 0;
    if (c.t1 >= 3 || c.fuel >= 8) i = 1;
    if (c.t2 >= 1) i = 2;
    if (c.t2 >= 4 || c.t3 >= 1) i = 3;
    if (c.t3 >= 4 || c.t4 >= 2 || (c.t2 >= 8 && c.t3 >= 2)) i = 4;
    return { i: i, c: c, n: rows.length };
  }
  function renderSupport() {
    const card = $('#supCard'), chip = $('#chipSup');
    const rows = (S.ov && S.ov.stations) || [];
    if (!rows.length) { card.classList.add('hidden'); chip.classList.add('hidden'); return; }
    const sp = supportLevel(rows), L = SUP[sp.i], c = sp.c;
    chip.classList.remove('hidden');
    chip.innerHTML = '<i style="background:' + L.col + '"></i>US: ' + L.name;
    chip.style.borderColor = L.col + '66';
    const score = (r) => (r.tier === 'x' ? -1 : (+r.tier) * 10000 + (r.stp || 0) * 1000 + (r.srh1 || 0));
    const top = rows.filter((r) => r.tier !== 'x' && +r.tier >= 2).sort((a, b) => score(b) - score(a)).slice(0, 5);
    const seg = SUP.map((u, k) => '<i style="background:' + (k <= sp.i ? u.col : '#1a2639') + '"></i>').join('');
    card.classList.remove('hidden');
    card.innerHTML = '<div class="hrow"><h3>Soundings support <span class="tag">whole US</span></h3></div>' +
      '<div class="supNow"><b style="color:' + L.col + '">' + esc(L.name) + '</b><span class="muted small">' + cycLabel(S.cyc) + ' balloons</span></div>' +
      '<div class="supBar">' + seg + '</div>' +
      '<p class="small">' + L.line + '</p>' +
      '<div class="supStats"><div><b>' + c.fuel + '</b><span>sites with storm fuel</span></div><div><b>' + c.t2 + '</b><span>fuel + organising wind</span></div><div><b>' + c.t3 + '</b><span>strong setup</span></div><div><b>' + sp.n + '</b><span>sites reporting</span></div></div>' +
      (top.length ? '<div class="supTop"><div class="muted small">Strongest balloons right now (click to open)</div>' + top.map((r) => '<button data-id="' + r.id + '"><i style="background:' + LVCOL[+r.tier + 1] + '"></i><b>' + esc(r.name) + ', ' + esc(r.state) + '</b><span>' + TIER_NAME[r.tier] + '</span></button>').join('') + '</div>' : '') +
      '<p class="muted small">Counts how many of the ' + sp.n + ' US balloon launches show fuel (CAPE) together with the wind pattern that organises storms. Balloons are two snapshots a day at fixed spots, so this describes the ingredients, not where or whether storms will form. Not a forecast. For warnings use the National Weather Service.</p>';
    card.querySelectorAll('.supTop button').forEach((b) => { b.onclick = () => selectStation(b.dataset.id); });
  }

  function initMap() {
    S.map = L.map('map', { zoomSnap: 1, zoomDelta: 1, minZoom: 3, maxZoom: 9, attributionControl: false, zoomControl: false });
    L.control.zoom({ position: 'bottomright', zoomInText: '', zoomOutText: '' }).addTo(S.map);
    const base = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/';
    L.tileLayer(base + 'World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 10, maxZoom: 11, crossOrigin: true, detectRetina: true, className: 'basetile' }).addTo(S.map);
    S.map.setView([38.5, -96], 4);
    initLabels();
    S.group = L.layerGroup().addTo(S.map);
    S.map.on('zoomend', () => { const k = S.map.getZoom() < 5.5; if (S.lastDot === k) return; S.lastDot = k; Object.values(S.mk).forEach((o) => o.m.setIcon(markerIcon(o.r))); });
  }

  function nearest(ll) {
    const p = S.map.latLngToLayerPoint(ll);
    let best = null, bd = 1e9;
    Object.values(S.mk).forEach((o) => {
      const q = S.map.latLngToLayerPoint([o.r.lat, o.r.lon]);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bd) { bd = d; best = o.r; }
    });
    return best;
  }
  function wireMapPick() {
    const wrap = $('#hMapWrap'), box = S.map.getContainer();
    const ret = document.createElement('div');
    ret.id = 'mapReticle'; ret.className = 'hidden';
    ret.innerHTML = '<i></i><i></i><i></i><i></i><b></b>';
    wrap.appendChild(ret);
    const tie = L.polyline([[0, 0], [0, 0]], { color: '#e8f1ff', weight: 1.2, opacity: 0.7, dashArray: '2 5', interactive: false, className: 'pickTie' });
    let lock = null, lockId = null, on = false;
    box.classList.add('pickmode');
    const off = () => {
      ret.classList.add('hidden');
      if (on) { S.map.removeLayer(tie); if (lock) { S.map.removeLayer(lock); lock = null; lockId = null; } on = false; }
    };
    S.map.on('mousemove', (e) => {
      const r = nearest(e.latlng);
      if (!r) return;
      const cp = e.containerPoint;
      ret.style.transform = 'translate(' + cp.x + 'px,' + cp.y + 'px)';
      ret.classList.remove('hidden');
      if (!on) { tie.addTo(S.map); on = true; }
      tie.setLatLngs([e.latlng, [r.lat, r.lon]]);
      if (lockId !== r.id) {
        if (lock) S.map.removeLayer(lock);
        const col = LVCOL[r.tier === 'x' ? 0 : +r.tier + 1] || LVCOL[0];
        lock = L.marker([r.lat, r.lon], { interactive: false, zIndexOffset: 900, icon: L.divIcon({ className: 'pickLock', iconSize: [0, 0],
          html: '<span class="ring" style="--c:' + col + '"></span><span class="chip"><i style="background:' + col + '"></i><b>' + esc(r.name) + (r.state ? ', ' + esc(r.state) : '') + '</b><em>' + TIER_NAME[r.tier] + '</em></span>' }) }).addTo(S.map);
        lockId = r.id;
      }
    });
    S.map.on('mouseout', off);
    const cc = box.querySelector('.leaflet-control-container');
    if (cc) cc.addEventListener('mouseover', off);
    S.map.on('movestart', () => { ret.classList.add('hidden'); });
    S.map.on('click', (e) => { const r = nearest(e.latlng); if (r) selectStation(r.id); });
  }
  function msg(t) {
    const m = $('#mapMsg');
    if (!t) { m.classList.add('hidden'); return; }
    m.textContent = t; m.classList.remove('hidden');
  }

  async function loadOverview(cyc) {
    msg('Loading balloon data...');
    let ov;
    try {
      ov = await HodoData.overview(cyc);
    } catch (e) { msg('Could not load soundings: ' + e.message); return; }
    S.ov = ov; S.cyc = ov.cycle;
    setTimeout(() => { if (S.refreshLabels) S.refreshLabels(); }, 600);
    renderSupport();
    S.group.clearLayers(); S.mk = {};
    if (!ov.stations.length) { msg('No soundings found for ' + (ov.cycle ? cycLabel(ov.cycle) : 'that time') + '. Try a different time.'); }
    else msg('');
    ov.stations.forEach((r) => {
      const m = L.marker([r.lat, r.lon], { icon: markerIcon(r), keyboard: false, interactive: false }).addTo(S.group);
      void ('<b>' + esc(r.name) + ', ' + esc(r.state) + '</b> (' + r.id + ')<br>' + TIER_NAME[r.tier] + (r.cape != null ? ' - fuel ' + r.cape + ' J/kg' : ''), { direction: 'top', offset: [0, -20] });
      S.mk[r.id] = { m, r };
    });
    // controls
    const cs = $('#cycSel');
    const list = ov.cycles.slice();
    if (ov.cycle && list.indexOf(ov.cycle) < 0) list.unshift(ov.cycle);
    cs.innerHTML = list.map((c) => '<option value="' + c + '"' + (c === ov.cycle ? ' selected' : '') + '>' + cycLabel(c) + '</option>').join('');
    $('#chipCycle').innerHTML = ov.cycle ? '<i></i>' + cycLabel(ov.cycle) + ' balloons <em>' + ov.stations.length + ' sites</em>' : '';
    const ss = $('#stSel');
    ss.innerHTML = '<option value="">Pick a station...</option>' + ov.stations.slice().sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => '<option value="' + r.id + '">' + esc(r.name) + ', ' + esc(r.state) + ' (' + r.id + ')</option>').join('');
    if (S.sel && S.mk[S.sel]) { ss.value = S.sel; selectStation(S.sel, true); }
    else if (S.sel) { S.sel = null; $('#stationView').classList.add('hidden'); $('#welcome').classList.remove('hidden'); }
  }

  async function selectStation(id, keepView) {
    const prev = S.sel;
    S.sel = id;
    if (prev && S.mk[prev]) S.mk[prev].m.setIcon(markerIcon(S.mk[prev].r));
    if (S.mk[id]) {
      S.mk[id].m.setIcon(markerIcon(S.mk[id].r));
      if (!keepView) S.map.panTo([S.mk[id].r.lat, S.mk[id].r.lon]);
    }
    $('#stSel').value = id;
    try {
      const P = await HodoData.profile(id, S.cyc);
      if (!P) throw new Error('no sounding at that site for this launch');
      if (S.sel !== id) return;
      render(P);
      history.replaceState(null, '', '?st=' + id + '&cycle=' + S.cyc);
    } catch (e) { msg('No sounding for ' + id + ': ' + e.message); setTimeout(() => msg(''), 3000); }
  }

  // ---------------------------------------------------------------- wiring
  $('#cycSel').onchange = (e) => loadOverview(e.target.value);
  $('#stSel').onchange = (e) => { if (e.target.value) selectStation(e.target.value); };
  $('#dayGo').onclick = () => {
    const d = $('#dayIn').value;
    if (!d) return;
    loadOverview(d.replace(/-/g, '') + $('#hrIn').value);
  };
  $('#unitSeg').querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', b.dataset.u === unit);
    b.onclick = () => {
      unit = b.dataset.u; localStorage.setItem('hodo-unit', unit);
      $('#unitSeg').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      if (S.P) render(S.P);
    };
  });
  [['#tgSrh', 'srh'], ['#tgShear', 'shear'], ['#tgKm', 'km']].forEach(([sel, key]) => {
    $(sel).onchange = (e) => { opt[key] = e.target.checked; if (S.P) drawHodo(S.P); };
  });
  const startTour = (ids) => { if (!S.P || !ids || !ids.length) return; S.tourIds = ids; tourGo(0); };
  $('#tourBtn').onclick = () => startTour(S.hodoTourIds);
  $('#tourBtn0').onclick = () => startTour(S.hodoTourIds);
  $('#sndTourBtn').onclick = () => startTour(S.sndTourIds);

  // ---------------------------------------------------------------- custom dropdown menus (replace the native lists)
  function enhanceSelect(sel) {
    const wrap = document.createElement('div');
    wrap.className = 'dd';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'ddb';
    const list = document.createElement('div');
    list.className = 'ddl hidden';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(btn); wrap.appendChild(list); wrap.appendChild(sel);
    sel.classList.add('ddsel');
    let built = '';
    const label = () => { const o = sel.options[sel.selectedIndex]; btn.textContent = o ? o.textContent : ''; };
    const build = () => {
      const key = Array.prototype.map.call(sel.options, (o) => o.value).join('|');
      if (key !== built) {
        built = key;
        list.innerHTML = '';
        Array.prototype.forEach.call(sel.options, (o) => {
          const it = document.createElement('div');
          it.className = 'ddi'; it.dataset.v = o.value; it.textContent = o.textContent;
          it.onclick = () => { sel.value = o.value; sel.dispatchEvent(new Event('change')); close(); label(); };
          list.appendChild(it);
        });
      }
      list.querySelectorAll('.ddi').forEach((it) => it.classList.toggle('on', it.dataset.v === sel.value));
      label();
    };
    const close = () => { list.classList.add('hidden'); wrap.classList.remove('open'); };
    btn.onclick = (e) => {
      e.stopPropagation();
      const open = list.classList.contains('hidden');
      document.querySelectorAll('.ddl').forEach((l) => l.classList.add('hidden'));
      document.querySelectorAll('.dd').forEach((d) => d.classList.remove('open'));
      if (open) { build(); list.classList.remove('hidden'); wrap.classList.add('open'); const on = list.querySelector('.ddi.on'); if (on) on.scrollIntoView({ block: 'center' }); }
    };
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    new MutationObserver(build).observe(sel, { childList: true });
    setInterval(label, 400);
    build();
  }
  ['#cycSel', '#hrIn', '#stSel'].forEach((q) => enhanceSelect($(q)));

  window.__hodoDiag = () => ({ cycle: S.cyc, stations: S.ov ? S.ov.stations.length : 0, sel: S.sel, infoIds: Object.keys(S.INFO), tour: S.tour, unit,
    P: S.P ? { id: S.P.id, srh1: S.P.srh1, sh6: S.P.sh6, cape: S.P.cape, tier: S.P.tier } : null });
  window.__hodoOpen = (id) => openInfo(id, false);

  initMap();
  wireMapPick();
  const q = new URLSearchParams(location.search);
  if (q.get('st')) S.sel = q.get('st');
  loadOverview(q.get('cycle') || null);
  void applyOpts;
})();
