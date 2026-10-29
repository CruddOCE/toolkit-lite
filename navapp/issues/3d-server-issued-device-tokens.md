# Issue 3d: Server-issued device tokens (NEEDS APPROVAL)

Status: Blocked, needs approval
Phase: 3 (crowd reports)

Done when: A device ID the server did not issue is rejected, and a legitimate
           phone still posts reports.

Steps:
1. Owner approves the design (server-issued signed tokens plus per-IP limits).
2. Implement token issue and check on the server.
3. Test that a made-up ID is refused.
4. Test that a phone with a real token still posts.

## Status log

- 2026-10-29: Blocked, needs approval.
