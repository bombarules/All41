/* Park Universe team sync (Supabase)
 * Sign in -> every item and photo syncs to the cloud and to every teammate's phone, live.
 * Works offline: changes wait on the phone and upload when signal returns.
 * Roles: admin (everything + people), editor (add/change), viewer (look only), pending (waiting for approval).
 * Also: back up everything to a file (save it to OneDrive) and restore from one.
 */
(function () {
  "use strict";
  var URL_ = "https://obfembzzqikqufuyniuc.supabase.co";
  var KEY = "sb_publishable_0V-jBlBehb8fOwx-W_A6pg_lejmjqxs";
  var FN = URL_ + "/functions/v1/pu-admin";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var LS = { get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  var toast = function (t, ms) { if (window.PU && PU.toast) PU.toast(t, ms); };
  var A = function () { return window.PUAssets && PUAssets._sync; };

  var sb = null, session = null, profile = null, busy = false, again = false, timer = 0, live = null, lastErr = "", lastSync = LS.get("pu-sync-at", 0), online = navigator.onLine !== false;
  function client() {
    if (!sb && window.supabase && supabase.createClient) sb = supabase.createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "pu-auth" } });
    return sb;
  }
  function role() { return profile ? profile.role : null; }
  function canWrite() { return role() === "admin" || role() === "editor"; }
  function canRead() { return canWrite() || role() === "viewer"; }

  /* ---------------- status ---------------- */
  function pendingCount() { var a = A(); if (!a) return 0; var n = a.all().filter(function (x) { return x.dirty !== false; }).length; return n + LS.get("pu-del", []).length; }
  function ago(t) { if (!t) return "never"; var s = Math.round((Date.now() - t) / 1000); return s < 60 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : new Date(t).toLocaleDateString(); }
  function statusText() {
    if (!session) return "Not signed in \u00b7 data stays on this phone";
    if (!profile) return "Signing in\u2026";
    if (role() === "pending") return "Waiting for an admin to approve you";
    if (busy) return "Syncing\u2026";
    var p = pendingCount();
    if (!online) return "Offline \u00b7 " + p + " change" + (p === 1 ? "" : "s") + " waiting";
    if (lastErr) return "Sync problem: " + lastErr;
    return "Synced " + ago(lastSync) + (p && canWrite() ? " \u00b7 " + p + " waiting" : "") + (role() === "viewer" ? " \u00b7 view only" : "");
  }
  var statusCbs = [];
  function emit() { var t = statusText(); statusCbs.forEach(function (f) { try { f(t); } catch (e) {} }); var el = $("syStatus"); if (el) el.textContent = t; }

  /* ---------------- rows <-> items ---------------- */
  function toRow(a) { var s = A(); return { id: a.id, layer: s.layerOf(a), type: a.type, park: a.park || null, lng: a.lng == null ? null : a.lng, lat: a.lat == null ? null : a.lat, acc: a.acc == null ? null : a.acc,
    coords: a.coords || null, cond: a.cond || null, label: a.label || null, notes: a.notes || null, props: a.props || {}, photo_count: a.photoCount || 0,
    last_photo: a.lastPhoto ? new Date(a.lastPhoto).toISOString() : null, deleted: false, created_at: new Date(a.created || Date.now()).toISOString() }; }
  function fromRow(r) { return { id: r.id, type: r.type, park: r.park || "", lng: r.lng, lat: r.lat, acc: r.acc, coords: r.coords || undefined, cond: r.cond || undefined, label: r.label || "", notes: r.notes || "",
    props: r.props || {}, photoCount: r.photo_count || 0, lastPhoto: r.last_photo ? Date.parse(r.last_photo) : null, created: Date.parse(r.created_at), updated: Date.parse(r.updated_at), dirty: false, synced: true }; }

  /* ---------------- sync ---------------- */
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(syncNow, ms == null ? 2500 : ms); }
  function syncNow() {
    if (!session || !canRead() || !online) { emit(); return Promise.resolve(); }
    if (busy) { again = true; return Promise.resolve(); }
    busy = true; emit();
    var p = canWrite() ? push() : Promise.resolve();
    return p.then(pull).then(function () { lastSync = Date.now(); LS.set("pu-sync-at", lastSync); lastErr = ""; })
      .catch(function (e) { lastErr = /failed to fetch|network/i.test(String(e && e.message || e)) ? "can't reach the server" : String(e && e.message || e).slice(0, 80); })
      .then(function () { busy = false; emit(); if (again) { again = false; schedule(500); } });
  }
  function chunk(a, n) { var o = []; for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
  function push() {
    var s = A(), dirty = s.all().filter(function (x) { return x.dirty !== false; }), stamps = {};
    dirty.forEach(function (x) { stamps[x.id] = x.updated; });
    var seq = Promise.resolve();
    chunk(dirty, 200).forEach(function (part) { seq = seq.then(function () { return sb.from("items").upsert(part.map(toRow)).then(function (r) { if (r.error) throw r.error;
      return Promise.all(part.map(function (x) { return s.markClean(x.id, stamps[x.id]); })); }); }); });
    seq = seq.then(function () { var del = LS.get("pu-del", []); if (!del.length) return;
      return sb.from("items").upsert(del.map(function (d) { return { id: d.id, layer: d.layer, type: d.type, deleted: true }; })).then(function (r) { if (r.error) throw r.error;
        var now = LS.get("pu-del", []); LS.set("pu-del", now.slice(del.length)); }); });
    seq = seq.then(function () { return s.photos(); }).then(function (ps) {
      var todo = ps.filter(function (p) { return p.synced === false || (p.synced == null && p.blob); }), q = Promise.resolve();
      todo.forEach(function (p) { q = q.then(function () { var path = p.asset + "/" + p.id + ".jpg";
        return sb.storage.from("pu-photos").upload(path, p.blob, { contentType: "image/jpeg", upsert: true }).then(function (r) { if (r.error) throw r.error;
          return sb.from("photos").upsert({ id: p.id, item_id: p.asset, path: path, taken_at: new Date(p.date).toISOString(), lat: p.lat, lng: p.lng, acc: p.acc }); })
          .then(function (r) { if (r.error) throw r.error; p.synced = true; p.path = path; return s.putPhoto(p); }); }); });
      return q; });
    return seq;
  }
  function since(key) { var t = LS.get(key, null); return t ? new Date(Date.parse(t) - 10000).toISOString() : "1970-01-01T00:00:00Z"; }
  function pullTable(table, key, apply) {
    var mark = LS.get(key, null), from = since(key);
    function page(after) {
      return sb.from(table).select("*").gt("updated_at", after).order("updated_at", { ascending: true }).limit(500).then(function (r) {
        if (r.error) throw r.error; var rows = r.data || [], seq = Promise.resolve();
        rows.forEach(function (row) { seq = seq.then(function () { return apply(row); }); if (!mark || row.updated_at > mark) mark = row.updated_at; });
        return seq.then(function () { if (mark) LS.set(key, mark); if (rows.length === 500) return page(rows[rows.length - 1].updated_at); });
      });
    }
    return page(from);
  }
  function pull() {
    var s = A(), touched = false;
    return pullTable("items", "pu-wm-items", function (row) {
      if (row.deleted) return s.removeRemote(row.id).then(function (c) { touched = touched || c; });
      return s.applyRemote(fromRow(row)).then(function (c) { touched = touched || c; });
    }).then(function () { return s.photos(); }).then(function (local) {
      var have = {}, items = {}; local.forEach(function (p) { have[p.id] = p; }); s.all().forEach(function (a) { items[a.id] = 1; });
      return pullTable("photos", "pu-wm-photos", function (row) {
        if (row.deleted) { if (have[row.id]) { touched = true; return s.delPhoto(row.id); } return; }
        if (have[row.id] || !items[row.item_id]) return;   /* skip photos of items that were deleted */
        touched = true;
        return s.putPhoto({ id: row.id, asset: row.item_id, date: Date.parse(row.taken_at), lat: row.lat, lng: row.lng, acc: row.acc, path: row.path, synced: true, blob: null });
      });
    }).then(function () { if (touched) return s.recount().then(function () { s.refresh(); }); });
  }
  function download(path) { if (!sb || !session) return Promise.resolve(null); return sb.storage.from("pu-photos").download(path).then(function (r) { return r.error ? null : r.data; }); }

  function goLive() {
    if (live || !sb) return;
    live = sb.channel("pu-live").on("postgres_changes", { event: "*", schema: "public", table: "items" }, function () { schedule(800); })
      .on("postgres_changes", { event: "*", schema: "public", table: "photos" }, function () { schedule(800); }).subscribe();
  }
  function stopLive() { if (live && sb) { try { sb.removeChannel(live); } catch (e) {} } live = null; }

  /* ---------------- accounts ---------------- */
  function loadProfile() {
    if (!session) { profile = null; return Promise.resolve(); }
    return sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle().then(function (r) {
      profile = r.data || { id: session.user.id, email: session.user.email, role: "pending", name: "" };
      if (window.PUAssets && PUAssets.setReadOnly) PUAssets.setReadOnly(profile.role === "viewer" || profile.role === "pending");
    });
  }
  function afterAuth() { return loadProfile().then(function () { emit(); if (canRead()) { goLive(); return syncNow(); } }); }
  function signIn(email, pw) { return sb.auth.signInWithPassword({ email: String(email).trim().toLowerCase(), password: pw }).then(function (r) { if (r.error) throw r.error; session = r.data.session; return afterAuth(); }); }
  function signOut() { stopLive(); return sb.auth.signOut().catch(function () {}).then(function () { session = null; profile = null; LS.set("pu-wm-items", null); LS.set("pu-wm-photos", null);
    if (window.PUAssets && PUAssets.setReadOnly) PUAssets.setReadOnly(false); emit(); }); }
  function callAdmin(body) {
    var h = { "Content-Type": "application/json", apikey: KEY }; if (session) h.Authorization = "Bearer " + session.access_token;
    return fetch(FN, { method: "POST", headers: h, body: JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return { error: "Server error " + r.status }; }); })
      .then(function (j) { if (j.error) throw new Error(j.error); return j; });
  }

  /* ---------------- backup to a file (OneDrive) ---------------- */
  function b64(blob) { return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(",")[1]); }; r.onerror = function () { res(null); }; r.readAsDataURL(blob); }); }
  function backup(withPhotos) {
    var s = A(); toast("Making the backup\u2026");
    var ids = {}; s.all().forEach(function (a) { ids[a.id] = 1; });
    return s.photos().then(function (ps) {
      ps = ps.filter(function (p) { return ids[p.asset]; });
      var out = { app: "Park Universe", kind: "backup", version: 1, made: new Date().toISOString(), items: s.all().map(function (a) { var c = JSON.parse(JSON.stringify(a)); delete c.dirty; return c; }), photos: [] };
      if (!withPhotos) { out.photos = ps.map(function (p) { return { id: p.id, asset: p.asset, date: p.date, lat: p.lat, lng: p.lng, acc: p.acc, path: p.path || null }; }); return out; }
      var q = Promise.resolve();
      ps.forEach(function (p) { q = q.then(function () { return s.blobOf(p); }).then(function (bl) { return bl ? b64(bl) : null; }).then(function (d) {
        out.photos.push({ id: p.id, asset: p.asset, date: p.date, lat: p.lat, lng: p.lng, acc: p.acc, path: p.path || null, jpeg: d }); }); });
      return q.then(function () { return out; });
    }).then(function (out) {
      var name = "park-universe-backup-" + new Date().toISOString().slice(0, 10) + (withPhotos ? "-with-photos" : "") + ".json", text = JSON.stringify(out);
      if (window.AndroidApp && AndroidApp.saveText) AndroidApp.saveText(name, text);
      else { var b = new Blob([text], { type: "application/json" }), u = URL.createObjectURL(b), l = document.createElement("a"); l.href = u; l.download = name; document.body.appendChild(l); l.click(); setTimeout(function () { URL.revokeObjectURL(u); l.remove(); }, 3000); }
      toast("Choose OneDrive (or any folder) in the save screen.", 4000);
      return { items: out.items.length, photos: out.photos.length };
    });
  }
  function restoreFile(file) {
    var s = A();
    return file.text().then(function (t) { var j = JSON.parse(t); if (!j || j.app !== "Park Universe" || !Array.isArray(j.items)) throw new Error("That isn't a Park Universe backup.");
      var mine = {}; s.all().forEach(function (a) { mine[a.id] = a; }); var added = 0, q = Promise.resolve();
      j.items.forEach(function (a) { var l = mine[a.id]; if (l && (l.updated || 0) >= (a.updated || 0)) return; added++;
        q = q.then(function () { a.dirty = true; return s.applyRemote(Object.assign({}, a, { dirty: true })).then(function () { return null; }); }); });
      return q.then(function () { return s.photos(); }).then(function (ps) { var have = {}; ps.forEach(function (p) { have[p.id] = 1; }); var pq = Promise.resolve(), np = 0;
        (j.photos || []).forEach(function (p) { if (have[p.id]) return; np++;
          pq = pq.then(function () { var blob = null; if (p.jpeg) { var bin = atob(p.jpeg), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); blob = new Blob([u8], { type: "image/jpeg" }); }
            return s.putPhoto({ id: p.id, asset: p.asset, date: p.date, lat: p.lat, lng: p.lng, acc: p.acc, path: p.path, blob: blob, synced: blob ? false : !!p.path }); }); });
        return pq.then(function () { return s.recount(); }).then(function () { s.refresh(); schedule(300); return { items: added, photos: np }; }); });
    });
  }

  /* ---------------- UI ---------------- */
  var st = document.createElement("style");
  st.textContent = ".sy-badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:800;padding:3px 10px;border-radius:99px;background:rgba(255,255,255,.08);text-transform:capitalize}" +
    ".sy-badge.admin{background:#7c3aed;color:#fff}.sy-badge.editor{background:#0e7490;color:#fff}.sy-badge.viewer{background:#475569;color:#fff}.sy-badge.pending{background:#a16207;color:#fff}" +
    ".sy-status{margin:8px 0 2px;font-size:13.5px;color:var(--mut)}.sy-user{display:grid;grid-template-columns:1fr auto;gap:4px 8px;align-items:center;padding:10px 2px;border-bottom:1px solid var(--line)}" +
    ".sy-user b{font-size:14.5px}.sy-user small{color:var(--mut);display:block}.sy-user select{padding:7px 8px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.07);color:var(--ink)}" +
    ".sy-user .ub{grid-column:1/-1;display:flex;gap:6px}.sy-user .ub button{flex:1;padding:7px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.05);font-size:12.5px;font-weight:700}" +
    ".sy-err{color:#ff8a80;font-size:13px;margin:6px 0}.sy-link{background:none;border:0;color:#7cc0ff;font-weight:700;padding:8px 0;font-size:13.5px}";
  document.head.appendChild(st);
  var shell = document.createElement("div");
  shell.innerHTML = '<div class="as-sheet glass" id="sySheet" hidden role="dialog" aria-label="Team sync"><div class="hd2"><h3 id="syT">Team sync</h3><button class="x" style="position:static" id="syX" aria-label="Close">&#10005;</button></div><div class="as-body" id="syBody"></div></div>';
  document.body.appendChild(shell);
  function show(on) { $("sySheet").hidden = !on; var sc = $("asScrim"); if (sc) sc.hidden = !on; }
  $("syX").onclick = function () { show(false); };
  function field(id, label, type, ph, extra) { return '<div class="as-f"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + (type || "text") + '" placeholder="' + (ph || "") + '" ' + (extra || "") + "></div>"; }
  function open() { if (window.PU && PU.closeAll) PU.closeAll(); show(true); render(); }
  function render() {
    var b = $("syBody");
    if (!client()) { b.innerHTML = '<p class="sy-err">The sync library didn\u2019t load. Reopen Park Universe.</p>'; return; }
    if (!session) {
      $("syT").textContent = "Sign in to your team";
      b.innerHTML = '<p class="mut" style="margin:0 0 6px">Sign in so everything you map is saved to the cloud and shared with your team. Without signing in, data stays on this phone only.</p>' +
        field("syEmail", "Email", "email", "you@mca80238.com", 'autocomplete="username"') + field("syPw", "Password", "password", "", 'autocomplete="current-password"') +
        '<div class="sy-err" id="syErr" hidden></div><div class="as-act"><button class="p" id="syIn">Sign in</button></div>' +
        '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><button class="sy-link" id="syForgot">Forgot password?</button><button class="sy-link" id="syBoot">Owner setup or new password</button></div>' + backupBlock();
      $("syIn").onclick = function () { var e = $("syEmail").value, p = $("syPw").value; if (!e || !p) return err("Enter your email and password.");
        this.disabled = true; signIn(e, p).then(function () { toast("Signed in."); render(); }, function (x) { err(/invalid/i.test(x.message) ? "Wrong email or password." : x.message); $("syIn").disabled = false; }); };
      $("syBoot").onclick = renderBoot; $("syForgot").onclick = renderForgot; wireBackup(); return;
    }
    $("syT").textContent = "Team sync";
    var r = role() || "pending";
    b.innerHTML = '<div style="display:flex;align-items:center;gap:10px"><div style="flex:1;min-width:0"><b style="font-size:16px">' + esc(profile && profile.name || session.user.email) + '</b><div class="mut" style="font-size:13px">' + esc(session.user.email) + '</div></div><span class="sy-badge ' + r + '">' + r + '</span></div>' +
      '<p class="sy-status" id="syStatus">' + esc(statusText()) + '</p>' +
      (r === "pending" ? '<p class="mut">An admin needs to approve your account before you can see the team\u2019s maps. Ask them to open Team sync \u2192 People.</p>' : '<div class="as-act"><button class="p" id="syNow">\u21bb Sync now</button></div>') +
      (r === "admin" ? '<div class="as-sec">People</div><div id="syUsers"><div class="mut">Loading\u2026</div></div><div class="as-sec">Add a person</div>' +
        field("syNName", "Name", "text", "First Last") + field("syNEmail", "Email", "email", "name@mca80238.com") + field("syNPw", "Starting password (8+ characters)", "text", "", 'autocomplete="off"') +
        '<div class="as-f"><label for="syNRole">Role</label><select id="syNRole"><option value="editor">Editor \u2014 can add and change</option><option value="viewer">Viewer \u2014 look only</option><option value="admin">Admin \u2014 everything + people</option></select></div>' +
        '<div class="sy-err" id="syErr" hidden></div><div class="as-act"><button class="p" id="syAdd">Add person</button></div><p class="src">Give them the email and starting password. They sign in from Team sync on their phone.</p>' : "") +
      backupBlock() + '<div class="as-act"><button class="d" id="syOut">Sign out</button></div>';
    if ($("syNow")) $("syNow").onclick = function () { syncNow().then(render); };
    $("syOut").onclick = function () { signOut().then(render); };
    wireBackup();
    if (r === "admin") { loadUsers(); $("syAdd").onclick = addPerson; }
  }
  function friendly(t) { return /failed to fetch|network|load failed|networkerror/i.test(String(t)) ? "Can't reach the server \u2014 check your connection and try again." : t; }
  function err(t) { var e = $("syErr"); if (e) { e.textContent = friendly(t); e.hidden = !t; } }
  function backupBlock() { return '<div class="as-sec">Backup (OneDrive)</div><div class="as-act"><button id="syBk">\u2b07 Back up everything</button><button id="syBkP">\u2b07 Back up with photos</button><button id="syRs">\u2b06 Restore a backup</button></div>' +
    '<p class="src">The backup saves to any folder you pick, including OneDrive. Restore adds anything missing from this phone.</p>'; }
  function wireBackup() {
    $("syBk").onclick = function () { backup(false); }; $("syBkP").onclick = function () { backup(true); };
    $("syRs").onclick = function () { var i = document.createElement("input"); i.type = "file"; i.accept = "application/json,.json"; i.style.display = "none"; document.body.appendChild(i);
      i.onchange = function () { if (i.files && i.files[0]) restoreFile(i.files[0]).then(function (n) { toast("Restored " + n.items + " items and " + n.photos + " photos."); }, function (x) { toast(x.message || "Couldn't read that backup."); }); };
      i.click(); setTimeout(function () { i.remove(); }, 60000); };
  }
  function renderForgot() {
    $("syT").textContent = "Forgot password";
    $("syBody").innerHTML = '<p class="mut" style="margin:0 0 6px">Enter your email. Your admin will see the request in Team sync, set a new password and tell you what it is.</p>' +
      field("syFEmail", "Email", "email", "you@mca80238.com") + '<div class="sy-err" id="syErr" hidden></div><p class="mut" id="syFDone" hidden style="color:#4ee1a0">Request sent. Ask your admin to check Team sync \u2192 People.</p>' +
      '<div class="as-act"><button class="p" id="syFGo">Ask an admin for a new password</button><button id="syFBack">Back</button></div>' +
      '<p class="src">Are you an owner (dchagolla@mca80238.com or bombarules@gmail.com)? Use <b>Owner setup or new password</b> with the setup code to set a new password yourself.</p>';
    $("syFBack").onclick = render;
    $("syFGo").onclick = function () { var e = $("syFEmail").value.trim(); if (!e) return err("Enter your email."); var btn = this; btn.disabled = true;
      callAdmin({ action: "request_reset", email: e }).then(function () { err(""); $("syFDone").hidden = false; }, function (x) { err(x.message); btn.disabled = false; }); };
  }
  function renderBoot() {
    $("syT").textContent = "Owner setup or new password";
    $("syBody").innerHTML = '<p class="mut" style="margin:0 0 6px">For the owner emails only. Enter the setup code and choose a password. The first time, this makes your admin account; after that it sets a new password if you forgot yours.</p>' +
      field("syCode", "Setup code", "text", "XXXX-XXXX-XXXX", 'autocapitalize="characters" autocomplete="off"') + field("syBName", "Your name", "text", "") +
      field("syBEmail", "Owner email", "email", "") + field("syBPw", "New password (8+ characters)", "password", "", 'autocomplete="new-password"') + field("syBPw2", "Repeat password", "password", "", 'autocomplete="new-password"') +
      '<div class="sy-err" id="syErr" hidden></div><div class="as-act"><button class="p" id="syBGo">Save and sign in</button><button id="syBBack">Back</button></div>';
    $("syBBack").onclick = render;
    $("syBGo").onclick = function () { var c = $("syCode").value, e = $("syBEmail").value.trim().toLowerCase(), p = $("syBPw").value;
      if (p !== $("syBPw2").value) return err("The passwords don't match."); if (p.length < 8) return err("Use at least 8 characters.");
      this.disabled = true; var btn = this;
      var wasReset = false;
      callAdmin({ action: "bootstrap", code: c, email: e, password: p, name: $("syBName").value }).then(function (r) { wasReset = !!r.reset; return signIn(e, p); })
        .then(function () { toast(wasReset ? "New password saved. You're signed in." : "Admin account ready. You're signed in."); render(); }, function (x) { err(x.message); btn.disabled = false; }); };
  }
  function loadUsers() {
    sb.from("profiles").select("*").order("role").order("email").then(function (r) {
      var box = $("syUsers"); if (!box) return; if (r.error) { box.innerHTML = '<div class="sy-err">' + esc(r.error.message) + "</div>"; return; }
      box.innerHTML = "";
      (r.data || []).forEach(function (u) { var d = document.createElement("div"); d.className = "sy-user"; var meRow = session && u.id === session.user.id;
        d.innerHTML = '<div><b></b><small></small></div><select aria-label="Role"><option value="admin">Admin</option><option value="editor">Editor</option><option value="viewer">Viewer</option><option value="pending">Pending</option></select>' +
          (meRow ? "" : '<div class="ub"><button class="pw">Reset password</button><button class="rm">Remove</button></div>');
        d.querySelector("b").textContent = (u.reset_requested_at ? "\ud83d\udd11 " : "") + (u.name || u.email); d.querySelector("small").textContent = u.email + (meRow ? " (you)" : "") + (u.reset_requested_at ? " \u00b7 asked for a new password" : "");
        if (u.reset_requested_at && !meRow) d.style.background = "rgba(234,179,8,.10)";
        var sel = d.querySelector("select"); sel.value = u.role; sel.disabled = meRow;
        sel.onchange = function () { sb.from("profiles").update({ role: sel.value }).eq("id", u.id).then(function (x) { toast(x.error ? x.error.message : (u.name || u.email) + " is now " + sel.value + "."); }); };
        if (!meRow) {
          d.querySelector(".pw").onclick = function () { var p = prompt("New password for " + u.email + " (8+ characters)"); if (!p) return;
            callAdmin({ action: "set_password", user_id: u.id, password: p }).then(function () { toast("Password changed. Tell " + (u.name || u.email) + "."); loadUsers(); }, function (x) { toast(x.message); }); };
          if (u.reset_requested_at) { var pb = d.querySelector(".pw"); pb.textContent = "\ud83d\udd11 Set new password"; pb.style.borderColor = "#eab308"; }
          d.querySelector(".rm").onclick = function () { if (!confirm("Remove " + u.email + " from Park Universe?")) return;
            callAdmin({ action: "delete_user", user_id: u.id }).then(function () { toast("Removed."); loadUsers(); }, function (x) { toast(x.message); }); };
        }
        box.appendChild(d); });
    });
  }
  function addPerson() {
    var name = $("syNName").value, email = $("syNEmail").value, pw = $("syNPw").value, r = $("syNRole").value;
    if (!email || pw.length < 8) return err("Enter an email and a starting password of 8+ characters.");
    err(""); $("syAdd").disabled = true;
    callAdmin({ action: "create_user", name: name, email: email, password: pw, role: r }).then(function () { toast(email + " added as " + r + "."); render(); },
      function (x) { err(x.message); $("syAdd").disabled = false; });
  }

  /* ---------------- start ---------------- */
  function start() {
    if (!client()) { emit(); return; }
    sb.auth.getSession().then(function (r) { session = r.data && r.data.session || null; return session ? afterAuth() : emit(); }).catch(function () { emit(); });
    sb.auth.onAuthStateChange(function (ev, s) { if (ev === "TOKEN_REFRESHED" || ev === "SIGNED_IN") session = s; if (ev === "SIGNED_OUT") { session = null; profile = null; emit(); } });
    if (window.PUAssets && PUAssets.onChange) PUAssets.onChange(function () { if (session && canWrite()) schedule(); else emit(); });
    window.addEventListener("online", function () { online = true; schedule(300); });
    window.addEventListener("offline", function () { online = false; emit(); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden && session) schedule(400); });
    setInterval(function () { if (session && !document.hidden) syncNow(); else emit(); }, 60000);
  }
  window.PUSync = { open: open, syncNow: syncNow, status: statusText, onStatus: function (f) { statusCbs.push(f); }, download: download, role: role, backup: backup, restoreFile: restoreFile,
    signIn: function (e, p) { return signIn(e, p); }, signOut: signOut, _state: function () { return { session: !!session, profile: profile, busy: busy, lastErr: lastErr }; }, _client: function () { return sb; } };
  if (window.PUAssets && PUAssets.ready) PUAssets.ready.then(start); else start();
})();
