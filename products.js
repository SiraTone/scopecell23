(function () {
  const BASES = ['https://raw.githubusercontent.com/SiraTone/scopecell23/refs/heads/cstor-data', 'https://cdn.jsdelivr.net/gh/SiraTone/scopecell23@cstor-data'];
  const $ = (id) => document.getElementById(id);
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmt = (d) => d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + 'Z';
  async function get(path, json) {
    for (const b of BASES) {
      try { const r = await fetch(b + '/' + path + '?t=' + Math.floor(Date.now() / 60000)); if (r.ok) return { b, v: json ? await r.json() : null }; } catch (e) {}
    }
    throw new Error('unavailable');
  }
  function nextRun(meta, now) {
    const cyc = (meta.schedule && meta.schedule.cycles_utc) || [0, 6, 12, 18], lag = (meta.schedule && meta.schedule.typical_lag_h) || 2.5;
    for (let i = 0; i < 3; i++) for (const c of cyc) {
      const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i, c) + lag * 3600e3);
      if (t > now) return t;
    }
  }
  (async function () {
    try {
      const { b, v: m } = await get('latest.json', true);
      const run = new Date(m.run_utc), now = new Date();
      $('p-run').textContent = run.getUTCDate() + ' ' + MON[run.getUTCMonth()] + ' ' + String(run.getUTCHours()).padStart(2, '0') + 'Z';
      const nxt = nextRun(m, now), nel = $('p-next');
      const tick = () => {
        const s = Math.max(0, Math.floor((nxt - new Date()) / 1000)), p = (n) => String(n).padStart(2, '0');
        nel.textContent = fmt(nxt) + ' (in ' + (s >= 3600 ? Math.floor(s / 3600) + 'h ' : '') + p(Math.floor(s % 3600 / 60)) + 'm ' + p(s % 60) + 's)';
      };
      tick(); setInterval(tick, 1000);
      const age = (now - run) / 3600e3;
      if (age > 9) { $('p-warn').hidden = false; $('p-warn').textContent = 'This run is ' + Math.round(age) + ' hours old. The model PC may be offline; newer data will appear here when it is back.'; }
      const bar = $('p-bar'), img = $('p-img');
      const show = (f, btn) => { img.src = b + '/' + f + '?v=' + m.published; [...bar.children, ...$('s-bar').children].forEach((x) => x.classList.toggle('on', x === btn)); };
      m.frames.forEach((f, i) => {
        const btn = document.createElement('button');
        btn.textContent = i === 0 ? 'Whole period' : '+' + f.match(/f(\d+)/)[1] + 'h';
        btn.onclick = () => show(f, btn);
        bar.appendChild(btn);
        if (i === 0) show(f, btn);
      });
    } catch (e) {
      $('p-run').textContent = 'not published yet';
      $('p-img').remove();
    }
  })();

  (async function () {
    const SB = ['https://raw.githubusercontent.com/SiraTone/scopecell23/refs/heads/svr-data', 'https://cdn.jsdelivr.net/gh/SiraTone/scopecell23@svr-data'];
    const NAMES = { wind: 'Wind', hail: 'Hail', sig_wind: 'Sig wind', sig_hail: 'Sig hail' };
    let b, m;
    for (const x of SB) { try { const r = await fetch(x + '/latest.json?t=' + Math.floor(Date.now() / 60000)); if (r.ok) { b = x; m = await r.json(); break; } } catch (e) {} }
    if (!m) return;
    const run = new Date(m.run_utc), note = $('s-note');
    note.hidden = false;
    note.textContent = 'Wind and hail, convective day (12Z to 12Z). REFS run ' + run.getUTCDate() + ' ' + MON[run.getUTCMonth()] + ' ' + String(run.getUTCHours()).padStart(2, '0') + 'Z, updates at 00 and 12Z.';
    const bar = $('s-bar'), img = $('p-img');
    ['wind', 'hail', 'sig_wind', 'sig_hail'].filter((k) => m.frames.includes('hz_' + k + '.png')).forEach((k) => {
      const btn = document.createElement('button'), pk = m.peaks && m.peaks[k];
      btn.textContent = NAMES[k] + (pk != null ? ' (' + (pk >= 0.1 ? Math.round(pk * 100) : (pk * 100).toFixed(1)) + '%)' : '');
      btn.onclick = () => {
        if (!img.isConnected) return;
        img.src = b + '/hz_' + k + '.png?v=' + m.published;
        [...$('p-bar').children, ...bar.children].forEach((x) => x.classList.toggle('on', x === btn));
      };
      bar.appendChild(btn);
    });
  })();

  (async function () {
    async function load(br) {
      for (const b of ['https://raw.githubusercontent.com/SiraTone/scopecell23/refs/heads/' + br, 'https://cdn.jsdelivr.net/gh/SiraTone/scopecell23@' + br]) {
        try { const r = await fetch(b + '/index.json?t=' + Math.floor(Date.now() / 60000)); if (r.ok) return { base: b, idx: await r.json() }; } catch (e) {}
      }
      return { base: null, idx: [] };
    }
    const [T, S] = await Promise.all([load('cstor-archive'), load('svr-archive')]);
    const days = $('a-days'), runs = $('a-runs'), svr = $('a-svr'), img = $('a-img');
    const NAMES = { wind: 'Wind', hail: 'Hail', sig_wind: 'Sig wind', sig_hail: 'Sig hail' };
    const byDay = {}, add = (r, kind) => { const d = r.run_utc.slice(0, 10); (byDay[d] = byDay[d] || { t: [], s: [] })[kind].push(r); };
    T.idx.filter((r) => r.run_utc >= '2026-11-12T00').forEach((r) => add(r, 't'));
    S.idx.forEach((r) => add(r, 's'));
    if (!Object.keys(byDay).length) { days.textContent = 'No archived runs yet.'; return; }
    const pick = (el, group) => [...group.children].forEach((x) => x.classList.toggle('on', x === el));
    const pickMap = (el) => [...runs.children, ...svr.children].forEach((x) => x.classList.toggle('on', x === el));
    function showDay(d, btn) {
      pick(btn, days); runs.innerHTML = ''; svr.innerHTML = '';
      byDay[d].t.forEach((r) => {
        const b = document.createElement('button');
        b.textContent = r.run_utc.slice(11, 13) + 'Z tornado';
        b.onclick = () => { pickMap(b); img.hidden = false; img.src = T.base + '/runs/' + r.id + '.png'; };
        runs.appendChild(b);
      });
      byDay[d].s.forEach((r) => ['wind', 'hail', 'sig_wind', 'sig_hail'].filter((k) => r.hazards.includes(k)).forEach((k) => {
        const b = document.createElement('button');
        b.textContent = r.run_utc.slice(11, 13) + 'Z ' + NAMES[k];
        b.onclick = () => { pickMap(b); img.hidden = false; img.src = S.base + '/runs/' + r.id + '_' + k + '.png'; };
        svr.appendChild(b);
      }));
      const first = runs.lastElementChild || svr.firstElementChild;
      if (first) first.click();
    }
    Object.keys(byDay).sort().reverse().forEach((d, i) => {
      const b = document.createElement('button');
      b.textContent = MON[+d.slice(5, 7) - 1] + ' ' + (+d.slice(8, 10));
      b.onclick = () => showDay(d, b);
      days.appendChild(b);
      if (i === 0) b.click();
    });
  })();
})();
