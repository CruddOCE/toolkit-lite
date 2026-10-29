# Issue 2a: Location recovers after it stalls indoors

Status: Built, awaiting test
Phase: 2 (navigator)

Done when: After the GPS goes quiet indoors, the position updates again within
           about 20 seconds of walking outside.

Steps:
1. Start a route indoors so the GPS goes quiet.
2. Walk outside.
3. Check the position updates again, and note how long it took.
4. If it does not recover, record the time it took and the phone model.

Note: do this first in Phase 2. The navigator depends on the position updating.

## Status log

- 2026-10-29: Built, awaiting test.
