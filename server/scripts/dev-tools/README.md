# Dev-only tools — NOT part of the Jest suite

These scripts run against a **live server** (not the in-memory test harness)
and are useful for manual probing, load testing, and forensic debugging.
None of them are picked up by `npm test`.

| Script | Purpose | How to run |
|---|---|---|
| `stress_test_booking.js` | k6 script: 500 concurrent bookings on the same slot. Asserts the weekly-cap + collision logic holds. | Requires k6 installed: `k6 run server/scripts/dev-tools/stress_test_booking.js` |
| `extreme-test.js` | Standalone Node attack simulator (brute force, NoSQL injection, IDOR, ReDoS, payload bomb, flood). | Requires a running server at `BASE_URL`. `BASE_URL=http://localhost:5000 node server/scripts/dev-tools/extreme-test.js` |
| `test_cascade_delete.js` | One-shot verification of the user-delete cascade against a live DB. Not a Jest test (filename has no `.test.js` suffix). | `MONGO_URI=... node server/scripts/dev-tools/test_cascade_delete.js` |
| `diagnose-login-state.js` | READ-ONLY login diagnosis: lists user empCodes + auth-relevant fields (lock/failed-attempts/MFA/mustChangePassword), then bcrypt-compares documented seed passwords against one target user offline. No writes, no API. | `node server/scripts/dev-tools/diagnose-login-state.js [empCode]` (loads `server/.env` for `MONGO_URI`; default target `000001`) |

These were previously in `server/tests/` where Jest never picked them up. Moved
under `server/scripts/dev-tools/` to make the boundary explicit. See
[`docs/audit/findings.md` § QA-009](../../../docs/audit/findings.md).
