/* Park Universe 3D: MetroGovernor-style low-poly models of every park and pool,
 * standing on their real spots on the Mapbox map (a three.js custom layer).
 *
 *   PU3D.layer(places, opts)  -> Mapbox custom layer; add it with map.addLayer(...)
 *   PU3D.setSel(i)            highlight one place (beacon spins, fountains play)
 *   PU3D.setLight(preset)     "day" | "dawn" | "dusk" | "night"
 *   PU3D.rebuild()            after a pin moves
 *   PU3D.radius(place)        footprint in metres (for tap targets)
 *
 * Local frame: metres from ORIGIN; x = east, y = up, z = south.
 */
(function () {
  "use strict";
  var ORIGIN = [-104.8885, 39.7745];
  var R = { large: 60, sports: 44, water: 28, amph: 34, picnic: 26, dog: 30, small: 24, pool: 32 };
  var GRASS = "#7cc96a", PATH = "#f3e7c9";
  var S = { places: null, map: null, scene: null, cam: null, rend: null, inst: {}, beacons: null, ring: null, jets: [],
            sel: -1, t0: 0, light: "day", hemi: null, sun: null, amb: null, ok: false, origin: null, s: 1, opts: {} };

  function radius(p) { return p.n === "Central Park" ? 120 : (R[p.cat] || 18); }

  /* deterministic random per park, so models don't change between visits */
  function rng(seed) { var h = 2166136261; for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }

  /* ---------- instanced builder: one draw call per shape ---------- */
  var GEO = null, VOXEL = false;
  function geos() {
    if (GEO) return GEO;
    if (VOXEL) { var bx = new THREE.BoxGeometry(1, 1, 1); bx.translate(0, .5, 0); GEO = {};
      ["box", "cyl", "half", "cone", "roof", "canopy", "pine"].forEach(function (k) { GEO[k] = bx; }); return GEO; }
    var T = THREE; GEO = {};
    GEO.box = new T.BoxGeometry(1, 1, 1); GEO.box.translate(0, .5, 0);
    GEO.cyl = new T.CylinderGeometry(.5, .5, 1, 18); GEO.cyl.translate(0, .5, 0);
    GEO.half = new T.CylinderGeometry(.5, .5, 1, 14, 1, false, 0, Math.PI); GEO.half.translate(0, .5, 0);
    GEO.cone = new T.ConeGeometry(.5, 1, 8); GEO.cone.translate(0, .5, 0);
    GEO.roof = new T.ConeGeometry(Math.SQRT1_2, 1, 4, 1); GEO.roof.rotateY(Math.PI / 4); GEO.roof.translate(0, .5, 0);
    GEO.canopy = new T.IcosahedronGeometry(.5, 0); GEO.canopy.translate(0, .5, 0);
    GEO.pine = new T.ConeGeometry(.5, 1, 6); GEO.pine.translate(0, .5, 0);
    return GEO;
  }
  var Q = null;
  function begin() { Q = {}; }
  function put(g, color, x, y, z, sx, sy, sz, ry) { (Q[g] = Q[g] || []).push([x, y, z, sx, sy, sz, ry || 0, color]); }
  function flush(scene, key) {
    key = key || "inst";
    var T = THREE, m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), sc = new T.Vector3(), c = new T.Color();
    S[key] = S[key] || {};
    Object.keys(S[key]).forEach(function (k) { scene.remove(S[key][k]); S[key][k].dispose(); });
    S[key] = {};
    var mat = new T.MeshStandardMaterial({ color: "#ffffff", roughness: .75, metalness: 0, flatShading: true });
    var glow = new T.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
    Object.keys(Q).forEach(function (g) {
      var isGlow = g.indexOf("glow:") === 0, list = Q[g], im = new T.InstancedMesh(geos()[isGlow ? g.slice(5) : g], isGlow ? glow : mat, list.length);
      list.forEach(function (a, i) {
        v.set(a[0], a[1], a[2]); sc.set(a[3], a[4], a[5]); q.setFromEuler(e.set(0, a[6], 0));
        im.setMatrixAt(i, m4.compose(v, q, sc)); im.setColorAt(i, c.set(a[7]));
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false; scene.add(im); S[key][g] = im;
    });
    Q = null;
  }

  function tree(r, x, z, s) {
    if (VOXEL) { var th = Math.round(4 + r() * 3), cw = r() < .2 ? 7 : 5, leaf = ["#4f9a3a", "#5aa843", "#3f8a33", "#64b04a"][Math.floor(r() * 4)];
      put("box", "#7a5530", x, 1.2, z, 1.2, th, 1.2);
      put("box", leaf, x, 1.2 + th - 1, z, cw, 3, cw); put("box", leaf, x, 1.2 + th + 2, z, cw - 2, 2, cw - 2); return; }
    var tall = (10 + r() * 7) * (s || 1), w = (6 + r() * 4) * (s || 1), pine = r() < .3;
    put("cyl", "#8a6440", x, 1.2, z, 1.1, tall * .45, 1.1);
    if (pine) put("pine", r() < .5 ? "#3d9a55" : "#4aab5c", x, 1.2 + tall * .2, z, w * .9, tall, w * .9);
    else put("canopy", ["#58b84f", "#6cc45a", "#7ccf5c", "#4fae4a"][Math.floor(r() * 4)], x, 1.2 + tall * .32, z, w, w * .9, w, r() * 6);
  }
  function scatter(r, cx, cz, rad, n, avoid) {
    for (var k = 0, tries = 0; k < n && tries < n * 8; tries++) {
      var a = r() * Math.PI * 2, d = rad * Math.sqrt(r()), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (avoid && avoid(x - cx, z - cz)) continue; tree(r, x, z); k++;
    }
  }

  /* ---------- one model per park, built from its real amenity list ---------- */
  function has(p, re) { return re.test(p.am || ""); }
  function model(p, x, z) {
    var r = rng(p.n), rad = radius(p), cat = p.cat, rot = r() * Math.PI * 2;
    var cs = Math.cos(rot), sn = Math.sin(rot);
    function at(dx, dz) { return [x + dx * cs - dz * sn, z + dx * sn + dz * cs]; }
    function P(g, col, dx, y, dz, sx, sy, sz, ry) { var a = at(dx, dz); put(g, col, a[0], y, a[1], sx, sy, sz, (ry || 0) - rot); }
    function G(g, col, dx, y, dz, sx, sy, sz) { var a = at(dx, dz); put("glow:" + g, col, a[0], y, a[1], sx, sy, sz, -rot); }

    /* free-spot finder so props never overlap each other or the main feature */
    var used = [];
    var reach = /sports|pool|amph|water/.test(cat) ? 1.6 : 1;
    function spot(fr, minD, maxD) {
      maxD = (maxD || rad * .85) * reach;
      for (var k = 0; k < 80; k++) { var a = r() * Math.PI * 2, d = (minD || 0) + r() * Math.max(1, (maxD || rad * .85) - (minD || 0)), dx = Math.cos(a) * d, dz = Math.sin(a) * d, ok = true;
        for (var i = 0; i < used.length; i++) { var u = used[i]; if (Math.hypot(dx - u[0], dz - u[1]) < fr + u[2]) { ok = false; break; } }
        if (ok) { used.push([dx, dz, fr]); return [dx, dz, a]; } }
      return null; }
    function reserve(dx, dz, fr) { used.push([dx, dz, fr]); }

    /* --- props (sizes in metres) --- */
    function bench(dx, dz, a) { var g = a || 0; P("box", "#8a6440", dx, .45, dz, 1.8, .12, .5, g); P("box", "#8a6440", dx - Math.sin(g) * .22, .6, dz - Math.cos(g) * .22, 1.8, .45, .08, g);
      P("box", "#3d3d3d", dx - .7 * Math.cos(g), 0, dz + .7 * Math.sin(g), .1, .45, .45, g); P("box", "#3d3d3d", dx + .7 * Math.cos(g), 0, dz - .7 * Math.sin(g), .1, .45, .45, g); }
    function lamp(dx, dz) { P("cyl", "#2f3a45", dx, 0, dz, .18, 4.2, .18); P("box", "#2f3a45", dx, 4.2, dz, .5, .15, .5); G("box", "#fff2b3", dx, 3.95, dz, .38, .28, .38); }
    function table(dx, dz, a) { P("box", "#a07850", dx, .72, dz, 1.9, .08, .8, a); P("box", "#8a6440", dx, .42, dz + .65, 1.9, .06, .3, a); P("box", "#8a6440", dx, .42, dz - .65, 1.9, .06, .3, a);
      P("box", "#5b4430", dx - .7, 0, dz, .12, .72, 1.6, a); P("box", "#5b4430", dx + .7, 0, dz, .12, .72, 1.6, a); }
    function bin(dx, dz) { P("cyl", "#2f5d3a", dx, 0, dz, .6, .95, .6); P("cyl", "#244a2e", dx, .95, dz, .66, .08, .66); }
    function dogbag(dx, dz) { P("cyl", "#3b6e3f", dx, 0, dz, .1, 1.3, .1); P("box", "#4caf50", dx, 1.1, dz, .3, .4, .2); }
    function playground(dx, dz) {
      P("box", "#ff9e57", dx, .02, dz, 9, .06, 8);                                   /* rubber surface */
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (o) { P("box", "#f2c14e", dx + o[0] * 1.1, 0, dz - 1.5 + o[1] * 1.1, .2, 3.4, .2); });
      P("box", "#3a86ff", dx, 1.6, dz - 1.5, 2.6, .2, 2.6); P("roof", "#e63946", dx, 3.4, dz - 1.5, 3.2, 1.6, 3.2);       /* tower */
      P("box", "#8ecae6", dx + 2.4, .2, dz - 1.5, 3.4, .25, 1.0, .0); P("box", "#8ecae6", dx + 3.6, 0, dz - 1.5, .9, .5, 1.0); /* slide */
      P("box", "#5c677d", dx - 3.4, 0, dz + 2.0, .18, 2.6, .18); P("box", "#5c677d", dx - .8, 0, dz + 2.0, .18, 2.6, .18); P("box", "#5c677d", dx - 2.1, 2.5, dz + 2.0, 2.9, .16, .16); /* swings */
      P("box", "#ffd166", dx - 2.6, .55, dz + 2.0, .55, .08, .3); P("box", "#06d6a0", dx - 1.6, .55, dz + 2.0, .55, .08, .3); }
    function pergola(dx, dz, a) { [[-1.8, -1.4], [1.8, -1.4], [-1.8, 1.4], [1.8, 1.4]].forEach(function (o) { P("box", "#e9e2d2", dx + o[0], 0, dz + o[1], .25, 2.8, .25, a); });
      for (var k = -2; k <= 2; k++) P("box", "#d8cfbd", dx + k * .85, 2.8, dz, .14, .2, 3.4, a); P("box", "#d8cfbd", dx, 2.95, dz - 1.4, 4, .14, .14, a); P("box", "#d8cfbd", dx, 2.95, dz + 1.4, 4, .14, .14, a);
      P("canopy", "#7fbf5a", dx - 1.8, 2.6, dz - 1.4, 1.2, 1.2, 1.2); }
    function grill(dx, dz) { P("box", "#3a3a3a", dx, 0, dz, .7, .9, .5); P("box", "#555", dx, .9, dz, .75, .25, .55); }
    function firepit(dx, dz) { P("cyl", "#8d8a85", dx, 0, dz, 2.2, .45, 2.2); P("cyl", "#3b2b22", dx, .4, dz, 1.7, .08, 1.7); G("cone", "#ff8c2b", dx, .45, dz, .9, 1.1, .9); G("cone", "#ffd166", dx, .45, dz, .5, .7, .5);
      for (var k = 0; k < 6; k++) { var a = k / 6 * Math.PI * 2; P("box", "#7a5a3c", dx + Math.cos(a) * 2.6, 0, dz + Math.sin(a) * 2.6, 1.4, .45, .45, a); } }
    function pizza(dx, dz) { P("box", "#c9b79c", dx, 0, dz, 2.2, 1, 2); P("canopy", "#b5651d", dx, .9, dz, 1.9, 1.3, 1.9); P("cyl", "#8d8a85", dx + .5, 1.6, dz, .3, 1.4, .3); G("box", "#ff9a3c", dx, 1.05, dz + .95, .7, .45, .06); }
    function court(dx, dz, kind, a) {
      if (kind === "basket") { P("box", "#c0603a", dx, .02, dz, 15, .06, 9, a); P("box", "#ffffff", dx, .09, dz, .12, .02, 9, a); P("cyl", "#ffffff", dx, .09, dz, 3.6, .02, 3.6);
        [-1, 1].forEach(function (k) { P("cyl", "#444", dx + k * 7, 0, dz, .2, 3.4, .2); P("box", "#ffffff", dx + k * 6.8, 2.9, dz, .1, 1.1, 1.8, a); P("cyl", "#ff6b35", dx + k * 6.4, 3.0, dz, .5, .06, .5); }); }
      else if (kind === "pickle") { for (var k = -1; k <= 1; k += 2) { P("box", "#2f6fb0", dx, .02, dz + k * 4, 13.4, .06, 6.1, a); P("box", "#5aa05a", dx, .025, dz + k * 4, 14.4, .05, 7.1, a); P("box", "#f4f4f4", dx, .02, dz + k * 4, .1, .95, 6.1, a); }
        P("box", "#2b2b2b", dx, 0, dz - 8.2, 16, 2.4, .08, a); P("box", "#2b2b2b", dx, 0, dz + 8.2, 16, 2.4, .08, a); }
      else if (kind === "volley") { P("box", "#e3cf91", dx, .02, dz, 16, .1, 8, a); P("cyl", "#ffffff", dx, 0, dz - 4.4, .12, 2.6, .12); P("cyl", "#ffffff", dx, 0, dz + 4.4, .12, 2.6, .12); P("box", "#f4f4f4", dx, 1.6, dz, .05, .9, 8.8, a); } }
    function beds(dx, dz) { for (var k = 0; k < 6; k++) { var bx = dx + (k % 3 - 1) * 2.6, bz = dz + (k < 3 ? -1.4 : 1.4); P("box", "#7a5a3c", bx, 0, bz, 2.1, .45, 1.1); P("box", "#5a3d26", bx, .45, bz, 1.9, .05, .9);
      for (var j = 0; j < 3; j++) P("canopy", ["#6cc45a", "#8bc34a", "#ffb703", "#e63946"][Math.floor(r() * 4)], bx - .6 + j * .6, .45, bz, .55, .45, .55); } }
    function rocks(dx, dz) { for (var k = 0; k < 4; k++) P("canopy", ["#9aa0a6", "#8a8f96", "#b0b5ba"][k % 3], dx + (r() - .5) * 5, 0, dz + (r() - .5) * 5, 1.6 + r() * 1.6, 1.2 + r() * 1.4, 1.6 + r() * 1.4, r() * 6); }
    function logs(dx, dz) { for (var k = 0; k < 4; k++) P("box", "#8a6440", dx + (k - 1.5) * 1.3, 0, dz + (k % 2) * 1.5, .45, .45, 3.2, k * .5); }
    function fitness(dx, dz) { for (var k = 0; k < 3; k++) { var fx = dx + (k - 1) * 3.2; P("box", "#5c677d", fx - .8, 0, dz, .16, 2.4, .16); P("box", "#5c677d", fx + .8, 0, dz, .16, 2.4, .16); P("box", "#ffb703", fx, 2.3, dz, 1.8, .12, .12); P("box", "#4ee1a0", fx, 0, dz, 2.6, .05, 1.6); } }
    function shade(dx, dz) { [[-2.6, -2], [2.6, -2], [0, 2.6]].forEach(function (o) { P("cyl", "#e9e2d2", dx + o[0], 0, dz + o[1], .18, 3.6, .18); });
      var a = at(dx, dz); put("box", "#ffffff", a[0], 3.2, a[1], 5.6, .06, 5.0, -rot + .5); }
    function umbrella(dx, dz, c) { P("cyl", "#ffffff", dx, 0, dz, .1, 2.4, .1); P("cone", c, dx, 2.2, dz, 2.6, .8, 2.6); }
    function shelter(dx, dz, a) { [[-3, -2.2], [3, -2.2], [-3, 2.2], [3, 2.2]].forEach(function (o) { P("box", "#8a6a4a", dx + o[0], 0, dz + o[1], .35, 3.2, .35, a); }); P("roof", "#c25b3c", dx, 3.2, dz, 8.8, 2.6, 6.8, a); table(dx, dz, a); }
    function trailRing(rr) { for (var k = 0; k < 36; k++) { var a = k / 36 * Math.PI * 2, a2 = at(Math.cos(a) * rr, Math.sin(a) * rr); put("box", "#d9c9a6", a2[0], .02, a2[1], 2.2, .06, 2 * Math.PI * rr / 36 + .3, -a - rot); } }
    function lawnMounds(n) { for (var k = 0; k < n; k++) { var sp = spot(4, rad * .2, rad * .8); if (sp) P("canopy", "#79c160", sp[0], -1.2, sp[1], 7, 2.2, 6, r() * 3); } }

    /* --- main feature by category --- */
    if (p.n === "Central Park") {
      P("cyl", "#4cc3e0", -35, -.1, 25, 70, .3, 44); reserve(-35, 25, 38);
      P("box", "#f2ead8", 30, 0, -10, 22, 6, 14); P("roof", "#c96f4a", 30, 6, -10, 26, 5, 18); reserve(30, -10, 16);
      P("cyl", "#e6e6e6", 10, 0, 40, 14, 1.2, 14); S.jets.push({ x: at(10, 40)[0], z: at(10, 40)[1], y: 1.3, i: S.places.indexOf(p) }); reserve(10, 40, 9);
      trailRing(rad * .78);
    } else if (cat === "large") {
      P("cyl", "#4cc3e0", rad * .3, -.1, rad * .25, rad * .7, .3, rad * .5); reserve(rad * .3, rad * .25, rad * .38);
      trailRing(rad * .82);
    } else if (cat === "sports") {
      var fw = rad * 1.25, fd = rad * .8; P("box", "#4c9a45", 0, .01, 0, fw, .12, fd);
      [[0, -fd / 2, fw, .3], [0, fd / 2, fw, .3], [-fw / 2, 0, .3, fd], [fw / 2, 0, .3, fd], [0, 0, .3, fd]].forEach(function (l) { P("box", "#ffffff", l[0], .13, l[1], l[2], .03, l[3]); });
      P("cyl", "#ffffff", 0, .13, 0, 9, .03, 9); P("box", "#ffffff", -fw / 2 + 1, 0, 0, .25, 2.4, 7.3); P("box", "#ffffff", fw / 2 - 1, 0, 0, .25, 2.4, 7.3);
      used.push([0, 0, Math.max(fw, fd) * .55]);
      for (var bl = 0; bl < 3; bl++) { P("box", "#9aa3ad", -fw / 4 + bl * 4, 0, fd / 2 + 4 + bl * .7, 3.6, .3 + bl * .45, .8); }   /* bleachers */
    } else if (cat === "water") {
      P("cyl", "#e7e2d6", 0, 0, 0, rad * .9, .35, rad * .9); P("cyl", "#4cc3e0", 0, .02, 0, rad * .78, .36, rad * .78);
      S.jets.push({ x: x, z: z, y: .4, i: S.places.indexOf(p) }); reserve(0, 0, rad * .5);
    } else if (cat === "amph") {
      for (var k = 0; k < 4; k++) P("half", "#cfc8bb", 0, 0, 4, rad * (1.5 - k * .27), .5 + k * .5, rad * (1.5 - k * .27));
      P("box", "#b9845b", 0, 0, -rad * .22, rad * .7, .9, rad * .35); P("box", "#e9e2d2", 0, .9, -rad * .35, rad * .7, 5, .6); reserve(0, 0, rad * .8);
    } else if (cat === "dog") {
      for (var f = 0; f < 34; f++) { var a = f / 34 * Math.PI * 2; put("box", "#8d7b66", x + Math.cos(a) * rad * .86, 0, z + Math.sin(a) * rad * .86, .25, 1.5, .25); }
      for (var f2 = 0; f2 < 34; f2++) { var a3 = (f2 + .5) / 34 * Math.PI * 2; put("box", "#a8987f", x + Math.cos(a3) * rad * .86, 1.1, z + Math.sin(a3) * rad * .86, .1, .1, 2 * Math.PI * rad * .86 / 34, -a3); }
      P("box", "#d8a867", 6, 0, 4, 2.4, 1.6, 3); P("roof", "#9c4b32", 6, 1.6, 4, 3, 1.2, 3.6); P("cyl", "#4cc3e0", -6, 0, -4, 2, .5, 2); reserve(6, 4, 3);
    } else if (cat === "pool") {
      var pw = rad * 1.25, pd = rad * .7;
      P("box", "#efe4cc", 0, 0, 0, pw + 10, .5, pd + 10); P("box", "#2fb4e8", 0, .05, 0, pw, .5, pd);
      for (var l = 1; l < 6; l++) P("box", "#e9fbff", -pw / 2 + pw * l / 6, .56, 0, .25, .03, pd * .9);
      for (var lt = 0; lt < 6; lt++) G("box", "#9ff3ff", -pw / 2 + pw * (lt + .5) / 6, .3, pd / 2 - .05, .5, .2, .1);        /* pool lights */
      P("box", "#f4f1ea", -pw / 2 - 9, 0, -pd / 2 + 2, 10, 4.5, 12); P("box", "#d8d2c4", -pw / 2 - 9, 4.5, -pd / 2 + 2, 11, .5, 13);
      P("box", "#ffffff", pw / 2 + 2.5, 0, -2, .2, 2.4, .2); P("box", "#ffffff", pw / 2 + 3.3, 0, -2, .2, 2.4, .2); P("box", "#e63946", pw / 2 + 2.9, 2.2, -2, 1.1, .2, .9); /* lifeguard chair */
      for (var lc = 0; lc < 5; lc++) P("box", "#ffffff", -pw / 2 + 3 + lc * 3, .5, pd / 2 + 3.2, 1.0, .25, 2.0);              /* loungers */
      ["#ff6b6b", "#ffd166", "#06d6a0", "#ff9f1c"].forEach(function (c, i) { umbrella(-pw / 2 + 4.5 + i * (pw / 4), pd / 2 + 6, c); });
      if (/Splash Landing/.test(p.n)) { P("cyl", "#ff8c42", pw / 2 + 3, 0, -pd / 2, 3, 9, 3); P("box", "#ffd23f", pw / 2 - 2, 4, -pd / 2 + 3, 2.4, .6, 13, .5); P("box", "#3dccc7", pw / 2 - 5, 3, -pd / 2 - 2, 2.4, .6, 12, -.4); }
      if (/Runway 35|Jet Stream/.test(p.n)) { P("box", "#ffffff", pw / 2 - 1, .5, 0, 2, 2.2, 1); P("box", "#3b82f6", pw / 2 - 3, 2.7, 0, 5, .25, 1.2); }
      if (/Puddle Jumper/.test(p.n)) { P("cyl", "#ffd166", -pw / 4, .5, 0, 3, 2.5, 3); G("cone", "#bff4ff", -pw / 4, 3, 0, 1, 2.5, 1); }
      used.push([0, 0, Math.max(pw, pd) * .75]);
    }

    /* --- amenities from Bubble --- */
    if (has(p, /Playground|Play area|Play structures/)) { var sp = spot(6.5, 2, rad * .75); if (sp) playground(sp[0], sp[1]); }
    if (has(p, /Basketball/)) { var sb = spot(9, 0, rad * .8); if (sb) court(sb[0], sb[1], "basket", 0); }
    if (has(p, /Pickleball/)) { var spk = spot(10, 0, rad * .85); if (spk) court(spk[0], spk[1], "pickle", 0); }
    if (has(p, /Sand volleyball/)) { var sv = spot(9, 0, rad * .85); if (sv) court(sv[0], sv[1], "volley", 0); }
    if (has(p, /Community garden/)) { var sg = spot(5, 0, rad * .8); if (sg) beds(sg[0], sg[1]); }
    if (has(p, /Climbing rocks/)) { var sr = spot(4, 0, rad * .8); if (sr) rocks(sr[0], sr[1]); }
    if (has(p, /Balance logs/)) { var slg = spot(3.5, 0, rad * .8); if (slg) logs(slg[0], slg[1]); }
    if (has(p, /fitness/i)) { var sf = spot(6, 0, rad * .85); if (sf) fitness(sf[0], sf[1]); }
    if (has(p, /Fire pit/)) { var sfp = spot(4, 0, rad * .6); if (sfp) firepit(sfp[0], sfp[1]); }
    if (has(p, /pizza oven/)) { var spz = spot(2.5, 0, rad * .7); if (spz) pizza(spz[0], spz[1]); }
    if (has(p, /Pergola|Trellis/)) { var spg = spot(3.4, 0, rad * .75); if (spg) pergola(spg[0], spg[1], spg[2]); }
    if (has(p, /Picnic shelter|Pavilion/) && p.n !== "Central Park") { var sps = spot(5.5, 0, rad * .75); if (sps) shelter(sps[0], sps[1], sps[2]); }
    if (has(p, /Shade structure|\bShade\b/)) { var ssh = spot(4, 0, rad * .75); if (ssh) shade(ssh[0], ssh[1]); }
    if (has(p, /Umbrellas/)) for (var u = 0; u < 3; u++) { var su = spot(1.6, 0, rad * .7); if (su) { umbrella(su[0], su[1], ["#ff6b6b", "#ffd166", "#06d6a0"][u]); table(su[0], su[1] + .01, 0); } }
    if (has(p, /Gas grill|\bGrill\b/)) { var sgr = spot(1, 0, rad * .75); if (sgr) grill(sgr[0], sgr[1]); }
    var nt = has(p, /Picnic tables/) ? 3 : has(p, /\bTables\b|Community table/) ? 2 : 0; if (has(p, /Community table/)) nt = Math.max(nt, 1);
    for (var t = 0; t < nt; t++) { var st = spot(1.4, 0, rad * .8); if (st) table(st[0], st[1], st[2]); }
    var nb = has(p, /Benches/) ? (rad > 40 ? 6 : 3) : 1;
    for (var bi = 0; bi < nb; bi++) { var sbn = spot(1.2, rad * .35, rad * .9); if (sbn) bench(sbn[0], sbn[1], -sbn[2] + Math.PI / 2); }
    if (has(p, /Dog bag/)) { var sd = spot(.5, rad * .5, rad * .95); if (sd) dogbag(sd[0], sd[1]); }
    if (has(p, /Trash|Dog bag/)) { var sx = spot(.6, rad * .5, rad * .95); if (sx) bin(sx[0], sx[1]); }
    if (has(p, /Trail|Walking paths|Access to trails/) && p.n !== "Central Park" && cat !== "large") trailRing(rad * .9);
    if (has(p, /Open space|Greenspace/)) lawnMounds(2);
    /* lamp posts on every park, and trees in the free space */
    var nl = rad > 50 ? 8 : rad > 30 ? 4 : 2;
    for (var li = 0; li < nl; li++) { var sl = spot(.6, rad * .55, rad * .98); if (sl) lamp(sl[0], sl[1]); }
    var ntrees = p.n === "Central Park" ? 60 : cat === "large" ? 26 : cat === "pool" ? 5 : cat === "sports" ? 8 : 4;
    var tmin = (cat === "large" || p.n === "Central Park") ? .2 : .62, ts = rad < 35 ? .75 : 1;
    for (var ti = 0; ti < ntrees; ti++) { var stp = spot(3 * ts, rad * tmin, rad * 1.02 / reach); if (stp) { var a4 = at(stp[0], stp[1]); tree(r, a4[0], a4[1], ts); } }
  }

  /* ---------- recorded assets: a small model at each GPS spot ---------- */
  S.assets = [];
  function assetModel(a, x, z) {
    var r = rng(a.id || (a.type + x)), rot = r() * Math.PI * 2, cs = Math.cos(rot), sn = Math.sin(rot);
    function P(g, col, dx, y, dz, sx, sy, sz) { put(g, col, x + dx * cs - dz * sn, y, z + dx * sn + dz * cs, sx, sy, sz, -rot); }
    function G(g, col, dx, y, dz, sx, sy, sz) { put("glow:" + g, col, x + dx * cs - dz * sn, y, z + dx * sn + dz * cs, sx, sy, sz, -rot); }
    switch (a.type) {
      case "bench": P("box", "#8a6440", 0, .45, 0, 1.8, .12, .5); P("box", "#8a6440", 0, .6, -.22, 1.8, .45, .08); P("box", "#333", -.7, 0, 0, .1, .45, .45); P("box", "#333", .7, 0, 0, .1, .45, .45); break;
      case "trash": P("cyl", "#2f5d3a", 0, 0, 0, .6, .95, .6); P("cyl", "#244a2e", 0, .95, 0, .66, .08, .66); break;
      case "dog": P("cyl", "#3b6e3f", 0, 0, 0, .1, 1.3, .1); P("box", "#4caf50", 0, 1.05, 0, .32, .45, .22); P("cyl", "#2f5d3a", .5, 0, 0, .45, .7, .45); break;
      case "grill": P("box", "#2b2b2b", 0, .55, 0, .8, .4, .55); P("box", "#4a4a4a", 0, .95, -.1, .8, .25, .4); P("box", "#555", 0, 0, 0, .12, .55, .12); break;
      case "bathroom": P("box", "#e9e2d2", 0, 0, 0, 3.4, 2.8, 3); P("roof", "#7b5e45", 0, 2.8, 0, 4, 1.2, 3.6); P("box", "#5d7fa0", -.7, 0, 1.51, .9, 2, .05); P("box", "#a05d5d", .7, 0, 1.51, .9, 2, .05); G("box", "#fff2b3", 0, 2.4, 1.55, .5, .2, .1); break;
      case "firepit": P("cyl", "#8d8a85", 0, 0, 0, 1.8, .45, 1.8); P("cyl", "#3b2b22", 0, .4, 0, 1.3, .06, 1.3); G("cone", "#ff8c2b", 0, .45, 0, .7, .9, .7); G("cone", "#ffd166", 0, .45, 0, .4, .55, .4); break;
      case "fountain": P("cyl", "#9aa3ad", 0, 0, 0, .45, .9, .45); P("cyl", "#c9d1d9", 0, .9, 0, .75, .14, .75); G("cone", "#bff4ff", 0, 1.04, 0, .12, .35, .12); break;
      case "light": P("cyl", "#2f3a45", 0, 0, 0, .18, 4.2, .18); P("box", "#2f3a45", 0, 4.2, 0, .5, .15, .5); G("box", "#fff2b3", 0, 3.95, 0, .38, .28, .38); break;
      case "mailbox": P("box", "#5a6470", 0, 0, 0, 1.7, .25, .7); P("box", "#b8c0c8", 0, .25, 0, 1.6, 1.45, .55); for (var k = 0; k < 4; k++) P("box", "#9aa3ad", -.55 + k * .37, .55, .28, .3, .9, .02); break;
      case "newspaper": ["#1565c0", "#c62828", "#2e7d32"].forEach(function (c, i) { P("box", "#444", -.6 + i * .6, 0, 0, .08, .4, .08); P("box", c, -.6 + i * .6, .4, 0, .5, .7, .45); }); break;
      case "table": P("box", "#a07850", 0, .72, 0, 1.9, .08, .8); P("box", "#8a6440", 0, .42, .65, 1.9, .06, .3); P("box", "#8a6440", 0, .42, -.65, 1.9, .06, .3); P("box", "#5b4430", -.7, 0, 0, .12, .72, 1.6); P("box", "#5b4430", .7, 0, 0, .12, .72, 1.6); break;
      case "playground": P("box", "#ff9e57", 0, .02, 0, 6, .06, 5); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (o) { P("box", "#f2c14e", o[0] * 1.1, 0, o[1] * 1.1, .2, 3.2, .2); });
        P("box", "#3a86ff", 0, 1.5, 0, 2.6, .2, 2.6); P("roof", "#e63946", 0, 3.2, 0, 3.1, 1.5, 3.1); P("box", "#8ecae6", 2.4, .2, 0, 3.2, .25, .9); break;
      case "field": P("box", "#ffffff", -3, 0, 0, .15, 2.4, .15); P("box", "#ffffff", 3, 0, 0, .15, 2.4, .15); P("box", "#ffffff", 0, 2.3, 0, 6.2, .15, .15); P("box", "#e9f5e9", 0, .02, 1.5, 6, .03, .12); break;
      case "sign": P("box", "#5d4037", -1.1, 0, 0, .18, 2.2, .18); P("box", "#5d4037", 1.1, 0, 0, .18, 2.2, .18); P("box", "#6d4c41", 0, 1.1, 0, 2.6, 1.1, .14); P("box", "#f3e7c9", 0, 1.25, .08, 2.2, .7, .02); P("roof", "#4e342e", 0, 2.2, 0, 3, .5, .5); break;
      case "structure": [[-2.4, -1.8], [2.4, -1.8], [-2.4, 1.8], [2.4, 1.8]].forEach(function (o) { P("box", "#e9e2d2", o[0], 0, o[1], .3, 3, .3); }); P("roof", "#8d6e63", 0, 3, 0, 7, 2, 5.4); break;
      case "flowerpot": P("cyl", "#c46a3f", 0, 0, 0, .9, .7, .9); P("cyl", "#5a3d26", 0, .66, 0, .8, .05, .8); ["#e91e63", "#ffb703", "#ab47bc", "#ff7043"].forEach(function (c, i) { P("canopy", c, -.2 + (i % 2) * .4, .7, -.2 + Math.floor(i / 2) * .4, .35, .3, .35); }); P("canopy", "#5aa843", 0, .65, 0, .7, .4, .7); break;
      default: P("cone", "#ff7a1a", 0, 0, 0, .7, 1.1, .7); P("cyl", "#ffffff", 0, .45, 0, .52, .15, .52);
    }
  }
  function buildAssets() {
    if (!S.scene) return; begin();
    S.assets.forEach(function (a) { var l = local(a.ll); assetModel(a, l[0], l[1]); });
    if (Object.keys(Q).length) flush(S.scene, "asInst"); else { Q = null; flush2clear(); }
  }
  function flush2clear() { var st = S.asInst || {}; Object.keys(st).forEach(function (k) { S.scene.remove(st[k]); st[k].dispose(); }); S.asInst = {}; }

  function local(ll) { var mc = mapboxgl.MercatorCoordinate.fromLngLat(ll, 0); return [(mc.x - S.origin.x) / S.s, (mc.y - S.origin.y) / S.s]; }

  function build() {
    if (!S.scene) return;
    var T = THREE; S.jets = []; begin();
    S.places.forEach(function (p) { var l = local(p.ll); model(p, l[0], l[1]); });
    flush(S.scene);
    /* beacons: floating diamonds in each place's colour */
    if (S.beacons) { S.scene.remove(S.beacons); S.beacons.dispose(); }
    var bg = new T.OctahedronGeometry(1, 0); bg.scale(1, 1.6, 1);
    var bm = new T.MeshBasicMaterial({ color: "#ffffff" });
    S.beacons = new T.InstancedMesh(bg, bm, S.places.length); S.beacons.frustumCulled = false;
    var c = new T.Color();
    S.places.forEach(function (p, i) { S.beacons.setColorAt(i, c.set(S.opts.color(p))); });
    S.beacons.instanceColor.needsUpdate = true; S.scene.add(S.beacons);
    /* fountain jets */
    if (S.jetMesh) { S.scene.remove(S.jetMesh); S.jetMesh.dispose(); }
    var jg = new T.ConeGeometry(.5, 1, 7); jg.translate(0, .5, 0);
    S.jetMesh = new T.InstancedMesh(jg, new T.MeshBasicMaterial({ color: "#d8f6ff", transparent: true, opacity: .85 }), Math.max(1, S.jets.length * 3));
    S.jetMesh.count = S.jets.length * 3; S.jetMesh.frustumCulled = false; S.scene.add(S.jetMesh);
    buildAssets();
    pose(0);
  }

  var _m = null, _q = null, _v = null, _s = null, _e = null;
  function pose(t) {
    var T = THREE; _m = _m || new T.Matrix4(); _q = _q || new T.Quaternion(); _v = _v || new T.Vector3(); _s = _s || new T.Vector3(); _e = _e || new T.Euler();
    S.places.forEach(function (p, i) {
      var l = local(p.ll), on = i === S.sel, big = on ? 5.5 : 3, h = (p.cat === "pool" ? 30 : radius(p) > 50 ? 34 : 26) + (on ? 6 : 0);
      _v.set(l[0], h + Math.sin(t * 2 + i) * (on ? 2 : .8), l[1]); _q.setFromEuler(_e.set(0, on ? t * 2.2 : i, 0)); _s.set(big, big, big);
      S.beacons.setMatrixAt(i, _m.compose(_v, _q, _s));
    });
    S.beacons.instanceMatrix.needsUpdate = true;
    S.jets.forEach(function (j, k) {
      var on = j.i === S.sel || S.animAll, amp = on ? 1 : .55;
      for (var n = 0; n < 3; n++) {
        var a = n / 3 * Math.PI * 2 + t * .3, d = n === 0 ? 0 : 0, hgt = (n === 0 ? 9 : 5) * amp * (.85 + .15 * Math.sin(t * 6 + n * 2 + k));
        _v.set(j.x + (n ? Math.cos(a) * 4 : 0), j.y, j.z + (n ? Math.sin(a) * 4 : 0)); _q.identity(); _s.set(n ? 1.4 : 2, hgt, n ? 1.4 : 2);
        S.jetMesh.setMatrixAt(k * 3 + n, _m.compose(_v, _q, _s));
      }
    });
    if (S.jetMesh) S.jetMesh.instanceMatrix.needsUpdate = true;
    if (S.ring) {
      if (S.sel >= 0 && S.places[S.sel]) { var l2 = local(S.places[S.sel].ll), rr = radius(S.places[S.sel]) + 14 + Math.sin(t * 3) * 2;
        S.ring.visible = true; S.ring.position.set(l2[0], 2.2, l2[1]); S.ring.scale.set(rr, 1, rr); S.ring.rotation.y = t * .6; }
      else S.ring.visible = false;
    }
  }

  var LIGHTS = {
    day:   { hemi: ["#fff8ec", "#8aa6bc", 2.7], sun: ["#fff0d4", 3.0], amb: .75 },
    dawn:  { hemi: ["#ffe1cc", "#5a6a8c", 1.6], sun: ["#ffb98a", 2.0], amb: .4 },
    dusk:  { hemi: ["#ffcfa8", "#4a5576", 1.45], sun: ["#ff9a5c", 1.8], amb: .38 },
    night: { hemi: ["#9fb4e0", "#1c2640", .85], sun: ["#b7c8ff", .5], amb: .3 }
  };
  function applyLight() {
    if (!S.hemi) return; var L = LIGHTS[S.light] || LIGHTS.day;
    S.hemi.color.set(L.hemi[0]); S.hemi.groundColor.set(L.hemi[1]); S.hemi.intensity = L.hemi[2];
    S.sun.color.set(L.sun[0]); S.sun.intensity = L.sun[1]; S.amb.intensity = L.amb;
  }

  function layer(places, opts) {
    S.places = places; S.opts = opts || {}; S.opts.color = S.opts.color || function () { return "#ffffff"; };
    return {
      id: "pu-3d", type: "custom", renderingMode: "3d", slot: S.opts.slot,
      onAdd: function (map, gl) {
        try {
          var T = THREE; S.map = map; S.t0 = performance.now();
          S.origin = mapboxgl.MercatorCoordinate.fromLngLat(ORIGIN, 0); S.s = S.origin.meterInMercatorCoordinateUnits();
          S.cam = new T.Camera(); S.scene = new T.Scene();
          S.hemi = new T.HemisphereLight("#fff4dd", "#4f6f86", 1.3); S.scene.add(S.hemi);
          S.sun = new T.DirectionalLight("#fff0d4", 2.8); S.sun.position.set(-70, 140, 60); S.scene.add(S.sun);
          S.amb = new T.AmbientLight("#9fb8d0", .3); S.scene.add(S.amb);
          var rg = new T.RingGeometry(.86, 1, 64); rg.rotateX(-Math.PI / 2);
          S.ring = new T.Mesh(rg, new T.MeshBasicMaterial({ color: "#ffe066", transparent: true, opacity: .95, side: T.DoubleSide, depthWrite: false })); S.scene.add(S.ring);
          S.rend = new T.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
          S.rend.autoClear = false; S.rend.toneMapping = T.ACESFilmicToneMapping; S.rend.toneMappingExposure = 1.25;
          applyLight(); build(); S.ok = true;
        } catch (e) { S.ok = false; if (S.opts.onError) S.opts.onError(e); }
      },
      render: function (gl, matrix) {
        if (!S.ok) return;
        var T = THREE, t = (performance.now() - S.t0) / 1000;
        var m = new T.Matrix4().fromArray(matrix);
        var l = new T.Matrix4().makeTranslation(S.origin.x, S.origin.y, S.origin.z)
          .scale(new T.Vector3(S.s, -S.s, S.s))
          .multiply(new T.Matrix4().makeRotationX(Math.PI / 2));
        S.cam.projectionMatrix = m.multiply(l);
        pose(t);
        S.rend.resetState(); S.rend.render(S.scene, S.cam);
        if (S.sel >= 0 || S.animAll) S.map.triggerRepaint();   /* animate only while something is picked or touring */
      },
      onRemove: function () { S.ok = false; S.scene = null; }
    };
  }

  window.PU3D = {
    layer: layer, radius: radius, origin: ORIGIN,
    setSel: function (i) { S.sel = i; if (S.map) S.map.triggerRepaint(); },
    setAnimate: function (on) { S.animAll = !!on; if (S.map) S.map.triggerRepaint(); },
    setLight: function (p) { S.light = p; applyLight(); if (S.map) S.map.triggerRepaint(); },
    rebuild: function () { if (S.ok) { build(); S.map.triggerRepaint(); } },
    setAssets: function (list) { S.assets = list || []; if (S.ok) { buildAssets(); S.map.triggerRepaint(); } },
    ok: function () { return S.ok; },
    _state: S
  };
})();

/* ---------- the rest of the world: voxel trees in every real park, lawn and wood, and along streets ----------
 * Reads Mapbox's own map data (landuse, roads, buildings) for the area on screen. */
(function () {
  "use strict";
  var W = { map: null, scene: null, meshes: [], last: null, timer: 0, max: 7000, on: true };
  function hash(a, b) { var h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; }
  function inRing(x, z, ring) { var c = false; for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) { var a = ring[i], b = ring[j];
      if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function inPoly(x, z, poly) { if (!inRing(x, z, poly[0])) return false; for (var k = 1; k < poly.length; k++) if (inRing(x, z, poly[k])) return false; return true; }
  function polys(f) { var g = f.geometry; if (!g) return []; return g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []; }
  function lines(f) { var g = f.geometry; if (!g) return []; return g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : []; }

  function scan() {
    var map = W.map, S = window.PU3D && PU3D._state; if (!map || !S || !S.ok || !W.on) return;
    if (map.getZoom() < 14.2) { place([]); W.last = null; return; }
    var b = map.getBounds(), c = map.getCenter(), z = map.getZoom();
    if (W.last && Math.abs(W.last.z - z) < .6 && Math.abs(W.last.lng - c.lng) < .004 && Math.abs(W.last.lat - c.lat) < .003) return;
    W.last = { z: z, lng: c.lng, lat: c.lat };
    var L = function (ll) { var mc = mapboxgl.MercatorCoordinate.fromLngLat(ll, 0); return [(mc.x - S.origin.x) / S.s, (mc.y - S.origin.y) / S.s]; };
    var lo = L([b.getWest(), b.getNorth()]), hi = L([b.getEast(), b.getSouth()]);
    var pad = 150, x0 = lo[0] - pad, x1 = hi[0] + pad, z0 = lo[1] - pad, z1 = hi[1] + pad;
    var q = function (layer, filter) { try { return map.querySourceFeatures("composite", { sourceLayer: layer, filter: filter }); } catch (e) { return []; } };
    /* buildings: a coarse grid so trees never grow inside one */
    var bgrid = {}, CELL = 40;
    q("building").forEach(function (f) { polys(f).forEach(function (pl) {
      var ring = pl[0].map(L), mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
      ring.forEach(function (p) { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mnz = Math.min(mnz, p[1]); mxz = Math.max(mxz, p[1]); });
      if (mxx < x0 || mnx > x1 || mxz < z0 || mnz > z1) return;
      for (var gx = Math.floor(mnx / CELL); gx <= Math.floor(mxx / CELL); gx++) for (var gz = Math.floor(mnz / CELL); gz <= Math.floor(mxz / CELL); gz++) (bgrid[gx + "," + gz] = bgrid[gx + "," + gz] || []).push([ring, mnx - 2, mxx + 2, mnz - 2, mxz + 2]);
    }); });
    function blocked(x, z) { var l = bgrid[Math.floor(x / CELL) + "," + Math.floor(z / CELL)]; if (!l) return false;
      for (var i = 0; i < l.length; i++) { var e = l[i]; if (x > e[1] && x < e[2] && z > e[3] && z < e[4] && inRing(x, z, e[0])) return true; } return false; }
    /* places with our own models stay clear */
    var keep = S.places.map(function (p) { var l = L(p.ll); return [l[0], l[1], PU3D.radius(p) * .7]; });
    function nearModel(x, z) { for (var i = 0; i < keep.length; i++) { var k = keep[i]; if (Math.abs(x - k[0]) < k[2] && Math.abs(z - k[1]) < k[2]) return true; } return false; }
    var seen = {}, out = [];
    function add(x, z, gs) { if (out.length >= W.max || x < x0 || x > x1 || z < z0 || z > z1) return; var key = Math.round(x / gs) + "," + Math.round(z / gs);
      if (seen[key] || blocked(x, z) || nearModel(x, z)) return; seen[key] = 1; out.push([x, z, hash(x * 7, z * 13)]); }
    /* green areas */
    var DENS = { wood: .85, park: .38, grass: .2, scrub: .45, cemetery: .3, golf_course: .12 };
    q("landuse").forEach(function (f) { var d = DENS[f.properties && f.properties.class]; if (!d) return;
      polys(f).forEach(function (pl) { var poly = pl.map(function (r) { return r.map(L); }), ring = poly[0], mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
        ring.forEach(function (p) { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mnz = Math.min(mnz, p[1]); mxz = Math.max(mxz, p[1]); });
        mnx = Math.max(mnx, x0); mxx = Math.min(mxx, x1); mnz = Math.max(mnz, z0); mxz = Math.min(mxz, z1);
        var st = 13;
        for (var gx = Math.ceil(mnx / st) * st; gx < mxx; gx += st) for (var gz = Math.ceil(mnz / st) * st; gz < mxz; gz += st) {
          if (hash(gx, gz) > d) continue; var jx = gx + (hash(gz, gx) - .5) * 8, jz = gz + (hash(gx + 3, gz - 5) - .5) * 8;
          if (inPoly(jx, jz, poly)) add(jx, jz, 9); }
      }); });
    /* street trees */
    var ST = { street: 1, street_limited: 1, tertiary: 1, secondary: 1, primary: .6 };
    q("road").forEach(function (f) { var k = f.properties && ST[f.properties.class]; if (!k) return;
      lines(f).forEach(function (ln) { var pts = ln.map(L);
        for (var i = 1; i < pts.length; i++) { var a = pts[i - 1], b2 = pts[i], dx = b2[0] - a[0], dz = b2[1] - a[1], len = Math.hypot(dx, dz); if (len < 1) continue;
          var nx = -dz / len, nz = dx / len, off = f.properties.class === "street" || f.properties.class === "street_limited" ? 9 : 14;
          for (var t = 8; t < len; t += 17) { var px = a[0] + dx * t / len, pz = a[1] + dz * t / len;
            if (hash(px, pz) < .62 * k) add(px + nx * off, pz + nz * off, 7);
            if (hash(pz, px) < .62 * k) add(px - nx * off, pz - nz * off, 7); } } }); });
    place(out);
  }

  function place(list) {
    var S = PU3D._state, T = THREE; if (!S.scene) return;
    W.meshes.forEach(function (m) { S.scene.remove(m); m.dispose(); }); W.meshes = [];
    if (!list.length) { W.map && W.map.triggerRepaint(); return; }
    var gt = new T.CylinderGeometry(.35, .5, 1, 6); gt.translate(0, .5, 0);
    var gc = new T.IcosahedronGeometry(.5, 0); gc.translate(0, .5, 0);
    var gp = new T.ConeGeometry(.5, 1, 7); gp.translate(0, .5, 0);
    var mat = new T.MeshStandardMaterial({ color: "#ffffff", roughness: .8, flatShading: true });
    var pines = list.filter(function (t) { return t[2] < .28; }), round = list.filter(function (t) { return t[2] >= .28; });
    var trunk = new T.InstancedMesh(gt, mat, list.length), leaf = new T.InstancedMesh(gc, mat, Math.max(1, round.length)), cone = new T.InstancedMesh(gp, mat, Math.max(1, pines.length));
    leaf.count = round.length; cone.count = pines.length;
    var m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), s = new T.Vector3(), c = new T.Color();
    var LEAF = ["#58b84f", "#6cc45a", "#7ccf5c", "#4fae4a", "#8bc34a"], PINE = ["#3d9a55", "#4aab5c", "#2f8a4a"];
    list.forEach(function (t, i) { var r = t[2], tall = 9 + r * 8;
      trunk.setMatrixAt(i, m4.compose(v.set(t[0], 0, t[1]), q.identity(), s.set(1.1, tall * .45, 1.1))); trunk.setColorAt(i, c.set("#8a6440")); });
    round.forEach(function (t, i) { var r = t[2], tall = 9 + r * 8, w = 6 + ((r * 977) % 1) * 4;
      leaf.setMatrixAt(i, m4.compose(v.set(t[0], tall * .32, t[1]), q.setFromEuler(e.set(0, r * 20, 0)), s.set(w, w * .9, w))); leaf.setColorAt(i, c.set(LEAF[Math.floor(r * 97) % LEAF.length])); });
    pines.forEach(function (t, i) { var r = t[2], tall = 11 + r * 12, w = 5 + r * 8;
      cone.setMatrixAt(i, m4.compose(v.set(t[0], tall * .2, t[1]), q.identity(), s.set(w, tall, w))); cone.setColorAt(i, c.set(PINE[Math.floor(r * 31) % PINE.length])); });
    [trunk, leaf, cone].forEach(function (m) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; m.frustumCulled = false; S.scene.add(m); W.meshes.push(m); });
    W.map && W.map.triggerRepaint();
  }

  window.PU3D_WORLD = {
    attach: function (map) { W.last = null; if (W.map === map) { clearTimeout(W.timer); W.timer = setTimeout(scan, 600); return; } W.map = map;
      var go = function () { clearTimeout(W.timer); W.timer = setTimeout(scan, 350); };
      map.on("idle", go); map.on("moveend", go); go(); },
    reset: function () { W.last = null; W.meshes = []; },
    setOn: function (on) { W.on = on; if (!on) place([]); W.last = null; if (on) scan(); },
    count: function () { return W.meshes.length ? W.meshes[0].count : 0; },
    meshes: function () { return W.meshes; },
    meshes: function () { return W.meshes; },
    _scan: scan, _place: place
  };
})();
