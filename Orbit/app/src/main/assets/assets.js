/* Park Universe GIS layers: Assets, Trees, Irrigation, Fields, Snow
 * Points (benches, trees, sprinkler heads...), lines (laterals, mainlines, plow routes) and
 * outlines (ball fields, cages, snow storage). Each item: GPS location, map icon, details,
 * condition, notes and a dated photo history. Stored on the phone (IndexedDB).
 *
 * Needs from the home page: window.PU = { map(), PL, pick(i,o), toast(t), closeAll(), padFor(), std(),
 *   moveMode(msg, cb, opts), setTempLook(l), restoreLook(), look(), setNames(on) }
 */
(function () {
  "use strict";
  /* ---------------- layers & types ---------------- */
  var LAYERS = [
    { id: "assets", name: "Assets", e: "\ud83d\udccd" },
    { id: "trees", name: "Trees", e: "\ud83c\udf33" },
    { id: "irrigation", name: "Irrigation", e: "\ud83d\udca7" },
    { id: "fields", name: "Fields", e: "\u26be" },
    { id: "snow", name: "Snow", e: "\u2744\ufe0f" }];
  var L = {}; LAYERS.forEach(function (l) { L[l.id] = l; });
  var COND_BY = {
    assets: ["Good", "Fair", "Needs repair", "Out of service"],
    trees: ["Good", "Fair", "Poor", "Dead"],
    irrigation: ["Working", "Needs repair", "Leaking", "Off"],
    fields: ["Good", "Worn", "Needs replacing", "Missing"],
    snow: ["Active", "Seasonal", "Needs review", "Retired"] };
  var COND_COL = ["#22c55e", "#eab308", "#f97316", "#ef4444"];
  var SIZES = ['Spray 4"', 'Spray 6"', 'Spray 12"', "Rotor \u2013 small", "Rotor \u2013 medium", "Rotor \u2013 large", "Impact", "Bubbler", "Drip emitter"];
  var SIZE_R = [.55, .62, .7, .78, .88, 1, .95, .55, .45];
  var PIPE = ['1/2"', '3/4"', '1"', '1-1/4"', '1-1/2"', '2"', '2-1/2"', '3"', '4"'];
  var SPECIES = ["Honeylocust", "Bur oak", "Swamp white oak", "English oak", "Kentucky coffeetree", "Littleleaf linden", "American linden", "Hackberry", "Freeman maple", "Norway maple",
    "Silver maple", "Autumn Blaze maple", "Elm (American)", "Elm (Siberian)", "Green ash", "White ash", "Cottonwood", "Catalpa", "Crabapple", "Serviceberry", "Hawthorn",
    "Ohio buckeye", "Chanticleer pear", "Japanese tree lilac", "Ponderosa pine", "Austrian pine", "Pinyon pine", "Colorado blue spruce", "Concolor fir", "Rocky Mountain juniper", "Other"];
  /* field kinds: text | num | date | select:LIST */
  var F = {
    tree: [["species", "Species", "species"], ["caliper", "Caliper (inches)", "num"], ["height", "Height (ft)", "num"], ["tag", "Tree tag #", "text"], ["planted", "Planted", "date"], ["replace", "Replacement date", "date"]],
    stump: [["species", "Species (was)", "species"], ["removed", "Removed", "date"], ["replace", "Replacement date", "date"]],
    site: [["species", "Species to plant", "species"], ["replace", "Plant by", "date"]],
    head: [["size", "Head size / type", "select:SIZES"], ["zone", "Zone", "text"], ["nozzle", "Nozzle", "text"], ["throw", "Throw radius (ft)", "num"]],
    backflow: [["make", "Make / model", "text"], ["bsize", "Size", "text"], ["serial", "Serial #", "text"], ["lasttest", "Last test", "date"], ["nexttest", "Next test due", "date"]],
    timer: [["make", "Make / model", "text"], ["zones", "Number of zones", "num"], ["power", "Power / Wi-Fi", "text"]],
    valve: [["zone", "Zone", "text"], ["vsize", "Valve size", "select:PIPE"]],
    coupler: [["zone", "Zone", "text"]],
    lateral: [["pipe", "Pipe size", "select:PIPE"], ["material", "Material", "select:MATERIAL"], ["zone", "Zone", "text"], ["depth", "Depth (in)", "num"]],
    mainline: [["pipe", "Pipe size", "select:PIPE"], ["material", "Material", "select:MATERIAL"], ["depth", "Depth (in)", "num"]],
    ballfield: [["surface", "Surface", "select:SURFACE"], ["bases", "Base distance (ft)", "num"], ["fence", "Fence distance (ft)", "num"]],
    cage: [["lanes", "Lanes", "num"]],
    storage: [], noplow: [] };
  ["walk", "route", "ramp", "smailbox", "entrance", "exitgate", "steps", "icemelt", "shovel", "parking"].forEach(function (k) { F[k] = [["method", "Method", "select:METHOD"], ["melt", "Ice melt", "select:YESNO"], ["priority", "Priority", "select:PRIORITY"]]; });
  ["base", "bcage", "paint", "chalk", "dragscreen", "spikedrag", "rack", "tamper", "paintmachine", "gear"].forEach(function (k) { F[k] = [["qty", "Quantity", "num"], ["stored", "Stored at", "text"]]; });
  var LISTS = { SIZES: SIZES, PIPE: PIPE, MATERIAL: ["PVC Sch 40", "PVC Class 200", "PVC Class 315", "Poly", "Copper", "Ductile iron", "Other"],
    SURFACE: ["Grass infield", "Skinned infield", "Turf", "Dirt"], PRIORITY: ["1 \u2013 first", "2", "3 \u2013 last"], METHOD: ["Shovel", "Plow", "Blower", "Skid steer", "Ice melt only"], YESNO: ["Yes", "No"] };
  /* [id, name, layer, geom, emoji or "#txt" badge, color] */
  var TYPES = [
    ["bench", "Bench", "assets", "point", "\ud83e\ude91", "#8d6e63"], ["trash", "Trash can", "assets", "point", "\ud83d\uddd1\ufe0f", "#2e7d32"], ["dog", "Dog station", "assets", "point", "\ud83d\udc15", "#43a047"],
    ["grill", "BBQ grill", "assets", "point", "\ud83c\udf56", "#5d4037"], ["bathroom", "Bathroom", "assets", "point", "\ud83d\udebb", "#1e88e5"], ["firepit", "Fire pit", "assets", "point", "\ud83d\udd25", "#f4511e"],
    ["fountain", "Fountain", "assets", "point", "\u26f2", "#039be5"], ["light", "Light", "assets", "point", "\ud83d\udca1", "#f9a825"], ["mailbox", "Mailbox", "assets", "point", "\ud83d\udceb", "#3949ab"],
    ["newspaper", "Newspaper box", "assets", "point", "\ud83d\udcf0", "#546e7a"], ["table", "Picnic table", "assets", "point", "\ud83e\uddfa", "#a1887f"], ["playground", "Playground", "assets", "point", "\ud83c\udfa0", "#ef6c00"],
    ["field", "Athletic field", "assets", "point", "\u26bd", "#2e7d32"], ["sign", "Park sign", "assets", "point", "\ud83d\udea9", "#6d4c41"], ["structure", "Structure", "assets", "point", "\ud83c\udfe0", "#8e24aa"],
    ["flowerpot", "Flower pot", "assets", "point", "\ud83c\udf37", "#d81b60"], ["other", "Other", "assets", "point", "\ud83d\udccd", "#607d8b"],
    ["tree", "Tree", "trees", "point", "@tree", "#15803d"], ["stump", "Stump", "trees", "point", "@stump", "#7c5a3a"], ["site", "Planting site", "trees", "point", "@site", "#65a30d"],
    ["head", "Sprinkler head", "irrigation", "point", "@head", "#ef4444"], ["backflow", "Backflow device", "irrigation", "point", "@backflow", "#14b8a6"],
    ["timer", "Timer clock", "irrigation", "point", "@timer", "#eab308"], ["valve", "Zone valve", "irrigation", "point", "@valve", "#f97316"], ["coupler", "Quick coupler", "irrigation", "point", "@coupler", "#a855f7"],
    ["lateral", "Lateral line", "irrigation", "line", "@line", "#3b82f6"], ["mainline", "Mainline", "irrigation", "line", "@line", "#1d4ed8"],
    ["ballfield", "Ball field outline", "fields", "polygon", "@poly", "#c2410c"], ["cage", "Batting cage outline", "fields", "polygon", "@poly", "#64748b"],
    ["base", "Bases", "fields", "point", "#B", "#f5f5f4"], ["bcage", "Portable cage", "fields", "point", "\ud83e\udd45", "#475569"], ["paint", "Field paint", "fields", "point", "\ud83c\udfa8", "#db2777"],
    ["chalk", "Chalk", "fields", "point", "#Ch", "#e7e5e4"], ["dragscreen", "Drag screen", "fields", "point", "#DS", "#92400e"], ["spikedrag", "Spike drag", "fields", "point", "#SD", "#78350f"],
    ["rack", "Rack", "fields", "point", "#R", "#57534e"], ["tamper", "Tamper", "fields", "point", "#T", "#44403c"], ["paintmachine", "Paint machine", "fields", "point", "#PM", "#be185d"], ["gear", "Other field gear", "fields", "point", "#+", "#a8a29e"],
    ["walk", "Sidewalk to shovel", "snow", "line", "@line", "#0ea5e9"], ["route", "Plow route", "snow", "line", "@line", "#6366f1"],
    ["ramp", "Handicap ramp", "snow", "point", "\u267f", "#2563eb"], ["smailbox", "Mailbox", "snow", "point", "\ud83d\udceb", "#3949ab"],
    ["entrance", "Entrance gate", "snow", "point", "#IN", "#16a34a"], ["exitgate", "Exit gate", "snow", "point", "#OUT", "#dc2626"],
    ["steps", "Steps / stairs", "snow", "point", "#ST", "#78716c"], ["icemelt", "Ice melt spot", "snow", "point", "\ud83e\uddc2", "#94a3b8"],
    ["shovel", "Other shovel spot", "snow", "point", "\u2744\ufe0f", "#0284c7"],
    ["property", "Property", "places", "point", "\ud83d\udccd", "#22d3ee"],
    ["parking", "Parking lot", "snow", "polygon", "@poly", "#64748b"], ["storage", "Snow storage area", "snow", "polygon", "@poly", "#93c5fd"], ["noplow", "Do-not-plow area", "snow", "polygon", "@poly", "#ef4444"]];
  var T = {}; TYPES.forEach(function (t) { T[t[0]] = { id: t[0], name: t[1], layer: t[2], geom: t[3], e: t[4], c: t[5] }; });
  var FIELD_NAMES = ["West field", "Burnett field", "East field", "Practice field", "Batting cages"];
  var LINE_W = { lateral: 2.5, mainline: 4.5, route: 5, walk: 3.5 }, DASH = { walk: 1, route: 0 };
  function tOf(a) { return T[a.type] || T.other; }
  function isPlace(a) { return a.type === "property"; }
  function layerOf(a) { return (T[a.type] || T.other).layer; }
  function condList(a) { return COND_BY[layerOf(a)] || COND_BY.assets; }
  function isBad(a) { var l = condList(a), i = l.indexOf(a.cond); return i >= 2; }

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
  function saveAsset(a, remote) { if (!remote) { a.updated = Date.now(); a.dirty = true; } return tx("assets", "readwrite", function (s) { return s.put(a); }).then(function () {
    var i = ASSETS.findIndex(function (x) { return x.id === a.id; }); if (i < 0) ASSETS.push(a); else ASSETS[i] = a; if (!remote) { refresh(); changed(); } }); }
  var hooks = [];
  function changed() { hooks.forEach(function (f) { try { f(); } catch (e) {} }); }
  function tombstone(a) { try { var d = JSON.parse(localStorage.getItem("pu-del") || "[]"); d.push({ id: a.id, layer: layerOf(a), type: a.type }); localStorage.setItem("pu-del", JSON.stringify(d)); } catch (e) {} }
  function delAsset(a, remote) { if (!remote && a.synced) tombstone(a);
    return photosOf(a.id).then(function (ph) { return tx("photos", "readwrite", function (s) { ph.forEach(function (p) { s.delete(p.id); }); }); })
    .then(function () { return tx("assets", "readwrite", function (s) { s.delete(a.id); }); }).then(function () { ASSETS = ASSETS.filter(function (x) { return x.id !== a.id; }); if (!remote) { refresh(); changed(); } }); }
  /* a photo may live only in the cloud until it is first viewed */
  function blobOf(p) { if (p.blob) return Promise.resolve(p.blob); if (!p.path || !window.PUSync || !PUSync.download) return Promise.resolve(null);
    return PUSync.download(p.path).then(function (b) { if (!b) return null; p.blob = b; return tx("photos", "readwrite", function (s) { s.put(p); }).then(function () { return b; }); }).catch(function () { return null; }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------------- helpers ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  function dkm(a, b) { var dx = (a[0] - b[0]) * 85, dy = (a[1] - b[1]) * 111; return Math.sqrt(dx * dx + dy * dy); }
  function nearestPark(ll) { var best = null, bd = 1e9; PU.PL.forEach(function (p) { var d = dkm(ll, p.ll); if (d < bd) { bd = d; best = p; } }); return best ? best.n : ""; }
  function parksByDistance(ll) { return PU.PL.map(function (p) { return { n: p.n, d: dkm(ll, p.ll) }; }).sort(function (a, b) { return a.d - b.d; }); }
  function parkLL(n) { var p = PU.PL.filter(function (x) { return x.n === n; })[0]; return p ? p.ll : null; }
  function fmtDate(t) { var d = new Date(t); return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
  function fmtAcc(m) { return m == null ? "map" : "\u00b1" + (m < 10 ? m.toFixed(1) : Math.round(m)) + " m"; }
  /* metres between two lon/lat points (haversine) */
  function meters(a, b) { var R = 6371008.8, r = Math.PI / 180, dl = (b[1] - a[1]) * r, dn = (b[0] - a[0]) * r, h = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dn / 2) * Math.sin(dn / 2); return 2 * R * Math.asin(Math.sqrt(h)); }
  function lineLen(c) { var m = 0; for (var i = 1; i < c.length; i++) m += meters(c[i - 1], c[i]); return m; }
  function polyArea(c) { if (c.length < 3) return 0; var lat0 = c[0][1] * Math.PI / 180, kx = 111320 * Math.cos(lat0), ky = 110540, s = 0;
    for (var i = 0; i < c.length; i++) { var p = c[i], q = c[(i + 1) % c.length]; s += (p[0] * kx) * (q[1] * ky) - (q[0] * kx) * (p[1] * ky); } return Math.abs(s) / 2; }
  function ft(m) { return Math.round(m * 3.28084); }
  function fmtLen(m) { var f = m * 3.28084; return f < 1000 ? Math.round(f) + " ft" : (f / 5280).toFixed(2) + " mi"; }
  function fmtArea(m2) { var f = m2 * 10.7639; return f < 43560 ? Math.round(f).toLocaleString() + " sq ft" : (f / 43560).toFixed(2) + " acres"; }
  function centroid(c) { var x = 0, y = 0; c.forEach(function (p) { x += p[0]; y += p[1]; }); return [x / c.length, y / c.length]; }
  function measure(a) { var t = tOf(a); if (t.geom === "line" && a.coords) return fmtLen(lineLen(a.coords)); if (t.geom === "polygon" && a.coords) return fmtArea(polyArea(a.coords)); return ""; }
  function summary(a) { var t = tOf(a), p = a.props || {}, bits = [];
    if (a.type === "tree") { if (p.species) bits.push(p.species); if (p.caliper) bits.push(p.caliper + '" cal'); if (p.replace) bits.push("replace " + p.replace); }
    else if (a.type === "head") { bits.push(p.size || SIZES[0]); if (p.zone) bits.push("zone " + p.zone); }
    else if (a.type === "backflow" && p.nexttest) bits.push("test due " + p.nexttest);
    else if ((a.type === "lateral" || a.type === "mainline") && p.pipe) bits.push(p.pipe);
    else if (p.qty) bits.push("qty " + p.qty);
    if (layerOf(a) === "snow") { if (p.method) bits.push(p.method); if (p.melt === "Yes") bits.push("ice melt"); if (p.priority) bits.push("priority " + p.priority.charAt(0)); }
    var m = measure(a); if (m) bits.push(m); return bits.join(" \u00b7 "); }

  /* ---------------- icons: tiny pictures, same on the map and in lists ---------------- */
  var iconCache = {};
  function iconCanvas(type, px, ring) {
    var t = T[type] || T.other, c = document.createElement("canvas"), s = px || 64; c.width = s; c.height = s;
    var g = c.getContext("2d"), r = s * .42, cx = s / 2, cy = s / 2;
    function disc(col, rr) { g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.fillStyle = col; g.fill(); }
    disc(ring || "#ffffff", r + s * .04); disc(t.c, r - s * .02);
    g.strokeStyle = "#fff"; g.fillStyle = "#fff"; g.lineWidth = s * .055; g.lineCap = "round"; g.lineJoin = "round";
    var e = t.e;
    if (e === "@head") { g.beginPath(); g.arc(cx, cy, s * .09, 0, Math.PI * 2); g.fill(); for (var k = 0; k < 6; k++) { var a = k / 6 * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * s * .16, cy + Math.sin(a) * s * .16); g.lineTo(cx + Math.cos(a) * s * .3, cy + Math.sin(a) * s * .3); g.stroke(); } }
    else if (e === "@backflow") { g.lineWidth = s * .07; g.beginPath(); g.moveTo(cx - s * .22, cy + s * .14); g.lineTo(cx - s * .22, cy - s * .12); g.arc(cx, cy - s * .12, s * .22, Math.PI, 0); g.lineTo(cx + s * .22, cy + s * .14); g.stroke();
      g.fillRect(cx - s * .1, cy - s * .04, s * .2, s * .16); }
    else if (e === "@timer") { g.beginPath(); g.arc(cx, cy, s * .24, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy - s * .15); g.moveTo(cx, cy); g.lineTo(cx + s * .11, cy + s * .05); g.stroke(); }
    else if (e === "@valve") { g.fillRect(cx - s * .18, cy - s * .14, s * .36, s * .28); g.fillStyle = t.c; g.font = "bold " + Math.round(s * .24) + "px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("V", cx, cy + s * .01); }
    else if (e === "@coupler") { g.beginPath(); g.arc(cx, cy, s * .16, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(cx + s * .08, cy + s * .08); g.lineTo(cx + s * .22, cy + s * .22); g.stroke(); }
    else if (e === "@tree") { g.fillRect(cx - s * .035, cy + s * .02, s * .07, s * .22); g.beginPath(); g.arc(cx, cy - s * .07, s * .19, 0, Math.PI * 2); g.fill(); }
    else if (e === "@stump") { g.beginPath(); g.ellipse(cx, cy - s * .06, s * .2, s * .08, 0, 0, Math.PI * 2); g.fill(); g.fillRect(cx - s * .2, cy - s * .06, s * .4, s * .2); }
    else if (e === "@site") { g.beginPath(); g.arc(cx, cy, s * .2, 0, Math.PI * 2); g.setLineDash([s * .06, s * .05]); g.stroke(); g.setLineDash([]); g.beginPath(); g.moveTo(cx, cy - s * .1); g.lineTo(cx, cy + s * .1); g.moveTo(cx - s * .1, cy); g.lineTo(cx + s * .1, cy); g.stroke(); }
    else if (e === "@line") { g.lineWidth = s * .09; g.beginPath(); g.moveTo(cx - s * .24, cy + s * .14); g.lineTo(cx - s * .04, cy - s * .12); g.lineTo(cx + s * .24, cy + s * .08); g.stroke(); }
    else if (e === "@poly") { g.globalAlpha = .45; g.beginPath(); g.moveTo(cx - s * .22, cy + s * .2); g.lineTo(cx - s * .22, cy - s * .18); g.quadraticCurveTo(cx + s * .22, cy - s * .2, cx + s * .22, cy + s * .2); g.closePath(); g.fill(); g.globalAlpha = 1; g.stroke(); }
    else if (e.charAt(0) === "#") { var txt = e.slice(1), light = /^#(f|e)/i.test(t.c); g.fillStyle = light ? "#3a2f25" : "#fff"; g.font = "bold " + Math.round(s * (txt.length > 1 ? .3 : .4)) + "px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(txt, cx, cy + s * .02); }
    else { g.font = Math.round(s * .46) + "px 'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(e, cx, cy + s * .03); }
    return c;
  }
  function iconURL(type) { return iconCache[type] || (iconCache[type] = iconCanvas(type, 64).toDataURL()); }

  /* ---------------- which layers are showing ---------------- */
  var VIS = (function () { try { var v = JSON.parse(localStorage.getItem("pu-layers") || "null"); if (v) return v; } catch (e) {} return { assets: true, trees: true, irrigation: true, fields: true, snow: true, models: true, decor: true, names: true }; })();
  function saveVis() { try { localStorage.setItem("pu-layers", JSON.stringify(VIS)); } catch (e) {} }
  function visList() { return LAYERS.map(function (l) { return l.id; }).filter(function (k) { return VIS[k] !== false || k === focusLayer; }); }

  /* ---------------- map layers ---------------- */
  var selId = null;
  function pointGJ() { return { type: "FeatureCollection", features: ASSETS.filter(function (a) { return a.lng != null && tOf(a).geom === "point" && !isPlace(a); }).map(function (a) {
    var p = a.props || {}, si = a.type === "head" ? Math.max(0, SIZES.indexOf(p.size || SIZES[0])) : -1;
    return { type: "Feature", geometry: { type: "Point", coordinates: [a.lng, a.lat] }, properties: { id: a.id, type: T[a.type] ? a.type : "other", layer: layerOf(a), bad: isBad(a) ? 1 : 0,
      sz: si >= 0 ? SIZE_R[si] : (layerOf(a) === "irrigation" ? .8 : 1), throwm: a.type === "head" && +p.throw > 0 ? +p.throw * .3048 : 0 } }; }) }; }
  function geoGJ() { return { type: "FeatureCollection", features: ASSETS.filter(function (a) { return a.coords && a.coords.length > 1 && tOf(a).geom !== "point"; }).map(function (a) {
    var t = tOf(a), poly = t.geom === "polygon";
    return { type: "Feature", geometry: poly ? { type: "Polygon", coordinates: [a.coords.concat([a.coords[0]])] } : { type: "LineString", coordinates: a.coords },
      properties: { id: a.id, type: a.type, layer: t.layer, color: t.c, w: LINE_W[a.type] || 2.5, dash: DASH[a.type] ? 1 : 0, poly: poly ? 1 : 0, len: t.geom === "line" ? fmtLen(lineLen(a.coords)) : "",
        name: a.label || (poly ? t.name : ""), bad: isBad(a) ? 1 : 0 } }; }) }; }
  function vertsGJ() { var a = ASSETS.filter(function (x) { return x.id === selId; })[0]; if (!a || !a.coords) return { type: "FeatureCollection", features: [] };
    return { type: "FeatureCollection", features: a.coords.map(function (c) { return { type: "Feature", geometry: { type: "Point", coordinates: c }, properties: {} }; }) }; }
  function lf() { return ["in", ["get", "layer"], ["literal", visList()]]; }
  var POINT_LAYERS = ["as-icons", "as-throw", "as-sel"], GEO_LAYERS = ["as-fill", "as-line", "as-line-d", "as-len", "as-name"];
  function applyVis() {
    var map = PU.map(); if (!map || !map.getLayer("as-icons")) return;
    POINT_LAYERS.concat(GEO_LAYERS).forEach(function (id) { if (!map.getLayer(id)) return; var base = id === "as-sel" ? ["==", ["get", "id"], selId || ""] : baseFilter[id]; map.setFilter(id, base ? ["all", lf(), base] : lf()); });
    var mapping = !!focusLayer;
    if (window.PU3D && PU3D.setVisible) PU3D.setVisible(!mapping && VIS.models !== false);
    if (window.PU3D && PU3D.setDecor) PU3D.setDecor(!mapping && VIS.decor !== false);
    if (PU.setNames) PU.setNames(VIS.names !== false);
  }
  var baseFilter = {}, LAYER_ERR = [];
  function addLayers() {
    var map = PU.map(); if (!map || map.getSource("as")) return;
    TYPES.forEach(function (t) { var id = "as-" + t[0]; if (!map.hasImage(id)) { var c = iconCanvas(t[0], 64); map.addImage(id, c.getContext("2d").getImageData(0, 0, 64, 64), { pixelRatio: 2 }); }
      var idb = "asb-" + t[0]; if (!map.hasImage(idb)) { var c2 = iconCanvas(t[0], 64, "#ff3b30"); map.addImage(idb, c2.getContext("2d").getImageData(0, 0, 64, 64), { pixelRatio: 2 }); } });
    var slot = PU.std() ? { slot: "top" } : {};
    map.addSource("as", { type: "geojson", data: pointGJ() });
    map.addSource("as-geo", { type: "geojson", data: geoGJ() });
    map.addSource("as-v", { type: "geojson", data: vertsGJ() });
    baseFilter = { "as-fill": ["==", ["get", "poly"], 1], "as-line": ["==", ["get", "dash"], 0], "as-line-d": ["==", ["get", "dash"], 1], "as-len": ["==", ["get", "poly"], 0], "as-name": ["==", ["get", "poly"], 1], "as-throw": [">", ["get", "throwm"], 0] };
    var add = function (o) { try { map.addLayer(Object.assign(o, slot)); } catch (e) { LAYER_ERR.push(o.id + ": " + (e.message || e)); } };
    add({ id: "as-fill", type: "fill", source: "as-geo", paint: { "fill-color": ["get", "color"], "fill-opacity": .22, "fill-emissive-strength": 1 } });
    add({ id: "as-line", type: "line", source: "as-geo", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["case", ["==", ["get", "bad"], 1], "#ff3b30", ["get", "color"]], "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 14, ["*", ["get", "w"], .5], 20, ["*", ["get", "w"], 2.2]], "line-emissive-strength": 1 } });
    add({ id: "as-line-d", type: "line", source: "as-geo", layout: { "line-cap": "butt" }, paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 14, 1.2, 20, 5], "line-dasharray": [2, 1.5], "line-emissive-strength": 1 } });
    add({ id: "as-throw", type: "circle", source: "as", minzoom: 16, paint: { "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 10, ["/", ["get", "throwm"], 58.74], 22, ["/", ["get", "throwm"], .01434]], "circle-color": "rgba(239,68,68,.10)", "circle-stroke-color": "rgba(239,68,68,.45)", "circle-stroke-width": 1, "circle-pitch-alignment": "map", "circle-emissive-strength": 1 } });
    add({ id: "as-len", type: "symbol", source: "as-geo", minzoom: 17.5, layout: { "symbol-placement": "line-center", "text-field": ["get", "len"], "text-size": 12, "text-allow-overlap": false }, paint: { "text-color": "#0b2238", "text-halo-color": "#fff", "text-halo-width": 1.6 } });
    add({ id: "as-name", type: "symbol", source: "as-geo", minzoom: 15.5, layout: { "text-field": ["get", "name"], "text-size": 13, "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"] }, paint: { "text-color": "#7c2d12", "text-halo-color": "#fff", "text-halo-width": 1.8 } });
    add({ id: "as-sel", type: "circle", source: "as", filter: ["==", ["get", "id"], selId || ""], paint: { "circle-radius": 20, "circle-color": "rgba(255,224,102,.35)", "circle-stroke-color": "#ffe066", "circle-stroke-width": 2.5, "circle-emissive-strength": 1 } });
    add({ id: "as-icons", type: "symbol", source: "as", minzoom: 14.5,
      layout: { "icon-image": ["concat", ["case", ["==", ["get", "bad"], 1], "asb-", "as-"], ["get", "type"]], "icon-size": ["interpolate", ["linear"], ["zoom"], 14.5, ["*", ["get", "sz"], .5], 17, ["*", ["get", "sz"], .8], 20, ["*", ["get", "sz"], 1.15]],
        "icon-allow-overlap": ["step", ["zoom"], false, 16.5, true], "icon-ignore-placement": ["step", ["zoom"], false, 16.5, true], "icon-padding": 0 },
      paint: { "icon-emissive-strength": 1, "icon-opacity": ["interpolate", ["linear"], ["zoom"], 14.5, 0, 15, 1] } });
    add({ id: "as-verts", type: "circle", source: "as-v", paint: { "circle-radius": 5, "circle-color": "#ffffff", "circle-stroke-color": "#0b2238", "circle-stroke-width": 2, "circle-emissive-strength": 1 } });
    add({ id: "me-acc", type: "circle", source: { type: "geojson", data: meGJ() }, paint: { "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 10, ["/", ["get", "acc"], 58.74], 22, ["/", ["get", "acc"], .01434]], "circle-color": "rgba(56,152,255,.15)", "circle-stroke-color": "rgba(56,152,255,.5)", "circle-stroke-width": 1, "circle-pitch-alignment": "map", "circle-emissive-strength": 1 } });
    add({ id: "me-dot", type: "circle", source: "me-acc", paint: { "circle-radius": 7, "circle-color": "#1e88ff", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5, "circle-emissive-strength": 1 } });
    if (!map._puAsBound) { map._puAsBound = true; bindMap(map); }
    applyVis(); if (draw) drawLayers();
  }
  function bindMap(map) {
    var hitPoint = function (e) { if (dragging || draw || armed) return; var f = e.features && e.features[0]; if (!f) return; if (e.originalEvent) e.originalEvent._asset = true; openAsset(f.properties.id, true); };
    map.on("click", "as-icons", hitPoint);
    var hitGeo = function (e) { if (dragging || draw || armed) return; var f = e.features && e.features[0]; if (!f) return; if (e.originalEvent && e.originalEvent._asset) return;
      if (e.originalEvent) e.originalEvent._asset = true; openAsset(f.properties.id, false); };
    ["as-line", "as-line-d", "as-fill"].forEach(function (id) { map.on("click", id, hitGeo); });
    map.on("click", function (e) { if (draw) { addVertex([e.lngLat.lng, e.lngLat.lat]); if (e.originalEvent) e.originalEvent._asset = true; return; }
      if (armed) { dropArmed([e.lngLat.lng, e.lngLat.lat], null); if (e.originalEvent) e.originalEvent._asset = true; } });
    ["mouseenter"].forEach(function (ev) { ["as-icons", "as-line", "as-fill"].forEach(function (id) { map.on(ev, id, function () { map.getCanvas().style.cursor = "pointer"; }); map.on("mouseleave", id, function () { map.getCanvas().style.cursor = ""; }); }); });
    /* press and hold a point, then drag it */
    var holdT = 0, start = null, cand = null;
    var down = function (e) { if (draw || armed || RO) return; var f = e.features && e.features[0]; if (!f) return; cand = f.properties.id; start = e.point;
      clearTimeout(holdT); holdT = setTimeout(function () { var a = byId(cand); if (!a) return; dragging = a; map.dragPan.disable(); if (navigator.vibrate) navigator.vibrate(30); PU.toast("Drag to move \u00b7 lift to drop", 1500); }, 480); };
    var move = function (e) { if (!dragging) { if (start && e.point && Math.hypot(e.point.x - start.x, e.point.y - start.y) > 8) { clearTimeout(holdT); start = null; } return; }
      dragging.lng = e.lngLat.lng; dragging.lat = e.lngLat.lat; var src = map.getSource("as"); if (src) src.setData(pointGJ()); if (e.preventDefault) e.preventDefault(); };
    var up = function () { clearTimeout(holdT); start = null; if (!dragging) return; var a = dragging; a.lng = +a.lng.toFixed(7); a.lat = +a.lat.toFixed(7); a.acc = null;
      map.dragPan.enable(); setTimeout(function () { dragging = null; }, 50); saveAsset(a).then(function () { PU.toast(tOf(a).name + " moved"); }); };
    map.on("touchstart", "as-icons", down); map.on("mousedown", "as-icons", down);
    map.on("touchmove", move); map.on("mousemove", move); map.on("touchend", up); map.on("mouseup", up); map.on("touchcancel", up);
  }
  var dragging = null;
  function byId(id) { return ASSETS.filter(function (x) { return x.id === id; })[0]; }
  function refresh() {
    var map = PU.map();
    if (map && map.getSource("as")) { map.getSource("as").setData(pointGJ()); map.getSource("as-geo").setData(geoGJ()); map.getSource("as-v").setData(vertsGJ()); }
    if (window.PU3D && PU3D.setAssets) PU3D.setAssets(ASSETS.filter(function (a) { return a.lng != null && tOf(a).geom === "point"; }).map(function (a) { return { type: a.type, ll: [a.lng, a.lat], id: a.id, props: a.props || {} }; }));
    if (window.PU3D && PU3D.setNoTreeZones) PU3D.setNoTreeZones(ASSETS.filter(function (a) { return (a.type === "ballfield" || a.type === "cage") && a.coords && a.coords.length > 2; }).map(function (a) { return a.coords; }));
    if (!$("asList").hidden) drawList();
    if (focusLayer) drawLayerBar();
    placeCbs.forEach(function (f) { try { f(); } catch (e) {} });
  }
  var placeCbs = [];
  function saveProperty(o) {
    if (RO) { PU.toast("View only \u2014 ask an admin for editor access."); return Promise.reject(new Error("view only")); }
    var a = o.id ? byId(o.id) : null;
    if (!a) a = { id: o.id || uid(), type: "property", created: o.created || Date.now(), photoCount: 0, cond: "Good", notes: "", props: {} };
    if (o.name != null) a.label = String(o.name).trim().slice(0, 60);
    ["cat", "am", "addr", "mca", "geo"].forEach(function (k) { if (o[k] != null) a.props[k] = String(o[k]).trim(); });
    if (o.ll) { a.lng = +(+o.ll[0]).toFixed(7); a.lat = +(+o.ll[1]).toFixed(7); a.acc = o.acc == null ? null : o.acc; }
    a.park = a.label;
    return saveAsset(a).then(function () { return a; });
  }
  function setSel(id) { selId = id; var map = PU.map(); if (map && map.getLayer("as-sel")) { map.setFilter("as-sel", ["all", lf(), ["==", ["get", "id"], id || ""]]); map.getSource("as-v").setData(vertsGJ()); } }

  /* ---------------- my location ---------------- */
  var me = null, watch = null, follow = false;
  function meGJ() { return { type: "FeatureCollection", features: me ? [{ type: "Feature", geometry: { type: "Point", coordinates: [me.lng, me.lat] }, properties: { acc: Math.max(me.acc || 5, 2) } }] : [] }; }
  var gpsListeners = [];
  function startGPS() {
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
      var ph = { id: uid(), asset: asset.id, date: Date.now(), blob: blob, lat: me ? me.lat : null, lng: me ? me.lng : null, acc: me ? me.acc : null, synced: false };
      return tx("photos", "readwrite", function (s) { s.put(ph); }).then(function () { asset.photoCount = (asset.photoCount || 0) + 1; asset.lastPhoto = ph.date; return saveAsset(asset); });
    });
  }
  function pickPhoto(camera, cb) { var i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; if (camera) i.setAttribute("capture", "environment");
    i.onchange = function () { if (i.files && i.files[0]) cb(i.files[0]); }; document.body.appendChild(i); i.style.display = "none"; i.click(); setTimeout(function () { i.remove(); }, 60000); }

  /* ---------------- UI ---------------- */
  var css = '\
.as-sheet{position:fixed;left:0;right:0;bottom:0;max-height:86vh;border-radius:22px 22px 0 0;z-index:11;display:flex;flex-direction:column;padding-bottom:env(safe-area-inset-bottom,0px);max-width:640px;margin:0 auto}\
.as-sheet .hd2{padding:12px 14px 8px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line)}\
.as-sheet .hd2 h3{margin:0;flex:1;font-size:17px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\
.as-body{overflow:auto;padding:12px 14px 16px;overscroll-behavior:contain}\
.as-types{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}\
.as-types button{display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 4px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.05);font-size:12.5px;font-weight:700}\
.as-types img{width:40px;height:40px}\
.as-sec{color:var(--mut);font-size:12px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;margin:12px 2px 8px}\
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
.as-f textarea{min-height:70px;resize:vertical}.as-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 10px}.as-2 .as-f input,.as-2 .as-f select{width:100%;min-width:0;box-sizing:border-box}\
.as-f .lyv label{text-transform:none;letter-spacing:0;font-size:15px;font-weight:500;color:var(--ink)}\
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
.as-view p{position:absolute;left:0;right:0;bottom:calc(16px + env(safe-area-inset-bottom,0px));text-align:center;color:#ddd;font-size:13px;margin:0}\
.ly-bar{position:fixed;left:8px;right:8px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:7;border-radius:18px;padding:8px;max-width:640px;margin:0 auto}\
.ly-top{display:flex;align-items:center;gap:8px;padding:2px 4px 8px}.ly-top b{flex:1;font-size:15px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\
.ly-top button{border:1px solid var(--line);background:rgba(255,255,255,.07);border-radius:10px;padding:7px 11px;font-weight:800;font-size:13px}\
.ly-top .ok{background:linear-gradient(135deg,#34d399,#22d3ee);color:#03221a;border-color:transparent}\
.ly-types{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}\
.ly-types button{flex:none;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:70px;padding:6px 6px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.05);font-size:11px;font-weight:700;line-height:1.15}\
.ly-types button img{width:30px;height:30px}.ly-types button[aria-pressed=true]{border-color:#ffe066;background:rgba(255,224,102,.15)}\
.ly-types small{color:var(--mut);font-weight:600}\
.dr-bar{position:fixed;left:8px;right:8px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:8;border-radius:18px;padding:10px;max-width:560px;margin:0 auto}\
.dr-info{text-align:center;font-size:13.5px;margin-bottom:8px}.dr-info b{font-size:16px}\
.dr-btns{display:flex;gap:6px}.dr-btns button{flex:1;padding:10px 4px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.07);font-weight:800;font-size:13px;white-space:nowrap}\
.dr-btns .p{background:linear-gradient(135deg,#34d399,#22d3ee);color:#03221a;border-color:transparent}\
.dr-names{display:flex;gap:6px;overflow-x:auto;margin-bottom:8px}.dr-names button{flex:none;padding:6px 10px;border-radius:99px;border:1px solid var(--line);background:rgba(255,255,255,.06);font-size:12.5px;font-weight:700}\
.dr-names button[aria-pressed=true]{background:#fff;color:#08121c}\
.lyv label{display:flex;align-items:center;gap:10px;padding:11px 4px;border-bottom:1px solid var(--line);font-size:15px}\
.lyv input{width:22px;height:22px;accent-color:#34d399}.lyv small{color:var(--mut);margin-left:auto;font-size:12.5px}\
.layering .dock,.layering .card,.layering .top .brand{display:none!important}\
.ly-top b{font-size:clamp(13px,3.6vw,15px)}.ly-types button{font-size:clamp(10px,2.8vw,11.5px)}';
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  var shell = document.createElement("div");
  shell.innerHTML = '<div class="scrim" id="asScrim" hidden></div>' +
    '<div class="as-sheet glass" id="asList" hidden role="dialog" aria-label="List"><div class="hd2"><h3 id="asListT">Assets</h3><button class="flyl" id="asAddBtn">\uff0b Add</button><button class="x" style="position:static" id="asListX" aria-label="Close">&#10005;</button></div>' +
    '<div class="as-body"><input class="search" id="asQ" type="search" placeholder="Search names, species, notes" autocomplete="off"><div class="chips" id="asChips" style="margin:8px 0"></div><div class="as-sum" id="asSum"></div><div id="asRows"></div>' +
    '<div class="as-act"><button id="asCsv">Export spreadsheet (CSV)</button><button id="asGeo">Export map file (GeoJSON)</button></div></div></div>' +
    '<div class="as-sheet glass" id="asSheet" hidden role="dialog" aria-label="Details"><div class="hd2"><button class="x" style="position:static" id="asBack" aria-label="Back">&larr;</button><h3 id="asT"></h3><button class="x" style="position:static" id="asX" aria-label="Close">&#10005;</button></div><div class="as-body" id="asBody"></div></div>' +
    '<div class="ly-bar glass" id="lyBar" hidden><div class="ly-top"><b id="lyT"></b><button id="lyRules" hidden>Rules</button><button id="lyList">List</button><button id="lyDl">\u2b07</button><button class="ok" id="lyDone">Done</button></div><div class="ly-types" id="lyTypes"></div></div>' +
    '<div class="dr-bar glass" id="drBar" hidden><div class="dr-names" id="drNames" hidden></div><div class="dr-info" id="drInfo"></div><div class="dr-btns"><button id="drUndo">\u21b6 Undo</button><button id="drPt">\uff0b Point at +</button><button id="drSat">Satellite</button><button class="p" id="drOk">Finish</button><button id="drX">\u2715</button></div></div>' +
    '<datalist id="asSpecies">' + SPECIES.map(function (s) { return '<option value="' + esc(s) + '">'; }).join("") + '</datalist>';
  document.body.appendChild(shell);

  function showSheet(id) { ["asList", "asSheet"].forEach(function (k) { $(k).hidden = k !== id; }); $("asScrim").hidden = !id; }
  function closeAll() { showSheet(null); setSel(null); stopGPSWait(); }
  $("asScrim").onclick = closeAll; $("asListX").onclick = closeAll; $("asX").onclick = closeAll;
  $("asBack").onclick = function () { stopGPSWait(); setSel(null); if (focusLayer && !listCtx.fromList) { showSheet(null); } else openList(listCtx); };

  /* --- list --- */
  var listCtx = {}, fType = "all";
  function inCtx(a) { return !isPlace(a) && (!listCtx.park || a.park === listCtx.park) && (!listCtx.layer || layerOf(a) === listCtx.layer); }
  function openList(ctx) { if (PU.closeAll && !focusLayer) PU.closeAll(); listCtx = ctx || {}; listCtx.fromList = true; fType = listCtx.type || "all"; $("asQ").value = ""; showSheet("asList"); drawList(); }
  function drawList() {
    var chips = $("asChips"); chips.innerHTML = "";
    var types = TYPES.filter(function (t) { return !listCtx.layer || t[2] === listCtx.layer; });
    [["all", "All"]].concat(types.map(function (t) { return [t[0], t[1]]; })).forEach(function (f) {
      var n = f[0] === "all" ? null : ASSETS.filter(function (a) { return a.type === f[0] && inCtx(a); }).length;
      if (n === 0 && f[0] !== fType) return;
      var b = document.createElement("button"); b.textContent = f[1] + (n ? " " + n : ""); b.setAttribute("aria-pressed", fType === f[0]); b.onclick = function () { fType = f[0]; drawList(); }; chips.appendChild(b); });
    var q = $("asQ").value.trim().toLowerCase();
    var list = ASSETS.filter(function (a) { return inCtx(a) && (fType === "all" || a.type === fType) &&
      (!q || (tOf(a).name + " " + a.park + " " + (a.label || "") + " " + (a.notes || "") + " " + JSON.stringify(a.props || {})).toLowerCase().indexOf(q) >= 0); });
    var noun = listCtx.layer ? { assets: "asset", trees: "tree", irrigation: "irrigation item", fields: "field item", snow: "snow item" }[listCtx.layer] : "item";
    if (!listCtx.layer) noun = "asset";
    $("asListT").textContent = (listCtx.park ? listCtx.park + " \u00b7 " : "") + list.length + " " + noun + (list.length === 1 ? "" : "s");
    var by = {}; ASSETS.filter(inCtx).forEach(function (a) { by[a.type] = (by[a.type] || 0) + 1; });
    $("asSum").innerHTML = Object.keys(by).map(function (k) { return '<span><img alt="" src="' + iconURL(k) + '">' + by[k] + " " + esc((T[k] || T.other).name.toLowerCase()) + "</span>"; }).join("");
    var rows = $("asRows"); rows.innerHTML = "";
    if (!list.length) { rows.innerHTML = '<div class="empty">Nothing here yet. Tap \uff0b Add to start mapping.</div>'; return; }
    list.sort(function (a, b) { return (a.park || "").localeCompare(b.park || "") || (a.type || "").localeCompare(b.type || "") || (b.updated - a.updated); });
    var near = me ? [me.lng, me.lat] : null;
    list.forEach(function (a) { var t = tOf(a), b = document.createElement("button"); b.className = "as-row";
      b.innerHTML = '<img class="i" alt="" src="' + iconURL(a.type) + '"><span><b></b><small></small></span>';
      b.querySelector("b").textContent = (a.label || t.name);
      var sm = summary(a);
      b.querySelector("small").textContent = (listCtx.park ? "" : a.park + " \u00b7 ") + (sm ? sm + " \u00b7 " : "") + (a.cond || condList(a)[0]) + " \u00b7 " + (a.photoCount || 0) + " photo" + ((a.photoCount || 0) === 1 ? "" : "s") + (near && a.lng != null ? " \u00b7 " + Math.round(dkm(near, [a.lng, a.lat]) * 1000) + " m away" : "");
      if (isBad(a)) b.querySelector("small").style.color = COND_COL[Math.max(2, condList(a).indexOf(a.cond))];
      if (a.lastPhoto) photosOf(a.id).then(function (ph) { if (ph[0]) blobOf(ph[0]).then(function (bl) { if (!bl) return; var im = document.createElement("img"); im.className = "th"; im.alt = ""; im.src = URL.createObjectURL(bl); b.appendChild(im); }); });
      b.onclick = function () { openAsset(a.id, true); }; rows.appendChild(b); });
  }
  $("asQ").oninput = drawList;
  function setRO(on) { RO = !!on; $("asAddBtn").hidden = RO; if (focusLayer) drawLayerBar(); }
  $("asAddBtn").onclick = function () { if (listCtx.layer && listCtx.layer !== "assets") { showSheet(null); openLayer(listCtx.layer, listCtx.park); return; } startAdd({ park: listCtx.park, type: fType !== "all" ? fType : null, layer: listCtx.layer }); };

  /* --- add a point (type -> GPS or + crosshair) --- */
  var gpsWait = null;
  function stopGPSWait() { if (gpsWait) { gpsListeners = gpsListeners.filter(function (f) { return f !== gpsWait; }); gpsWait = null; } }
  function startAdd(ctx) {
    if (RO) { PU.toast("View only \u2014 ask an admin for editor access."); return; }
    ctx = ctx || {}; if (PU.closeAll && !focusLayer) PU.closeAll(); showSheet("asSheet"); $("asT").textContent = "Add";
    if (ctx.type) { var tt = T[ctx.type]; if (tt && tt.geom !== "point") { showSheet(null); return startDraw(ctx.type, { park: ctx.park }); } return chooseLocation(ctx); }
    var body = $("asBody"), lyr = ctx.layer || "assets";
    body.innerHTML = '<p class="mut" style="margin:0 0 10px">What are you recording' + (ctx.park ? " at " + esc(ctx.park) : "") + '?</p><div class="as-types" id="asTypes"></div>';
    TYPES.filter(function (t) { return t[2] === lyr; }).forEach(function (t) { var b = document.createElement("button"); b.innerHTML = '<img alt="" src="' + iconURL(t[0]) + '"><span></span>'; b.lastChild.textContent = t[1];
      b.onclick = function () { ctx.type = t[0]; if (t[3] !== "point") { showSheet(null); startDraw(t[0], { park: ctx.park }); } else chooseLocation(ctx); }; $("asTypes").appendChild(b); });
  }
  function chooseLocation(ctx) {
    var t = T[ctx.type]; $("asT").textContent = "Add " + t.name.toLowerCase(); showSheet("asSheet");
    var body = $("asBody");
    body.innerHTML = '<div class="as-gps" id="asGps"><div style="display:flex;align-items:center;gap:10px"><img alt="" src="' + iconURL(ctx.type) + '" style="width:40px;height:40px"><div><div class="big" id="asAcc">Finding GPS\u2026</div><small class="mut" id="asAccT">Stand right next to the ' + esc(t.name.toLowerCase()) + '. Accuracy improves for a few seconds.</small></div></div><div class="meter"><i id="asMeter"></i></div></div>' +
      '<div class="as-act"><button class="p" id="asUseGps" disabled>Save GPS spot</button><button id="asTapMap">Place on satellite map</button></div>';
    var best = null;
    gpsWait = function (fix, err) {
      if (!$("asAcc")) return;
      if (!fix) { $("asAcc").textContent = err && err.code === 1 ? "Location is off" : "No GPS yet"; $("asAccT").textContent = err && err.code === 1 ? "Allow location for Park Universe, or place it on the map instead." : "Keep waiting outside, or place it on the map instead."; return; }
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
      var c = best ? [best.lng, best.lat] : (ctx.park ? parkLL(ctx.park) : null);
      PU.moveMode("Line up the + with the " + t.name.toLowerCase(), function (ll) { create(ctx, ll[0], ll[1], null); }, { center: c }); };
  }
  function create(ctx, lng, lat, acc, props, quiet) {
    var a = { id: uid(), type: ctx.type, lng: +lng.toFixed(7), lat: +lat.toFixed(7), acc: acc, park: ctx.park || nearestPark([lng, lat]), cond: condList({ type: ctx.type })[0], label: ctx.label || "", notes: "", created: Date.now(), photoCount: 0, props: props || {} };
    if (ctx.coords) a.coords = ctx.coords;
    return saveAsset(a).then(function () { if (!quiet) { PU.toast(tOf(a).name + " saved at " + a.park + "." + (tOf(a).geom === "point" ? " Add a photo." : "")); openAsset(a.id, false); } return a; });
  }

  /* --- layer workspace: top-down park map with that layer's tools --- */
  var focusLayer = null, focusPark = null, armed = null, lastSize = SIZES[0], RO = false;
  function openLayer(layer, park) {
    if (PU.closeAll) PU.closeAll(); showSheet(null);
    if (!focusLayer) wsKeep = { decor: VIS.decor, models: VIS.models };
    focusLayer = layer; focusPark = park || null; armed = null;
    if (VIS[layer] === false) { VIS[layer] = true; saveVis(); }
    applyVis(); if (window.PU3D) { if (PU3D.setDecor) PU3D.setDecor(false); if (PU3D.setVisible) PU3D.setVisible(false); }
    document.body.classList.add("layering"); $("lyBar").hidden = false; $("lyRules").hidden = layer !== "snow" || !park; drawLayerBar();
    var c = park ? parkLL(park) : null, map = PU.map();
    var pk = park ? PU.PL.filter(function (x) { return x.n === park; })[0] : null, z = !pk ? Math.max(map ? map.getZoom() : 17, 17) : pk.n === "Central Park" ? 16.4 : pk.cat === "large" ? 17.1 : /sports|pool|amph/.test(pk.cat) ? 17.5 : 17.9;
    var cw = map ? (map.getCanvas().clientWidth || 400) : 400; z -= Math.max(0, (420 - cw) / 420);
    if (map) map.flyTo({ center: c || map.getCenter(), zoom: z, pitch: 0, bearing: 0, duration: 1200, essential: true, padding: { top: 20, bottom: 150, left: 10, right: 10 } });
  }
  var wsKeep = null;
  function closeLayer() { disarm(); focusLayer = null; focusPark = null; $("lyBar").hidden = true; document.body.classList.remove("layering"); wsKeep = null; applyVis();
    var map = PU.map(); if (map) map.easeTo({ pitch: 58, duration: 900 }); }
  function drawLayerBar() {
    var l = L[focusLayer]; if (!l) return;
    var n = ASSETS.filter(function (a) { return layerOf(a) === focusLayer && (!focusPark || a.park === focusPark); }).length;
    $("lyT").textContent = l.e + " " + l.name + (focusPark ? " \u00b7 " + focusPark : "") + " (" + n + ")";
    var box = $("lyTypes"); box.innerHTML = "";
    if (RO) { box.innerHTML = '<div class="mut" style="padding:8px 6px;font-size:13px">View only \u2014 ask an admin for editor access to add or change items.</div>'; return; }
    TYPES.filter(function (t) { return t[2] === focusLayer; }).forEach(function (t) {
      var b = document.createElement("button"); b.setAttribute("aria-pressed", armed === t[0]);
      var hint = t[3] === "point" ? "tap map" : t[3] === "line" ? "draw line" : "outline";
      b.innerHTML = '<img alt="" src="' + iconURL(t[0]) + '"><span></span><small></small>'; b.querySelector("span").textContent = t[1]; b.querySelector("small").textContent = armed === t[0] ? "adding\u2026" : hint;
      b.onclick = function () { if (t[3] === "point") { if (armed === t[0]) disarm(); else arm(t[0]); } else { disarm(); startDraw(t[0], { park: focusPark }); } };
      box.appendChild(b); });
  }
  function arm(type) {
    armed = type; drawLayerBar();
    var t = T[type], msg = "Tap the map to drop " + t.name.toLowerCase() + (/s$/.test(t.name) ? "" : "s") + ". Tap the button again when done.";
    if (type === "head") { msg = "Tap the map to drop sprinkler heads (" + lastSize + "). Long-press a head to drag it."; }
    PU.toast(msg, 4000);
    if (type === "head") { pickSize(); }
  }
  function disarm() { armed = null; if (focusLayer) drawLayerBar(); var ps = $("asSizePick"); if (ps) ps.remove(); }
  function pickSize() {
    var old = $("asSizePick"); if (old) old.remove();
    var d = document.createElement("div"); d.id = "asSizePick"; d.className = "dr-names glass"; var bh = ($("lyBar").offsetHeight || 130) + 18;
    d.style.cssText = "position:fixed;left:8px;right:8px;bottom:calc(" + bh + "px + env(safe-area-inset-bottom,0px));z-index:8;padding:8px;border-radius:14px;max-width:640px;margin:0 auto";
    SIZES.forEach(function (sz) { var b = document.createElement("button"); b.textContent = sz; b.setAttribute("aria-pressed", sz === lastSize); b.onclick = function () { lastSize = sz; pickSize(); }; d.appendChild(b); });
    document.body.appendChild(d);
  }
  function dropArmed(ll) {
    var props = armed === "head" ? { size: lastSize } : {};
    create({ type: armed, park: focusPark || nearestPark(ll) }, ll[0], ll[1], null, props, true).then(function (a) { PU.toast(tOf(a).name + " added \u00b7 tap it to edit", 1400); });
  }
  $("lyDone").onclick = closeLayer;
  $("lyRules").onclick = function () { disarm(); var i = PU.PL.map(function (p) { return p.n; }).indexOf(focusPark); if (i >= 0 && PU.openSnowRules) PU.openSnowRules(i); };
  $("lyList").onclick = function () { disarm(); openList({ park: focusPark, layer: focusLayer }); };
  $("lyDl").onclick = function () { disarm(); openExport(focusPark, focusLayer); };

  /* --- drawing lines and outlines --- */
  var draw = null;
  function startDraw(type, o) {
    o = o || {}; var t = T[type]; if (!t) return;
    draw = { type: type, coords: (o.coords || []).slice(), park: o.park, edit: o.edit || null, label: o.edit ? o.edit.label : "" };
    $("drBar").hidden = false; $("xhair").hidden = false; document.body.classList.add("placing");
    if ($("lyBar")) $("lyBar").hidden = true;
    var names = $("drNames"); names.innerHTML = ""; names.hidden = type !== "ballfield" && type !== "cage";
    if (!names.hidden) FIELD_NAMES.forEach(function (n) { var b = document.createElement("button"); b.textContent = n; b.setAttribute("aria-pressed", draw.label === n);
      b.onclick = function () { draw.label = draw.label === n ? "" : n; [].forEach.call(names.children, function (x) { x.setAttribute("aria-pressed", x.textContent === draw.label); }); drawInfo(); }; names.appendChild(b); });
    $("drSat").textContent = PU.look() === "sat" ? "Street map" : "Satellite";
    var map = PU.map(); if (map) { if (draw.coords.length) map.flyTo({ center: centroid(draw.coords), zoom: Math.max(map.getZoom(), 18.3), pitch: 0, bearing: 0, duration: 800 }); else map.easeTo({ pitch: 0, bearing: 0, zoom: Math.max(map.getZoom(), 18), duration: 700 }); }
    drawLayers(); drawInfo();
    PU.toast(t.geom === "line" ? "Tap along the " + t.name.toLowerCase() + " to add points, or line up the + and tap \uff0b Point." : "Tap each corner of the outline. Add more points on curves.", 4200);
  }
  function drawGJ() { var c = draw ? draw.coords : [], t = draw ? T[draw.type] : null, f = [];
    if (c.length > 1) f.push({ type: "Feature", geometry: t.geom === "polygon" && c.length > 2 ? { type: "Polygon", coordinates: [c.concat([c[0]])] } : { type: "LineString", coordinates: c }, properties: {} });
    c.forEach(function (p, i) { f.push({ type: "Feature", geometry: { type: "Point", coordinates: p }, properties: { last: i === c.length - 1 ? 1 : 0 } }); });
    return { type: "FeatureCollection", features: f }; }
  function drawLayers() {
    var map = PU.map(); if (!map || !draw) return; var col = T[draw.type].c;
    if (!map.getSource("dr")) map.addSource("dr", { type: "geojson", data: drawGJ() }); else map.getSource("dr").setData(drawGJ());
    var slot = PU.std() ? { slot: "top" } : {};
    if (!map.getLayer("dr-fill")) map.addLayer(Object.assign({ id: "dr-fill", type: "fill", source: "dr", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": col, "fill-opacity": .25 } }, slot));
    if (!map.getLayer("dr-line")) map.addLayer(Object.assign({ id: "dr-line", type: "line", source: "dr", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": col, "line-width": 3, "line-dasharray": [2, 1] } }, slot));
    if (!map.getLayer("dr-pt")) map.addLayer(Object.assign({ id: "dr-pt", type: "circle", source: "dr", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": ["case", ["==", ["get", "last"], 1], 7, 5], "circle-color": "#fff", "circle-stroke-color": col, "circle-stroke-width": 3 } }, slot));
    ["dr-fill", "dr-line"].forEach(function (id) { map.setPaintProperty(id, id === "dr-fill" ? "fill-color" : "line-color", col); }); map.setPaintProperty("dr-pt", "circle-stroke-color", col);
  }
  function clearDrawLayers() { var map = PU.map(); if (!map) return; ["dr-pt", "dr-line", "dr-fill"].forEach(function (id) { if (map.getLayer(id)) map.removeLayer(id); }); if (map.getSource("dr")) map.removeSource("dr"); }
  function drawInfo() { if (!draw) return; var t = T[draw.type], c = draw.coords, s;
    if (t.geom === "line") s = "<b>" + (c.length > 1 ? fmtLen(lineLen(c)) : "0 ft") + "</b> \u00b7 " + c.length + " point" + (c.length === 1 ? "" : "s");
    else s = "<b>" + (c.length > 2 ? fmtArea(polyArea(c)) : "\u2014") + "</b> \u00b7 " + c.length + " corner" + (c.length === 1 ? "" : "s") + (c.length > 2 ? " \u00b7 edge " + fmtLen(lineLen(c.concat([c[0]]))) : "");
    $("drInfo").innerHTML = esc((draw.label ? draw.label + " \u00b7 " : "") + t.name) + "<br>" + s;
    var need = t.geom === "line" ? 2 : 3; $("drOk").disabled = c.length < need; }
  function addVertex(ll) { if (!draw) return; draw.coords.push([+ll[0].toFixed(7), +ll[1].toFixed(7)]); drawLayers(); drawInfo(); }
  function endDraw() { draw = null; clearDrawLayers(); $("drBar").hidden = true; $("xhair").hidden = true; document.body.classList.remove("placing"); if (PU.restoreLook) PU.restoreLook(); if (focusLayer) $("lyBar").hidden = false; }
  $("drUndo").onclick = function () { if (draw && draw.coords.length) { draw.coords.pop(); drawLayers(); drawInfo(); } };
  $("drPt").onclick = function () { var c = PU.map().getCenter(); addVertex([c.lng, c.lat]); };
  $("drSat").onclick = function () { var map = PU.map(), cam = { center: map.getCenter(), zoom: map.getZoom() }; if (PU.look() === "sat") { PU.restoreLook(); this.textContent = "Satellite"; } else { PU.setTempLook("sat"); this.textContent = "Street map"; } map.jumpTo(cam); };
  $("drX").onclick = function () { var e = draw && draw.edit; endDraw(); if (e) openAsset(e.id, false); };
  $("drOk").onclick = function () {
    if (!draw) return; var d = draw, t = T[d.type], c = d.coords.slice(); if (c.length < (t.geom === "line" ? 2 : 3)) return;
    var rep = t.geom === "polygon" ? centroid(c) : c[Math.floor(c.length / 2)];
    endDraw();
    if (d.edit) { var a = d.edit; a.coords = c; a.lng = rep[0]; a.lat = rep[1]; if (d.label) a.label = d.label; saveAsset(a).then(function () { PU.toast("Shape saved \u00b7 " + measure(a)); openAsset(a.id, false); }); }
    else create({ type: d.type, park: d.park || nearestPark(rep), coords: c, label: d.label }, rep[0], rep[1], null, {}).then(function (a) { PU.toast(t.name + " saved \u00b7 " + measure(a)); });
  };

  /* --- details card --- */
  var curPhotos = [];
  function fieldInput(a, f) {
    var key = f[0], kind = f[2], v = (a.props || {})[key], id = "asP_" + key, h;
    if (kind.indexOf("select:") === 0) { var opts = LISTS[kind.slice(7)] || []; h = '<select id="' + id + '"><option value="">\u2014</option>' + opts.map(function (o) { return '<option' + (o === v ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>"; }
    else if (kind === "species") h = '<input id="' + id + '" list="asSpecies" value="' + esc(v || "") + '" placeholder="Start typing\u2026">';
    else if (kind === "date") h = '<input id="' + id + '" type="date" value="' + esc(v || "") + '">';
    else if (kind === "num") h = '<input id="' + id + '" type="number" inputmode="decimal" step="any" value="' + esc(v == null ? "" : v) + '">';
    else h = '<input id="' + id + '" value="' + esc(v || "") + '">';
    return '<div class="as-f"><label for="' + id + '">' + esc(f[1]) + "</label>" + h + "</div>";
  }
  function openAsset(id, fly, keep) {
    var a = byId(id); if (!a) return;
    if (PU.closeAll && !focusLayer) PU.closeAll(); stopGPSWait(); setSel(id); showSheet("asSheet");
    var t = tOf(a), geom = t.geom; $("asT").textContent = a.label || t.name; a.props = a.props || {};
    var map = PU.map();
    if (fly && a.lng != null && map) map.flyTo({ center: [a.lng, a.lat], zoom: Math.max(map.getZoom(), geom === "point" ? 18.6 : 17.8), pitch: focusLayer ? 0 : 62, duration: 1200, padding: PU.padFor() });
    var body = $("asBody"), y = keep ? body.scrollTop : 0, conds = condList(a), fields = F[a.type] || [];
    body.innerHTML = '<div style="display:flex;gap:10px;align-items:center"><img alt="" src="' + iconURL(a.type) + '" style="width:44px;height:44px"><div style="flex:1;min-width:0"><b style="font-size:16px">' + esc(t.name) + '</b><div class="mut" style="font-size:13px">' + esc(a.park) + (measure(a) ? " \u00b7 " + esc(measure(a)) : "") + '</div></div>' +
      '<span class="as-pill" style="--c:' + COND_COL[Math.max(0, conds.indexOf(a.cond))] + '"><i></i>' + esc(a.cond || conds[0]) + '</span></div>' +
      '<div id="asHeroBox"></div>' +
      '<div class="as-act"><button class="p" id="asCam">\ud83d\udcf7 Take new photo</button><button id="asGal">\ud83d\uddbc Add from gallery</button></div>' +
      '<div class="as-ph" id="asPh"></div>' +
      '<div class="as-f"><label>' + (layerOf(a) === "trees" ? "Health" : "Condition") + '</label><div class="as-seg" id="asCond"></div></div>' +
      '<div class="as-f"><label for="asLabel">' + (a.type === "ballfield" || a.type === "cage" ? "Field name" : "Name or ID tag") + '</label><input id="asLabel" maxlength="60" placeholder="' + (a.type === "ballfield" ? "e.g. West field" : a.type === "tree" ? "e.g. Tree 14" : "e.g. Bench 3, north path") + '"' + (a.type === "ballfield" ? ' list="asFieldNames"' : "") + '></div>' +
      (a.type === "ballfield" ? '<datalist id="asFieldNames">' + FIELD_NAMES.map(function (n) { return '<option value="' + esc(n) + '">'; }).join("") + "</datalist>" : "") +
      '<div class="as-2">' + fields.map(function (f) { return fieldInput(a, f); }).join("") + "</div>" +
      '<div class="as-f"><label for="asType">Type</label><select id="asType"></select></div>' +
      '<div class="as-f"><label for="asPark">Park</label><select id="asPark"></select></div>' +
      '<div class="as-f"><label for="asNotes">Notes</label><textarea id="asNotes" placeholder="' + (layerOf(a) === "trees" ? "Health notes, pests, pruning, staking\u2026" : layerOf(a) === "irrigation" ? "Brand, repairs, coverage, schedule\u2026" : "Material, model, damage, work done\u2026") + '"></textarea></div>' +
      '<p class="src" id="asLoc"></p>' +
      '<div class="as-act">' + (geom === "point" ? '<button id="asReGps">\ud83d\udccd Update GPS here</button><button id="asReTap">Move on satellite map</button>' : '<button id="asShape">\u270f\ufe0f Edit shape</button><button id="asRedraw">Redraw</button>') +
      '<button id="asNav">Directions</button><button class="d" id="asDel">Delete</button></div>';
    conds.forEach(function (c, i) { var b = document.createElement("button"); b.textContent = c; b.style.setProperty("--c", COND_COL[i]); b.setAttribute("aria-pressed", (a.cond || conds[0]) === c);
      b.onclick = function () { a.cond = c; saveAsset(a).then(function () { openAsset(a.id, false, true); }); }; $("asCond").appendChild(b); });
    $("asLabel").value = a.label || ""; $("asNotes").value = a.notes || "";
    $("asLabel").onchange = function () { a.label = this.value.trim(); saveAsset(a); $("asT").textContent = a.label || t.name; };
    $("asNotes").onchange = function () { a.notes = this.value; saveAsset(a); };
    fields.forEach(function (f) { var el = $("asP_" + f[0]); if (!el) return; el.onchange = function () { var v = this.value; if (f[2] === "num") v = v === "" ? "" : +v; a.props[f[0]] = v; if (f[0] === "size") lastSize = v || lastSize; saveAsset(a); }; });
    var ts = $("asType"); TYPES.filter(function (x) { return x[2] === t.layer && x[3] === geom; }).forEach(function (x) { var o = document.createElement("option"); o.value = x[0]; o.textContent = x[1]; if (x[0] === a.type) o.selected = true; ts.appendChild(o); });
    ts.onchange = function () { a.type = this.value; saveAsset(a).then(function () { openAsset(a.id, false, true); }); };
    var ps = $("asPark"); parksByDistance([a.lng, a.lat]).forEach(function (p) { var o = document.createElement("option"); o.value = p.n; o.textContent = p.n + " (" + (p.d < 1 ? Math.round(p.d * 1000) + " m" : p.d.toFixed(1) + " km") + ")"; if (p.n === a.park) o.selected = true; ps.appendChild(o); });
    ps.onchange = function () { a.park = this.value; saveAsset(a); };
    $("asLoc").textContent = (geom === "point" ? "GPS " + a.lat.toFixed(6) + ", " + a.lng.toFixed(6) + " \u00b7 " + fmtAcc(a.acc) : (a.coords ? a.coords.length : 0) + " points") + " \u00b7 added " + fmtDate(a.created) + (a.updated && a.updated - a.created > 60000 ? " \u00b7 updated " + fmtDate(a.updated) : "");
    $("asCam").onclick = function () { startGPS(); pickPhoto(true, function (f) { addPhoto(a, f).then(function () { PU.toast("Photo saved."); openAsset(a.id, false); }, function () { PU.toast("Couldn't read that photo."); }); }); };
    $("asGal").onclick = function () { pickPhoto(false, function (f) { addPhoto(a, f).then(function () { PU.toast("Photo saved."); openAsset(a.id, false); }, function () { PU.toast("Couldn't read that photo."); }); }); };
    if (geom === "point") {
      $("asReGps").onclick = function () { chooseRelocate(a); };
      $("asReTap").onclick = function () { showSheet(null); PU.moveMode("Line up the + with the " + t.name.toLowerCase(), function (ll) { a.lng = +ll[0].toFixed(7); a.lat = +ll[1].toFixed(7); a.acc = null; saveAsset(a).then(function () { openAsset(a.id, false); }); }, { center: [a.lng, a.lat] }); };
    } else {
      $("asShape").onclick = function () { showSheet(null); startDraw(a.type, { coords: a.coords, edit: a, park: a.park }); };
      $("asRedraw").onclick = function () { showSheet(null); startDraw(a.type, { coords: [], edit: a, park: a.park }); };
    }
    $("asNav").onclick = function () { location.href = "https://www.google.com/maps/dir/?api=1&destination=" + a.lat + "," + a.lng; };
    $("asDel").onclick = function () { if (confirm("Delete this " + t.name.toLowerCase() + " and all its photos?")) delAsset(a).then(function () { PU.toast("Deleted."); if (focusLayer) showSheet(null); else openList(listCtx.park ? listCtx : { park: a.park }); }); };
    if (RO) { [].forEach.call(body.querySelectorAll("input,select,textarea,#asCond button"), function (el) { el.disabled = true; });
      ["asCam", "asGal", "asReGps", "asReTap", "asShape", "asRedraw", "asDel"].forEach(function (k) { var el = $(k); if (el) el.hidden = true; }); }
    body.scrollTop = y;
    curPhotos.forEach(function (u) { URL.revokeObjectURL(u); }); curPhotos = [];
    photosOf(a.id).then(function (ph) {
      var box = $("asPh"); if (!box) return;
      if (!ph.length) { $("asHeroBox").innerHTML = '<div class="empty" style="padding:16px 0">No photos yet. Take one now so there is a dated record of its condition.</div>'; return; }
      $("asHeroBox").innerHTML = '<img class="as-hero" alt="Latest photo"><div class="src">Latest photo \u00b7 ' + fmtDate(ph[0].date) + (ph[0].blob ? "" : " \u00b7 loading\u2026") + '</div>';
      $("asHeroBox").querySelector("img").onclick = function () { view(ph, 0); };
      ph.forEach(function (p, i) { var f = document.createElement("figure"); f.innerHTML = '<img alt=""><figcaption></figcaption>'; f.querySelector("figcaption").textContent = new Date(p.date).toLocaleDateString();
        f.onclick = function () { view(ph, i); }; box.appendChild(f);
        blobOf(p).then(function (bl) { if (!bl) return; var u = URL.createObjectURL(bl); curPhotos.push(u); f.querySelector("img").src = u;
          if (i === 0 && $("asHeroBox")) { var h = $("asHeroBox").querySelector("img"); if (h) h.src = u; var c = $("asHeroBox").querySelector(".src"); if (c) c.textContent = "Latest photo \u00b7 " + fmtDate(p.date); } }); });
    });
  }
  function view(ph, i) {
    if (!ph[i].blob) { blobOf(ph[i]).then(function (b) { if (b) view(ph, i); else PU.toast("That photo isn't downloaded yet. Check your connection."); }); return; }
    var v = document.createElement("div"); v.className = "as-view"; var u = URL.createObjectURL(ph[i].blob);
    v.innerHTML = '<img alt=""><button aria-label="Close">&#10005;</button><p></p>'; v.querySelector("img").src = u;
    v.querySelector("p").textContent = fmtDate(ph[i].date) + (ph[i].lat != null ? " \u00b7 taken at " + ph[i].lat.toFixed(5) + ", " + ph[i].lng.toFixed(5) : "") + "  (" + (i + 1) + " of " + ph.length + ")";
    var close = function () { URL.revokeObjectURL(u); v.remove(); };
    v.querySelector("button").onclick = close;
    v.querySelector("img").onclick = function (e) { e.stopPropagation(); close(); if (ph.length > 1) view(ph, (i + 1) % ph.length); };
    document.body.appendChild(v);
  }
  function chooseRelocate(a) {
    var t = tOf(a); $("asT").textContent = "Update GPS";
    $("asBody").innerHTML = '<div class="as-gps" id="asGps"><div class="big" id="asAcc">Finding GPS\u2026</div><small class="mut" id="asAccT">Stand next to the ' + esc(t.name.toLowerCase()) + '.</small><div class="meter"><i id="asMeter"></i></div></div><div class="as-act"><button class="p" id="asUseGps" disabled>Save new GPS spot</button><button id="asCancel">Cancel</button></div>';
    var best = null;
    gpsWait = function (fix) { if (!fix || !$("asAcc")) return; if (!best || fix.acc <= best.acc + 1) best = fix; var x = best.acc;
      $("asAcc").textContent = fmtAcc(x); $("asMeter").style.width = (x <= 5 ? 100 : x <= 10 ? 80 : x <= 20 ? 55 : 25) + "%"; $("asGps").style.setProperty("--c", x <= 10 ? "#22c55e" : "#eab308");
      $("asAccT").textContent = Math.round(dkm([a.lng, a.lat], [best.lng, best.lat]) * 1000) + " m from the saved spot"; $("asUseGps").disabled = false; };
    gpsListeners.push(gpsWait); if (me) gpsWait(me); startGPS();
    $("asUseGps").onclick = function () { stopGPSWait(); a.lng = +best.lng.toFixed(7); a.lat = +best.lat.toFixed(7); a.acc = best.acc; saveAsset(a).then(function () { PU.toast("GPS updated."); openAsset(a.id, true); }); };
    $("asCancel").onclick = function () { stopGPSWait(); openAsset(a.id, false); };
  }

  /* --- layers on/off --- */
  var VIS_ITEMS = [["assets", "Assets"], ["trees", "Trees"], ["irrigation", "Irrigation"], ["fields", "Fields"], ["snow", "Snow"], ["models", "3D park models"], ["decor", "Decorative 3D trees"], ["names", "Park names"]];
  function openLayersPanel() {
    if (PU.closeAll) PU.closeAll(); showSheet("asSheet"); $("asT").textContent = "Map layers";
    $("asBody").innerHTML = '<div class="lyv" id="lyv"></div><p class="src">Turn layers off to declutter the map. Tap a layer name on a park card to open its tools.</p>';
    VIS_ITEMS.forEach(function (it) { var n = L[it[0]] ? ASSETS.filter(function (a) { return layerOf(a) === it[0]; }).length : null;
      var lb = document.createElement("label"); lb.innerHTML = '<input type="checkbox"><span></span><small></small>'; lb.querySelector("input").checked = VIS[it[0]] !== false; lb.querySelector("span").textContent = (L[it[0]] ? L[it[0]].e + " " : "") + it[1];
      lb.querySelector("small").textContent = n == null ? "" : n + " mapped";
      lb.querySelector("input").onchange = function () { VIS[it[0]] = this.checked; saveVis(); applyVis(); }; $("lyv").appendChild(lb); });
  }

  /* --- download a park map with chosen layers --- */
  var EXP = null;
  function openExport(park, layer) {
    if (PU.closeAll && !focusLayer) PU.closeAll(); showSheet("asSheet"); $("asT").textContent = "Download park map";
    var parks = PU.PL.map(function (p) { return p.n; });
    EXP = { park: park || "", on: {} }; VIS_ITEMS.forEach(function (it) { EXP.on[it[0]] = layer ? (it[0] === layer || it[0] === "names") : VIS[it[0]] !== false; });
    $("asBody").innerHTML = '<div class="as-f"><label for="exPark">Park</label><select id="exPark"><option value="">Whole community</option>' + parks.map(function (n) { return "<option" + (n === EXP.park ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("") + '</select></div>' +
      '<div class="as-f"><label>Include</label><div class="lyv" id="exLy"></div></div>' +
      '<div class="as-act"><button class="p" id="exPng">\ud83d\uddbc Map image (PNG)</button><button id="exGeo">Map data (GeoJSON)</button><button id="exCsv">Spreadsheet (CSV)</button></div>' +
      '<p class="src">The image is taken straight down over the park with a title, legend, scale bar and north arrow.</p>';
    VIS_ITEMS.forEach(function (it) { var lb = document.createElement("label"); lb.innerHTML = '<input type="checkbox"><span></span>'; lb.querySelector("input").checked = !!EXP.on[it[0]];
      lb.querySelector("span").textContent = (L[it[0]] ? L[it[0]].e + " " : "") + it[1]; lb.querySelector("input").onchange = function () { EXP.on[it[0]] = this.checked; }; $("exLy").appendChild(lb); });
    $("exPark").onchange = function () { EXP.park = this.value; };
    $("exPng").onclick = function () { exportImage(); };
    $("exGeo").onclick = function () { saveFile(fileBase() + ".geojson", JSON.stringify(exportGJ(), null, 1), "application/geo+json"); };
    $("exCsv").onclick = function () { saveFile(fileBase() + ".csv", toCSV(exportRows()), "text/csv"); };
  }
  function fileBase() { return (EXP.park ? EXP.park.replace(/[^A-Za-z0-9]+/g, "-") : "central-park") + "-" + Object.keys(EXP.on).filter(function (k) { return EXP.on[k] && L[k]; }).join("-") + "-" + new Date().toISOString().slice(0, 10); }
  function exportRows() { return ASSETS.filter(function (a) { return EXP.on[layerOf(a)] && (!EXP.park || a.park === EXP.park); }); }
  function exportGJ() { return { type: "FeatureCollection", features: exportRows().map(function (a) { var t = tOf(a), g = t.geom === "point" ? { type: "Point", coordinates: [a.lng, a.lat] } : t.geom === "line" ? { type: "LineString", coordinates: a.coords } : { type: "Polygon", coordinates: [a.coords.concat([a.coords[0]])] };
    return { type: "Feature", geometry: g, properties: Object.assign({ id: a.id, layer: L[layerOf(a)].name, type: t.name, name: a.label, park: a.park, condition: a.cond, accuracy_m: a.acc, length_or_area: measure(a), photos: a.photoCount || 0, notes: a.notes, added: new Date(a.created).toISOString(), updated: new Date(a.updated || a.created).toISOString() }, a.props || {}) }; }) }; }
  function toCSV(rows) {
    var keys = {}; rows.forEach(function (a) { Object.keys(a.props || {}).forEach(function (k) { keys[k] = 1; }); }); keys = Object.keys(keys);
    var label = {}; Object.keys(F).forEach(function (k) { F[k].forEach(function (f) { if (!label[f[0]]) label[f[0]] = f[1]; }); });
    Object.assign(label, { species: "Species", replace: "Replacement date", zone: "Zone", make: "Make / model", qty: "Quantity", stored: "Stored at", priority: "Priority", method: "Method" });
    var q = function (v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [["Park", "Layer", "Type", "Name/ID", "Condition", "Latitude", "Longitude", "GPS accuracy (m)", "Length/area"].concat(keys.map(function (k) { return label[k] || k; })).concat(["Photos", "Last photo", "Notes", "Added", "Updated", "ID"]).map(q).join(",")];
    rows.forEach(function (a) { lines.push([a.park, L[layerOf(a)].name, tOf(a).name, a.label, a.cond, a.lat, a.lng, a.acc == null ? "" : Math.round(a.acc * 10) / 10, measure(a)].concat(keys.map(function (k) { return (a.props || {})[k]; }))
      .concat([a.photoCount || 0, a.lastPhoto ? new Date(a.lastPhoto).toISOString() : "", a.notes, new Date(a.created).toISOString(), new Date(a.updated || a.created).toISOString(), a.id]).map(q).join(",")); });
    return lines.join("\n");
  }
  function exportImage() {
    var map = PU.map(); if (!map) return; var keepVis = JSON.parse(JSON.stringify(VIS)), keepFocus = focusLayer;
    VIS_ITEMS.forEach(function (it) { VIS[it[0]] = !!EXP.on[it[0]]; }); focusLayer = null; applyVis();
    showSheet(null); var lb = $("lyBar"), lbWas = lb.hidden; lb.hidden = true; document.body.classList.add("placing");
    var rows = exportRows(), pts = [];
    rows.forEach(function (a) { if (a.coords) pts = pts.concat(a.coords); else pts.push([a.lng, a.lat]); });
    var c = EXP.park ? parkLL(EXP.park) : null; if (c) pts.push(c);
    var done = false;
    var finish = function () {
      if (done) return; done = true;
      try {
        var mc = map.getCanvas(), W = mc.width, H = mc.height, dpr = mc.clientWidth ? W / mc.clientWidth : (window.devicePixelRatio || 1), out = document.createElement("canvas"), g = out.getContext("2d"), head = Math.round(64 * dpr);
        out.width = W; out.height = H + head; g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, out.height); g.drawImage(mc, 0, head);
        g.fillStyle = "#0b2238"; g.font = "bold " + Math.round(22 * dpr) + "px sans-serif"; g.textBaseline = "top"; g.fillText((EXP.park || "Central Park") + " \u2014 Park Universe", 16 * dpr, 10 * dpr);
        g.font = Math.round(13 * dpr) + "px sans-serif"; g.fillStyle = "#475569";
        g.fillText(VIS_ITEMS.filter(function (it) { return EXP.on[it[0]] && L[it[0]]; }).map(function (it) { return it[1]; }).join(" \u00b7 ") + "   \u00b7   " + new Date().toLocaleDateString(), 16 * dpr, 38 * dpr);
        /* legend */
        var types = {}; rows.forEach(function (a) { types[a.type] = (types[a.type] || 0) + 1; }); var tk = Object.keys(types), lh = 22 * dpr, lw = 210 * dpr, lx = W - lw - 12 * dpr, ly = head + 12 * dpr;
        if (tk.length) { g.fillStyle = "rgba(255,255,255,.92)"; g.fillRect(lx, ly, lw, lh * tk.length + 14 * dpr); g.strokeStyle = "#cbd5e1"; g.strokeRect(lx, ly, lw, lh * tk.length + 14 * dpr);
          tk.forEach(function (k, i) { var ic = iconCanvas(k, 48); g.drawImage(ic, lx + 8 * dpr, ly + 7 * dpr + i * lh, 18 * dpr, 18 * dpr); g.fillStyle = "#0b2238"; g.font = Math.round(12.5 * dpr) + "px sans-serif"; g.textBaseline = "middle"; g.fillText(T[k].name + " (" + types[k] + ")", lx + 32 * dpr, ly + 16 * dpr + i * lh); }); }
        /* scale bar + north arrow */
        var z = map.getZoom(), lat = map.getCenter().lat, mpp = 78271.517 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z), feet = [10, 20, 50, 100, 200, 500, 1000, 2000], tgt = 120 * mpp * 3.28084, sf = feet[0];
        feet.forEach(function (f) { if (f <= tgt) sf = f; }); var px = sf / 3.28084 / mpp * dpr, sx = 16 * dpr, sy = out.height - 22 * dpr;
        g.fillStyle = "rgba(255,255,255,.9)"; g.fillRect(sx - 6 * dpr, sy - 22 * dpr, px + 70 * dpr, 30 * dpr); g.fillStyle = "#0b2238"; g.fillRect(sx, sy, px, 4 * dpr); g.font = "bold " + Math.round(12 * dpr) + "px sans-serif"; g.textBaseline = "bottom"; g.fillText(sf + " ft", sx, sy - 3 * dpr);
        var nx = W - 34 * dpr, ny = out.height - 40 * dpr; g.save(); g.translate(nx, ny); g.rotate(-map.getBearing() * Math.PI / 180); g.fillStyle = "#0b2238"; g.beginPath(); g.moveTo(0, -18 * dpr); g.lineTo(9 * dpr, 12 * dpr); g.lineTo(0, 6 * dpr); g.lineTo(-9 * dpr, 12 * dpr); g.closePath(); g.fill(); g.font = "bold " + Math.round(12 * dpr) + "px sans-serif"; g.textAlign = "center"; g.fillText("N", 0, -20 * dpr); g.restore();
        var data = out.toDataURL("image/png");
        saveBinary(fileBase() + ".png", data.split(",")[1], "image/png");
      } catch (e) { PU.toast("Couldn't make the image: " + (e.message || e)); }
      VIS = keepVis; saveVis(); focusLayer = keepFocus; applyVis(); lb.hidden = lbWas; document.body.classList.remove("placing");
    };
    var go = function () { map.once("idle", function () { setTimeout(finish, 400); }); setTimeout(finish, 6000); map.triggerRepaint(); };
    if (pts.length > 1) { var w = 180, e = -180, s = 90, n = -90; pts.forEach(function (p) { w = Math.min(w, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]); });
      var padLL = .00012, cw = map.getCanvas().clientWidth || 400; map.fitBounds([[w - padLL, s - padLL], [e + padLL, n + padLL]], { pitch: 0, bearing: 0, padding: { top: 20, bottom: 50, left: 20, right: Math.round(Math.min(200, cw * .3)) }, maxZoom: 19.5, duration: 0 }); }
    else if (c) map.jumpTo({ center: c, zoom: 18, pitch: 0, bearing: 0 });
    else map.jumpTo({ pitch: 0, bearing: 0 });
    go();
  }
  function saveBinary(name, b64, mime) {
    if (window.AndroidApp && AndroidApp.saveBase64) { AndroidApp.saveBase64(name, mime, b64); return; }
    var bin = atob(b64), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    var b = new Blob([u8], { type: mime }), u = URL.createObjectURL(b), l = document.createElement("a"); l.href = u; l.download = name; document.body.appendChild(l); l.click(); setTimeout(function () { URL.revokeObjectURL(u); l.remove(); }, 3000);
  }
  function saveFile(name, text, mime) {
    if (window.AndroidApp && AndroidApp.saveText) { AndroidApp.saveText(name, text); return; }
    var b = new Blob([text], { type: mime }), u = URL.createObjectURL(b), l = document.createElement("a"); l.href = u; l.download = name; document.body.appendChild(l); l.click(); setTimeout(function () { URL.revokeObjectURL(u); l.remove(); }, 2000);
  }
  function rowsFor() { return ASSETS.filter(inCtx); }
  $("asCsv").onclick = function () { saveFile("park-" + (listCtx.layer || "assets") + "-" + new Date().toISOString().slice(0, 10) + ".csv", toCSV(rowsFor()), "text/csv"); };
  $("asGeo").onclick = function () { EXP = { park: listCtx.park || "", on: {} }; LAYERS.forEach(function (l) { EXP.on[l.id] = !listCtx.layer || l.id === listCtx.layer; });
    saveFile("park-" + (listCtx.layer || "assets") + "-" + new Date().toISOString().slice(0, 10) + ".geojson", JSON.stringify(exportGJ(), null, 1), "application/geo+json"); };

  /* ---------------- start ---------------- */
  function counts(park, layer) { var by = {}; ASSETS.forEach(function (a) { if (a.park === park && (!layer || layerOf(a) === layer)) by[a.type] = (by[a.type] || 0) + 1; }); return by; }
  function layerCount(park, layer) { return ASSETS.filter(function (a) { return a.park === park && layerOf(a) === layer; }).length; }
  var ready = open().then(function () { return all("assets"); }).then(function (list) { ASSETS = list || []; refresh(); }).catch(function () { PU.toast("Storage isn't available on this device."); });
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

  window.PUAssets = { TYPES: TYPES, T: T, LAYERS: LAYERS, addLayers: addLayers, openList: openList, startAdd: startAdd, openAsset: openAsset, locateMe: locateMe, counts: counts, layerCount: layerCount, iconURL: iconURL,
    openLayer: openLayer, closeLayer: closeLayer, openLayersPanel: openLayersPanel, openExport: openExport, startDraw: startDraw, vis: function () { return VIS; }, focus: function () { return focusLayer; },
    close: function () { closeAll(); if (draw) endDraw(); }, ready: ready, me: function () { return me; }, startGPS: function () { return startGPS(); }, list: function () { return ASSETS.filter(function (a) { return !isPlace(a); }); },
    layerErrors: function () { return LAYER_ERR.slice(); },
    places: function () { return ASSETS.filter(isPlace); }, saveProperty: saveProperty, deleteProperty: function (id) { var a = byId(id); return a ? delAsset(a) : Promise.resolve(); },
    onPlaces: function (f) { placeCbs.push(f); }, setReadOnly: setRO, readOnly: function () { return RO; },
    onChange: function (f) { hooks.push(f); },
    _sync: { all: function () { return ASSETS.slice(); }, layerOf: layerOf,
      markClean: function (id, stamp) { var a = byId(id); if (a && a.updated === stamp) { a.dirty = false; a.synced = true; return saveAsset(a, true); } return Promise.resolve(); },
      applyRemote: function (a) { var l = byId(a.id); if (l && l.dirty) return Promise.resolve(false); return saveAsset(a, true).then(function () { return true; }); },
      removeRemote: function (id) { var l = byId(id); if (!l || l.dirty) return Promise.resolve(false); return delAsset(l, true).then(function () { return true; }); },
      photos: function () { return all("photos"); }, putPhoto: function (p) { return tx("photos", "readwrite", function (s) { s.put(p); }); },
      delPhoto: function (id) { return tx("photos", "readwrite", function (s) { s.delete(id); }); },
      recount: function () { return all("photos").then(function (ps) { var n = {}, last = {}; ps.forEach(function (p) { n[p.asset] = (n[p.asset] || 0) + 1; last[p.asset] = Math.max(last[p.asset] || 0, p.date); });
        return Promise.all(ASSETS.map(function (a) { var c = n[a.id] || 0; if (c !== (a.photoCount || 0)) { a.photoCount = c; a.lastPhoto = last[a.id] || null; return saveAsset(a, true); } })); }); },
      refresh: function () { refresh(); }, blobOf: blobOf }, _addPhotoBlob: function (id, file) { return addPhoto(byId(id), file); }, _me: function (m) { me = m; }, _lineLen: lineLen, _polyArea: polyArea };
})();
