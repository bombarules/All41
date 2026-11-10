/* Park Universe: Work
 * What's due, repair tasks, snow storms, irrigation checklists, QR tags, the monthly summary,
 * links from pools and parks to their other apps, and the "update ready" banner.
 *
 * Everything here is saved as ordinary items (types task / run / tick in the "work" layer), so it
 * syncs to the team, backs up and restores exactly like assets do. Nothing new is needed on the server.
 *
 * Needs: window.PU (index.html), window.PUAssets (assets.js); uses window.PUSync (sync.js) when signed in.
 */
(function () {
  "use strict";
  var A = window.PUAssets, PU = window.PU;
  if (!A || !PU) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var LS = { get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  var REPO = "bombarules/ParkUniverse";
  var DAY = 86400000;

  /* ---------------- small helpers ---------------- */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { d = d ? new Date(d) : new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseYmd(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function addDays(s, n) { var d = parseYmd(s); if (!d) return ""; d.setDate(d.getDate() + n); return ymd(d); }
  function addYears(s, n) { var d = parseYmd(s); if (!d) return ""; d.setFullYear(d.getFullYear() + n); return ymd(d); }
  function daysUntil(s) { var d = parseYmd(s), t = parseYmd(ymd()); return d ? Math.round((d - t) / DAY) : null; }
  function niceDay(s) { var d = parseYmd(s); return d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }) : ""; }
  function niceTime(t) { return new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
  function niceStamp(t) { var d = new Date(t); return (ymd(d) === ymd() ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " ") + niceTime(t); }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function plural(n, w, ws) { return n + " " + (n === 1 ? w : ws || w + "s"); }
  function nameOf(a) { return a.label || A.tOf(a).name; }
  function ro() { return !!(A.readOnly && A.readOnly()); }
  function things() { return A.all().filter(function (a) { return !A.isRec(a) && a.type !== "property" && a.type !== "parkfix"; }); }
  function recs(type) { return A.all().filter(function (a) { return a.type === type; }); }
  function who() { return (window.PUSync && PUSync.who && PUSync.who()) || LS.get("pu-me", ""); }
  /* a name for the log: the signed-in person, or asked once on phones that aren't signed in */
  function needWho() { var w = who(); if (w) return w; w = (window.prompt("Your name, for the log") || "").trim().slice(0, 40); if (w) LS.set("pu-me", w); return w; }
  function roster() { var r = A.byId("roster"), n = (r && r.props && r.props.names) || [], seen = {}; recs("task").forEach(function (t) { var p = t.props || {}; [p.assignee, p.by, p.doneBy].forEach(function (x) { if (x) seen[x] = 1; }); });
    n.forEach(function (x) { seen[x] = 1; }); var w = who(); if (w) seen[w] = 1; return Object.keys(seen).sort(); }
  function parkNames() { return PU.PL.map(function (p) { return p.n; }); }
  function parkIndex(n) { return parkNames().indexOf(n); }
  function nearSort(list, key) { var m = A.me && A.me(); if (!m) return list; var d = {}; PU.PL.forEach(function (p) { d[p.n] = A.meters([m.lng, m.lat], p.ll); });
    return list.slice().sort(function (x, y) { return (d[key(x)] == null ? 1e12 : d[key(x)]) - (d[key(y)] == null ? 1e12 : d[key(y)]); }); }

  /* ---------------- the Work sheet (one sheet, a stack of screens) ---------------- */
  var css = '\
.op-tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px}\
.op-tile{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;padding:12px 12px 11px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.05);min-height:78px}\
.op-tile i{font-style:normal;font-size:22px;line-height:1.1}.op-tile b{font-size:15px}.op-tile small{color:var(--mut);font-size:12.5px;line-height:1.25}\
.op-tile em{position:absolute;right:10px;top:10px;font-style:normal;font-weight:800;font-size:13px;min-width:24px;height:24px;line-height:24px;padding:0 7px;border-radius:12px;text-align:center;background:#22d3ee;color:#03221a}\
.op-tile em.hot{background:#ef4444;color:#fff}.op-tile em.z{display:none}\
.op-tile.on{border-color:#7cc8ff;background:rgba(124,200,255,.12)}\
.op-row{display:flex;gap:10px;align-items:center;width:100%;text-align:left;padding:10px 2px;border:0;border-bottom:1px solid var(--line);background:none}\
.op-row>span{flex:1;min-width:0}.op-row b{display:block;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.op-row small{display:block;color:var(--mut);font-size:12.5px}\
.op-row img{width:32px;height:32px;flex:none}.op-row .when{flex:none;font-size:12.5px;font-weight:800;padding:3px 9px;border-radius:99px;background:rgba(255,255,255,.08);white-space:nowrap}\
.op-row .when.late{background:#ef4444;color:#fff}.op-row .when.soon{background:#eab308;color:#221a00}.op-row .when.ok{background:rgba(52,211,153,.22);color:#7ff0c2}\
.op-row .go{flex:none;border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.06);padding:7px 10px;font-weight:800;font-size:12.5px}\
.op-tick{flex:none;width:44px;height:44px;border-radius:13px;border:2px solid var(--line);background:rgba(255,255,255,.04);font-size:22px;line-height:1;display:grid;place-items:center;color:transparent}\
.op-tick[aria-pressed=true]{background:linear-gradient(135deg,#34d399,#22d3ee);border-color:transparent;color:#03221a}\
.op-bar{height:8px;border-radius:8px;background:rgba(255,255,255,.1);overflow:hidden;margin:8px 0 2px}.op-bar i{display:block;height:100%;background:linear-gradient(90deg,#34d399,#22d3ee);width:0;transition:width .3s}\
.op-note{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:8px 0;background:rgba(255,255,255,.04);font-size:13.5px}\
.op-note.warn{border-color:rgba(234,179,8,.5);background:rgba(234,179,8,.08)}\
.op-box{border:1px solid var(--line);border-radius:14px;padding:4px 10px 8px;margin:10px 0;background:rgba(255,255,255,.03)}\
.op-box h4{margin:8px 0 2px;font-size:12px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--mut)}\
.op-mini{display:flex;gap:8px;align-items:center;width:100%;text-align:left;padding:8px 0;border:0;border-top:1px solid var(--line);background:none;font-size:13.5px}\
.op-mini:first-of-type{border-top:0}.op-mini span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.op-mini small{color:var(--mut);flex:none}\
.dock button{position:relative}.dock .bdg{position:absolute;top:1px;left:calc(50% + 6px);min-width:17px;height:17px;line-height:17px;padding:0 5px;border-radius:9px;background:#22d3ee;color:#03221a;font-size:10.5px;font-weight:800;font-style:normal}\
.dock .bdg.hot{background:#ef4444;color:#fff}.dock .bdg.z{display:none}\
.op-upd{position:fixed;left:10px;right:10px;top:calc(60px + env(safe-area-inset-top,0px));z-index:6;max-width:520px;margin:0 auto;border-radius:14px;padding:9px 10px 9px 14px;display:flex;align-items:center;gap:8px;font-size:13.5px;background:#0e7490;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.45)}\
.op-upd span{flex:1}.op-upd button{border:0;border-radius:10px;padding:7px 12px;font-weight:800;background:#fff;color:#0b2238}.op-upd .x2{background:rgba(255,255,255,.18);color:#fff}\
.touring .op-upd,.placing .op-upd,.layering .op-upd{display:none}\
.cardops{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.cardops button{flex:1 1 auto;padding:7px 8px;border-radius:11px;border:1px solid var(--line);background:rgba(255,255,255,.06);font-weight:700;font-size:12px;white-space:nowrap}\
.cardops button.hot{border-color:#ef4444;color:#ffb4ab}.cardops button.pool{border-color:rgba(34,211,238,.55);color:#a5f3fc}.cardops button.storm{border-color:#7cc8ff;color:#cfe9ff}\
.op-scan{display:block;width:100%;max-height:38vh;object-fit:contain;border-radius:12px;margin:8px 0;background:#000}\
#puPrint{position:fixed;inset:0;z-index:40;background:#e9edf2;color:#111827;overflow:auto;color-scheme:light;font:14px/1.45 system-ui,"Segoe UI",Roboto,sans-serif}\
#puPrint .pbar{position:sticky;top:0;z-index:2;display:flex;gap:8px;align-items:center;padding:calc(10px + env(safe-area-inset-top,0px)) 12px 10px;background:#0b2238;color:#fff}\
#puPrint .pbar b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\
#puPrint .pbar button,#puPrint .pbar select{border:0;border-radius:10px;padding:8px 12px;font-weight:800;background:rgba(255,255,255,.16);color:#fff;font-size:13.5px}\
#puPrint .pbar select option{color:#111}#puPrint .pbar .go{background:linear-gradient(135deg,#34d399,#22d3ee);color:#03221a}\
#puPrint .paper{background:#fff;max-width:8.5in;margin:14px auto;padding:.55in .6in;box-shadow:0 2px 14px rgba(0,0,0,.18)}\
#puPrint h1{font-size:24px;margin:0 0 2px;letter-spacing:-.01em}#puPrint h2{font-size:15px;margin:22px 0 8px;padding-bottom:4px;border-bottom:2px solid #0b2238}\
#puPrint .sub{color:#4b5563;margin:0 0 14px}#puPrint table{width:100%;border-collapse:collapse;font-size:12.5px}\
#puPrint th{text-align:left;font-size:11px;color:#4b5563;border-bottom:1px solid #9ca3af;padding:4px 6px 4px 0}#puPrint td{border-bottom:1px solid #e5e7eb;padding:5px 6px 5px 0;vertical-align:top}\
#puPrint .facts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}#puPrint .fact{border:1px solid #d1d5db;border-radius:8px;padding:8px 10px}\
#puPrint .fact b{display:block;font-size:22px;line-height:1.1}#puPrint .fact span{font-size:11.5px;color:#4b5563}\
#puPrint .pair{display:flex;gap:6px;margin-top:4px}#puPrint .pair figure{margin:0;width:1.35in}#puPrint .pair img{width:100%;height:1in;object-fit:cover;border-radius:4px;display:block}\
#puPrint .pair figcaption{font-size:10px;color:#4b5563}#puPrint .none{color:#6b7280;font-style:italic}\
#puPrint .tagpage{background:#fff;width:8.5in;height:11in;box-sizing:border-box;margin:14px auto;box-shadow:0 2px 14px rgba(0,0,0,.18);display:grid;overflow:hidden;page-break-after:always;break-after:page}\
#puPrint .tagpage.t10{padding:.5in .156in;grid-template-columns:4in 4in;column-gap:.188in;grid-auto-rows:2in}\
#puPrint .tagpage.t30{padding:.5in .188in;grid-template-columns:2.625in 2.625in 2.625in;column-gap:.125in;grid-auto-rows:1in}\
#puPrint .tag{display:flex;align-items:center;gap:.12in;padding:.1in .14in;overflow:hidden;box-sizing:border-box;outline:1px dashed #d1d5db;outline-offset:-1px}\
#puPrint .tag img{image-rendering:pixelated;flex:none}#puPrint .t10 .tag img{width:1.6in;height:1.6in}#puPrint .t30 .tag img{width:.8in;height:.8in}\
#puPrint .tag div{min-width:0}#puPrint .tag b{display:block;font-size:15pt;line-height:1.1;overflow-wrap:anywhere}#puPrint .t30 .tag b{font-size:8.5pt}\
#puPrint .tag span{display:block;font-size:9.5pt;color:#374151;margin-top:3pt}#puPrint .t30 .tag span{font-size:6.5pt;margin-top:1pt}\
#puPrint .tag small{display:block;font-size:7pt;color:#6b7280;margin-top:4pt;font-family:ui-monospace,Menlo,monospace}#puPrint .t30 .tag small{font-size:5pt;margin-top:1pt}\
@media screen and (max-width:860px){#puPrint .tagpage{zoom:var(--tz,.45)}#puPrint .paper{padding:18px 16px;margin:10px}#puPrint .facts{grid-template-columns:repeat(2,1fr)}}\
@media print{html,body{height:auto!important;overflow:visible!important;background:#fff!important}body>*:not(#puPrint){display:none!important}\
#puPrint{position:static!important;overflow:visible!important;background:#fff!important}#puPrint .noprint{display:none!important}\
#puPrint .paper{box-shadow:none;margin:0;max-width:none;padding:0}#puPrint .tagpage{box-shadow:none;margin:0;zoom:1!important}#puPrint .tag{outline:0}\
#puPrint tr,#puPrint .fact,#puPrint .pair{break-inside:avoid}}';
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  var shell = document.createElement("div");
  shell.innerHTML = '<div class="as-sheet glass" id="opSheet" hidden role="dialog" aria-label="Work"><div class="hd2"><button class="x" style="position:static" id="opBack" aria-label="Back" hidden>&larr;</button><h3 id="opT">Work</h3><button class="flyl" id="opAct" hidden></button><button class="x" style="position:static" id="opX" aria-label="Close">&#10005;</button></div><div class="as-body" id="opBody"></div></div>';
  document.body.appendChild(shell);
  var stack = [];
  function sheetOpen() { return !$("opSheet").hidden; }
  function hide() { $("opSheet").hidden = true; stack = []; }
  function close() { var was = sheetOpen(); hide(); if (was && $("asScrim") && $("asList").hidden && $("asSheet").hidden) $("asScrim").hidden = true; }
  function draw() { if (!stack.length) return close(); $("opSheet").hidden = false; $("asScrim").hidden = false; $("opBack").hidden = stack.length < 2; $("opAct").hidden = true; $("opAct").onclick = null;
    var y = $("opBody").scrollTop, top = stack[stack.length - 1]; top.fn(); $("opBody").scrollTop = top.keep ? y : 0; top.keep = true; }
  function push(fn) { stack.push({ fn: fn }); draw(); }
  function start(fn) { if (PU.closeAll) PU.closeAll(); stack = []; push(fn); }
  function redraw() { if (sheetOpen() && stack.length) draw(); }
  function title(t) { $("opT").textContent = t; }
  function action(label, fn) { var b = $("opAct"); b.hidden = false; b.textContent = label; b.onclick = fn; }
  $("opX").onclick = close; $("opBack").onclick = function () { stack.pop(); draw(); };
  A.onClose(hide);
  /* open an item's card and come back here with its back arrow */
  function openThing(id) { var keep = stack.slice(); A.openAsset(id, true); if (A.backTo) A.backTo(function () { if (PU.closeAll) PU.closeAll(); stack = keep; stack.forEach(function (s) { s.keep = false; }); draw(); }); }

  /* ======================================================================
   * 1. WHAT'S DUE
   * ====================================================================== */
  function dueList() {
    var out = [];
    things().forEach(function (a) { var p = a.props || {};
      if (a.type === "backflow") { var d = p.nexttest || (p.lasttest ? addYears(p.lasttest, 1) : "");
        if (d) out.push({ id: a.id, when: d, what: "Backflow test", sub: nameOf(a) + (p.nexttest ? "" : " \u00b7 a year after the last test"), park: a.park, a: a, kind: "backflow" }); }
      else if (a.type === "tree" && p.replace) out.push({ id: a.id, when: p.replace, what: "Replace tree", sub: (p.species ? p.species + " \u00b7 " : "") + nameOf(a), park: a.park, a: a, kind: "tree" });
      else if (a.type === "stump" && p.replace) out.push({ id: a.id, when: p.replace, what: "Replace removed tree", sub: (p.species ? p.species + " \u00b7 " : "") + nameOf(a), park: a.park, a: a, kind: "tree" });
      else if (a.type === "site" && p.replace) out.push({ id: a.id, when: p.replace, what: "Plant by", sub: (p.species ? p.species + " \u00b7 " : "") + nameOf(a), park: a.park, a: a, kind: "tree" });
    });
    openTasks().forEach(function (t) { var p = t.props || {}; if (p.due) out.push({ id: t.id, when: p.due, what: t.label || "Task", sub: (p.assignee ? p.assignee + " \u00b7 " : "") + "task", park: t.park, a: t, kind: "task" }); });
    out.forEach(function (x) { x.days = daysUntil(x.when); });
    return out.filter(function (x) { return x.days != null; }).sort(function (x, y) { return x.days - y.days; });
  }
  function dueCounts(list) { list = list || dueList(); var c = { late: 0, week: 0, month: 0 }; list.forEach(function (x) { if (x.days < 0) c.late++; else if (x.days <= 7) c.week++; else if (x.days <= 30) c.month++; }); c.all = c.late + c.week + c.month; return c; }
  function whenPill(days) { var cls = days < 0 ? "late" : days <= 7 ? "soon" : "ok", t = days < 0 ? (-days) + " d late" : days === 0 ? "today" : days === 1 ? "tomorrow" : "in " + days + " d"; return '<span class="when ' + cls + '">' + t + "</span>"; }
  var dueShowLater = false;
  function screenDue(park) { return function () {
    var all = dueList().filter(function (x) { return !park || x.park === park; }), c = dueCounts(all);
    title((park ? park + " \u00b7 " : "") + "What\u2019s due"); action("\u2b07 CSV", function () { exportDue(all); });
    var b = $("opBody"); b.innerHTML = "";
    if (!all.length) { b.innerHTML = '<div class="empty">Nothing with a date yet.<br><br>Dates come from a backflow\u2019s <b>Next test due</b>, a tree\u2019s <b>Replacement date</b>, a planting site\u2019s <b>Plant by</b> and a task\u2019s <b>Due</b> date.</div>'; return; }
    var groups = [["Overdue", function (x) { return x.days < 0; }], ["Next 7 days", function (x) { return x.days >= 0 && x.days <= 7; }], ["Next 30 days", function (x) { return x.days > 7 && x.days <= 30; }], ["Later", function (x) { return x.days > 30; }]];
    groups.forEach(function (g, gi) { var rows = all.filter(g[1]); if (!rows.length) return;
      var h = document.createElement("div"); h.className = "as-sec"; h.textContent = g[0] + " \u00b7 " + rows.length; b.appendChild(h);
      if (gi === 3 && !dueShowLater) { var more = document.createElement("button"); more.className = "sy-link"; more.textContent = "Show " + rows.length + " later"; more.onclick = function () { dueShowLater = true; redraw(); }; b.appendChild(more); return; }
      rows.forEach(function (x) { var r = document.createElement("div"); r.className = "op-row"; r.setAttribute("role", "button"); r.tabIndex = 0;
        r.innerHTML = '<img alt="" src="' + A.iconURL(x.a.type) + '"><span><b></b><small></small></span>' + (x.kind === "backflow" && !ro() ? '<button class="go">Tested today</button>' : "") + whenPill(x.days);
        r.querySelector("b").textContent = x.what; r.querySelector("small").textContent = (park ? "" : (x.park || "No park") + " \u00b7 ") + x.sub + " \u00b7 " + niceDay(x.when);
        r.onclick = function () { if (x.kind === "task") push(screenTask(x.id)); else openThing(x.id); };
        var go = r.querySelector(".go"); if (go) go.onclick = function (e) { e.stopPropagation(); testedToday(x.a); };
        b.appendChild(r); }); });
    var n = document.createElement("p"); n.className = "src"; n.textContent = c.late + " overdue \u00b7 " + c.week + " this week \u00b7 " + c.month + " more this month"; b.appendChild(n);
  }; }
  function testedToday(a) { if (!confirm("Mark " + nameOf(a) + " at " + a.park + " as tested today? The next test will be due in one year.")) return;
    a.props = a.props || {}; a.props.lasttest = ymd(); a.props.nexttest = addYears(ymd(), 1); a.props.testedBy = who() || a.props.testedBy || "";
    A.save(a).then(function () { PU.toast("Test logged. Next due " + niceDay(a.props.nexttest) + "."); refreshAll(); }); }
  function exportDue(list) { var q = A.toCSVq, lines = [["Due", "Days from today", "What", "Item", "Park", "ID"].join(",")];
    list.forEach(function (x) { lines.push([x.when, x.days, x.what, x.sub, x.park, x.id].map(q).join(",")); }); A.saveFile("whats-due-" + ymd() + ".csv", lines.join("\n"), "text/csv"); }
  /* one phone notification a day when something is overdue or due this week */
  function dueNotify() { var c = dueCounts(); if (!(c.late + c.week)) return; if (LS.get("pu-due-noted", "") === ymd()) return;
    if (!(window.BombaNative && BombaNative.notifyDue)) return; LS.set("pu-due-noted", ymd());
    var bits = []; if (c.late) bits.push(c.late + " overdue"); if (c.week) bits.push(c.week + " due this week");
    var first = dueList().filter(function (x) { return x.days <= 7; }).slice(0, 3).map(function (x) { return x.what + " at " + (x.park || "a park"); }).join("; ");
    try { BombaNative.notifyDue("Park Universe: " + bits.join(", "), first); } catch (e) {} }

  /* ======================================================================
   * 2. REPAIR TASKS
   * ====================================================================== */
  var PRI = ["Normal", "High", "Safety"];
  function tasks() { return recs("task"); }
  function isOpen(t) { return t.cond !== "Done"; }
  function openTasks() { return tasks().filter(isOpen); }
  function tasksFor(id) { return tasks().filter(function (t) { return (t.props || {}).asset === id; }); }
  function newTask(o) { if (ro()) { PU.toast("View only \u2014 ask an admin for editor access."); return Promise.reject(new Error("view only")); }
    var t = { id: "t" + A.uid(), type: "task", created: Date.now(), photoCount: 0, park: o.park || "", label: String(o.title || "Task").slice(0, 80), notes: o.notes || "", cond: "Open",
      props: { asset: o.asset || "", assignee: o.assignee || "", due: o.due || "", pri: o.pri || "Normal", by: who(), src: o.src || "manual" } };
    return A.save(t).then(function () { refreshAll(); return t; }); }
  /* marking an item "Needs repair" (or worse) opens its repair task by itself */
  A.onCond(function (a, was, now) {
    if (ro() || A.isRec(a)) return; var layer = A.layerOf(a), list = A.condList(a), bad = list.indexOf(now) >= 2, wasBad = list.indexOf(was) >= 2;
    var wants = layer === "assets" || layer === "irrigation" || layer === "fields" || (layer === "trees" && now === "Dead");
    if (bad && !wasBad && wants && now !== "Off") { if (tasksFor(a.id).some(isOpen)) return;
      var urgent = /out of service|leaking|dead|missing/i.test(now);
      newTask({ park: a.park, asset: a.id, title: (layer === "trees" ? "Remove and replace: " : "Repair: ") + nameOf(a), pri: urgent ? "High" : "Normal", notes: "Marked \u201c" + now + "\u201d" + (who() ? " by " + who() : "") + ".", src: "auto" })
        .then(function () { PU.toast("Repair task opened for " + nameOf(a) + "."); }, function () {}); }
    else if (!bad && wasBad) { var open = tasksFor(a.id).filter(isOpen); if (open.length) PU.toast(plural(open.length, "repair task") + " still open for this item."); } });
  var taskFilter = "open";
  function screenTasks(ctx) { ctx = ctx || {}; return function () {
    var mine = who(), all = tasks().filter(function (t) { return (!ctx.park || t.park === ctx.park) && (!ctx.asset || (t.props || {}).asset === ctx.asset); });
    title((ctx.park ? ctx.park + " \u00b7 " : "") + "Tasks");
    if (!ro()) action("\uff0b Task", function () { push(screenTaskNew({ park: ctx.park || "", asset: ctx.asset || "" })); });
    var b = $("opBody"); b.innerHTML = '<div class="chips" id="opChips" style="margin:0 0 6px"></div><div id="opRows"></div>';
    var sets = [["open", "Open", all.filter(isOpen)], ["mine", "Mine", all.filter(function (t) { return isOpen(t) && mine && (t.props || {}).assignee === mine; })], ["done", "Done", all.filter(function (t) { return !isOpen(t); })]];
    sets.forEach(function (s) { var c = document.createElement("button"); c.textContent = s[1] + " " + s[2].length; c.setAttribute("aria-pressed", taskFilter === s[0]); c.onclick = function () { taskFilter = s[0]; redraw(); }; $("opChips").appendChild(c); });
    var list = sets.filter(function (s) { return s[0] === taskFilter; })[0][2].slice();
    if (taskFilter === "done") list.sort(function (x, y) { return ((y.props || {}).doneAt || 0) - ((x.props || {}).doneAt || 0); });
    else list.sort(function (x, y) { var px = PRI.indexOf((x.props || {}).pri), py = PRI.indexOf((y.props || {}).pri); return (py - px) || String((x.props || {}).due || "9").localeCompare(String((y.props || {}).due || "9")) || (x.created - y.created); });
    if (!list.length) { $("opRows").innerHTML = '<div class="empty">' + (taskFilter === "done" ? "No finished tasks yet." : taskFilter === "mine" ? (mine ? "Nothing assigned to " + esc(mine) + "." : "Sign in (Menu \u22ee \u2192 Team sync) so tasks can be assigned to you.") : "No open tasks. Marking an item \u201cNeeds repair\u201d opens one automatically.") + "</div>"; return; }
    list.forEach(function (t) { $("opRows").appendChild(taskRow(t, !ctx.park)); });
  }; }
  function taskRow(t, showPark) { var p = t.props || {}, r = document.createElement("button"); r.className = "op-row"; var a = p.asset ? A.byId(p.asset) : null, d = p.due ? daysUntil(p.due) : null;
    r.innerHTML = '<img alt="" src="' + A.iconURL(a ? a.type : "task") + '"><span><b></b><small></small></span>' + (isOpen(t) ? (d != null ? whenPill(d) : p.pri !== "Normal" ? '<span class="when late">' + esc(p.pri) + "</span>" : "") : '<span class="when ok">done</span>');
    r.querySelector("b").textContent = (isOpen(t) && p.pri === "Safety" ? "\u26a0 " : "") + (t.label || "Task");
    var bits = []; if (showPark && t.park) bits.push(t.park); if (p.assignee) bits.push(p.assignee); else if (isOpen(t)) bits.push("unassigned");
    if (!isOpen(t) && p.doneAt) bits.push("closed " + niceDay(ymd(p.doneAt)) + (p.doneBy ? " by " + p.doneBy : "")); else bits.push("opened " + niceDay(ymd(t.created)));
    if (t.cond === "In progress") bits.push("in progress"); if (t.photoCount) bits.push(plural(t.photoCount, "photo"));
    r.querySelector("small").textContent = bits.join(" \u00b7 "); r.onclick = function () { push(screenTask(t.id)); }; return r; }
  function screenTaskNew(o) { return function () {
    title("New task"); var a = o.asset ? A.byId(o.asset) : null, b = $("opBody");
    b.innerHTML = (a ? '<div class="op-note">For <b>' + esc(nameOf(a)) + "</b> at " + esc(a.park) + "</div>" : "") +
      '<div class="as-f"><label for="tkTitle">What needs doing</label><input id="tkTitle" maxlength="80" placeholder="e.g. Replace broken bench slat"></div>' +
      (a ? "" : '<div class="as-f"><label for="tkPark">Park</label><select id="tkPark"><option value="">No park</option>' + parkNames().map(function (n) { return "<option" + (n === o.park ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("") + "</select></div>") +
      taskFields({ assignee: "", due: "", pri: "Normal" }) + '<div class="as-f"><label for="tkNotes">Notes</label><textarea id="tkNotes" placeholder="Parts, where exactly, anything the crew should know"></textarea></div>' +
      '<div class="as-act"><button class="p" id="tkSave">Save task</button></div>';
    if (a) $("tkTitle").value = "Repair: " + nameOf(a);
    wirePri(null);
    $("tkSave").onclick = function () { var ti = $("tkTitle").value.trim(); if (!ti) { PU.toast("Say what needs doing."); $("tkTitle").focus(); return; }
      newTask({ title: ti, park: a ? a.park : $("tkPark").value, asset: o.asset, assignee: $("tkWho").value.trim(), due: $("tkDue").value, pri: curPri, notes: $("tkNotes").value }).then(function (t) { stack.pop(); stack.push({ fn: screenTask(t.id) }); draw(); PU.toast("Task saved."); }, function () {}); };
  }; }
  var curPri = "Normal";
  function taskFields(p) { return '<div class="as-2"><div class="as-f"><label for="tkWho">Assigned to</label><input id="tkWho" list="tkNames" value="' + esc(p.assignee || "") + '" placeholder="Name"><datalist id="tkNames">' + roster().map(function (n) { return '<option value="' + esc(n) + '">'; }).join("") + "</datalist></div>" +
    '<div class="as-f"><label for="tkDue">Due</label><input id="tkDue" type="date" value="' + esc(p.due || "") + '"></div></div><div class="as-f"><label>Priority</label><div class="as-seg" id="tkPri"></div></div>'; }
  function wirePri(t) { curPri = t ? (t.props || {}).pri || "Normal" : "Normal"; var box = $("tkPri"); box.innerHTML = "";
    PRI.forEach(function (x, i) { var b = document.createElement("button"); b.textContent = x; b.style.setProperty("--c", ["#22c55e", "#f97316", "#ef4444"][i]); b.setAttribute("aria-pressed", curPri === x);
      b.onclick = function () { if (ro()) return; curPri = x; [].forEach.call(box.children, function (c) { c.setAttribute("aria-pressed", c.textContent === x); }); if (t) { t.props.pri = x; A.save(t).then(refreshBadges); } }; box.appendChild(b); }); }
  var taskUrls = [];
  function screenTask(id) { return function () {
    var t = A.byId(id); if (!t) { stack.pop(); return draw(); } t.props = t.props || {};
    var p = t.props, a = p.asset ? A.byId(p.asset) : null, b = $("opBody"); title(t.label || "Task");
    b.innerHTML = (a ? '<button class="op-row" id="tkAsset"><img alt="" src="' + A.iconURL(a.type) + '"><span><b></b><small></small></span><span class="go">Open</span></button>' : t.park ? '<div class="op-note">' + esc(t.park) + "</div>" : "") +
      '<div class="as-f"><label>Status</label><div class="as-seg" id="tkSt"></div></div>' +
      '<div class="as-f"><label for="tkTitle">What needs doing</label><input id="tkTitle" maxlength="80"></div>' + taskFields(p) +
      '<div class="as-f"><label for="tkNotes">Notes</label><textarea id="tkNotes" placeholder="Parts, where exactly, work done"></textarea></div>' +
      '<div class="as-sec">Photos</div><div class="as-act"><button class="p" id="tkCam">\ud83d\udcf7 ' + (isOpen(t) ? "Before photo" : "After photo") + '</button><button id="tkGal">\ud83d\uddbc From gallery</button></div><div class="as-ph" id="tkPh"></div>' +
      '<p class="src" id="tkHist"></p><div class="as-act"><button class="d" id="tkDel">Delete task</button></div>';
    if (a) { b.querySelector("#tkAsset b").textContent = nameOf(a); b.querySelector("#tkAsset small").textContent = a.park + " \u00b7 " + (a.cond || A.condList(a)[0]); $("tkAsset").onclick = function () { openThing(a.id); }; }
    ["Open", "In progress", "Done"].forEach(function (s, i) { var x = document.createElement("button"); x.textContent = s; x.style.setProperty("--c", ["#eab308", "#38bdf8", "#22c55e"][i]); x.setAttribute("aria-pressed", (t.cond || "Open") === s);
      x.onclick = function () { setStatus(t, s); }; $("tkSt").appendChild(x); });
    $("tkTitle").value = t.label || ""; $("tkNotes").value = t.notes || ""; wirePri(t);
    $("tkTitle").onchange = function () { t.label = this.value.trim() || "Task"; A.save(t); title(t.label); };
    $("tkNotes").onchange = function () { t.notes = this.value; A.save(t); };
    $("tkWho").onchange = function () { p.assignee = this.value.trim(); A.save(t).then(refreshBadges); };
    $("tkDue").onchange = function () { p.due = this.value; A.save(t).then(refreshBadges); };
    var snap = function (cam) { A.pickPhoto(cam, function (f) { var after = !isOpen(t); A.addPhoto(t, f).then(function (ph) { if (after && ph) { p.after = (p.after || []).concat([ph.id]); return A.save(t); } }).then(function () { PU.toast("Photo saved."); redraw(); }, function () { PU.toast("Couldn't read that photo."); }); }); };
    $("tkCam").onclick = function () { snap(true); }; $("tkGal").onclick = function () { snap(false); };
    $("tkDel").onclick = function () { if (!confirm("Delete this task and its photos?")) return; A.remove(t).then(function () { PU.toast("Task deleted."); stack.pop(); refreshAll(); draw(); }, function () {}); };
    $("tkHist").textContent = "Opened " + A.fmtDate(t.created) + (p.by ? " by " + p.by : "") + (p.src === "auto" ? " (automatically, when the item was marked for repair)" : "") + (p.doneAt ? " \u00b7 closed " + A.fmtDate(p.doneAt) + (p.doneBy ? " by " + p.doneBy : "") : "");
    if (ro()) { [].forEach.call(b.querySelectorAll("input,select,textarea,#tkSt button,#tkPri button"), function (el) { el.disabled = true; }); ["tkCam", "tkGal", "tkDel"].forEach(function (k) { $(k).hidden = true; }); }
    taskUrls.forEach(function (u) { URL.revokeObjectURL(u); }); taskUrls = [];
    A.photosOf(t.id).then(function (ph) { var box = $("tkPh"); if (!box) return; var after = {}; (p.after || []).forEach(function (x) { after[x] = 1; });
      ph.forEach(function (x, i) { var f = document.createElement("figure"); f.innerHTML = '<img alt=""><figcaption></figcaption>'; f.querySelector("figcaption").textContent = (after[x.id] ? "After \u00b7 " : "Before \u00b7 ") + new Date(x.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
        f.onclick = function () { A.viewPhotos(ph, i); }; box.appendChild(f); A.blobOf(x).then(function (bl) { if (!bl) return; var u = URL.createObjectURL(bl); taskUrls.push(u); f.querySelector("img").src = u; }); }); });
  }; }
  function setStatus(t, s) { if (ro()) return; var p = t.props, was = t.cond || "Open"; if (was === s) return;
    t.cond = s; if (s === "Done") { p.doneAt = Date.now(); p.doneBy = needWho(); } else { delete p.doneAt; delete p.doneBy; }
    A.save(t).then(function () { refreshAll(); redraw(); if (s !== "Done") return;
      var a = p.asset ? A.byId(p.asset) : null;
      if (a && A.isBad(a) && !tasksFor(a.id).some(isOpen)) { var good = A.condList(a)[0]; if (confirm("Task closed. Set " + nameOf(a) + " back to \u201c" + good + "\u201d?")) { a.cond = good; A.save(a).then(redraw); } }
      if (confirm("Take an \u201cafter\u201d photo now?")) A.pickPhoto(true, function (f) { A.addPhoto(t, f).then(function (ph) { if (ph) { p.after = (p.after || []).concat([ph.id]); return A.save(t); } }).then(function () { PU.toast("After photo saved."); redraw(); }, function () {}); });
    }, function () {}); }

  /* ======================================================================
   * 3 + 4. STORMS AND CHECKLISTS  (a "run" is a storm or a checklist; a "tick" is one check-off)
   * ====================================================================== */
  var CLEAR = { walk: 1, route: 1, ramp: 1, smailbox: 1, entrance: 1, exitgate: 1, steps: 1, icemelt: 1, shovel: 1, parking: 1 };
  var KIND = { storm: { n: "Snow storm", e: "\u2744\ufe0f", verb: "cleared" }, startup: { n: "Irrigation spring startup", e: "\ud83c\udf31", verb: "done" }, blowout: { n: "Irrigation fall blowout", e: "\ud83c\udf2c\ufe0f", verb: "done" } };
  function runs(kind) { return recs("run").filter(function (r) { return (r.props || {}).kind === kind; }); }
  function activeStorm() { return runs("storm").filter(function (r) { return !(r.props || {}).ended; }).sort(function (x, y) { return ((x.props || {}).started || 0) - ((y.props || {}).started || 0); })[0] || null; }
  function tickId(run, key) { return "tk-" + run.id + "-" + String(key).replace(/[^A-Za-z0-9]+/g, "_"); }
  function ticksOf(run) { var m = {}; recs("tick").forEach(function (t) { var p = t.props || {}; if (p.run === run.id) m[p.item] = t; }); return m; }
  function snowItems(park) { return things().filter(function (a) { return A.layerOf(a) === "snow" && CLEAR[a.type] && a.cond !== "Retired" && (!park || a.park === park); }); }
  function pri(a) { var v = parseInt(String((a.props || {}).priority || "2"), 10); return isNaN(v) ? 2 : v; }
  /* the steps of a run at one park */
  function steps(run, park) { var k = (run.props || {}).kind;
    if (k === "storm") { var list = snowItems(park).sort(function (x, y) { return pri(x) - pri(y) || x.type.localeCompare(y.type) || nameOf(x).localeCompare(nameOf(y)); });
      if (!list.length) return [{ key: "park:" + slug(park), text: "Whole park cleared", sub: "Nothing is mapped in this park\u2019s Snow tab yet, so it is one check." }];
      return list.map(function (a) { return { key: a.id, a: a, text: nameOf(a), sub: [A.tOf(a).name !== nameOf(a) ? A.tOf(a).name : "", A.summary(a)].filter(Boolean).join(" \u00b7 ") }; }); }
    var ir = things().filter(function (a) { return A.layerOf(a) === "irrigation" && a.park === park && a.cond !== "Off"; }), of = function (ty) { return ir.filter(function (a) { return a.type === ty; }).sort(function (x, y) { return String((x.props || {}).zone || "").localeCompare(String((y.props || {}).zone || ""), undefined, { numeric: true }) || nameOf(x).localeCompare(nameOf(y)); }); };
    var st = function (key, text, sub) { return { key: "step:" + key, text: text, sub: sub || "" }; }, it = function (a, text, sub) { return { key: a.id, a: a, text: text, sub: sub || "" }; };
    var zn = function (a) { var z = (a.props || {}).zone; return z ? "Zone " + z : nameOf(a); }, out = [];
    if (k === "startup") {
      of("backflow").forEach(function (a) { out.push(it(a, nameOf(a) + ": close the test cocks and drains", "Put back any plugs or caps taken off for winter.")); });
      out.push(st("fill", "Open the main shutoff slowly and let the mainline fill", "A quarter turn at a time, so the pipes don\u2019t hammer."));
      of("backflow").forEach(function (a) { out.push({ key: a.id + ":open", a: a, text: nameOf(a) + ": shutoffs fully open, no leaks", sub: (a.props || {}).nexttest ? "Next test due " + niceDay(a.props.nexttest) : "No test date on file" }); });
      of("timer").forEach(function (a) { out.push(it(a, nameOf(a) + ": power on, date, time and program set", (a.props || {}).zones ? plural(+a.props.zones, "zone") : "")); });
      of("valve").forEach(function (a) { out.push(it(a, zn(a) + ": run it, check every head, fix leaks", headCount(park, (a.props || {}).zone))); });
      out.push(st("walk", "Walk the mainline and laterals for wet spots"));
    } else {
      out.push(st("off", "Shut off the water supply to the system"));
      of("timer").forEach(function (a) { out.push(it(a, nameOf(a) + ": set to off or rain mode")); });
      var qc = of("coupler"); if (qc.length) qc.forEach(function (a) { out.push(it(a, "Connect the compressor at " + nameOf(a))); }); else out.push(st("air", "Connect the compressor at the blowout point"));
      of("valve").forEach(function (a) { out.push(it(a, zn(a) + ": blow out until only mist comes out", headCount(park, (a.props || {}).zone))); });
      of("backflow").forEach(function (a) { out.push(it(a, nameOf(a) + ": drain it, leave the ball valves half open", "Test cocks open too.")); });
      out.push(st("done", "Disconnect the compressor and leave the drains open"));
    }
    return out; }
  function headCount(park, zone) { if (!zone) return ""; var n = things().filter(function (a) { return a.type === "head" && a.park === park && String((a.props || {}).zone || "") === String(zone); }).length; return n ? plural(n, "head") + " mapped" : ""; }
  function progress(run, park, tk) { tk = tk || ticksOf(run); var s = steps(run, park), d = s.filter(function (x) { return tk[x.key]; }).length; return { done: d, all: s.length }; }
  function setTick(run, park, step, on) { if (ro()) { PU.toast("View only \u2014 ask an admin for editor access."); return Promise.resolve(); }
    var id = tickId(run, step.key), cur = A.byId(id);
    if (!on) return cur ? A.remove(cur) : Promise.resolve();
    if (cur) return Promise.resolve(); var w = needWho();
    return A.save({ id: id, type: "tick", created: Date.now(), photoCount: 0, park: park, label: "", notes: "", props: { run: run.id, item: step.key, by: w, t: Date.now() } }); }

  /* --- storms --- */
  function screenStormHome() {
    title("Snow storms"); var act = activeStorm(), b = $("opBody"), past = runs("storm").filter(function (r) { return (r.props || {}).ended; }).sort(function (x, y) { return y.props.started - x.props.started; });
    b.innerHTML = act ? "" : '<p class="mut" style="margin:0 0 6px">Start a storm when crews head out. Each sidewalk, ramp, route and lot mapped in a park\u2019s Snow tab becomes a check-off with the time and who cleared it. Parks with nothing mapped get one check for the whole park.</p>' +
      (ro() ? "" : '<div class="as-f"><label for="stName">Storm name</label><input id="stName" maxlength="50"></div><div class="as-act"><button class="p" id="stGo">\u2744 Start storm</button></div>') +
      '<p class="src">' + plural(snowItems().length, "snow item") + " mapped across " + plural(Object.keys(snowItems().reduce(function (m, a) { m[a.park] = 1; return m; }, {})).length, "park") + ".</p>";
    if (act) { stack[stack.length - 1] = { fn: screenRun(act.id) }; return draw(); }
    if ($("stName")) { $("stName").value = "Storm " + new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
      $("stGo").onclick = function () { var w = needWho(), r = { id: "run-" + A.uid(), type: "run", created: Date.now(), photoCount: 0, park: "", label: $("stName").value.trim() || "Storm", notes: "", cond: "Open", props: { kind: "storm", started: Date.now(), ended: "", by: w } };
        A.save(r).then(function () { refreshAll(); stack[stack.length - 1] = { fn: screenRun(r.id) }; draw(); PU.toast("Storm started. Check places off as they\u2019re cleared."); }, function () {}); }; }
    if (past.length) { var h = document.createElement("div"); h.className = "as-sec"; h.textContent = "Past storms"; b.appendChild(h);
      past.forEach(function (r) { var tk = ticksOf(r), row = document.createElement("button"); row.className = "op-row"; row.innerHTML = '<img alt="" src="' + A.iconURL("run") + '"><span><b></b><small></small></span><span class="go">Log</span>';
        row.querySelector("b").textContent = r.label; row.querySelector("small").textContent = new Date(r.props.started).toLocaleDateString() + " \u00b7 " + plural(Object.keys(tk).length, "check-off") + " \u00b7 " + hours(r.props.started, r.props.ended);
        row.onclick = function () { push(screenRun(r.id)); }; b.appendChild(row); }); }
  }
  function hours(a, b) { var m = Math.max(0, Math.round(((b || Date.now()) - a) / 60000)); return m < 60 ? m + " min" : (m / 60).toFixed(1) + " h"; }
  function runParks(run) { var k = run.props.kind;
    if (k === "storm") { var has = {}; snowItems().forEach(function (a) { has[a.park] = 1; }); return parkNames().map(function (n) { return { n: n, mapped: !!has[n] }; }); }
    var ir = {}; things().forEach(function (a) { if (A.layerOf(a) === "irrigation") ir[a.park] = 1; }); return Object.keys(ir).sort().map(function (n) { return { n: n, mapped: true }; }); }
  var runQ = "";
  function screenRun(id) { return function () {
    var run = A.byId(id); if (!run) { stack.pop(); return draw(); } var k = run.props.kind, tk = ticksOf(run), ended = !!run.props.ended, b = $("opBody");
    title(KIND[k].e + " " + run.label); action("\u2b07 Log", function () { exportRun(run); });
    var parks = runParks(run).map(function (p) { var g = progress(run, p.n, tk); p.done = g.done; p.all = g.all; return p; });
    var tot = parks.reduce(function (s, p) { return s + (p.mapped ? p.all : 0); }, 0), dn = parks.reduce(function (s, p) { return s + (p.mapped ? p.done : 0); }, 0), whole = parks.filter(function (p) { return !p.mapped && p.done; }).length, full = parks.filter(function (p) { return p.all && p.done === p.all; }).length;
    b.innerHTML = '<div class="op-note' + (ended ? "" : " warn") + '"><b>' + (ended ? "Ended" : "In progress") + "</b> \u00b7 started " + esc(niceStamp(run.props.started)) + (run.props.by ? " by " + esc(run.props.by) : "") + (ended ? " \u00b7 ended " + esc(niceStamp(run.props.ended)) : "") + " \u00b7 " + hours(run.props.started, run.props.ended) +
      '<div class="op-bar"><i style="width:' + (tot ? Math.round(dn / tot * 100) : parks.length ? Math.round(full / parks.length * 100) : 0) + '%"></i></div>' + (tot ? dn + " of " + tot + " mapped items " + KIND[k].verb + " \u00b7 " : "") + full + " of " + parks.length + " parks finished</div>" +
      '<input class="search" id="rnQ" type="search" placeholder="Find a park" autocomplete="off" style="margin-bottom:4px"><div id="rnRows"></div>' +
      (ro() ? "" : '<div class="as-act">' + (ended ? '<button id="rnRe">Reopen</button>' : '<button class="p" id="rnEnd">End storm</button>') + '<button class="d" id="rnDel">Delete</button></div>');
    $("rnQ").value = runQ; $("rnQ").oninput = function () { runQ = this.value; rows(); };
    function rows() { var box = $("rnRows"), q = runQ.trim().toLowerCase(); box.innerHTML = "";
      var list = parks.filter(function (p) { return !q || p.n.toLowerCase().indexOf(q) >= 0; });
      list = nearSort(list, function (p) { return p.n; }); if (!(A.me && A.me())) list.sort(function (x, y) { return (y.mapped - x.mapped) || x.n.localeCompare(y.n); });
      list.sort(function (x, y) { return (x.all && x.done === x.all ? 1 : 0) - (y.all && y.done === y.all ? 1 : 0); });
      list.forEach(function (p) { var r = document.createElement("button"); r.className = "op-row", r.innerHTML = "<span><b></b><small></small></span>" + '<span class="when ' + (p.done === p.all ? "ok" : p.done ? "soon" : "") + '">' + (p.mapped ? p.done + " / " + p.all : p.done ? "\u2713 cleared" : "not yet") + "</span>";
        r.querySelector("b").textContent = p.n; r.querySelector("small").textContent = p.mapped ? plural(p.all, "mapped item") : "nothing mapped \u00b7 one check for the park";
        r.onclick = function () { push(screenRunPark(run.id, p.n)); }; box.appendChild(r); });
      if (!list.length) box.innerHTML = '<div class="empty">No park matches.</div>'; }
    rows();
    if ($("rnEnd")) $("rnEnd").onclick = function () { if (!confirm("End " + run.label + "? The log stays and can be downloaded any time.")) return; run.props.ended = Date.now(); run.cond = "Done"; A.save(run).then(function () { refreshAll(); redraw(); PU.toast("Storm ended."); }); };
    if ($("rnRe")) $("rnRe").onclick = function () { run.props.ended = ""; run.cond = "Open"; A.save(run).then(function () { refreshAll(); redraw(); }); };
    if ($("rnDel")) $("rnDel").onclick = function () { if (!confirm("Delete " + run.label + " and all of its check-offs? This can\u2019t be undone.")) return;
      var q = Promise.resolve(); Object.keys(tk).forEach(function (key) { q = q.then(function () { return A.remove(tk[key]); }); });
      q.then(function () { return A.remove(run); }).then(function () { stack.pop(); refreshAll(); draw(); PU.toast("Deleted."); }, function () {}); };
  }; }
  function screenRunPark(id, park) { return function () {
    var run = A.byId(id); if (!run) { stack.pop(); return draw(); } var k = run.props.kind, tk = ticksOf(run), list = steps(run, park), b = $("opBody"), locked = ro() || (k === "storm" && !!run.props.ended);
    var dn = list.filter(function (s) { return tk[s.key]; }).length; title(park);
    if (k === "storm") action("Map", function () { A.openLayer("snow", park); }); else action("Map", function () { A.openLayer("irrigation", park); });
    b.innerHTML = '<div class="op-note">' + KIND[k].e + " " + esc(run.label) + ' \u00b7 <b id="rpN"></b><div class="op-bar"><i id="rpBar"></i></div></div><div id="rpRows"></div>' +
      (locked || !list.length ? "" : '<div class="as-act"><button class="p" id="rpAll">\u2713 All ' + KIND[k].verb + " here</button></div>") + (k === "storm" ? "" : '<div id="rpCov"></div>');
    function head() { $("rpN").textContent = dn + " of " + list.length + " " + KIND[k].verb; $("rpBar").style.width = (list.length ? Math.round(dn / list.length * 100) : 0) + "%"; }
    head();
    if (!list.length) $("rpRows").innerHTML = '<div class="empty">Nothing to check here.</div>';
    list.forEach(function (s) { var t = tk[s.key], r = document.createElement("div"); r.className = "op-row";
      r.innerHTML = (s.a ? '<img alt="" src="' + A.iconURL(s.a.type) + '">' : "") + "<span><b></b><small></small></span>" + '<button class="op-tick" aria-label="Done">\u2713</button>';
      r.querySelector("b").textContent = s.text; r.querySelector("b").style.whiteSpace = "normal";
      var sm = r.querySelector("small"), btn = r.querySelector(".op-tick"), paint = function () { btn.setAttribute("aria-pressed", !!t); sm.textContent = t ? "\u2713 " + niceStamp(t.props.t) + (t.props.by ? " \u00b7 " + t.props.by : "") : s.sub; sm.style.color = t ? "#7ff0c2" : ""; };
      paint(); btn.disabled = locked;
      btn.onclick = function () { var on = !t; btn.disabled = true; setTick(run, park, s, on).then(function () { t = on ? A.byId(tickId(run, s.key)) : null; if (t) tk[s.key] = t; else delete tk[s.key]; dn = list.filter(function (x) { return tk[x.key]; }).length; paint(); head(); btn.disabled = false; refreshBadges(); if (navigator.vibrate) navigator.vibrate(15); }, function () { btn.disabled = false; }); };
      if (s.a) { r.querySelector("span").onclick = function () { openThing(s.a.id); }; r.querySelector("span").style.cursor = "pointer"; }
      $("rpRows").appendChild(r); });
    if ($("rpAll")) $("rpAll").onclick = function () { var q = Promise.resolve(); list.forEach(function (s) { if (!tk[s.key]) q = q.then(function () { return setTick(run, park, s, true); }); }); q.then(function () { refreshBadges(); redraw(); PU.toast(park + ": all " + KIND[k].verb + "."); }); };
    if (k !== "storm") coverageBox(park, $("rpCov"));
  }; }
  function exportRun(run) { var q = A.toCSVq, k = run.props.kind, tk = ticksOf(run), lines = [[k === "storm" ? "Storm" : "Checklist", "Park", "Item", "Type", "Priority", "Method", "Ice melt", "Length/area", "Status", k === "storm" ? "Cleared at" : "Done at", "By", "Item ID"].join(",")];
    runParks(run).forEach(function (p) { steps(run, p.n).forEach(function (s) { var t = tk[s.key], a = s.a, pr = a ? a.props || {} : {};
      if (!p.mapped && !t) return;
      lines.push([run.label, p.n, s.text, a ? A.tOf(a).name : (p.mapped ? "Step" : "Whole park"), pr.priority || "", pr.method || "", pr.melt || "", a ? A.measure(a) : "", t ? (k === "storm" ? "Cleared" : "Done") : "Not done", t ? new Date(t.props.t).toLocaleString() : "", t ? t.props.by || "" : "", a ? a.id : ""].map(q).join(",")); }); });
    lines.push(""); lines.push(["Started", new Date(run.props.started).toLocaleString(), "Ended", run.props.ended ? new Date(run.props.ended).toLocaleString() : "still open", "Started by", run.props.by || ""].map(q).join(","));
    A.saveFile(slug(run.label) + "-log-" + ymd(run.props.started) + ".csv", lines.join("\n"), "text/csv"); }

  /* --- irrigation checklists: one shared list per park, per season --- */
  var irKind = (function () { var m = new Date().getMonth(); return m >= 7 ? "blowout" : "startup"; })();
  function checklist(kind, park, make) { var yr = new Date().getFullYear(), id = "run-" + kind + "-" + yr + "-" + slug(park), r = A.byId(id);
    if (r || !make) return r || { id: id, type: "run", label: (kind === "startup" ? "Spring startup " : "Fall blowout ") + yr, park: park, props: { kind: kind, year: yr, started: Date.now(), ended: "", by: "" }, ghost: true };
    r = { id: id, type: "run", created: Date.now(), photoCount: 0, park: park, label: (kind === "startup" ? "Spring startup " : "Fall blowout ") + yr, notes: "", cond: "Open", props: { kind: kind, year: yr, started: Date.now(), ended: "", by: who() } };
    return r; }
  function screenIrrigation() {
    title("Irrigation checklists"); var b = $("opBody"), ir = {}; things().forEach(function (a) { if (A.layerOf(a) === "irrigation") ir[a.park] = (ir[a.park] || 0) + 1; });
    var parks = Object.keys(ir).sort(), yr = new Date().getFullYear();
    b.innerHTML = '<div class="as-seg" id="irK" style="margin-bottom:8px"></div><p class="mut" style="font-size:13px;margin:0 0 6px" id="irHelp"></p><div id="irRows"></div>';
    [["startup", "\ud83c\udf31 Spring startup"], ["blowout", "\ud83c\udf2c\ufe0f Fall blowout"]].forEach(function (x) { var c = document.createElement("button"); c.textContent = x[1] + " " + yr; c.style.setProperty("--c", "#7cc8ff"); c.setAttribute("aria-pressed", irKind === x[0]); c.onclick = function () { irKind = x[0]; redraw(); }; $("irK").appendChild(c); });
    $("irHelp").textContent = irKind === "startup" ? "Each park\u2019s backflows, timers and zone valves become the steps to bring the system up. Everyone on the team works from the same list." : "Each park\u2019s timers, quick couplers, zone valves and backflows become the steps to winterize. Everyone on the team works from the same list.";
    if (!parks.length) { $("irRows").innerHTML = '<div class="empty">No irrigation is mapped yet. Open a park, tap <b>Water</b>, and add its backflow, timer and zone valves. They become this checklist.</div>'; return; }
    var doneParks = 0;
    nearSort(parks, function (n) { return n; }).forEach(function (n) { var run = checklist(irKind, n, false), g = run.ghost ? { done: 0, all: steps(run, n).length } : progress(run, n); if (g.all && g.done === g.all) doneParks++;
      var r = document.createElement("button"); r.className = "op-row"; r.innerHTML = "<span><b></b><small></small></span>" + '<span class="when ' + (g.done === g.all ? "ok" : g.done ? "soon" : "") + '">' + g.done + " / " + g.all + "</span>";
      r.querySelector("b").textContent = n; r.querySelector("small").textContent = plural(ir[n], "irrigation item") + " mapped";
      r.onclick = function () { var real = checklist(irKind, n, true); (real.created && !A.byId(real.id) && !ro() ? A.save(real) : Promise.resolve()).then(function () { push(screenRunPark(real.id, n)); }, function () {}); };
      $("irRows").appendChild(r); });
    var s = document.createElement("p"); s.className = "src"; s.textContent = doneParks + " of " + parks.length + " parks finished"; b.appendChild(s);
  }
  /* head-to-head coverage: a head's spray should reach the next head. Flag heads that have no throw set, or whose nearest neighbour is out of reach. */
  function coverage(park) { var heads = things().filter(function (a) { return a.type === "head" && a.park === park && a.lng != null && a.cond !== "Off"; }), noThrow = [], gaps = [];
    heads.forEach(function (h) { var t = +((h.props || {}).throw); if (!(t > 0)) { noThrow.push(h); return; } if (heads.length < 2) return; var best = Infinity;
      heads.forEach(function (o) { if (o !== h) { var d = A.meters([h.lng, h.lat], [o.lng, o.lat]) * 3.28084; if (d < best) best = d; } }); if (best > t * 1.15) gaps.push({ a: h, d: best, t: t }); });
    return { heads: heads.length, noThrow: noThrow, gaps: gaps.sort(function (x, y) { return (y.d - y.t) - (x.d - x.t); }) }; }
  function coverageBox(park, el) { if (!el) return; var c = coverage(park); if (!c.heads) return;
    el.innerHTML = '<div class="op-box"><h4>Coverage check \u00b7 ' + plural(c.heads, "head") + "</h4>" + (c.gaps.length || c.noThrow.length ? "" : '<div class="op-mini"><span>Every head reaches its nearest neighbour.</span></div>') + '<div id="cvRows"></div>' +
      '<p class="src" style="margin:4px 0 2px">A head\u2019s spray should reach the next head. A gap here means dry turf between two heads, or a head that isn\u2019t on the map yet.</p></div>';
    var box = el.querySelector("#cvRows");
    c.gaps.slice(0, 12).forEach(function (g) { var r = document.createElement("button"); r.className = "op-mini"; r.innerHTML = "<span></span><small></small>"; r.querySelector("span").textContent = "\u26a0 " + nameOf(g.a) + ((g.a.props || {}).zone ? " \u00b7 zone " + g.a.props.zone : "");
      r.querySelector("small").textContent = "throws " + Math.round(g.t) + " ft, next head " + Math.round(g.d) + " ft"; r.onclick = function () { openThing(g.a.id); }; box.appendChild(r); });
    if (c.gaps.length > 12) { var m = document.createElement("div"); m.className = "op-mini"; m.innerHTML = "<span>and " + (c.gaps.length - 12) + " more</span>"; box.appendChild(m); }
    if (c.noThrow.length) { var r2 = document.createElement("button"); r2.className = "op-mini"; r2.innerHTML = "<span></span><small>open list</small>"; r2.querySelector("span").textContent = plural(c.noThrow.length, "head") + " with no throw radius set";
      r2.onclick = function () { A.openList({ park: park, layer: "irrigation", type: "head" }); }; box.appendChild(r2); } }

  /* ======================================================================
   * 5. LINKS: pools open their own tools; parks and items open their field reports
   * ====================================================================== */
  var POOL_ID = { "Splash Landing Pool": ["splash", "splash-landing"], "Aviator Pool": ["aviator", "aviator"], "F-15 Pool": ["f15", "f-15"], "Jet Stream Pool": ["jet", "jet-stream"], "Puddle Jumper Pool": ["puddle", "puddle-jumper"], "Maverick Pool": ["maverick", "maverick"], "Runway 35 Pool": ["runway", "runway-35"] };
  var FR_ALIAS = { "Runway 35 Pool": "Runway Pool" };
  function frName(n) { return FR_ALIAS[n] || n; }
  function frIndex() { return LS.get("pu-fr-index", null) || { by: {}, assets: {} }; }
  function frAt(park) { return (frIndex().by || {})[frName(park)] || { n: 0, open: 0, hot: 0 }; }
  function frOpen(park) { location.href = "apps/field-reports.html#prop=" + encodeURIComponent(frName(park)); }
  function frNew(park, a) { location.href = "apps/field-reports.html#new=" + encodeURIComponent(frName(park)) + (a ? "&asset=" + encodeURIComponent(a.id) + "&title=" + encodeURIComponent(nameOf(a)) : ""); }
  /* extra buttons on a park or pool card */
  function decorateCard(p, i, el) {
    var old = el.querySelector(".cardops"); if (old) old.remove();
    var row = document.createElement("div"); row.className = "cardops";
    var add = function (label, cls, fn) { var b = document.createElement("button"); b.textContent = label; if (cls) b.className = cls; b.onclick = fn; row.appendChild(b); return b; };
    var ids = POOL_ID[p.n];
    if (ids) { add("\ud83c\udfed Plant 3D", "pool", function () { location.href = "apps/pool-plant/index.html#/" + ids[0]; });
      add("\ud83e\uddea PoolCommand", "pool", function () { location.href = "apps/pool-command.html#pool=" + ids[1]; });
      add("\ud83d\udcd8 Aquatics Tech", "pool", function () { location.href = "apps/aquatics-tech.html#/" + ids[0]; }); }
    else if (p.pool) add("\ud83e\uddea PoolCommand", "pool", function () { location.href = "apps/pool-command.html"; });
    var storm = activeStorm(); if (storm) { var g = progress(storm, p.n); add("\u2744 " + (g.done === g.all && g.all ? "Cleared \u2713" : "Storm " + g.done + "/" + g.all), "storm", function () { start(screenRun(storm.id)); push(screenRunPark(storm.id, p.n)); }); }
    var due = dueList().filter(function (x) { return x.park === p.n && x.days <= 30; }), late = due.filter(function (x) { return x.days < 0; }).length;
    if (due.length) add("\u23f0 Due " + due.length, late ? "hot" : "", function () { start(screenDue(p.n)); });
    var ot = openTasks().filter(function (t) { return t.park === p.n; }).length; add("\ud83d\udd27 Tasks" + (ot ? " " + ot : ""), "", function () { taskFilter = "open"; start(screenTasks({ park: p.n })); });
    var fr = frAt(p.n); add("\ud83d\udcdd Reports" + (fr.n ? " " + (fr.open ? fr.open + " open" : fr.n) : ""), fr.hot ? "hot" : "", function () { if (fr.n) frOpen(p.n); else frNew(p.n); });
    var tabs = el.querySelector("#cTabs"); if (tabs && tabs.parentNode) tabs.parentNode.insertBefore(row, tabs.nextSibling); else el.appendChild(row);
  }
  /* extra section on an item's card: repairs, tag, reports */
  A.onCard(function (a, body, RO) {
    if (sheetOpen()) hide();   /* an item card replaces the Work sheet; its back arrow can bring it back (openThing) */
    var slot = body.querySelector("#asWork"); if (!slot || A.isRec(a) || a.type === "property" || a.type === "parkfix") return;
    var ts = tasksFor(a.id), open = ts.filter(isOpen), done = ts.length - open.length, reps = ((frIndex().assets || {})[a.id] || []);
    var h = '<div class="op-box"><h4>Work</h4><div id="awRows"></div><div class="as-act" style="margin-top:6px">' + (RO ? "" : '<button id="awTask">\ud83d\udd27 Repair task</button>') +
      (a.type === "backflow" && !RO ? '<button id="awTest">\u2713 Tested today</button>' : "") + '<button id="awTag">\ud83c\udff7 QR tag</button><button id="awRep">\ud83d\udcdd Field report</button></div></div>';
    slot.innerHTML = h; var box = slot.querySelector("#awRows");
    open.forEach(function (t) { var r = document.createElement("button"); r.className = "op-mini"; r.innerHTML = "<span></span><small></small>"; r.querySelector("span").textContent = "\ud83d\udd27 " + t.label; r.querySelector("small").textContent = ((t.props || {}).assignee || "unassigned") + ((t.props || {}).due ? " \u00b7 due " + niceDay(t.props.due) : "");
      r.onclick = function () { start(screenTasks({ asset: a.id })); push(screenTask(t.id)); }; box.appendChild(r); });
    if (done) { var r2 = document.createElement("button"); r2.className = "op-mini"; r2.innerHTML = "<span></span><small>history</small>"; r2.querySelector("span").textContent = plural(done, "past repair"); r2.onclick = function () { taskFilter = "done"; start(screenTasks({ asset: a.id })); }; box.appendChild(r2); }
    reps.slice(0, 4).forEach(function (x) { var r = document.createElement("button"); r.className = "op-mini"; r.innerHTML = "<span></span><small></small>"; r.querySelector("span").textContent = "\ud83d\udcdd " + x.title; r.querySelector("small").textContent = x.st + " \u00b7 " + niceDay(String(x.t).slice(0, 10));
      r.onclick = function () { location.href = "apps/field-reports.html#open=" + encodeURIComponent(x.id); }; box.appendChild(r); });
    if (!open.length && !done && !reps.length) box.innerHTML = '<div class="op-mini"><span style="color:var(--mut)">No repairs or reports on this item.</span></div>';
    if (slot.querySelector("#awTask")) slot.querySelector("#awTask").onclick = function () { start(screenTasks({ asset: a.id })); push(screenTaskNew({ asset: a.id, park: a.park })); };
    if (slot.querySelector("#awTest")) slot.querySelector("#awTest").onclick = function () { testedToday(a); };
    slot.querySelector("#awTag").onclick = function () { printTags([a]); };
    slot.querySelector("#awRep").onclick = function () { frNew(a.park, a); };
  });

  /* ======================================================================
   * 6. QR TAGS
   * ====================================================================== */
  var loaded = {};
  function lib(src, test) { if (test()) return Promise.resolve(); if (loaded[src]) return loaded[src];
    return loaded[src] = new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = function () { test() ? res() : rej(new Error("load")); }; s.onerror = function () { loaded[src] = null; rej(new Error("load")); }; document.head.appendChild(s); }); }
  function tagText(a) { return "PU:" + a.id; }
  function tagId(text) { var m = /(?:^|[\/#?=])PU:([A-Za-z0-9_-]+)\s*$/.exec(String(text || "").trim()); return m ? m[1] : null; }
  function qrURL(text) { var q = window.qrcode(0, "M"); q.addData(text); q.make(); return q.createDataURL(6, 2); }
  var tagSize = LS.get("pu-tag-size", "t10");
  function printTags(list) { if (!list.length) { PU.toast("Nothing to make tags for."); return; }
    lib("vendor/qrcode.js", function () { return !!window.qrcode; }).then(function () {
      var per = tagSize === "t10" ? 10 : 30, pages = [];
      for (var i = 0; i < list.length; i += per) pages.push(list.slice(i, i + per));
      var html = pages.map(function (pg) { return '<div class="tagpage ' + tagSize + '">' + pg.map(function (a) { return '<div class="tag"><img alt="" src="' + qrURL(tagText(a)) + '"><div><b>' + esc(nameOf(a)) + "</b><span>" + esc(A.tOf(a).name !== nameOf(a) ? A.tOf(a).name + " \u00b7 " : "") + esc(a.park || "") + "</span><small>" + esc(a.id) + " \u00b7 Park Universe</small></div></div>"; }).join("") + "</div>"; }).join("");
      printView(plural(list.length, "tag") + " \u00b7 " + plural(pages.length, "sheet"), html, { tags: true, redo: function () { printTags(list); } });
    }, function () { PU.toast("The tag maker didn\u2019t load. Reopen Park Universe."); }); }
  var tagCtx = { park: "", layer: "" };
  function screenTags() {
    title("Print QR tags"); var b = $("opBody"), parks = {}; things().forEach(function (a) { parks[a.park] = 1; });
    b.innerHTML = '<p class="mut" style="margin:0 0 6px">Print a sticker for each item. Scanning the sticker opens that item\u2019s card: its photos, condition and repairs.</p>' +
      '<div class="as-f"><label for="tgPark">Park</label><select id="tgPark"><option value="">All parks</option>' + Object.keys(parks).sort().map(function (n) { return "<option" + (n === tagCtx.park ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("") + "</select></div>" +
      '<div class="as-f"><label for="tgLayer">What</label><select id="tgLayer"><option value="">Everything that is a point</option>' + A.LAYERS.map(function (l) { return '<option value="' + l.id + '"' + (l.id === tagCtx.layer ? " selected" : "") + ">" + esc(l.name) + "</option>"; }).join("") + "</select></div>" +
      '<p class="src" id="tgN"></p><div class="as-act"><button class="p" id="tgGo">\ud83c\udff7 Make the tag sheets</button></div>' +
      '<p class="src">Sheets fit Avery 5163 (10 large tags) or Avery 5160 (30 small tags); choose the size on the next screen. Plain paper and clear tape work too. Sprinkler heads are left out unless you pick Irrigation.</p>';
    function pick() { var l = $("tgLayer").value, p = $("tgPark").value; tagCtx = { park: p, layer: l };
      return things().filter(function (a) { return A.tOf(a).geom === "point" && (!p || a.park === p) && (l ? A.layerOf(a) === l : a.type !== "head") && (A.layerOf(a) !== "snow" || l === "snow"); })
        .sort(function (x, y) { return (x.park || "").localeCompare(y.park || "") || x.type.localeCompare(y.type) || nameOf(x).localeCompare(nameOf(y)); }); }
    function count() { $("tgN").textContent = plural(pick().length, "tag"); }
    $("tgPark").onchange = count; $("tgLayer").onchange = count; count(); $("tgGo").onclick = function () { printTags(pick()); };
  }
  /* scanning: take a picture of the tag, read the code out of the picture */
  function decodeImage(file) {
    return new Promise(function (res, rej) { var u = URL.createObjectURL(file), im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { URL.revokeObjectURL(u); rej(new Error("photo")); }; im.src = u; }).then(function (im) {
      var native = window.BarcodeDetector ? new BarcodeDetector({ formats: ["qr_code"] }).detect(im).then(function (r) { return r && r[0] ? r[0].rawValue : null; }).catch(function () { return null; }) : Promise.resolve(null);
      return native.then(function (txt) { if (txt) return txt;
        return lib("vendor/jsqr.js", function () { return !!window.jsQR; }).then(function () {
          var W = im.naturalWidth, H = im.naturalHeight, tries = [[1, 1100], [1, 700], [.6, 900], [.35, 800]];
          for (var i = 0; i < tries.length; i++) { var f = tries[i][0], cw = W * f, ch = H * f, k = Math.min(1, tries[i][1] / Math.max(cw, ch)), c = document.createElement("canvas"); c.width = Math.round(cw * k); c.height = Math.round(ch * k);
            var g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(im, (W - cw) / 2, (H - ch) / 2, cw, ch, 0, 0, c.width, c.height);
            var d = g.getImageData(0, 0, c.width, c.height), r = window.jsQR(d.data, c.width, c.height, { inversionAttempts: "attemptBoth" }); if (r && r.data) return r.data; }
          return null; }); }); }); }
  function scan(camera) { A.pickPhoto(camera !== false, function (file) { PU.toast("Reading the tag\u2026", 6000);
    decodeImage(file).then(function (txt) { try { if (camera !== false && window.BombaNative && BombaNative.discardCapture) BombaNative.discardCapture(); } catch (e) {}
      var id = tagId(txt); if (!txt) { PU.toast("No tag found in that photo. Fill the frame with the square code and try again.", 5000); return; }
      if (!id) { PU.toast("That code isn\u2019t a Park Universe tag.", 4000); return; }
      var a = A.byId(id); if (!a) { PU.toast("That tag isn\u2019t on this phone yet. Sync (Menu \u22ee \u2192 Team sync), then scan again.", 5500); return; }
      if (a.type === "task") { start(screenTasks({})); push(screenTask(a.id)); } else A.openAsset(a.id, true);
    }, function () { PU.toast("Couldn\u2019t read that photo."); }); }); }

  /* ======================================================================
   * 7. PRINT VIEW + MONTHLY SUMMARY
   * ====================================================================== */
  function printView(titleText, html, o) { o = o || {}; var v = $("puPrint"); if (v) v.remove(); if (PU.closeAll) PU.closeAll();
    v = document.createElement("div"); v.id = "puPrint";
    v.innerHTML = '<div class="pbar noprint"><button id="ppClose">\u2190 Back</button><b></b>' + (o.bar || "") + (o.tags ? '<select id="ppSize" aria-label="Tag size"><option value="t10">10 per sheet</option><option value="t30">30 per sheet</option></select>' : "") + '<button class="go" id="ppPrint">Print / PDF</button></div><div id="ppBody">' + html + "</div>";
    v.querySelector(".pbar b").textContent = titleText; document.body.appendChild(v);
    var fit = function () { v.style.setProperty("--tz", Math.min(1, (window.innerWidth - 16) / 816).toFixed(3)); }; fit();
    $("ppClose").onclick = function () { v.remove(); if (o.back) o.back(); };
    if (o.tags) { $("ppSize").value = tagSize; $("ppSize").onchange = function () { tagSize = this.value; LS.set("pu-tag-size", tagSize); o.redo(); }; }
    $("ppPrint").onclick = function () { if (window.BombaNative && BombaNative.printPage) { try { BombaNative.printPage(o.file || titleText); return; } catch (e) {} }
      if (window.BombaNative) { PU.toast("Printing needs the newest Park Universe app. Update, then try again.", 5000); return; } window.print(); };
    if (o.after) o.after(v);
    return v; }
  var repMonth = null;
  function monthBounds(d) { var a = new Date(d.getFullYear(), d.getMonth(), 1), b = new Date(d.getFullYear(), d.getMonth() + 1, 1); return [a.getTime(), b.getTime()]; }
  function inYmd(s, lo, hi) { var d = parseYmd(s); return !!d && d.getTime() >= lo && d.getTime() < hi; }
  function summaryData(d) { var mb = monthBounds(d), lo = mb[0], hi = mb[1], T = things(), within = function (t) { return t >= lo && t < hi; };
    var ts = tasks(), opened = ts.filter(function (t) { return within(t.created); }), closed = ts.filter(function (t) { return (t.props || {}).doneAt && within(t.props.doneAt); }).sort(function (x, y) { return x.props.doneAt - y.props.doneAt; });
    var stillOpen = ts.filter(function (t) { return t.created < hi && (isOpen(t) || ((t.props || {}).doneAt || 0) >= hi); }).sort(function (x, y) { return x.created - y.created; });
    var storms = runs("storm").filter(function (r) { return within(r.props.started); }).sort(function (x, y) { return x.props.started - y.props.started; });
    var lists = recs("run").filter(function (r) { return r.props.kind !== "storm"; }).map(function (r) { var tk = ticksOf(r), inM = Object.keys(tk).filter(function (k) { return within(tk[k].props.t); }).length, g = progress(r, r.park, tk); return { r: r, inM: inM, done: g.done, all: g.all }; }).filter(function (x) { return x.inM; });
    var nextLo = hi, nextHi = new Date(d.getFullYear(), d.getMonth() + 2, 1).getTime(), due = dueList().filter(function (x) { var t = parseYmd(x.when).getTime(); return t < nextHi && (t >= nextLo || x.days < 0); });
    var byLayer = {}; A.LAYERS.forEach(function (l) { byLayer[l.id] = { n: 0, added: 0, name: l.name }; }); T.forEach(function (a) { var l = byLayer[A.layerOf(a)]; if (!l) return; if ((a.created || 0) < hi) l.n++; if (within(a.created || 0)) l.added++; });
    return { lo: lo, hi: hi, opened: opened, closed: closed, stillOpen: stillOpen, storms: storms, lists: lists, due: due, byLayer: byLayer,
      tests: T.filter(function (a) { return a.type === "backflow" && inYmd((a.props || {}).lasttest, lo, hi); }), planted: T.filter(function (a) { return a.type === "tree" && inYmd((a.props || {}).planted, lo, hi); }),
      removed: T.filter(function (a) { return a.type === "stump" && inYmd((a.props || {}).removed, lo, hi); }), bad: T.filter(function (a) { return A.isBad(a) && A.layerOf(a) !== "snow"; }),
      photographed: T.filter(function (a) { return a.lastPhoto && within(a.lastPhoto); }).length, fr: frIndex() }; }
  function monthlySummary(d) { repMonth = d || repMonth || new Date(); var D = summaryData(repMonth), mName = repMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    var fact = function (n, l) { return '<div class="fact"><b>' + n + "</b><span>" + esc(l) + "</span></div>"; }, td = function (v) { return "<td>" + esc(v == null ? "" : v) + "</td>"; };
    var item = function (t) { var a = (t.props || {}).asset ? A.byId(t.props.asset) : null; return a ? nameOf(a) : ""; };
    var frTot = { n: 0, open: 0, hot: 0 }; Object.keys(D.fr.by || {}).forEach(function (k) { var x = D.fr.by[k]; frTot.n += x.n; frTot.open += x.open; frTot.hot += x.hot; });
    var days = function (t) { return Math.max(0, Math.round((Math.min(Date.now(), D.hi) - t.created) / DAY)); };
    var h = '<div class="paper"><h1>Park Universe \u2014 ' + esc(mName) + '</h1><p class="sub">Monthly summary for the Master Community Association \u00b7 prepared ' + esc(new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })) + (who() ? " by " + esc(who()) : "") + "</p>" +
      '<div class="facts">' + fact(D.opened.length, "repairs opened") + fact(D.closed.length, "repairs closed") + fact(D.stillOpen.length, "open at month end") + fact(D.storms.length, D.storms.length === 1 ? "snow event" : "snow events") +
      fact(D.tests.length, "backflow tests") + fact(D.planted.length, "trees planted") + fact(D.removed.length, "trees removed") + fact(D.photographed, "items photographed") + "</div>" +
      "<h2>Repairs closed</h2>" + (D.closed.length ? "<table><tr><th>Closed</th><th>Park</th><th>Item</th><th>Work</th><th>By</th><th>Days open</th></tr>" + D.closed.map(function (t) { return '<tr data-task="' + esc(t.id) + '">' + td(niceDay(ymd(t.props.doneAt))) + td(t.park) + td(item(t)) + "<td>" + esc(t.label) + (t.notes ? '<div style="color:#4b5563">' + esc(t.notes) + "</div>" : "") + '<div class="pair"></div></td>' + td(t.props.doneBy || t.props.assignee || "") + td(Math.max(0, Math.round((t.props.doneAt - t.created) / DAY))) + "</tr>"; }).join("") + "</table>" : '<p class="none">No repairs were closed this month.</p>') +
      "<h2>Still open at month end</h2>" + (D.stillOpen.length ? "<table><tr><th>Opened</th><th>Park</th><th>Item</th><th>Work</th><th>Assigned to</th><th>Priority</th><th>Days open</th></tr>" + D.stillOpen.map(function (t) { return "<tr>" + td(niceDay(ymd(t.created))) + td(t.park) + td(item(t)) + td(t.label) + td((t.props || {}).assignee || "\u2014") + td((t.props || {}).pri || "") + td(days(t)) + "</tr>"; }).join("") + "</table>" : '<p class="none">Nothing was left open.</p>') +
      "<h2>Snow events</h2>" + (D.storms.length ? "<table><tr><th>Storm</th><th>Started</th><th>Length</th><th>Check-offs</th><th>Parks touched</th></tr>" + D.storms.map(function (r) { var tk = ticksOf(r), pk = {}; Object.keys(tk).forEach(function (k) { pk[tk[k].park] = 1; }); return "<tr>" + td(r.label) + td(new Date(r.props.started).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })) + td(r.props.ended ? hours(r.props.started, r.props.ended) : "still open") + td(Object.keys(tk).length) + td(Object.keys(pk).length) + "</tr>"; }).join("") + "</table>" : '<p class="none">No snow events this month.</p>') +
      (D.lists.length ? "<h2>Irrigation checklists worked on</h2><table><tr><th>Checklist</th><th>Park</th><th>Steps done this month</th><th>Overall</th></tr>" + D.lists.map(function (x) { return "<tr>" + td(x.r.label) + td(x.r.park) + td(x.inM) + td(x.done + " of " + x.all) + "</tr>"; }).join("") + "</table>" : "") +
      (D.tests.length ? "<h2>Backflow tests</h2><table><tr><th>Tested</th><th>Park</th><th>Device</th><th>Serial</th><th>Next due</th></tr>" + D.tests.map(function (a) { return "<tr>" + td(niceDay(a.props.lasttest)) + td(a.park) + td(nameOf(a)) + td(a.props.serial || "") + td(a.props.nexttest ? niceDay(a.props.nexttest) : "") + "</tr>"; }).join("") + "</table>" : "") +
      "<h2>Due next month, and overdue now</h2>" + (D.due.length ? "<table><tr><th>Due</th><th>What</th><th>Item</th><th>Park</th></tr>" + D.due.map(function (x) { return "<tr>" + td(niceDay(x.when) + (x.days < 0 ? " (overdue)" : "")) + td(x.what) + td(x.sub) + td(x.park) + "</tr>"; }).join("") + "</table>" : '<p class="none">Nothing is due.</p>') +
      "<h2>Inventory</h2><table><tr><th>Layer</th><th>Mapped at month end</th><th>Added this month</th></tr>" + Object.keys(D.byLayer).map(function (k) { var l = D.byLayer[k]; return "<tr>" + td(l.name) + td(l.n) + td(l.added) + "</tr>"; }).join("") + "</table>" +
      '<p class="sub" style="margin-top:10px">' + D.bad.length + " " + (D.bad.length === 1 ? "item is" : "items are") + " marked as needing repair or out of service today." + (frTot.n ? " Field Reports on this phone: " + frTot.open + " open of " + frTot.n + (frTot.hot ? ", " + frTot.hot + " high priority or safety" : "") + "." : "") + "</p></div>";
    printView("Summary \u00b7 " + mName, h, { file: "Park Universe summary " + ymd(repMonth).slice(0, 7), bar: '<button id="ppPrev" aria-label="Previous month">\u2039</button><button id="ppNext" aria-label="Next month">\u203a</button>',
      after: function (v) {
        v.querySelector("#ppPrev").onclick = function () { monthlySummary(new Date(repMonth.getFullYear(), repMonth.getMonth() - 1, 1)); };
        v.querySelector("#ppNext").onclick = function () { monthlySummary(new Date(repMonth.getFullYear(), repMonth.getMonth() + 1, 1)); };
        /* first "before" and first "after" photo of each closed repair */
        [].forEach.call(v.querySelectorAll("tr[data-task]"), function (tr) { var t = A.byId(tr.getAttribute("data-task")); if (!t || !t.photoCount) return; var after = {}; ((t.props || {}).after || []).forEach(function (x) { after[x] = 1; });
          A.photosOf(t.id).then(function (ph) { ph = ph.slice().reverse(); var b = ph.filter(function (x) { return !after[x.id]; })[0], a2 = ph.filter(function (x) { return after[x.id]; }).pop();
            [[b, "Before"], [a2, "After"]].forEach(function (x) { if (!x[0]) return; A.blobOf(x[0]).then(function (bl) { if (!bl) return; var r = new FileReader(); r.onload = function () { var f = document.createElement("figure"); f.innerHTML = '<img alt=""><figcaption></figcaption>'; f.querySelector("img").src = r.result; f.querySelector("figcaption").textContent = x[1] + " \u00b7 " + new Date(x[0].date).toLocaleDateString(undefined, { month: "short", day: "numeric" }); var box = tr.querySelector(".pair"); if (x[1] === "Before" && box.firstChild) box.insertBefore(f, box.firstChild); else box.appendChild(f); }; r.readAsDataURL(bl); }); }); }); });
      } }); }

  /* ======================================================================
   * 8. THE WORK HUB + DOCK BUTTON
   * ====================================================================== */
  function screenHub() {
    title("Work"); var c = dueCounts(), ot = openTasks(), mine = who() ? ot.filter(function (t) { return (t.props || {}).assignee === who(); }).length : 0, storm = activeStorm(), b = $("opBody"), fr = frIndex(), frOpenN = 0;
    Object.keys(fr.by || {}).forEach(function (k) { frOpenN += fr.by[k].open; });
    var sp = storm ? (function () { var tk = Object.keys(ticksOf(storm)).length; return plural(tk, "check-off") + " so far"; })() : "Check off walks, ramps and routes";
    var tiles = [
      ["due", "\u23f0", "What\u2019s due", c.late ? c.late + " overdue" : c.all ? "next 30 days" : "Tests, trees and task dates", c.all, c.late > 0],
      ["tasks", "\ud83d\udd27", "Tasks", ot.length ? (mine ? mine + " assigned to you" : plural(ot.length, "open repair")) : "Repairs and work orders", ot.length, ot.some(function (t) { return (t.props || {}).pri === "Safety"; })],
      ["storm", "\u2744\ufe0f", storm ? storm.label : "Snow storm", sp, 0, false, !!storm],
      ["irrigation", "\ud83d\udca7", "Irrigation checklists", "Spring startup and fall blowout", 0],
      ["scan", "\ud83d\udcf7", "Scan a tag", "Take a picture of an item\u2019s QR tag", 0],
      ["tags", "\ud83c\udff7", "Print QR tags", "Stickers for benches, backflows, trees\u2026", 0],
      ["summary", "\ud83d\udcc4", "Monthly summary", "One page for the board, as a PDF", 0],
      ["reports", "\ud83d\udcdd", "Field Reports", frOpenN ? frOpenN + " open" : "Report something you saw", frOpenN]];
    b.innerHTML = '<div class="op-tiles" id="hubTiles"></div><p class="src" id="hubWho"></p>';
    tiles.forEach(function (t) { var el = document.createElement("button"); el.className = "op-tile" + (t[6] ? " on" : ""); el.id = "hub_" + t[0];
      el.innerHTML = "<i>" + t[1] + "</i><b></b><small></small><em class=\"" + (t[4] ? (t[5] ? "hot" : "") : "z") + '">' + (t[4] || "") + "</em>"; el.querySelector("b").textContent = t[2]; el.querySelector("small").textContent = t[3];
      el.onclick = function () { go(t[0], true); }; $("hubTiles").appendChild(el); });
    var signed = window.PUSync && PUSync.signedIn && PUSync.signedIn();
    $("hubWho").textContent = signed ? "Signed in as " + (who() || "your team account") + " \u00b7 work syncs to the team" + (ro() ? " \u00b7 view only" : "") : "Not signed in \u00b7 work stays on this phone until you sign in (Menu \u22ee \u2192 Team sync)";
  }
  function go(what, fromHub) { var open = fromHub ? push : start;
    if (what === "due") { dueShowLater = false; open(screenDue()); } else if (what === "tasks") { taskFilter = "open"; open(screenTasks({})); } else if (what === "storm") open(screenStormHome);
    else if (what === "irrigation") open(screenIrrigation); else if (what === "tags") open(screenTags); else if (what === "scan") scan(true); else if (what === "summary") monthlySummary(new Date());
    else if (what === "reports") location.href = "apps/field-reports.html"; else start(screenHub); }
  var dock = document.querySelector(".dock");
  if (dock && !$("dWork")) { var wb = document.createElement("button"); wb.id = "dWork"; wb.innerHTML = '<i>\u2611</i>Work<em class="bdg z" id="dWorkN"></em>'; wb.onclick = function () { if (sheetOpen()) close(); else start(screenHub); };
    dock.insertBefore(wb, $("dApps") || null); }
  function refreshBadges() { var el = $("dWorkN"); if (!el) return; var c = dueCounts(), n = c.late + c.week + openTasks().length, storm = activeStorm();
    el.textContent = storm && !n ? "\u2744" : n; el.className = "bdg" + (n || storm ? (c.late ? " hot" : "") : " z"); }
  var refT = 0;
  function refreshAll() { refreshBadges(); clearTimeout(refT); refT = setTimeout(function () { var card = $("card"); if (card && !card.hidden && window.__pu && PU.selected) { var i = PU.selected(); if (i >= 0 && PU.PL[i]) decorateCard(PU.PL[i], i, card); } }, 60); }
  A.onChange(function () { refreshAll(); });
  A.onPlaces(function () { refreshBadges(); });   /* also runs after every sync */

  /* ======================================================================
   * 9. UPDATE BANNER
   * ====================================================================== */
  function verNum(v) { return String(v || "").split(".").map(function (x) { return parseInt(x, 10) || 0; }); }
  function newer(a, b) { a = verNum(a); b = verNum(b); for (var i = 0; i < Math.max(a.length, b.length); i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0); } return false; }
  function myVersion() { try { return window.PoolBridge && PoolBridge.version ? PoolBridge.version() : ""; } catch (e) { return ""; } }
  function myBuild() { return fetch("build.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }); }
  function showUpdate(label, url) { if ($("opUpd") || LS.get("pu-upd-skip", "") === label) return; var d = document.createElement("div"); d.className = "op-upd"; d.id = "opUpd";
    d.innerHTML = '<span></span><button id="opUpdGo">Update</button><button class="x2" id="opUpdX" aria-label="Not now">\u2715</button>'; d.querySelector("span").textContent = "A newer Park Universe is ready (" + label + ").";
    document.body.appendChild(d); $("opUpdGo").onclick = function () { PU.toast("Downloading\u2026 open the file when it finishes, then tap Install.", 6000); location.href = url; };
    $("opUpdX").onclick = function () { LS.set("pu-upd-skip", label); d.remove(); }; }
  function checkUpdate(manual) {
    if (!window.BombaNative || !window.fetch || navigator.onLine === false) { if (manual) PU.toast(window.BombaNative ? "You\u2019re offline. Try again with signal." : "Updates are for the phone app. This web page is always the newest."); return; }
    if (!manual && Date.now() - LS.get("pu-upd-at", 0) < 6 * 3600000) return; LS.set("pu-upd-at", Date.now()); if (manual) LS.set("pu-upd-skip", "");
    var mine = myVersion();
    myBuild().then(function (bj) { var myRun = +bj.run || 0;
      return fetch("https://api.github.com/repos/" + REPO + "/releases/latest", { headers: { Accept: "application/vnd.github+json" } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (rel) {
        var apk = rel && (rel.assets || []).filter(function (x) { return /\.apk$/i.test(x.name); })[0];
        if (apk) { var m = /^v?([\d.]+)(?:-b(\d+))?/.exec(rel.tag_name || ""), v = m ? m[1] : "", run = m && m[2] ? +m[2] : 0;
          if ((v && mine && newer(v, mine)) || (run && myRun && run > myRun && !newer(mine, v))) { showUpdate("version " + v + (run ? ", build " + run : ""), apk.browser_download_url); return true; }
          if (manual) PU.toast("You have the newest version (" + (mine || "?") + (myRun ? ", build " + myRun : "") + ")."); return true; }
        return false; })
      .then(function (handled) { if (handled) return;
        /* no published release yet: compare with the version in the repo and point at the build page */
        return fetch("https://raw.githubusercontent.com/" + REPO + "/main/Orbit/app/build.gradle", { cache: "no-store" }).then(function (r) { return r.ok ? r.text() : ""; }).then(function (t) { var m = /versionName\s+'([^']+)'/.exec(t);
          if (m && mine && newer(m[1], mine)) showUpdate("version " + m[1], "https://github.com/" + REPO + "/actions"); else if (manual) PU.toast("You have the newest version (" + (mine || "?") + ")."); }); });
    }).catch(function () { if (manual) PU.toast("Couldn\u2019t check for updates. Try again later."); }); }
  var menu = $("menu"), anchor = $("mHome");
  if (menu && anchor && !$("mUpd")) { var mw = document.createElement("button"); mw.id = "mWork"; mw.setAttribute("role", "menuitem"); mw.innerHTML = "<i>\u2611</i>Work\u2026"; mw.onclick = function () { start(screenHub); }; menu.insertBefore(mw, $("mLayers") || anchor);
    var mu = document.createElement("button"); mu.id = "mUpd"; mu.setAttribute("role", "menuitem"); mu.innerHTML = "<i>\u2b06</i>Check for update"; mu.onclick = function () { menu.hidden = true; checkUpdate(true); }; menu.insertBefore(mu, anchor.nextSibling); }

  /* ---------------- start ---------------- */
  function hashGo() { var h = location.hash || ""; if (!h || h === "#") return; var m;
    if (h === "#due") go("due"); else if (h === "#tasks") go("tasks"); else if (h === "#storm") go("storm"); else if (h === "#work") go("hub");
    else if ((m = /^#asset=(.+)$/.exec(h))) { var a = A.byId(decodeURIComponent(m[1])); if (a) A.openAsset(a.id, true); else return; } else return;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} }
  window.bombaOpen = function (what) { go(what === "due" || what === "tasks" || what === "storm" ? what : "hub"); };
  window.addEventListener("hashchange", hashGo);
  window.PUOps = { open: function (w) { go(w || "hub"); }, decorateCard: decorateCard, dueList: dueList, dueCounts: dueCounts, tasks: tasks, newTask: newTask, activeStorm: activeStorm, steps: steps, coverage: coverage, checklist: checklist,
    printTags: printTags, scan: scan, tagId: tagId, tagText: tagText, decodeImage: decodeImage, monthlySummary: monthlySummary, summaryData: summaryData, checkUpdate: checkUpdate, newer: newer, refresh: refreshAll, close: close };
  (A.ready || Promise.resolve()).then(function () { refreshBadges(); hashGo(); setTimeout(dueNotify, 5000); setTimeout(function () { checkUpdate(false); }, 9000);
    /* on the web (no phone app) there is nothing to see until you sign in */
    setTimeout(function () { if (!window.BombaNative && window.PUSync && PUSync.signedIn && !PUSync.signedIn() && !things().length && !LS.get("pu-web-asked", 0)) { LS.set("pu-web-asked", 1); PUSync.open(); PU.toast("Sign in to see your team\u2019s map.", 5000); } }, 2500); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { refreshBadges(); dueNotify(); checkUpdate(false); } });
})();
