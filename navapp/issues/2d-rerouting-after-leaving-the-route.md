# Issue 2d: Rerouting after leaving the route

Status: Built, awaiting test
Phase: 2 (navigator)

Done when: Leaving the route on purpose triggers a reroute, and the new route is
           drawn within the 10-second limit.

Steps:
1. During a drive, leave the planned route on purpose.
2. Check the off-route state is detected (3 fixes in a row, more than 40 m away).
3. Check the new route is drawn and the time taken is 10 seconds or less.

## Status log

- 2026-10-29: Built, awaiting test.
