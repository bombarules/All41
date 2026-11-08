# All41

Everything for Bomba Live in one place. Each app has its own folder, so you
can update one without touching the others.

| Folder | What it is |
|---|---|
| `Orbit/` | The Orbit Android app: solar-system home, app drawer, live screens, phone sharing |
| `bomba-live/` | The Overlook / Bomba Live web page for computers, phones and tablets |
| `OverLook/` | `bomba-wall.js` to add to OverLook when it's wired in |

All of them join the same wall: same wall code = same screens. See CONNECTING.md.

## Get the Orbit app
Actions tab → newest green run → download **Orbit-apk** → unzip → install `app-debug.apk`.

## Update later
- Edit any file on GitHub (open it → pencil icon → Commit). The app rebuilds by itself.
- Or upload a new `All41.zip` to the main page of the repo; it unpacks itself and rebuilds.
- `bomba-wall.js` is in three places (Orbit assets, bomba-live, OverLook). Keep them identical.
