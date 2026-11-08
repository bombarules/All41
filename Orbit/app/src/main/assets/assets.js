/* Park Universe asset inventory
 * Every bench, trash can, light, sign... in every park: GPS location, map icon,
 * condition, notes and a dated photo history, stored on the phone (IndexedDB).
 *
 * Needs from the home page: window.PU = { map(), PL, pick(i,o), toast(t), closeAll(), padFor() }
 */
(function () {
  "use strict";
  var TYPES = [
    ["bench", "Bench", "\ud83e\ude91", "#8d6e63"], ["trash", "Trash can", "\ud83d\uddd1\ufe0f", "#2e7d32"], ["dog", "Dog station", "\ud83d\udc15", "#43a047"],
    ["grill", "BBQ grill", "\ud83c\udf56", "#5d4037"], ["bathroom", "Bathroom", "\ud83d\udebb", "#1e88e5"], ["firepit", "Fire pit", "\ud83d\udd25", "#f4511e"],
    ["fountain", "Fountain", "\u26f2", "#039be5"], ["light", "Light", "\ud83d\udca1", "#f9a825"], ["mailbox", "Mailbox", "\ud83d\udceb", "#3949ab"],
    ["newspaper", "Newspaper box", "\ud83d\udcf0", "#546e7a"], ["table", "Picnic table", "\ud83e\uddfa", "#a1887f"], ["playground", "Playground", "\ud83c\udfa0", "#ef6c00"],
    ["field", "Athletic field", "\u26bd", "#2e7d32"], ["sign", "Park sign", "\ud83d\udea9", "#6d4c41"], ["structure", "Structure", "\ud83c\udfe0", "#8e24aa"],
    ["flowerpot", "Flower pot", "\ud83c\udf37", "#d81b60"], ["other", "Other", "\ud83d\udccd", "#607d8b"]];
  var T = {}; TYPES.forEach(function (t) { T[t[0]] = { id: t[0], name: t[1], e: t[2], c: t[3] }; });
  var COND = ["Good", "Fair", "Needs repair", "Out of service"];
  var COND_C = { "Good": "#22c55e", "Fair": "#eab308", "Needs repair": "#f97316", "Out of service": "#ef4444" };

  /* ---------------- storage (IndexedDB) ---------------- */
  var db = null, ASSETS = [];
  function open() {
    return new Promise(function (res, rej) {
      var rq = indexedDB.open("pu-assets", 1);
      rq.onupgradeneeded = function () { var d = rq.result;
        if (!d.objectStoreNames.contains("assets")) d.createObjectStore("assets", { keyPath: "id" });
        if (!d.objectStoreNames.contains("photos")) { var s = d.createObjectStore("photos", { keyPath: "id" }); s.createIndex("asset", "asset", { unique: false }); } };
      rq.onsuccess = function () { db = rq.result; res(db); }; rq.onerror = function () { rej(rq.error); };
    });
  }
  function tx(store, mode, fn) { return new Promise(function (res, rej) { var t = db.transaction(store, mode), s = t.objectStore(store), out = fn(s); t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); }; t.onerror = function () { rej(t.error); }; }); }
  function all(store) { return new Promise(function (res, rej) { var rq = db.transaction(store).objectStore(store).getAll(); rq.onsuccess = function () { res(rq.result || []); }; rq.onerror = function () { rej(rq.error); }; }); }
  function photosOf(id) { return new Promise(function (res) { var rq = db.transaction("photos").objectStore("photos").index("asset").getAll(id); rq.onsuccess = function () { res((rq.result || []).sort(function (a, b) { return b.date - a.date; })); }; rq.onerror = function () { res([]); }; }); }
  function saveAsset(a) { a.updated = Date.now(); return tx("assets", "readwrite", function (s) { return s.put(a); }).then(function () {
    var i = ASSETS.findIndex(function (x) { return x.id === a.id; }); if (i < 0) ASSETS.push(a); else ASSETS[i] = a; refresh(); }); }
  function delAsset(a) { return photosOf(a.id).then(function (ph) { return tx("photos", "readwrite", function (s) { ph.forEach(function (p) { s.delete(p.id); }); }); })
    .then(function () { return tx("assets", "readwrite", function (s) { s.delete(a.id); }); }).then(function () { ASSETS = ASSETS.filter(function (x) { return x.id !== a.id; }); refresh(); }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------------- helpers ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  function dkm(a, b) { var dx = (a[0] - b[0]) * 85, dy = (a[1] - b[1]) * 111; return Math.sqrt(dx * dx + dy * dy); }
  function nearestPark(ll) { var best = null, bd = 1e9; PU.PL.forEach(function (p) { var d = dkm(ll, p.ll); if (d < bd) { bd = d; best = p; } }); return best ? best.n : ""; }
  function parksByDistance(ll) { return PU.PL.map(function (p) { return { n: p.n, d: dkm(ll, p.ll) }; }).sort(function (a, b) { return a.d - b.d; }); }
  function fmtDate(t) { var d = new Date(t); return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
  function fmtAcc(m) { return m == null ? "map" : "\u00b1" + (m < 10 ? m.toFixed(1) : Math.round(m)) + " m"; }

  /* icon images: coloured pin with the type's symbol (same picture on the map and in lists) */
  var iconCache = {};
  function iconCanvas(type, px, ring) {
    var t = T[type] || T.other, c = document.createElement("canvas"), s = px || 64; c.width = s; c.height = s;
    var g = c.getContext("2d"), r = s * .42;
    g.beginPath(); g.arc(s / 2, s / 2, r + s * .04, 0, Math.PI * 2); g.fillStyle = ring || "#ffffff"; g.fill();
    g.beginPath(); g.arc(s / 2, s / 2, r - s * .02, 0, Math.PI * 2); g.fillStyle = t.c; g.fill();
    g.font = Math.round(s * .46) + "px 'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(t.e, s / 2, s / 2 + s * .03);
    return c;
  }
  function iconURL(type) { return iconCache[type] || (iconCache[type] = iconCanvas(type, 64).toDataURL()); }

  /* ---------------- map layers ---------------- */
  var selId = null;
  function gj() { return { type: "FeatureCollection", features: ASSETS.filter(function (a) { return a.lng != null; }).map(function (a) {
    return { type: "Feature", geometry: { type: "Point", coordinates: [a.lng, a.lat] }, properties: { id: a.id, type: T[a.type] ? a.type : "other", bad: a.cond === "Needs repair" || a.cond === "Out of service" ? 1 : 0 } }; }) }; }
  function addLayers() {
    var map = PU.map(); if (!map || map.getSource("as")) return;
    TYPES.forEach(function (t) { var id = "as-" + t[0]; if (!map.hasImage(id)) { var c = iconCanvas(t[0], 64); map.addImage(id, c.getContext("2d").getImageData(0, 0, 64, 64), { pixelRatio: 2 }); }
      var idb = "asb-" + t[0]; if (!map.hasImage(idb)) { var c2 = iconCanvas(t[0], 64, "#ff3b30"); map.addImage(idb, c2.getContext("2d").getImageData(0, 0, 64, 64), { pixelRatio: 2 }); } });
    var slot = PU.std() ? { slot: "top" } : {};
    map.addSource("as", { type: "geojson", data: gj() });
    map.addLayer(Object.assign({ id: "as-sel", type: "circle", source: "as", filter: ["==", ["get", "id"], selId || ""], paint: { "circle-radius": 20, "circle-color": "rgba(255,224,102,.35)", "circle-stroke-color": "#ffe066", "circle-stroke-width": 2.5, "circle-emissive-strength": 1 } }, slot));
    map.addLayer(Object.assign({ id: "as-icons", type: "symbol", source: "as", minzoom: 14.5,
      layout: { "icon-image": ["concat", ["case", ["==", ["get", "bad"], 1], "asb-", "as-"], ["get", "type"]], "icon-size": ["interpolate", ["linear"], ["zoom"], 14.5, .55, 17, .85, 20, 1.15],
        "icon-allow-overlap": ["step", ["zoom"], false, 17.5, true], "icon-ignore-placement": false, "icon-padding": 1 },
      paint: { "icon-emissive-strength": 1, "icon-opacity": ["interpolate", ["linear"], ["zoom"], 14.5, 0, 15, 1] } }, slot));
    map.addLayer(Object.assign({ id: "me-acc", type: "circle", source: { type: "geojson", data: meGJ() }, paint: { "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 10, ["/", ["get", "acc"], 58.74], 22, ["/", ["get", "acc"], .01434]], "circle-color": "rgba(56,152,255,.15)", "circle-stroke-color": "rgba(56,152,255,.5)", "circle-stroke-width": 1, "circle-pitch-alignment": "map", "circle-emissive-strength": 1 } }, slot));
    map.addLayer(Object.assign({ id: "me-dot", type: "circle", source: "me-acc", paint: { "circle-radius": 7, "circle-color": "#1e88ff", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5, "circle-emissive-strength": 1 } }, slot));
    map.on("click", "as-icons", function (e) { var f = e.features && e.features[0]; if (!f) return; if (e.originalEvent) e.originalEvent._asset = true; openAsset(f.properties.id, true); });
    map.on("mouseenter", "as-icons", function () { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "as-icons", function () { map.getCanvas().style.cursor = ""; });
  }
  function refresh() {
    var map = PU.map(); if (map && map.getSource("as")) map.getSource("as").setData(gj());
    if (window.PU3D && PU3D.setAssets) PU3D.setAssets(ASSETS.filter(function (a) { return a.lng != null; }).map(function (a) { return { type: a.type, ll: [a.lng, a.lat], id: a.id }; }));
    if (!$("asList").hidden) drawList();
  }
  function setSel(id) { selId = id; var map = PU.map(); if (map && map.getLayer("as-sel")) map.setFilter("as-sel", ["==", ["get", "id"], id || ""]); }

  /* ---------------- my location ---------------- */
  var me = null, watch = null, follow = false;
  function meGJ() { return { type: "FeatureCollection", features: me ? [{ type: "Feature", geometry: { type: "Point", coordinates: [me.lng, me.lat] }, properties: { acc: Math.max(me.acc || 5, 2) } }] : [] }; }
  function startGPS(onFix) {
    if (!navigator.geolocation) { PU.toast("This device can't share its location."); return false; }
    if (watch == null) watch = navigator.geolocation.watchPosition(function (p) {
      me = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: p.timestamp };
      var map = PU.map(); if (map && map.getSource("me-acc")) map.getSource("me-acc").setData(meGJ());
      if (follow && map) { follow = false; map.flyTo({ center: [me.lng, me.lat], zoom: 18.2, pitch: 60, duration: 1600 }); }
      gpsListeners.forEach(function (f) { f(me); });
    }, function (err) { gpsListeners.forEach(function (f) { f(null, err); });
      if (err.code === 1) PU.toast("Location is off for Park Universe. Allow location in the phone's settings."); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    return true;
  }
  var gpsListeners = [];
  function locateMe() { follow = true; if (me) { follow = false; PU.map().flyTo({ center: [me.lng, me.lat], zoom: 18.2, pitch: 60, duration: 1400 }); } startGPS(); }

  /* ---------------- photos ---------------- */
  function compress(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { var M = 1600, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, M / Math.max(w, h)), c = document.createElement("canvas");
        c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? res(b) : rej(new Error("photo")); }, "image/jpeg", .82); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("photo")); }; img.src = url;
    });
  }
  function addPhoto(asset, file) {
    return compress(file).then(function (blob) {
      var ph = { id: uid(), asset: asset.id, date: Date.now(), blob: blob, lat: me ? me.lat : null, lng: me ? me.lng : null, acc: me ? me.acc : null };
      return tx("photos", "readwrite", function (s) { s.put(ph); }).then(function () { asset.photoCount = (asset.photoCount || 0) + 1; asset.lastPhoto = ph.date; return saveAsset(asset); });
    });
  }
  function pickPhoto(camera, cb) { var i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; if (camera) i.setAttribute("capture", "environment");
    i.onchange = function () { if (i.files && i.files[0]) cb(i.files[0]); }; document.body.appendChild(i); i.style.display = "none"; i.click(); setTimeout(function () { i.remove(); }, 60000); }

  /* ---------------- UI ---------------- */
  var css = '\
.as-sheet{position:fixed;left:0;right:0;bottom:0;max-height:86vh;border-radius:22px 22px 0 0;z-index:11;display:flex;flex-direction:column;padding-bottom:env(safe-area-inset-bottom,0px);max-width:640px;margin:0 auto}\
.as-sheet .hd2{padding:12px 14px 8px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line)}\
.as-sheet .hd2 h3{margin:0;flex:1;font-size:17px}\
.as-body{overflow:auto;padding:12px 14px 16px;overscroll-behavior:contain}\
.as-types{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}\
.as-types button{display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 4px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.05);font-size:12.5px;font-weight:700}\
.as-types img{width:40px;height:40px}\
.as-row{display:flex;gap:10px;align-items:center;width:100%;text-align:left;padding:10px 4px;border:0;border-bottom:1px solid var(--line);background:none}\
.as-row img.i{width:34px;height:34px;flex:none}.as-row b{display:block;font-size:15px}.as-row small{display:block;color:var(--mut);font-size:12.5px}\
.as-row .th{width:46px;height:46px;border-radius:10px;object-fit:cover;flex:none;margin-left:auto}\
.as-pill{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;padding:2px 8px;border-radius:99px;background:rgba(255,255,255,.08)}\
.as-pill i{width:8px;height:8px;border-radius:50%;background:var(--c)}\
.as-gps{border:1px solid var(--line);border-radius:14px;padding:12px;margin:10px 0;background:rgba(255,255,255,.04)}\
.as-gps .big{font-size:22px;font-weight:800}.as-gps .meter{height:6px;border-radius:6px;background:rgba(255,255,255,.1);overflow:hidden;margin:8px 0}\
.as-gps .meter i{display:block;height:100%;width:0;background:var(--c,#22c55e);transition:width .4s}\
.as-f{display:flex;flex-direction:column;gap:5px;margin:10px 0}.as-f label{font-size:12px;font-weight:800;color:var(--mut);letter-spacing:.4px;text-transform:uppercase}\
.as-f select,.as-f input,.as-f textarea{padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.07);color:var(--ink);font:inherit}\
.as-f textarea{min-height:70px;resize:vertical}\
.as-seg{display:flex;flex-wrap:wrap;gap:6px}.as-seg button{flex:1 1 auto;padding:8px 10px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.05);font-weight:700;font-size:13px}\
.as-seg button[aria-pressed=true]{background:var(--c,#fff);color:#08121c;border-color:transparent}\
.as-ph{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}\
.as-ph figure{margin:0;position:relative}.as-ph img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;display:block}\
.as-ph figcaption{position:absolute;left:4px;right:4px;bottom:4px;font-size:10.5px;background:rgba(0,0,0,.6);border-radius:6px;padding:1px 5px;text-align:center}\
.as-hero{width:100%;max-height:42vh;object-fit:cover;border-radius:14px;display:block;margin-top:6px}\
.as-act{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.as-act button{flex:1 1 40%;padding:10px 8px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.06);font-weight:700;font-size:13.5px}\
.as-act .p{background:linear-gradient(135deg,#34d399,#22d3ee);color:#03221a;border-color:transparent}.as-act .d{color:#ff8a80;border-color:rgba(255,138,128,.4)}\
.as-sum{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px}.as-sum span{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;background:rgba(255,255,255,.07);border:1px solid var(--line);border-radius:99px;padding:2px 9px 2px 3px}\
.as-sum img{width:20px;height:20px}\
.as-view{position:fixed;inset:0;background:#000;z-index:30;display:flex;align-items:center;justify-content:center}.as-view img{max-width:100%;max-height:100%}\
.as-view button{position:absolute;top:calc(12px + env(safe-area-inset-top,0px));right:12px;width:42px;height:42px;border-radius:12px;border:0;background:rgba(255,255,255,.15);color:#fff;font-size:18px}\
.as-view p{position:absolute;left:0;right:0;bottom:calc(16px + env(safe-area-inset-bottom,0px));text-align:center;color:#ddd;font-size:13px;margin:0}';
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  var shell = document.createElement("div");
  shell.innerHTML = '<div class="scrim" id="asScrim" hidden></div>' +
    '<div class="as-sheet glass" id="asList" hidden role="dialog" aria-label="Assets"><div class="hd2"><h3 id="asListT">Assets</h3><button class="flyl" id="asAddBtn">\uff0b Add</button><button class="x" style="position:static" id="asListX" aria-label="Close">&#10005;</button></div>' +
    '<div class="as-body"><input class="search" id="asQ" type="search" placeholder="Search assets, parks, notes" autocomplete="off"><div class="chips" id="asChips" style="margin:8px 0"></div><div class="as-sum" id="asSum"></div><div id="asRows"></div>' +
    '<div class="as-act"><button id="asCsv">Export spreadsheet (CSV)</button><button id="asGeo">Export map file (GeoJSON)</button></div></div></div>' +
    '<div class="as-sheet glass" id="asSheet" hidden role="dialog" aria-label="Asset"><div class="hd2"><button class="x" style="position:static" id="asBack" aria-label="Back">&larr;</button><h3 id="asT"></h3><button class="x" style="position:static" id="asX" aria-label="Close">&#10005;</button></div><div class="as-body" id="asBody"></div></div>';
  document.body.appendChild(shell);

  function showSheet(id) { ["asList", "asSheet"].forEach(function (k) { $(k).hidden = k !== id; }); $("asScrim").hidden = !id; }
  function closeAll() { showSheet(null); setSel(null); stopGPSWait(); }
  $("asScrim").onclick = closeAll; $("asListX").onclick = closeAll; $("asX").onclick = closeAll;
  $("asBack").onclick = function () { stopGPSWait(); setSel(null); openList(listCtx); };

  /* --- list --- */
  var listCtx = {}, fType = "all";
  function openList(ctx) { if (PU.closeAll) PU.closeAll(); listCtx = ctx || {}; fType = listCtx.type || "all"; $("asQ").value = ""; showSheet("asList"); drawList(); }
  function drawList() {
    var chips = $("asChips"); chips.innerHTML = "";
    [["all", "All"]].concat(TYPES.map(function (t) { return [t[0], t[1]]; })).forEach(function (f) {
      var n = f[0] === "all" ? null : ASSETS.filter(function (a) { return a.type === f[0] && (!listCtx.park || a.park === listCtx.park); }).length;
      if (n === 0 && f[0] !== fType) return;
      var b = document.createElement("button"); b.textContent = f[1] + (n ? " " + n : ""); b.setAttribute("aria-pressed", fType === f[0]); b.onclick = function () { fType = f[0]; drawList(); }; chips.appendChild(b); });
    var q = $("asQ").value.trim().toLowerCase();
    var list = ASSETS.filter(function (a) { return (!listCtx.park || a.park === listCtx.park) && (fType === "all" || a.type === fType) &&
      (!q || ((T[a.type] || T.other).name + " " + a.park + " " + (a.label || "") + " " + (a.notes || "")).toLowerCase().indexOf(q) >= 0); });
    $("asListT").textContent = (listCtx.park ? listCtx.park + " \u00b7 " : "") + list.length + (list.length === 1 ? " asset" : " assets");
    var by = {}; ASSETS.filter(function (a) { return !listCtx.park || a.park === listCtx.park; }).forEach(function (a) { by[a.type] = (by[a.type] || 0) + 1; });
    $("asSum").innerHTML = Object.keys(by).map(function (k) { return '<span><img alt="" src="' + iconURL(k) + '">' + by[k] + " " + esc((T[k] || T.other).name.toLowerCase()) + "</span>"; }).join("");
    var rows = $("asRows"); rows.innerHTML = "";
    if (!list.length) { rows.innerHTML = '<div class="empty">No assets here yet. Tap \uff0b Add, stand next to the item and save its GPS spot.</div>'; return; }
    list.sort(function (a, b) { return (a.park || "").localeCompare(b.park || "") || (a.type || "").localeCompare(b.type || "") || (b.updated - a.updated); });
    var near = me ? [me.lng, me.lat] : null;
    list.forEach(function (a) { var t = T[a.type] || T.other, b = document.createElement("button"); b.className = "as-row";
      b.innerHTML = '<img class="i" alt="" src="' + iconURL(a.type) + '"><span><b></b><small></small></span>';
      b.querySelector("b").textContent = (a.label || t.name);
      b.querySelector("small").textContent = (listCtx.park ? "" : a.park + " \u00b7 ") + (a.cond || "Good") + " \u00b7 " + (a.photoCount || 0) + " photo" + ((a.photoCount || 0) === 1 ? "" : "s") + (near && a.lng != null ? " \u00b7 " + Math.round(dkm(near, [a.lng, a.lat]) * 1000) + " m away" : "");
      if (a.cond && a.cond !== "Good") b.querySelector("small").style.color = COND_C[a.cond];
      if (a.lastPhoto) photosOf(a.id).then(function (ph) { if (ph[0]) { var im = document.createElement("img"); im.className = "th"; im.alt = ""; im.src = URL.createObjectURL(ph[0].blob); b.appendChild(im); } });
      b.onclick = function () { openAsset(a.id, true); }; rows.appendChild(b); });
  }
  $("asQ").oninput = drawList;
  $("asAddBtn").onclick = function () { startAdd({ park: listCtx.park, type: fType !== "all" ? fType : null }); };

  /* --- add: type -> location -> photo --- */
  var gpsWait = null;
  function stopGPSWait() { if (gpsWait) { gpsListeners = gpsListeners.filter(function (f) { return f !== gpsWait; }); gpsWait = null; } }
  function startAdd(ctx) {
    ctx = ctx || {}; if (PU.closeAll) PU.closeAll(); showSheet("asSheet"); $("asT").textContent = "Add an asset";
    if (ctx.type) return chooseLocation(ctx);
    var body = $("asBody"); body.innerHTML = '<p class="mut" style="margin:0 0 10px">What are you recording' + (ctx.park ? " at " + esc(ctx.park) : "") + '?</p><div class="as-types" id="asTypes"></div>';
    TYPES.forEach(function (t) { var b = document.createElement("button"); b.innerHTML = '<img alt="" src="' + iconURL(t[0]) + '"><span></span>'; b.lastChild.textContent = t[1];
      b.onclick = function () { ctx.type = t[0]; chooseLocation(ctx); }; $("asTypes").appendChild(b); });
  }
  function chooseLocation(ctx) {
    var t = T[ctx.type]; $("asT").textContent = "Add " + t.name.toLowerCase();
    var body = $("asBody");
    body.innerHTML = '<div class="as-gps" id="asGps"><div style="display:flex;align-items:center;gap:10px"><img alt="" src="' + iconURL(ctx.type) + '" style="width:40px;height:40px"><div><div class="big" id="asAcc">Finding GPS\u2026</div><small class="mut" id="asAccT">Stand right next to the ' + esc(t.name.toLowerCase()) + '. Accuracy improves for a few seconds.</small></div></div><div class="meter"><i id="asMeter"></i></div></div>' +
      '<div class="as-act"><button class="p" id="asUseGps" disabled>Save GPS spot</button><button id="asTapMap">Place on satellite map</button></div>';
    var best = null;
    gpsWait = function (fix, err) {
      if (!fix) { $("asAcc").textContent = err && err.code === 1 ? "Location is off" : "No GPS yet"; $("asAccT").textContent = err && err.code === 1 ? "Allow location for Park Universe, or tap the map instead." : "Keep waiting outside, or tap the map instead."; return; }
      if (!best || fix.acc <= best.acc + 1 || Date.now() - best.t > 15000) best = { lat: fix.lat, lng: fix.lng, acc: fix.acc, t: Date.now() };
      var a = best.acc, q = a <= 5 ? 1 : a <= 10 ? .8 : a <= 20 ? .55 : a <= 50 ? .3 : .12;
      $("asAcc").textContent = fmtAcc(a) + (a <= 5 ? " \u00b7 excellent" : a <= 10 ? " \u00b7 good" : a <= 20 ? " \u00b7 fair" : " \u00b7 weak");
      $("asAccT").textContent = "Nearest park: " + nearestPark([best.lng, best.lat]);
      $("asMeter").style.width = (q * 100) + "%"; $("asGps").style.setProperty("--c", a <= 10 ? "#22c55e" : a <= 20 ? "#eab308" : "#f97316");
      $("asUseGps").disabled = false;
    };
    gpsListeners.push(gpsWait); if (me) gpsWait(me); startGPS();
    $("asUseGps").onclick = function () { if (!best) return; stopGPSWait(); create(ctx, best.lng, best.lat, best.acc); };
    $("asTapMap").onclick = function () { stopGPSWait(); showSheet(null);
      var c = best ? [best.lng, best.lat] : (ctx.park ? (PU.PL.filter(function (p) { return p.n === ctx.park; })[0] || {}).ll : null);
      PU.moveMode("Line up the + with the " + t.name.toLowerCase(), function (ll) { create(ctx, ll[0], ll[1], null); }, { center: c }); };
  }
  function create(ctx, lng, lat, acc) {
    var a = { id: uid(), type: ctx.type, lng: +lng.toFixed(7), lat: +lat.toFixed(7), acc: acc, park: ctx.park || nearestPark([lng, lat]), cond: "Good", label: "", notes: "", created: Date.now(), photoCount: 0 };
    saveAsset(a).then(function () { PU.toast((T[a.type] || T.other).name + " saved at " + a.park + ". Add a photo."); openAsset(a.id, false); });
  }

  /* --- asset card --- */
  var curPhotos = [];
  function openAsset(id, fly, keep) {
    var a = ASSETS.filter(function (x) { return x.id === id; })[0]; if (!a) return;
    if (PU.closeAll) PU.closeAll(); stopGPSWait(); setSel(id); showSheet("asSheet");
    var t = T[a.type] || T.other; $("asT").textContent = a.label || t.name;
    if (fly && a.lng != null) PU.map().flyTo({ center: [a.lng, a.lat], zoom: Math.max(PU.map().getZoom(), 18.6), pitch: 62, duration: 1200, padding: PU.padFor() });
    var body = $("asBody"), y = keep ? body.scrollTop : 0;
    body.innerHTML = '<div style="display:flex;gap:10px;align-items:center"><img alt="" src="' + iconURL(a.type) + '" style="width:44px;height:44px"><div style="flex:1;min-width:0"><b style="font-size:16px">' + esc(t.name) + '</b><div class="mut" style="font-size:13px">' + esc(a.park) + '</div></div>' +
      '<span class="as-pill" style="--c:' + (COND_C[a.cond] || "#22c55e") + '"><i></i>' + esc(a.cond || "Good") + '</span></div>' +
      '<div id="asHeroBox"></div>' +
      '<div class="as-act"><button class="p" id="asCam">\ud83d\udcf7 Take new photo</button><button id="asGal">\ud83d\uddbc Add from gallery</button></div>' +
      '<div class="as-ph" id="asPh"></div>' +
      '<div class="as-f"><label>Condition</label><div class="as-seg" id="asCond"></div></div>' +
      '<div class="as-f"><label for="asLabel">Name or ID tag</label><input id="asLabel" maxlength="60" placeholder="e.g. Bench 3, north path"></div>' +
      '<div class="as-f"><label for="asType">Type</label><select id="asType"></select></div>' +
      '<div class="as-f"><label for="asPark">Park</label><select id="asPark"></select></div>' +
      '<div class="as-f"><label for="asNotes">Notes</label><textarea id="asNotes" placeholder="Material, model, damage, work done\u2026"></textarea></div>' +
      '<p class="src" id="asLoc"></p>' +
      '<div class="as-act"><button id="asReGps">\ud83d\udccd Update GPS here</button><button id="asReTap">Move on satellite map</button><button id="asNav">Directions</button><button class="d" id="asDel">Delete</button></div>';
    COND.forEach(function (c) { var b = document.createElement("button"); b.textContent = c; b.style.setProperty("--c", COND_C[c]); b.setAttribute("aria-pressed", (a.cond || "Good") === c);
      b.onclick = function () { a.cond = c; saveAsset(a).then(function () { openAsset(a.id, false, true); }); }; $("asCond").appendChild(b); });
    $("asLabel").value = a.label || ""; $("asNotes").value = a.notes || "";
    $("asLabel").onchange = function () { a.label = this.value.trim(); saveAsset(a); $("asT").textContent = a.label || t.name; };
    $("asNotes").onchange = function () { a.notes = this.value; saveAsset(a); };
    var ts = $("asType"); TYPES.forEach(function (x) { var o = document.createElement("option"); o.value = x[0]; o.textContent = x[1]; if (x[0] === a.type) o.selected = true; ts.appendChild(o); });
    ts.onchange = function () { a.type = this.value; saveAsset(a).then(function () { openAsset(a.id, false, true); }); };
    var ps = $("asPark"); parksByDistance([a.lng, a.lat]).forEach(function (p) { var o = document.createElement("option"); o.value = p.n; o.textContent = p.n + " (" + (p.d < 1 ? Math.round(p.d * 1000) + " m" : p.d.toFixed(1) + " km") + ")"; if (p.n === a.park) o.selected = true; ps.appendChild(o); });
    ps.onchange = function () { a.park = this.value; saveAsset(a); };
    $("asLoc").textContent = "GPS " + a.lat.toFixed(6) + ", " + a.lng.toFixed(6) + " \u00b7 " + fmtAcc(a.acc) + " \u00b7 added " + fmtDate(a.created) + (a.updated && a.updated - a.created > 60000 ? " \u00b7 updated " + fmtDate(a.updated) : "");
    $("asCam").onclick = function () { startGPS(); pickPhoto(true, function (f) { addPhoto(a, f).then(function () { PU.toast("Photo saved."); openAsset(a.id, false); }, function () { PU.toast("Couldn't read that photo."); }); }); };
    $("asGal").onclick = function () { pickPhoto(false, function (f) { addPhoto(a, f).then(function () { PU.toast("Photo saved."); openAsset(a.id, false); }, function () { PU.toast("Couldn't read that photo."); }); }); };
    $("asReGps").onclick = function () { var ctx = { type: a.type, park: a.park, existing: a }; chooseRelocate(a); };
    $("asReTap").onclick = function () { showSheet(null); PU.moveMode("Line up the + with the " + t.name.toLowerCase(), function (ll) { a.lng = +ll[0].toFixed(7); a.lat = +ll[1].toFixed(7); a.acc = null; saveAsset(a).then(function () { openAsset(a.id, false); }); }, { center: [a.lng, a.lat] }); };
    $("asNav").onclick = function () { location.href = "https://www.google.com/maps/dir/?api=1&destination=" + a.lat + "," + a.lng; };
    $("asDel").onclick = function () { if (confirm("Delete this " + t.name.toLowerCase() + " and all its photos?")) delAsset(a).then(function () { PU.toast("Deleted."); openList(listCtx.park ? listCtx : { park: a.park }); }); };
    body.scrollTop = y;
    /* photos, newest first */
    curPhotos.forEach(function (u) { URL.revokeObjectURL(u); }); curPhotos = [];
    photosOf(a.id).then(function (ph) {
      var box = $("asPh"); if (!box) return;
      if (!ph.length) { $("asHeroBox").innerHTML = '<div class="empty" style="padding:16px 0">No photos yet. Take one now so there is a record of its condition.</div>'; return; }
      var u0 = URL.createObjectURL(ph[0].blob); curPhotos.push(u0);
      $("asHeroBox").innerHTML = '<img class="as-hero" alt="Latest photo" src="' + u0 + '"><div class="src">Latest photo \u00b7 ' + fmtDate(ph[0].date) + '</div>';
      $("asHeroBox").querySelector("img").onclick = function () { view(ph, 0); };
      ph.forEach(function (p, i) { var u = i === 0 ? u0 : URL.createObjectURL(p.blob); if (i) curPhotos.push(u);
        var f = document.createElement("figure"); f.innerHTML = '<img alt=""><figcaption></figcaption>'; f.querySelector("img").src = u; f.querySelector("figcaption").textContent = new Date(p.date).toLocaleDateString();
        f.onclick = function () { view(ph, i); }; box.appendChild(f); });
    });
  }
  function view(ph, i) {
    var v = document.createElement("div"); v.className = "as-view"; var u = URL.createObjectURL(ph[i].blob);
    v.innerHTML = '<img alt=""><button aria-label="Close">&#10005;</button><p></p>'; v.querySelector("img").src = u;
    v.querySelector("p").textContent = fmtDate(ph[i].date) + (ph[i].lat != null ? " \u00b7 taken at " + ph[i].lat.toFixed(5) + ", " + ph[i].lng.toFixed(5) : "") + "  (" + (i + 1) + " of " + ph.length + ")";
    var close = function () { URL.revokeObjectURL(u); v.remove(); };
    v.querySelector("button").onclick = close;
    v.querySelector("img").onclick = function (e) { e.stopPropagation(); close(); if (ph.length > 1) view(ph, (i + 1) % ph.length); };
    document.body.appendChild(v);
  }
  function chooseRelocate(a) {
    var t = T[a.type] || T.other; $("asT").textContent = "Update GPS";
    $("asBody").innerHTML = '<div class="as-gps" id="asGps"><div class="big" id="asAcc">Finding GPS\u2026</div><small class="mut" id="asAccT">Stand next to the ' + esc(t.name.toLowerCase()) + '.</small><div class="meter"><i id="asMeter"></i></div></div><div class="as-act"><button class="p" id="asUseGps" disabled>Save new GPS spot</button><button id="asCancel">Cancel</button></div>';
    var best = null;
    gpsWait = function (fix) { if (!fix) return; if (!best || fix.acc <= best.acc + 1) best = fix; var x = best.acc;
      $("asAcc").textContent = fmtAcc(x); $("asMeter").style.width = (x <= 5 ? 100 : x <= 10 ? 80 : x <= 20 ? 55 : 25) + "%"; $("asGps").style.setProperty("--c", x <= 10 ? "#22c55e" : "#eab308");
      $("asAccT").textContent = Math.round(dkm([a.lng, a.lat], [best.lng, best.lat]) * 1000) + " m from the saved spot"; $("asUseGps").disabled = false; };
    gpsListeners.push(gpsWait); if (me) gpsWait(me); startGPS();
    $("asUseGps").onclick = function () { stopGPSWait(); a.lng = +best.lng.toFixed(7); a.lat = +best.lat.toFixed(7); a.acc = best.acc; saveAsset(a).then(function () { PU.toast("GPS updated."); openAsset(a.id, true); }); };
    $("asCancel").onclick = function () { stopGPSWait(); openAsset(a.id, false); };
  }

  /* --- export --- */
  function saveFile(name, text, mime) {
    if (window.AndroidApp && AndroidApp.saveText) { AndroidApp.saveText(name, text); return; }
    var b = new Blob([text], { type: mime }), u = URL.createObjectURL(b), l = document.createElement("a"); l.href = u; l.download = name; document.body.appendChild(l); l.click(); setTimeout(function () { URL.revokeObjectURL(u); l.remove(); }, 2000);
  }
  function rowsFor() { return ASSETS.filter(function (a) { return !listCtx.park || a.park === listCtx.park; }); }
  $("asCsv").onclick = function () {
    var q = function (v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = ["Park,Type,Name/ID,Condition,Latitude,Longitude,GPS accuracy (m),Photos,Last photo,Notes,Added,Updated,ID"];
    rowsFor().forEach(function (a) { lines.push([a.park, (T[a.type] || T.other).name, a.label, a.cond, a.lat, a.lng, a.acc == null ? "" : Math.round(a.acc * 10) / 10, a.photoCount || 0,
      a.lastPhoto ? new Date(a.lastPhoto).toISOString() : "", a.notes, new Date(a.created).toISOString(), new Date(a.updated || a.created).toISOString(), a.id].map(q).join(",")); });
    saveFile("park-assets-" + new Date().toISOString().slice(0, 10) + ".csv", lines.join("\n"), "text/csv");
  };
  $("asGeo").onclick = function () {
    var fc = { type: "FeatureCollection", features: rowsFor().map(function (a) { return { type: "Feature", geometry: { type: "Point", coordinates: [a.lng, a.lat] },
      properties: { id: a.id, park: a.park, type: (T[a.type] || T.other).name, name: a.label, condition: a.cond, accuracy_m: a.acc, photos: a.photoCount || 0, notes: a.notes, added: new Date(a.created).toISOString(), updated: new Date(a.updated || a.created).toISOString() } }; }) };
    saveFile("park-assets-" + new Date().toISOString().slice(0, 10) + ".geojson", JSON.stringify(fc, null, 1), "application/geo+json");
  };

  /* ---------------- start ---------------- */
  function counts(park) { var by = {}; ASSETS.forEach(function (a) { if (a.park === park) by[a.type] = (by[a.type] || 0) + 1; }); return by; }
  var ready = open().then(function () { return all("assets"); }).then(function (list) { ASSETS = list || []; refresh(); }).catch(function () { PU.toast("Asset storage isn't available on this device."); });
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

  window.PUAssets = { TYPES: TYPES, T: T, addLayers: addLayers, openList: openList, startAdd: startAdd, openAsset: openAsset, locateMe: locateMe, counts: counts, iconURL: iconURL,
    close: closeAll, ready: ready, me: function () { return me; }, startGPS: function () { return startGPS(); }, list: function () { return ASSETS; }, _addPhotoBlob: function (id, file) { var a = ASSETS.filter(function (x) { return x.id === id; })[0]; return addPhoto(a, file); }, _me: function (m) { me = m; } };
})();
