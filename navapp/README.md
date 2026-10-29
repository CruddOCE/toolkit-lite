# navapp (placeholder name)

A Waze-style navigation app. Current build: map, place search, a drawn route, turn-by-turn guidance with voice prompts, and an Android debug build for testing on a phone. Crowd reports, Android Auto and public-release work come in later phases (see `HANDOFF.md`).

## Run it in a browser

Needs Node 22.5 or newer. Tested on Node 24.

```bash
npm install
npm start
```

Open http://localhost:8090/. Allow location when asked. Search works without it.

## Test it

```bash
npm test
```

Tests are hand-rolled (`test/run.js`) and use recorded fixtures, so they need no network. The server tests use an OS-picked port, so they never collide with the dev server.

## Build the Android test app

The phone has no server, so the app calls the PC's server over Wi-Fi. Three things must be true first:

1. **The server runs on this PC** (`npm start`) and stays running while you test.
2. **The phone is on the same Wi-Fi network** as this PC. Find this PC's Wi-Fi address with `ipconfig` (the "Wireless LAN adapter Wi-Fi" IPv4 line).
3. **Windows Firewall allows port 8090** on the private network. The first run usually shows a prompt; allow it. If the phone can't reach the app, check this first.

Then build with that address:

```bash
NAV_API_BASE=http://192.168.1.221:8090 npm run android:build
```

Replace `192.168.1.221` with your PC's Wi-Fi address. The build writes it into `web/js/config.js`, bundles the APK, then restores the file. The APK lands at `dist/navapp-debug.apk`.

The address is baked into the APK. If the PC's address changes, rebuild.

### Install over Wi-Fi debugging

USB debugging doesn't work on this PC, so use wireless debugging:

1. On the phone, open **Settings > Developer options > Wireless debugging** and turn it on.
2. Choose **Pair device with pairing code**. Note the pairing IP:port and the six-digit code.
3. On this PC, run `adb pair <ip:port>` with the pairing values, then enter the code.
4. Note the **IP address and port** shown on the main Wireless debugging screen, and run `adb connect <ip:port>`.
5. Install and launch:

```bash
npm run android:install
```

`adb` is in `%LOCALAPPDATA%\Android\Sdk\platform-tools`. If it isn't on PATH, run it with the full path.

## Configuration (env vars, server side)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8090` | Dev server port |
| `NOMINATIM_URL` | `https://nominatim.openstreetmap.org` | Place search. Public service, for development only |
| `OSRM_URL` | `https://router.project-osrm.org` | Routing. Public demo server, for development only |
| `USER_AGENT` | `navapp/dev (placeholder contact)` | Sent to Nominatim, which requires an identifying User-Agent |
Place search needs no setting. It returns places within 100 km of the device as "Nearby", and everything else as "Further away", using the device position the app sends.

Build-side: `NAV_API_BASE` (see above).

## Layout

- `server/index.js`: Express app. Serves `web/`, plus `/api/geocode` and `/api/route`.
- `server/src/geocode.js`: place search proxy with a cache and a one-request-per-second limit.
- `server/src/routing.js`: OSRM wrapper. Converts OSRM's `[lng, lat]` into `{lat, lng}` and builds the instruction text.
- `web/js/nav.js`: navigator. Tracks the current step, distance to the next turn and off-route state. No network, no timers.
- `web/js/voice.js`: spoken prompts at 400 m, 100 m and 20 m, once each per manoeuvre.
- `web/js/map.js`: map screen, search, GPS and the navigation view. Reroutes at most once every 10 seconds.
- `web/js/config.js`: API base. Empty in the repo; the Android build sets it.
- `android/`: Capacitor Android project. The location permissions are in its manifest, and cleartext HTTP is allowed so the phone can reach the PC's server.
- `scripts/build-android.js`: builds the APK and installs it.
- `test/`: `run.js` runner, `*.test.js` suites, `fixtures/` for recorded responses and a GPS trace.

## Notes

- The Android debug build allows plain HTTP to the API, for testing on home Wi-Fi only. The release build needs an HTTPS API.
- The map tiles come from `tile.openstreetmap.org`, which is for light development use. Switch to a tile host with its own terms before release.
- Capacitor is pinned to 8.5.3, which was released 2026-10-07. Newer versions are not used until they are at least two weeks old.
- The app name and package id (`com.example.navapp`) are placeholders.
