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
Actions tab → newest green run → download **ParkUniverse-apk** → unzip → install `app-debug.apk`.

## Update later
- Edit any file on GitHub (open it → pencil icon → Commit). The app rebuilds by itself.
- Or upload a new `All41.zip` to the main page of the repo; it unpacks itself and rebuilds.
- `bomba-wall.js` is in three places (Orbit assets, bomba-live, OverLook). Keep them identical.

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
