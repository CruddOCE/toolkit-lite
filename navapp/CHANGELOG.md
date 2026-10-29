# Changelog

## 0.01 (2026-10-29)

First test build. Debug APK for personal testing; not a public release.

### Added
- Map with place search, nearby places first, then places further away.
- Route drawing from the device position, with turn-by-turn navigation: banner, ETA bar, End.
- Spoken prompts at 400 m, 100 m and 20 m. Rerouting when off route.
- Crowd reports: post, confirm, dismiss, live updates over WebSocket.
- Android Auto navigation screen (Car App Library 1.7.0).
- Wi-Fi debug build and install scripts.

### Fixed
- Car screen crash on open (missing navigation callback).
- Location stalls: the GPS watch restarts after 20 s with no fix.

### Changed
- Search moved into a bottom sheet with a recenter button.
- Map restyled toward a pale navigation look.

### Known issues
- Report button crash when tapping out of it (under investigation).
- Device IDs are client-chosen; host check allows all hosts in every build.
