# Issue 4a-2: Host check allows all hosts only in debug builds (NEEDS APPROVAL)

Status: Blocked, needs approval
Phase: 4a (Android Auto)

Done when: A release build rejects an unknown host, and the debug build still
           connects.

Steps:
1. Owner approves the change.
2. Limit ALLOW_ALL_HOSTS to debuggable builds.
3. Build the debug APK and check it connects on the DHU.
4. Build a release APK and check an unknown host is rejected.

## Status log

- 2026-10-29: Blocked, needs approval.
