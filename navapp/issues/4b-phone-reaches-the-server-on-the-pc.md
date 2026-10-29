# Issue 4b: Phone reaches the server on the PC

Status: Built, awaiting test
Phase: 4 (Capacitor shell)

Done when: Search returns results on the phone, which means it reached
           http://<PC Wi-Fi IP>:8090.

Steps:
1. Start the server on the PC (npm start).
2. Confirm the phone is on the same Wi-Fi.
3. Run a search on the phone.
4. If it fails, check the Windows Firewall rule for port 8090 first.

## Status log

- 2026-10-29: Built, awaiting test. Not verified yet, per owner. The build and install exist, so the check is awaiting test.
