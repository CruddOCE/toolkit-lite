# navapp test build: plan and status

Date: 2026-10-29. Debug APK for testing on the owner's phone over Wi-Fi.
Not a release build. The API address is baked in at build time (NAV_API_BASE).

## Goal
A Waze-style navigation app for personal use first, Android first (Capacitor).
Public release comes later and is out of scope here.

## Phases and status

| Phase | Scope | Status |
|---|---|---|
| 1 | Map, place search (nearby first, then further away), OSRM route | Built, tested on phone |
| 2 | Turn-by-turn navigator, off-route detection, voice prompts, navigation screen | Built; navigation screen tested on phone; voice and reroute not yet tested on the road |
| 3 | Crowd reports: post, confirm, dismiss, live updates over WebSocket | Built and server-tested (40 tests); phone pins and voting not yet confirmed |
| 4 | Capacitor Android shell, Wi-Fi debug install | Built and installed |
| 4a | Android Auto navigation screen (Car App Library 1.7.0) | Car screen opens on the Desktop Head Unit with no crash; route-on-car not yet confirmed |

## Known issues
- **Location stalls indoors.** The GPS watch can go quiet. A watchdog restarts it after 20 s.
  Outdoors fixes arrive; confirm before relying on it.
- **Reports need a fresh check** on the phone (markers, confirm, dismiss).
- **Device IDs are client-chosen.** Reports can be spammed by anyone who fakes an ID.
  Planned fix: server-issued signed device tokens and per-IP limits. Not yet approved.
- **Car service host check is permissive** (ALLOW_ALL_HOSTS in all builds). Planned fix:
  allow all hosts only in debuggable builds. Not yet approved.
- **Search bias** is 100 km around the device, not a hard limit.

## Next steps
1. Confirm location outdoors, then test a route on the phone and on the car screen.
2. Test voice prompts and rerouting on a real drive, with a passenger operating the phone.
3. Approve or change the device-token and host-check fixes.
4. Verify reports on the phone.
5. Release-only work (later): HTTPS API, self-hosted OSRM and Nominatim, Google's Android Auto
   review, a real app name and icon, privacy policy.

## How to build and install
    cd navapp
    NAV_API_BASE=http://<PC Wi-Fi IP>:8090 npm run android:build
    npm run android:install
The server must be running on the PC (npm start), and the phone must be on the same Wi-Fi.
