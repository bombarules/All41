# All41

Everything for Bomba Live in one place. Each app has its own folder, so you
can update one without touching the others.

| Folder | What it is |
|---|---|
| `Orbit/` | The Park Universe Android app: a 3D map home of all 72 Central Park parks and 7 pools with fly-overs, plus the app drawer, Live screens and phone sharing |
| `bomba-live/` | The Overlook / Bomba Live web page for computers, phones and tablets |
| `OverLook/` | `bomba-wall.js` to add to OverLook when it's wired in |

All of them join the same wall: same wall code = same screens. See CONNECTING.md.

## Get the Park Universe app
- **Easiest:** on the phone, open the repo's **Releases** → newest → tap **ParkUniverse.apk** → Install.
- Or: Actions tab → newest green run → download **ParkUniverse-apk** → unzip → install `app-debug.apk`.
- Once v2.7 is on a phone it tells you when a newer build is ready (see "Update banner" below).

## Update later
- Edit any file on GitHub (open it → pencil icon → Commit). The app rebuilds by itself.
- Or upload a new `All41.zip` to the main page of the repo; it unpacks itself and rebuilds.
- `bomba-wall.js` is in three places (Orbit assets, bomba-live, OverLook). Keep them identical.
  The build checks this and stops with a clear message if one copy is different.
- The build recipe (`.github/workflows/build.yml`) is the one file a zip upload never changes. Edit it on GitHub by hand.

## The 3D map (Park Universe home)
- **Bubble 3D** (default): Bubble's Mapbox street map tilted into 3D with standing buildings, the same coloured park dots and names, low-poly trees and the park models.
- **Realistic 3D**: Mapbox's real 3D buildings, trees, roads, shops and companies.
  **Satellite** (menu ⋮): aerial photo with 3D buildings, plus low-poly trees grown from the real parks and streets.
- Every park and pool has a MetroGovernor-style 3D model built from its real amenity list in Bubble
  (benches, playgrounds, courts, pergolas, grills, fire pits, garden plots and more). Lamps glow at night.
- **Fly over** tours all 79 places; the Places list can tour just pools, saved places or a filter.
- Files: `Orbit/app/src/main/assets/index.html` (map, parks and pools lists), `parks3d.js` (3D models),
  `assets.js` (asset inventory), `vendor/` (Mapbox + three.js, built in).
- To add or fix a park: edit `var P=` (parks) or `var POOLS=` (pools) in `index.html`.
- The Mapbox key must allow `https://bombarules.github.io` (same key as Bubble). The app loads its pages
  from that address inside the phone.

## Asset inventory
- 17 types: bench, trash can, dog station, BBQ grill, bathroom, fire pit, fountain, light, mailbox,
  newspaper box, picnic table, playground, athletic field, park sign, structure, flower pot, other.
- **Add**: Assets → ＋ Add (or a park's card → ＋ Add asset) → pick the type → stand next to it and
  **Save GPS spot** (live accuracy shown; wait for "good" or "excellent") or tap the map.
- Each asset: map icon (red ring = needs repair / out of service), 3D model, condition, name/ID tag,
  notes, and a dated photo history (camera photos are also saved to the phone's Pictures/Park Universe).
- **Place on satellite map** / **Move on satellite map**: the real satellite photo opens straight down at full zoom
  with a + crosshair. Drag the map until the + sits on the item, then **Place here**. **My GPS** jumps the + to
  where you're standing; **Street map** switches the background. Park pins (📍 on a park card) work the same way.
- **Update GPS here** re-captures the location; **Export** gives a spreadsheet (CSV) or map file (GeoJSON).
- Everything is stored on the phone. Export regularly to keep a copy.

## App tray (Apps button)
All41 apps with 3D icons, then your phone apps: Live screens (bomba-live), Metro Governor,
PoolCommand (ParkCommand), Pool Plant 3D (AquaticsTech), Aquatics Tech, VoluntTold, Field Reports.
They live in `Orbit/app/src/main/assets/apps/` and all work offline.

## Park layers (v1.8)
Each park card has tabs: **Assets, Trees, Irrigation, Fields, Snow**, plus **⬇ Map**.
A tab opens a top-down map of the park with that layer's tools along the bottom.
- **Points** (heads, trees, backflow, gear…): tap the tool, then tap the map to drop as many as you need.
  Tap the tool again to stop. Press and hold any point to drag it. Tap a point to edit it.
- **Lines** (laterals, mainline, plow routes) and **outlines** (ball fields, batting cages, snow areas):
  tap along the line or around the outline; a ruler shows feet / square feet / acres. Undo, ＋ Point at +, Satellite.
- **Irrigation**: sprinkler heads (red, sized by type, with zone, nozzle and throw radius shown as a coverage circle),
  backflow devices (turquoise, test dates), timer clocks (yellow), zone valves, quick couplers,
  lateral lines (blue) and mainline (dark blue) with pipe size and material.
- **Trees**: species, caliper, height, tag, planted date, replacement date, health (red ring = poor or dead),
  dated photo history. Stumps and planting sites too. Real trees appear in 3D sized by caliper.
- **Fields**: ball field and batting cage outlines (quick names: West, Burnett, East, Practice, Batting cages);
  decorative 3D trees disappear inside them. Field gear: bases, portable cages, paint, chalk, drag screens,
  spike drags, racks, tampers, paint machines.
- **Snow** (also the ❄ button on a park card): sidewalks to shovel and plow routes (lines), handicap ramps,
  mailboxes, entrance gates, exit gates, steps, ice-melt spots and other shovel spots (points), parking lots,
  snow storage and do-not-plow areas (outlines). Each has method (shovel, plow, blower, ice melt), ice melt yes/no
  and priority. **Rules** opens the snow guidelines page for that park.
- While mapping in any tab the header, 3D park models and decorative 3D trees are hidden for a clean top-down view.
- **Menu ⋮ → Map layers**: switch each layer, the 3D models, decorative trees and park names on or off.
- **⬇ Map / Menu → Download map**: pick a park and layers; save a map image (PNG, with legend, scale bar and
  north arrow), the map data (GeoJSON for GIS) or a spreadsheet (CSV).

## Team sync (v2.0) — Supabase project "ParkUniverse"
Menu ⋮ → **Team sync**.
- **First time (owners only):** "First-time owner setup", enter the setup code, your owner email
  (dchagolla@mca80238.com or bombarules@gmail.com) and a password. That makes your admin account.
  Anything already on that phone uploads automatically.
- **Add people (admins):** Team sync → Add a person: name, email, starting password, role.
  They sign in from Team sync on their own phone. Roles: Admin (everything + people), Editor (add/change),
  Viewer (look only), Pending (sees nothing until approved). Change roles, reset passwords or remove people anytime.
- **Syncing:** every item and photo in every layer uploads and appears on everyone's phone, live.
  Offline changes wait on the phone and upload when signal returns. Photos from teammates download when opened.
- **Backup (OneDrive):** "Back up everything" or "Back up with photos" saves one file; pick OneDrive in the
  save screen. "Restore a backup" adds anything missing from the phone.
- **Forgot password:** crew tap "Forgot password?" on the sign-in screen; admins see a 🔑 next to them in People and
  tap "Set new password". Owners use "Owner setup or new password" with the setup code to reset their own.
- Server pieces: tables `profiles`, `items`, `photos`; private storage bucket `pu-photos`; edge function `pu-admin`.
  Row-level security enforces the roles on the server.

## Properties (v2.1)
84 places: the original 79 plus West Baseball Field (2500 Dayton St, Aurora — exact GPS), East Baseball Field
(9901 E 25th Ave, Aurora), Burnett Baseball Field (exact GPS), The Cube (8371 E Northfield Blvd) and
MCA Office (8351 E Northfield Blvd). East field, The Cube and MCA Office find their exact spot from the address the
first time the app is online. To add more: Places → ＋ Property (name, type, address, amenities, optional MCA page),
then use GPS or line up the + on the satellite map. Edit or delete with ✎ on the property's card.
Added properties sync to the whole team.

## Turning parks and assets (v2.2)
Park card → 📍 opens "line up the + and turn": drag the map to put the + on the real spot and use ⟲ 15° / 15° ⟳
until the 3D model matches (it follows the + and turns live). Place here saves the spot and direction; Cancel puts it back.
Moved/turned original parks are saved as team-synced park pins. Asset cards have Direction buttons (15°/45°) and
"Move / turn on map". If satellite photos don't load, the app shows the reason and the menu status line keeps it.

## Baseball diamonds (v2.3)
Burnett, East, West and Practice fields (anything with "baseball" or "softball" in the name or amenities)
show as 3D baseball diamonds: outfield fan and fence, skinned infield, grass infield, bases, home plate, mound,
foul lines, backstop, dugout benches and bleachers. On any sports field, 📍 → "⚾ Diamond / ▭ Rectangle" switches
the shape; ⟲ ⟳ aims home plate. The choice syncs to the team.
- Practice Field (v2.4): baseball diamond with two batting cage lanes attached parallel to the third-base line
  (turf, frame, batter's mat, pitching machine). Starts as an approximate pin near E 26th Ave & Elmira St, Aurora:
  tap 📍 to place and turn it. Any diamond field whose amenities include "Batting cages" gets cages.
- Practice Field (v2.5): "Infield only" style — all-dirt infield, no outfield or outfield fence; batting cages right beside
  the dirt along the third-base line. Shape button on any sports field cycles ⚾ Diamond → ◆ Infield only → ▭ Rectangle.
  Ball fields and cages are no-tree zones for every park's 3D trees.
- v2.6: batting cages start at third base and run outward parallel to the left-field line, in foul ground.
  West Baseball Field faces northeast (home plate southwest); Practice Field sits just past West's outfield fence,
  home plate at its northeast corner with the infield facing West (approximate until placed with 📍).

## Work (v2.7)
The **Work** button in the bottom bar (also Menu ⋮ → Work). The number on it is what's overdue, due this week and open tasks.
Everything here is saved as ordinary items, so it syncs to the team, backs up and restores like assets do. Nothing new on the server.
- **What's due**: backflow tests (the "Next test due" date, or a year after "Last test"), tree replacement and plant-by dates,
  and task due dates, for every place, grouped overdue / next 7 days / next 30 days. **Tested today** on a backflow sets
  last test to today and next test a year out. **CSV** exports the list. Once a day the phone shows one notification if
  anything is overdue or due this week; tapping it opens the list.
- **Tasks**: marking an item Needs repair, Out of service, Leaking, Needs replacing, Missing (or a tree Dead) opens a
  repair task by itself. Or add one from an item's card (🔧 Repair task) or the Tasks list. Each task: who it's for, due date,
  priority (Normal / High / Safety), notes, before and after photos, status (Open → In progress → Done). Closing a task
  offers to set the item back to Good and take the after photo. An item's card shows its open tasks and past repairs.
- **Snow storm**: Start storm when crews head out. Every sidewalk, plow route, ramp, mailbox, gate, steps, ice-melt spot
  and parking lot mapped in a park's Snow tab becomes a check-off, in priority order, stamped with the time and who.
  Parks with nothing mapped get one check for the whole park. End storm closes the log; **CSV** is the proof-of-service record.
  While a storm is running each park card shows "Storm 2/5".
- **Irrigation checklists**: Spring startup and Fall blowout per park, built from that park's backflows, timers, quick
  couplers and zone valves. One shared list per park per year. The park screen also shows a **coverage check**: heads with
  no throw radius set, and heads whose nearest neighbour is farther away than their throw.
- **QR tags**: Print QR tags makes sticker sheets (10 per sheet for Avery 5163, 30 per sheet for Avery 5160, or plain paper and tape) for a park, a layer or one
  item (item card → 🏷 QR tag). **Scan a tag** takes a picture of a tag and opens that item's card. The scan picture is
  not kept in the gallery.
- **Monthly summary**: one report for the board: repairs opened and closed (with before / after photos), still open,
  snow events, backflow tests, trees planted and removed, what's due next month. Print / PDF saves it as a PDF.
  Arrows change the month.

## Pools, parks and Field Reports linked up (v2.7)
- A pool's card on the map has **Plant 3D**, **PoolCommand** and **Aquatics Tech** buttons that open straight to that pool.
- Every park card has **Reports** (count of that property's field reports; opens them, or starts a new one) plus
  **Due**, **Tasks** and, during a storm, **Storm**.
- An item's card has **📝 Field report**: starts a report for that park with the item's name filled in. Reports made this
  way are listed on the item's card afterwards.
- The counts refresh each time Field Reports is opened (it stays a phone-only app; its reports do not sync).

## Update banner (v2.7)
When a newer build has been published, the app shows "A newer Park Universe is ready" with an **Update** button that
downloads the APK; open it and tap Install. Menu ⋮ → **Check for update** checks right now. It checks at most every 6 hours.
This needs the newer `build.yml` (it publishes each build under Releases and keeps the newest 5).

## Web map (v2.7)
The same map as a web page: `https://bombarules.github.io/ParkUniverse/` once Pages is on
(repo Settings → Pages → Source: **GitHub Actions**). Anyone can open the page, but it shows nothing of yours until they
sign in with a Team sync account. Give the board and office staff the **Viewer** role: they can look at every layer,
What's due, tasks, storm logs and the monthly summary, and change nothing. Phone-only things (app drawer, screen sharing,
notifications, update banner) are not on the web page.

## Housekeeping (v2.7)
- `Orbit/app/src/main/assets/three.min.js` (an unused second copy of the 3D library) is now a one-line placeholder.
  You can delete that file on GitHub.
