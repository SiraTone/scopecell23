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
      $('p-next').textContent = fmt(nextRun(m, now));
      const age = (now - run) / 3600e3;
      if (age > 9) { $('p-warn').hidden = false; $('p-warn').textContent = 'This run is ' + Math.round(age) + ' hours old. The model PC may be offline; newer data will appear here when it is back.'; }
      const bar = $('p-bar'), img = $('p-img');
      const show = (f, btn) => { img.src = b + '/' + f + '?v=' + m.published; [...bar.children].forEach((x) => x.classList.toggle('on', x === btn)); };
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
    const A = ['https://raw.githubusercontent.com/SiraTone/scopecell23/refs/heads/cstor-archive', 'https://cdn.jsdelivr.net/gh/SiraTone/scopecell23@cstor-archive'];
    let base, idx;
    for (const b of A) { try { const r = await fetch(b + '/index.json?t=' + Math.floor(Date.now() / 60000)); if (r.ok) { base = b; idx = await r.json(); break; } } catch (e) {} }
    const days = $('a-days'), runs = $('a-runs'), img = $('a-img');
    if (!idx || !idx.length) { days.textContent = 'No archived runs yet.'; return; }
    const byDay = {};
    idx.forEach((r) => { (byDay[r.run_utc.slice(0, 10)] = byDay[r.run_utc.slice(0, 10)] || []).push(r); });
    const pick = (el, group) => [...group.children].forEach((x) => x.classList.toggle('on', x === el));
    function showDay(d, btn) {
      pick(btn, days); runs.innerHTML = '';
      byDay[d].forEach((r, i) => {
        const b = document.createElement('button');
        b.textContent = r.run_utc.slice(11, 13) + 'Z run';
        b.onclick = () => { pick(b, runs); img.hidden = false; img.src = base + '/runs/' + r.id + '.png'; };
        runs.appendChild(b);
        if (i === byDay[d].length - 1) b.click();
      });
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
