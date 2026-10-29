# navapp handoff

Last updated: 2026-10-29. Read this first when resuming.

## Where it stands

- **Built:** project skeleton, geocoding proxy, OSRM routing wrapper, map screen with search and a route, navigator (Phase 2 logic), voice prompts, navigation view, crowd reports (server and client), Capacitor Android shell, Android Auto navigation screen, debug APK (`dist/navapp-debug.apk`, built with `NAV_API_BASE=http://<PC-IP>:8090`).
- **Tests:** `npm test` passes across `geocode`, `routing`, `server` (including the 40 report tests), `nav` (includes a replayed GPS trace) and `voice`.
- **Checked in a browser preview:** search, route from a real OSRM response, Start, navigation banner with the next instruction and distance, ETA bar, End.
- **Installed on the phone:** the debug APK is recorded as installed in `BUILD-PLAN.md`. Nothing in the phone checks below is confirmed yet.
- **Not verified on a phone or the road yet:** place search and route drawing (issues 1a and 1b), the drive (2a to 2d), crowd reports (3b and 3c), phone reaching the server (4b), and the car screen route (4a-1).
- **Confirmed working:** nothing is recorded as tested and confirmed yet.
- **Slice status:** every slice has its own file in `navapp/issues/`, with the status and a dated log. Start with `navapp/issues/README.md`.
- **Committed on `navapp-test-build`, not pushed.** The `navapp/` source is tracked in the `claude` repo. Push needs the owner's approval.

## Decisions made

- **Placeholder name and package id.** Folder `navapp`, package `com.example.navapp`. No name chosen yet.
- **Android first.** Capacitor 8.5.3 (released 2026-10-07, at least two weeks old). Newer 8.6.0 is not used yet.
- **v1 scope:** crowd reports (Phase 3, built, awaiting phone checks), Android Auto (Phase 4a, built, route on the car not confirmed), anonymous device IDs, no accounts.
- **Phone reaches the PC's server over Wi-Fi.** The phone has no server, so the APK calls `http://<PC Wi-Fi IP>:8090`. The address is baked in at build time. The Android manifest allows cleartext HTTP, and Capacitor's `androidScheme` is `http` so the page can make those calls. This is acceptable for home Wi-Fi testing only. The release build needs an HTTPS API.
- **Navigator depart step.** The depart step is skipped if the first GPS fix is more than 25 m from the start point (the app was opened mid-route).
- **Off route.** Measured as distance to the nearest route segment, not the nearest vertex. Off route after 3 fixes in a row, more than 40 m away. Reroute at most every 10 seconds.
- **Voice.** Each manoeuvre is announced once at 400 m, 100 m and 20 m. A jump past several thresholds speaks only the closest one.
- **ETA.** Calculated from the route's total duration at the start, not re-estimated as you drive. It drifts on long routes. Acceptable for now.
- **Test port.** Server tests use an OS-picked port, not 8092, because a fixed port collided between tests.
- **Search results.** Each search returns "nearby" (inside 100 km of the device, bounded search) and "further" (everything else, shown under a "Further away" heading). Without a device position, everything is "further". The old Perth-only viewbox (`NAV_VIEWBOX`) is gone.
- **Location on Android.** Uses the Capacitor Geolocation plugin when running in the app, and the browser API otherwise.

## In progress at the stop

Nothing is half-edited. The dev server on port 8090 is running and bound to all interfaces. It was reached at `http://<PC-IP>:8090/api/route` from this PC, but the phone path has not been tested.

## Next steps (in order)

The full list lives in `navapp/issues/`. Work them in this order:

1. **Issue 4b:** confirm the phone reaches the server on the PC. If it fails, check the Windows Firewall prompt for port 8090 first.
2. **Issue 2a:** confirm location recovers after an indoor stall.
3. **Issues 1a and 1b:** confirm place search and route drawing on the phone.
4. **Issues 2b to 2e:** the road test, with a passenger operating the phone. Save the GPS trace as a fixture for `test/nav.test.js` (issue 2e).
5. **Issue 3a:** fix the report-screen crash listed in the CHANGELOG, before other Phase 3 work.
6. **Issues 3b and 3c:** confirm reports and votes on two phones.
7. **Issue 4a-1:** confirm a route shows on the Desktop Head Unit.
8. **Issues 3d and 4a-2:** need the owner's approval before starting.

## Open questions and assumptions

- **Car App Library version:** not chosen. Confirm before adding to Gradle.
- **Name, icon and package id:** placeholders.
- **Public routing and search:** demo services, development only. Self-host OSRM, Nominatim and a tile host before release.
- **Privacy, moderation and store listing:** deferred to public release.
- **Windows Firewall:** port 8090 must be allowed on the private network. Not checked from the phone.

## Landmines

- `NAV_API_BASE` is baked into the APK. A changed PC IP means rebuilding the APK.
- `npm run android:build` writes `web/js/config.js` while it runs and restores it after. If the build is interrupted and the file looks wrong, reset it to `window.NAV_API_BASE = '';`.
- Gradle needs the socket redirect (`.jdk-sock/`) because Java sockets fail under `AppData` on this PC. The build script handles it. Running Gradle directly will fail.
- `package.json` has no `version` field on purpose (confirm with the user before setting one).
- The public OSRM demo and Nominatim have usage limits. The geocoder cache and one-request-per-second limit protect them, but heavy testing will get blocked.
- `test/fixtures/osrm-route.json` is hand-written in OSRM's format, not a captured response. If parsing breaks against the real service, capture a real response and replace it.
