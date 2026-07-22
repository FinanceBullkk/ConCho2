# Incident — Production database truncated by the local test suite

**Date:** 2026-07-21
**Severity:** High (full production data loss) — **downgraded to Low impact**:
the lost data was entirely seed/demo, no real user data existed yet.
**Status:** Resolved. Root cause fixed and gated.

## Summary

While running the Gate 3 English integration tests locally, the Jest harness
TRUNCATEd every table on the **production Neon** database. The test lane and the
live app shared one connection string, and the test setup wipes all tables for
per-file isolation. Production was left holding only the test fixture. No real
user data was lost (the environment held only `seed-pg.js` demo data), so we did
**not** use Neon Time Travel — a re-seed was simpler and cleaner.

## Timeline (ICT, GMT+7)

| Time | Event |
|---|---|
| ~16:34:40 | `resetPgDatabase()` runs `TRUNCATE … CASCADE` against the production Neon branch during a local Gate 3 test run. |
| ~16:35 | Data loss noticed: production reduced to a 6-user test fixture. All DB writes stopped. |
| ~17:46 | Incident triaged. Confirmed the lost data was seed/demo only (no HR-imported staff, no hand-entered classes/schedules). |
| ~17:50 | Decision: skip Time Travel restore, re-seed instead. Focus on root cause. |
| ~18:00 | Root cause fixed and committed (`a91e048`); fail-closed guard + regression test (7/7). |

Neon offered a 6-hour Time Travel window (recovery point 16:34:00 was available)
but it was unnecessary given the data was reproducible.

## Root cause

1. `server/config/pg.js` resolved the connection as `PG_URL || PG_PROTOTYPE_URL`
   for **both** the running app and the Jest lane — no separate test database.
2. `server/tests/setup.js` → `server/tests/pg-test-utils.js#resetPgDatabase()`
   runs `TRUNCATE <all tables> RESTART IDENTITY CASCADE` once per test file, to
   emulate the per-file isolation the retired Mongo harness gave.
3. The local `server/.env` had `PG_URL` pointing at **production Neon**. Running
   the suite locally therefore truncated production.
4. An ad-hoc guard added during the session only **string-compared** `PG_URL`
   against `PG_PROTOTYPE_URL`. Neon exposes the same branch through a pooler
   hostname (`ep-xxx-pooler…`) and a direct hostname (`ep-xxx…`); the strings
   differed, so the guard concluded they were different databases and allowed
   the truncate.

CI was never at risk — its `PG_URL` points at an ephemeral `postgres:16` service
on `localhost`.

## Impact

- Production Neon reduced to: 6 users, 2 classes, 0 schedules, 2 English
  Meetings, 1 attendance (the test fixture).
- **No real/irreplaceable data lost** — the environment was pre-launch with only
  `seed-pg.js` demo content.
- No secrets exposed. No code lost (all version-controlled).

## Resolution

1. **Fail-closed connection guard** (`server/config/pg.js`): in `NODE_ENV=test`,
   the pool connects **only** to a loopback Postgres (Docker locally, the CI
   service) and throws on any remote host. It no longer silently falls back to a
   remote `PG_URL`.
2. **Test-only reset guard** (`server/tests/pg-test-utils.js`): `resetPgDatabase`
   refuses to run unless `NODE_ENV==='test'`, blocking any stray caller.
3. **Regression test** (`server/tests/unit/pg-connection-guard.test.js`): pins
   the throw/allow matrix, including the exact incident config. 7/7 green.
4. **Docker test-DB recipe** documented in `server/.env.example` (`PG_TEST_URL`).
5. **Production re-seeded** from `server/scripts/seed-pg.js`.

Commit: `a91e048 fix(pg): fail closed in test mode — never TRUNCATE a remote
database`.

## Prevention / follow-ups

- [ ] Local `server/.env`: keep `PG_URL` for the live DB, run all tests/E2E
      against a Docker `PG_TEST_URL` — never point tooling at Neon.
- [ ] The **E2E server** runs `NODE_ENV=development`, so the test-mode guard does
      NOT protect it. When running Playwright locally, start the API server with
      `PG_URL=$PG_TEST_URL` (Docker) so deep create/edit/cancel specs cannot
      write to production.
- [ ] Consider a confirmation flag (`SEED_ALLOW_REMOTE=1`) on `seed-pg.js` before
      it TRUNCATEs a non-localhost database.
- [ ] Review other maintenance scripts under `server/scripts/` that mutate the
      DB for the same "which database am I pointed at?" assumption.

## Lessons

- Do not compare database **URL strings** to decide "is this production" — Neon
  pooler vs direct hostnames alias the same branch. Compare on a positive,
  fail-closed signal (loopback-only) instead.
- Test and production must never share a connection string. Isolation is the
  guard; a string comparison is not.
