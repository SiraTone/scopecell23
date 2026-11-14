/* KyCast viewer: live GOES-East satellite layer with a product switcher.
   Public build: tiles come straight from NASA GIBS (keyless, CORS open), so no server is needed.
   The studio version (static/kysat.js) renders from RAMMB SLIDER on a local server; keep the product list in step by hand.
   Diag: window.__kySatDiag(). */
(() => {
  'use strict';
  const map = window.__kyMap;
  const $ = s => document.querySelector(s);
  if (!map || !$('#lySat')) return;

  // id -> [group, short name, one-line description, GIBS layer, native max zoom]
  const PRODUCTS = {
    geocolor: ['Color', 'GeoColor', 'True color, IR at night', 'GOES-East_ABI_GeoColor', 7],
    firetemp: ['Color', 'Fire temp', 'Hot spots and fires', 'GOES-East_ABI_FireTemp', 7],
    airmass: ['Color', 'Air mass', 'Jet stream and dry air', 'GOES-East_ABI_Air_Mass', 6],
    dust: ['Color', 'Dust', 'Dust and smoke', 'GOES-East_ABI_Dust', 7],
    vis: ['Visible', 'Visible', 'Red, 0.64 um (day only)', 'GOES-East_ABI_Band2_Red_Visible_1km', 7],
    ir: ['Infrared', 'Clean IR', '10.3 um cloud-top temp', 'GOES-East_ABI_Band13_Clean_Infrared', 6],
  };
  const label = k => PRODUCTS[k][1];
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ky.sat.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ky.sat.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  const st = { prod: store.get('prod', 'geocolor'), on: store.get('on', false), op: store.get('op', 70), layer: null, timer: null, err: 0 };
  if (!PRODUCTS[st.prod]) st.prod = 'geocolor';

  map.createPane('sat').style.zIndex = 415;      // above the basemap, under every forecast layer

  const groups = [...new Set(Object.values(PRODUCTS).map(v => v[0]))];
  const sel = $('#satProd');
  sel.innerHTML = groups.map(g => `<optgroup label="${g}">` + Object.entries(PRODUCTS).filter(([, v]) => v[0] === g)
    .map(([k, v]) => `<option value="${k}">${v[1]} - ${v[2]}</option>`).join('') + '</optgroup>').join('');
  sel.value = st.prod;
  $('#opSatV').textContent = st.op + '%';
  $('#lySat').checked = st.on;
  $('#opSat').value = st.op;

  const note = (t, cls) => { $('#satNote').textContent = t; $('#satStat').className = cls || ''; };

  function remove() { if (st.layer) { map.removeLayer(st.layer); st.layer = null; } }

  function show() {
    clearTimeout(st.timer);
    remove();
    if (!st.on) { note(''); return; }
    const [, , , gibs, nz] = PRODUCTS[st.prod];
    const bucket = Math.floor(Date.now() / 600000);      // new URL every 10 min so the browser cache never pins an old scan
    const url = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${gibs}/default/GoogleMapsCompatible_Level${nz}/{z}/{y}/{x}.png?b=${bucket}`;
    // no TIME segment in the path = GIBS serves the newest scan
    const layer = L.tileLayer(url, { pane: 'sat', opacity: st.op / 100, maxNativeZoom: nz, maxZoom: 11, crossOrigin: true, keepBuffer: 1 });
    st.err = 0;
    note('Loading ' + label(st.prod) + ' ...', 'load');
    layer.on('tileerror', () => { st.err++; });
    layer.on('load', () => {
      if (st.layer !== layer) return;
      note(st.err > 3 ? 'Some satellite tiles unavailable' : `${label(st.prod)} - NASA GIBS, about 10 min behind`, st.err > 3 ? 'err' : 'ok');
    });
    layer.addTo(map);
    st.layer = layer;
    st.timer = setTimeout(show, 10 * 60 * 1000);          // GOES CONUS scans every 5 min; GIBS publishes about every 10
  }

  $('#lySat').onchange = e => { st.on = e.target.checked; store.set('on', st.on); $('#satSub').classList.toggle('hidden', !st.on); show(); };
  sel.onchange = e => { st.prod = e.target.value; store.set('prod', st.prod); show(); };
  $('#satRef').onclick = show;
  $('#opSat').oninput = e => { st.op = +e.target.value; $('#opSatV').textContent = st.op + '%'; store.set('op', st.op); if (st.layer) st.layer.setOpacity(st.op / 100); };
  $('#satSub').classList.toggle('hidden', !st.on);

  window.__kySatDiag = () => ({ on: st.on, product: st.prod, tileErrors: st.err, onMap: !!st.layer && map.hasLayer(st.layer), opacity: st.op, note: $('#satNote').textContent, url: st.layer && st.layer._url });
  if (st.on) show();
})();
