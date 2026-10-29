# navapp issues

One file per vertical slice from BUILD-PLAN.md. Each file holds its own
status, the "Done when" test and the steps, plus a dated status log.

## Status values

- **To come**: not built yet.
- **Built, awaiting test**: the code exists, but the check in "Done when" has not been run on the phone or road.
- **Tested and confirmed**: the "Done when" check has passed. Record the date in the status log.
- **Blocked, needs approval**: planned, but the owner must approve it first.

Update a file's `Status:` line and add a log entry in the same commit as the change.

## Index

| Slice | Title | Status | File |
|---|---|---|---|
| 1a | Place search works on the phone | Built, awaiting test | [1a-place-search-works-on-the-phone.md](1a-place-search-works-on-the-phone.md) |
| 1b | Route draws on the phone | Built, awaiting test | [1b-route-draws-on-the-phone.md](1b-route-draws-on-the-phone.md) |
| 2a | Location recovers after it stalls indoors | Built, awaiting test | [2a-location-recovers-after-it-stalls-indoors.md](2a-location-recovers-after-it-stalls-indoors.md) |
| 2b | Banner and ETA hold up over a full drive | Built, awaiting test | [2b-banner-and-eta-hold-up-over-a-full-drive.md](2b-banner-and-eta-hold-up-over-a-full-drive.md) |
| 2c | Each manoeuvre is spoken once at 400 m, 100 m and 20 m | Built, awaiting test | [2c-each-manoeuvre-is-spoken-once-at-400-m-100-m-and-20-m.md](2c-each-manoeuvre-is-spoken-once-at-400-m-100-m-and-20-m.md) |
| 2d | Rerouting after leaving the route | Built, awaiting test | [2d-rerouting-after-leaving-the-route.md](2d-rerouting-after-leaving-the-route.md) |
| 2e | Save the drive as a regression test | To come | [2e-save-the-drive-as-a-regression-test.md](2e-save-the-drive-as-a-regression-test.md) |
| 3a | Report screen does not crash | To come | [3a-report-screen-does-not-crash.md](3a-report-screen-does-not-crash.md) |
| 3b | Reports show on another phone's map | Built, awaiting test | [3b-reports-show-on-another-phone-s-map.md](3b-reports-show-on-another-phone-s-map.md) |
| 3c | Confirm and dismiss update live | Built, awaiting test | [3c-confirm-and-dismiss-update-live.md](3c-confirm-and-dismiss-update-live.md) |
| 3d | Server-issued device tokens | Blocked, needs approval | [3d-server-issued-device-tokens.md](3d-server-issued-device-tokens.md) |
| 4a | App installs and opens on the phone | Built, awaiting test | [4a-app-installs-and-opens-on-the-phone.md](4a-app-installs-and-opens-on-the-phone.md) |
| 4b | Phone reaches the server on the PC | Built, awaiting test | [4b-phone-reaches-the-server-on-the-pc.md](4b-phone-reaches-the-server-on-the-pc.md) |
| 4c | Document the rebuild when the PC's Wi-Fi IP changes | To come | [4c-document-the-rebuild-when-the-pc-s-wi-fi-ip-changes.md](4c-document-the-rebuild-when-the-pc-s-wi-fi-ip-changes.md) |
| 4a-1 | Route shows on the car screen | Built, awaiting test | [4a-1-route-shows-on-the-car-screen.md](4a-1-route-shows-on-the-car-screen.md) |
| 4a-2 | Host check allows all hosts only in debug builds | Blocked, needs approval | [4a-2-host-check-allows-all-hosts-only-in-debug-builds.md](4a-2-host-check-allows-all-hosts-only-in-debug-builds.md) |
| R1 | HTTPS API instead of the Wi-Fi IP | To come | [r1-https-api-instead-of-the-wi-fi-ip.md](r1-https-api-instead-of-the-wi-fi-ip.md) |
| R2 | Self-hosted routing and geocoding (OSRM and Nominatim) | To come | [r2-self-hosted-routing-and-geocoding-osrm-and-nominatim.md](r2-self-hosted-routing-and-geocoding-osrm-and-nominatim.md) |
| R3 | Google's Android Auto review | To come | [r3-google-s-android-auto-review.md](r3-google-s-android-auto-review.md) |
| R4 | Real app name, icon and privacy policy | To come | [r4-real-app-name-icon-and-privacy-policy.md](r4-real-app-name-icon-and-privacy-policy.md) |
