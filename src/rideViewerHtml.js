/**
 * Builds the self-contained HTML page shown in the ride detail WebView:
 * route map (Leaflet, coloured by lean), lean chart, and a shared cursor —
 * tap the route or drag across the chart to read lean and speed at that point.
 *
 * Kept as plain HTML/JS so it can also be opened and tested in a desktop browser.
 */
import { LEAFLET_CSS, LEAFLET_JS } from './leafletBundle';

export function rideViewerHtml(ride, settings) {
  const cfg = {
    warn: settings.warnDeg,
    danger: settings.dangerDeg,
    speedFactor: settings.speedUnit === 'mph' ? 0.621371 : 1,
    speedUnit: settings.speedUnit === 'mph' ? 'mph' : 'km/h',
    distFactor: settings.speedUnit === 'mph' ? 0.621371 : 1,
    distUnit: settings.speedUnit === 'mph' ? 'mi' : 'km',
  };
  // "<" is escaped so the data can never close the script tag.
  const data = JSON.stringify({ ride, cfg }).replace(/</g, '\\u003c');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>${LEAFLET_CSS}</style>
<style>
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin: 0; height: 100%; background: #000; color: #F5F5F5;
    font-family: ui-monospace, Menlo, Consolas, monospace; overflow: hidden;
    -webkit-user-select: none; user-select: none; }
  #root { display: flex; flex-direction: column; height: 100%; }
  #stats { display: flex; border-bottom: 1px solid #222; }
  #stats div { flex: 1; padding: 6px 4px; text-align: center; border-right: 1px solid #222; min-width: 0; }
  #stats div:last-child { border-right: 0; }
  #stats b { display: block; font-size: 17px; white-space: nowrap; }
  #stats span { font-size: 9px; letter-spacing: 1px; color: #8A8A8A; }
  #main { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  #map { flex: 1.25; min-height: 0; background: #0A0A0A; }
  #side { flex: 1; display: flex; flex-direction: column; min-height: 0; min-width: 0; }
  #readout { display: flex; align-items: baseline; gap: 14px; padding: 8px 10px;
    border-top: 1px solid #222; border-bottom: 1px solid #222; }
  #rLean { font-size: 34px; font-weight: 800; min-width: 118px; }
  #rSpeed { font-size: 18px; }
  #rTime { font-size: 13px; color: #8A8A8A; margin-left: auto; }
  #chartWrap { flex: 1; position: relative; min-height: 0; }
  #chart { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
  #tools { display: flex; gap: 6px; padding: 6px 8px; align-items: center; }
  #tools button { background: #0A0A0A; color: #F5F5F5; border: 1px solid #555; border-radius: 4px;
    font: inherit; font-size: 13px; font-weight: 700; padding: 7px 12px; }
  #tools button.on { border-color: #F5F5F5; }
  #tools .hint { font-size: 10px; color: #8A8A8A; margin-left: auto; text-align: right; }
  #empty { display: none; padding: 30px 16px; color: #8A8A8A; text-align: center; }
  .leaflet-container { background: #0A0A0A; font: inherit; }
  .leaflet-control-attribution { background: rgba(0,0,0,.6) !important; color: #8A8A8A; font-size: 9px; }
  .leaflet-control-attribution a { color: #8A8A8A; }
  .leaflet-bar a { background: #0A0A0A; color: #F5F5F5; border-color: #333; }
  .tag { background: #000; border: 1px solid #F5F5F5; color: #F5F5F5; font-size: 10px; font-weight: 700;
    padding: 1px 4px; border-radius: 3px; white-space: nowrap; }
  @media (orientation: landscape) {
    #main { flex-direction: row; }
    #map { flex: 1; }
    #side { border-left: 1px solid #222; }
    #readout { border-top: 0; }
  }
</style>
</head>
<body>
<div id="root">
  <div id="stats">
    <div><b id="sDur">–</b><span>TIME</span></div>
    <div><b id="sDist">–</b><span>DIST</span></div>
    <div><b id="sL">–</b><span>MAX LEFT</span></div>
    <div><b id="sR">–</b><span>MAX RIGHT</span></div>
    <div><b id="sV">–</b><span>MAX SPEED</span></div>
  </div>
  <div id="empty">This ride has no samples.</div>
  <div id="main">
    <div id="map"></div>
    <div id="side">
      <div id="readout">
        <span id="rLean">–</span><span id="rSpeed">–</span><span id="rTime">–</span>
      </div>
      <div id="chartWrap"><canvas id="chart"></canvas></div>
      <div id="tools">
        <button id="zOut">−</button><button id="zIn">+</button><button id="zAll">ALL</button>
        <button id="bL">MAX L</button><button id="bR">MAX R</button>
        <span class="hint">tap route<br>or drag chart</span>
      </div>
    </div>
  </div>
</div>
<script>${LEAFLET_JS}</script>
<script>
(function () {
  var DATA = ${data};
  var cfg = DATA.cfg, S = DATA.ride.samples || [], N = S.length;
  var $ = function (id) { return document.getElementById(id); };
  var COL = ['#00E676', '#FFB000', '#FF3B30'];
  var bucket = function (deg) { var a = Math.abs(deg); return a >= cfg.danger ? 2 : a >= cfg.warn ? 1 : 0; };
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  var clock = function (ms) { var d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()); };
  var dur = function (ms) { var s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? h + 'h ' + pad2(m) + 'm' : m + 'm ' + pad2(s % 60) + 's'; };
  var leanText = function (deg) { var a = Math.round(Math.abs(deg)); return a + '\\u00B0' + (a < 1 ? '' : deg < 0 ? ' L' : ' R'); };

  if (!N) { $('main').style.display = 'none'; $('empty').style.display = 'block'; return; }

  /* ---------- prepare data ---------- */
  var lean = new Float32Array(N), spd = new Float32Array(N), lat = new Float64Array(N), lon = new Float64Array(N), hasPos = false;
  var iMaxL = 0, iMaxR = 0, vMax = 0;
  for (var i = 0; i < N; i++) {
    lean[i] = S[i].lean || 0; spd[i] = (S[i].spd || 0) * cfg.speedFactor;
    if (lean[i] < lean[iMaxL]) iMaxL = i;
    if (lean[i] > lean[iMaxR]) iMaxR = i;
    if (spd[i] > vMax) vMax = spd[i];
  }
  // GPS updates ~1x per second but lean is logged faster: spread the samples evenly
  // between consecutive fixes so every sample has its own spot on the road.
  var fixes = [];
  for (i = 0; i < N; i++) {
    if (S[i].lat == null || S[i].lon == null) continue;
    var last = fixes.length ? fixes[fixes.length - 1] : -1;
    if (last < 0 || S[i].lat !== S[last].lat || S[i].lon !== S[last].lon) fixes.push(i);
  }
  if (fixes.length) {
    hasPos = true;
    for (i = 0; i < N; i++) { lat[i] = S[fixes[0]].lat; lon[i] = S[fixes[0]].lon; }
    for (var k = 0; k < fixes.length; k++) {
      var a = fixes[k], b = k + 1 < fixes.length ? fixes[k + 1] : N;
      var la1 = S[a].lat, lo1 = S[a].lon;
      var la2 = k + 1 < fixes.length ? S[b].lat : la1, lo2 = k + 1 < fixes.length ? S[b].lon : lo1;
      for (i = a; i < b; i++) { var u = (i - a) / (b - a); lat[i] = la1 + (la2 - la1) * u; lon[i] = lo1 + (lo2 - lo1) * u; }
    }
  }

  /* ---------- stats ---------- */
  var st = DATA.ride.stats || {};
  $('sDur').textContent = dur((DATA.ride.endedAt || S[N - 1].t) - (DATA.ride.startedAt || S[0].t));
  $('sDist').textContent = st.distanceKm != null ? (st.distanceKm * cfg.distFactor).toFixed(1) + ' ' + cfg.distUnit : '–';
  $('sL').textContent = Math.round(-lean[iMaxL]) + '\\u00B0';
  $('sR').textContent = Math.round(lean[iMaxR]) + '\\u00B0';
  $('sV').textContent = Math.round(vMax) + ' ' + cfg.speedUnit;

  /* ---------- map ---------- */
  var map = null, cursor = null, STEP = Math.max(1, Math.ceil(N / 6000));
  if (hasPos && window.L) {
    map = L.map('map', { preferCanvas: true, zoomControl: true, attributionControl: true });
    map.attributionControl.setPrefix(false);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(map);
    // route, split into runs of the same colour
    var run = [], runB = -1, all = [];
    for (i = 0; i < N; i += STEP) {
      var worst = 0;
      for (var j = i; j < Math.min(N, i + STEP); j++) if (Math.abs(lean[j]) > Math.abs(worst)) worst = lean[j];
      var bk = bucket(worst), pt = [lat[i], lon[i]];
      all.push(pt);
      if (bk !== runB && run.length) {
        run.push(pt);
        L.polyline(run, { color: COL[runB], weight: 5, opacity: 0.95, interactive: false }).addTo(map);
        run = [];
      }
      run.push(pt); runB = bk;
    }
    if (run.length > 1) L.polyline(run, { color: COL[runB], weight: 5, opacity: 0.95, interactive: false }).addTo(map);
    var tag = function (idx, text) {
      L.marker([lat[idx], lon[idx]], { interactive: false, icon: L.divIcon({ className: '', html: '<span class="tag">' + text + '</span>', iconSize: null, iconAnchor: [-6, 8] }) }).addTo(map);
      L.circleMarker([lat[idx], lon[idx]], { radius: 4, color: '#F5F5F5', weight: 2, fillColor: '#000', fillOpacity: 1, interactive: false }).addTo(map);
    };
    tag(0, 'START'); tag(N - 1, 'END');
    if (lean[iMaxL] < -1) tag(iMaxL, 'MAX L ' + Math.round(-lean[iMaxL]) + '\\u00B0');
    if (lean[iMaxR] > 1) tag(iMaxR, 'MAX R ' + Math.round(lean[iMaxR]) + '\\u00B0');
    cursor = L.circleMarker([lat[0], lon[0]], { radius: 9, color: '#F5F5F5', weight: 3, fillColor: '#00B0FF', fillOpacity: 1, interactive: false }).addTo(map);
    map.fitBounds(L.latLngBounds(all), { padding: [24, 24] });
    // tap anywhere near the route -> nearest logged sample
    map.on('click', function (e) {
      var p = map.latLngToContainerPoint(e.latlng), best = -1, bestD = 1e18;
      for (var q = 0; q < N; q += STEP) {
        var c = map.latLngToContainerPoint([lat[q], lon[q]]), dx = c.x - p.x, dy = c.y - p.y, d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = q; }
      }
      // refine inside the decimation step
      for (q = Math.max(0, best - STEP); q < Math.min(N, best + STEP); q++) {
        c = map.latLngToContainerPoint([lat[q], lon[q]]); dx = c.x - p.x; dy = c.y - p.y; d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = q; }
      }
      if (best >= 0 && bestD < 60 * 60) select(best, 'map');
    });
  } else {
    $('map').innerHTML = '<div style="padding:24px;color:#8A8A8A;text-align:center">No GPS positions in this ride.</div>';
  }

  /* ---------- chart ---------- */
  var cv = $('chart'), ctx = cv.getContext('2d'), W = 0, H = 0, DPR = window.devicePixelRatio || 1;
  var v0 = 0, v1 = N - 1, sel = iMaxL !== 0 && -lean[iMaxL] > lean[iMaxR] ? iMaxL : iMaxR;
  var ML = 34, MR = 8, MT = 8, MB = 18;
  var yMax = Math.max(20, Math.ceil(Math.max(-lean[iMaxL], lean[iMaxR]) / 10) * 10 + 5);
  var xOf = function (idx) { return ML + (v1 === v0 ? 0 : (idx - v0) / (v1 - v0)) * (W - ML - MR); };
  var yOf = function (deg) { return MT + (1 - (deg + yMax) / (2 * yMax)) * (H - MT - MB); };
  var idxAt = function (px) { var u = (px - ML) / (W - ML - MR); u = u < 0 ? 0 : u > 1 ? 1 : u; return Math.round(v0 + u * (v1 - v0)); };

  function draw() {
    var r = cv.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    if (W !== r.width || H !== r.height) { W = r.width; H = r.height; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = '10px ui-monospace, Menlo, monospace'; ctx.textBaseline = 'middle';
    // grid + labels (right lean up, left lean down)
    for (var g = -yMax + 5; g < yMax; g += 10) { if (Math.abs(g % 20) > 0.1 && yMax > 45) continue;
      ctx.strokeStyle = g === 0 ? '#555' : '#1C1C1C'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ML, yOf(g)); ctx.lineTo(W - MR, yOf(g)); ctx.stroke(); }
    ctx.strokeStyle = '#555'; ctx.beginPath(); ctx.moveTo(ML, yOf(0)); ctx.lineTo(W - MR, yOf(0)); ctx.stroke();
    ctx.fillStyle = '#8A8A8A'; ctx.textAlign = 'right';
    for (g = -Math.floor(yMax / 20) * 20; g <= yMax; g += 20) ctx.fillText(Math.abs(g) + '\\u00B0', ML - 5, yOf(g));
    ctx.textAlign = 'left'; ctx.fillText('R', 2, yOf(yMax * 0.5)); ctx.fillText('L', 2, yOf(-yMax * 0.5));
    // warning bands
    [[cfg.warn, COL[1]], [cfg.danger, COL[2]]].forEach(function (t) { if (t[0] >= yMax) return;
      ctx.strokeStyle = t[1]; ctx.globalAlpha = 0.45; ctx.setLineDash([4, 4]);
      [t[0], -t[0]].forEach(function (d) { ctx.beginPath(); ctx.moveTo(ML, yOf(d)); ctx.lineTo(W - MR, yOf(d)); ctx.stroke(); });
      ctx.setLineDash([]); ctx.globalAlpha = 1; });
    // speed (faint, own scale 0..vMax across the upper half... full height)
    var cols = Math.max(1, Math.floor(W - ML - MR)), span = v1 - v0;
    if (vMax > 0) { ctx.strokeStyle = '#2E5E8C'; ctx.lineWidth = 1; ctx.beginPath();
      for (var cI = 0; cI <= cols; cI++) { var ii = Math.round(v0 + (cI / cols) * span), yy = MT + (1 - spd[ii] / (vMax * 1.05)) * (H - MT - MB); if (cI) ctx.lineTo(ML + cI, yy); else ctx.moveTo(ML + cI, yy); }
      ctx.stroke(); }
    // lean: per pixel column keep the extreme value so peaks never disappear when zoomed out
    var prevB = -1; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    var px = 0, py = 0;
    for (cI = 0; cI <= cols; cI++) {
      var s0 = Math.round(v0 + (cI / cols) * span), s1 = Math.max(s0 + 1, Math.round(v0 + ((cI + 1) / cols) * span)), ext = lean[s0];
      for (var q = s0; q < Math.min(N, s1); q++) if (Math.abs(lean[q]) > Math.abs(ext)) ext = lean[q];
      var x = ML + cI, y = yOf(ext), bkt = bucket(ext);
      if (cI) { ctx.strokeStyle = COL[Math.max(bkt, prevB)] === COL[0] ? '#F5F5F5' : COL[Math.max(bkt, prevB)]; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke(); }
      px = x; py = y; prevB = bkt;
    }
    // time axis
    ctx.fillStyle = '#8A8A8A'; ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left'; ctx.fillText(clock(S[v0].t), ML, H - 4);
    ctx.textAlign = 'right'; ctx.fillText(clock(S[v1].t), W - MR, H - 4);
    // cursor
    if (sel >= v0 && sel <= v1) { var sx = xOf(sel);
      ctx.strokeStyle = '#00B0FF'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx, MT); ctx.lineTo(sx, H - MB); ctx.stroke();
      ctx.fillStyle = '#00B0FF'; ctx.strokeStyle = '#F5F5F5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, yOf(lean[sel]), 5, 0, 6.3); ctx.fill(); ctx.stroke(); }
  }

  function select(idx, from) {
    sel = Math.max(0, Math.min(N - 1, idx));
    var b = bucket(lean[sel]);
    $('rLean').textContent = leanText(lean[sel]);
    $('rLean').style.color = b ? COL[b] : '#F5F5F5';
    $('rSpeed').textContent = Math.round(spd[sel]) + ' ' + cfg.speedUnit;
    $('rTime').textContent = clock(S[sel].t);
    if (from !== 'chart' && (sel < v0 || sel > v1)) { var half = (v1 - v0) / 2; v0 = Math.max(0, Math.round(sel - half)); v1 = Math.min(N - 1, v0 + Math.round(half * 2)); }
    if (cursor) { var ll = [lat[sel], lon[sel]]; cursor.setLatLng(ll);
      if (from !== 'map' && !map.getBounds().pad(-0.1).contains(ll)) map.panTo(ll, { animate: false }); }
    draw();
  }
  window.__select = select; // used by tests

  function zoom(f) {
    if (f === 0) { v0 = 0; v1 = N - 1; draw(); return; }
    var span = Math.max(20, Math.min(N - 1, Math.round((v1 - v0) * f)));
    v0 = Math.max(0, Math.min(N - 1 - span, Math.round(sel - span / 2))); v1 = Math.min(N - 1, v0 + span); draw();
  }
  $('zIn').onclick = function () { zoom(0.5); };
  $('zOut').onclick = function () { zoom(2); };
  $('zAll').onclick = function () { zoom(0); };
  $('bL').onclick = function () { select(iMaxL); };
  $('bR').onclick = function () { select(iMaxR); };

  var dragging = false;
  var pick = function (e) { var r = cv.getBoundingClientRect(); select(idxAt(e.clientX - r.left), 'chart'); };
  cv.addEventListener('pointerdown', function (e) { dragging = true; try { cv.setPointerCapture(e.pointerId); } catch (x) {} pick(e); });
  cv.addEventListener('pointermove', function (e) { if (dragging) pick(e); });
  cv.addEventListener('pointerup', function () { dragging = false; });
  cv.addEventListener('pointercancel', function () { dragging = false; });

  window.addEventListener('resize', function () { if (map) map.invalidateSize(); draw(); });
  select(sel);
  setTimeout(function () { if (map) map.invalidateSize(); draw(); }, 150);
})();
</script>
</body>
</html>`;
}
