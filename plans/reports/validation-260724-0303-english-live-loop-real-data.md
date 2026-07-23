# Tier-1 validation — English live-loop on real workbook data

**Date:** 2026-07-24 · **Branch:** main (uncommitted) · **Scope:** run the whole
English live operations loop (create Meeting → mark attendance → eligibility →
exam level) as a real operator, against the real imported workbook — closing
audit finding **U2** ("built + tested but ~0 real usage").

## Verdict

The loop **works end to end on real data**, but it was **not shippable before
this session**: the final step (record exam level) returned **500 on every first
entry**, wrote the row anyway, and skipped the audit record. Two more
reference-data defects meant a freshly seeded environment could not offer any
level at all. All three are fixed and covered by a regression test that fails
without the fix.

## Environment (reproducible)

```
DB      concho_local (local PG 17), dropped + recreated, knex migrate:latest (51)
seed    node scripts/seed-pg.js
import  node scripts/eng-import.js "Copy of ENGCLASS_MANA.xlsx"   # the real workbook
server  PG_URL=… DB_BACKEND=postgres ENGLISH_TRAINING_ENABLED=true PORT=5000
client  npm run dev (:3000)
browser real Chromium (Playwright), 1440×900, actor = Coordinator 000010
```

Import reconciliation matched the documented baseline exactly:
COURSE_PLAN 6 · STUDENTS 308 · CLASSES 91 · ENROLLMENTS 552 · PIC 52 ·
CLASS_SESSIONS 984 · ATTENDANCE 5996→5962 (+34 exact dupes) · **182 DQ issues** ·
checksum `9e514aea2350fa33…`. Live tables: 53 cohorts, 92 course runs, 309
employees, 985 meetings/session units, 5 962 attendance records.

## What was exercised (real operator path)

| # | Step | Result |
|---|------|--------|
| 1 | Schedule tab → "Schedule session" → run **EL052 · Foundation · #1**, today, slot 09:00-10:00 | `201 POST …/course-runs/{id}/sessions`, toast "English session scheduled", button correctly offered **"Create session 6"** (next number from real history) |
| 2 | DB assert | `eng_meetings` 1 row (02:00Z = 09:00 VN, 60 min, planned) + `eng_session_units` session 6 linked to the meeting + `eng_audit_events attendance.session.create` by `000010` |
| 3 | Attendance tab → open the new session **before it starts** | Blocked by design: "Session hasn't started — attendance can only be marked after the session begins" ✅ |
| 4 | (simulation) meeting/unit time moved back 1 day in DB to represent "the class happened" — see limitations | — |
| 5 | Attendance tab → Needs evidence → open the live EL052 cell → Reset all to P → flip 1 learner to A → Save (6) | `200 PUT …/session-units/{id}/attendance`, toast "English attendance saved" |
| 6 | DB assert | 6 attendance facts (5 present / 1 absent), `entered_by` = coordinator, exactly once, `eng_audit_events attendance.roster.save` |
| 7 | Classes tab → EL052 360° | Roster recomputed live: Ho Phuc **75 % (3/4) not_eligible**, Tran Hai Phong 75 % not_eligible, 4 learners 100 % within_limit, 1 waiting `not_applicable` — target ≥ 80 % |
| 8 | Evaluation tab | "Needs level (completed runs)" worklist over the real archive (45+ runs, e.g. EL049 Foundation 8 pending) |
| 9 | EL049 → Enter levels → pick "Pre-Intermediate" for an eligible learner → Save all (1) | **BEFORE FIX: 500** "Saved 0, 1 failed". **AFTER FIX: 201**, "Saved 1 exam level(s)" |
| 10 | DB assert | `eng_exam_results` 1 active row (THẠCH THÁI HUY, `pre_intermediate`, entered_by coordinator) + `audit_log` row `created / EnglishTrainingExamResult` |

Ineligible learners' level selects are disabled and show "Not eligible
(attendance below target)" — the 80 % gate is enforced in the UI and the
use-case.

## Defects found and fixed

**D1 · Recording a level 500s on the first entry — row written, audit lost.**
`auditService.diff(before, after)` used parameter defaults (`= {}`), which only
cover `undefined`. Every create passes `before = null` → `Object.keys(null)`
throws **after** the transaction committed. Effect: the operator sees a failure,
the data is silently saved, and the mandatory audit row is missing (violates
"audit every mutation"). 39 call sites use this helper, so the fix is in the
helper: coerce both sides. `server/services/auditService.js`.

**D2 · `seed-pg.js` TRUNCATEs migration-owned reference data.** It truncated
every table, including `eng_levels` (13 levels seeded by migration 039) and the
`english_archive_control` singleton (migration 043), restoring neither. Any
seeded environment therefore had an **empty level list** — the Phase-3 exam entry
was impossible — and an archive freeze that could never engage. Fixed: exclude
`eng_levels`, re-insert the archive-control singleton (mirrors the test harness).

**D3 · Same wipe in the test harness.** `tests/pg-test-utils.resetPgDatabase`
truncated `eng_levels` too, so **no integration test could ever cover
exam-result entry** — which is exactly why D1 shipped. Fixed by keeping
`eng_levels` out of the reset, alongside knex's own tables.

**Regression test** (`tests/integration/englishLiveOperations.test.js`): the live
flow now continues into the first exam-result entry and asserts `201`, the
persisted row, and the `audit_log` row. Verified red→green: with the audit fix
stashed the test fails `Expected 201 / Received 500`; with it, 4/4 pass.

## Findings NOT fixed (no code change)

| ID | Sev | Finding |
|----|-----|---------|
| L1 | Med (UX) | ~~Attendance filter tiles don't move the calendar. Clicking **Upcoming** (9 sessions) leaves the grid on the previously shown week (Jul 6–12) → an empty grid, as if nothing were upcoming.~~ **FIXED (PR #335, 2026-07-24)** — the week now seeds from the session closest to now in the current set, and the grid remounts on a filter change so it actually re-seeds. Browser-verified at 3 viewports: every filter lands on a week containing its sessions. |
| L2 | Low (UX) | The class 360° roster shows raw enum codes — `not_eligible`, `within_limit`, `not_applicable` — while the Evaluation screen shows proper labels ("Eligible", "Not eligible (attendance below target)"). Inconsistent vocabulary on an operator screen. |
| L3 | Low (perf) | Both the Schedule and Attendance tabs load the **entire** session history on every visit: 5 sequential `GET /sessions?limit=200&offset=…` calls (985 rows) before rendering. Fine at this size, but it is a full-table page-through on each tab switch. |
| L4 | Info | The "session hasn't started" gate is client-side only; the API accepts a roster save for a future session (the existing integration test marks a 2099 session). Harmless today, but the guard is not enforced server-side. |

## Verification

- `tests/integration/englishLiveOperations.test.js` — **4/4 pass** (fails 1/4 without the audit fix)
- Full server Jest suite on Postgres (`--runInBand`) — **139/139 suites, 1187/1187 tests**
- Client: `npm run lint` 0 errors (5 pre-existing warnings, cap unchanged) · `npm run test:run` **121 files / 571 tests pass** (no client code changed)
- `git diff --check` clean
- Browser: real Chromium at 1440×900, routes `/english-operations?tab=schedule|attendance|classes|evaluation`, drawers/dialogs opened and closed, screenshots kept in the session scratchpad (`ll-*.png`)
- No console errors from the English surfaces; the recurring 401/403 lines are the pre-existing `/api/auth/me` bootstrap probe and Coordinator-forbidden `/api/org/my-team`, `/api/teams`, `/api/dashboard/alerts` calls made by shared shells

## Limitations

- **Time simulation.** No approved slot could be in the past at run time (03:00 VN), so after creating the session through the UI its `starts_at`/`held_at` were moved back one day directly in `concho_local` to represent a class that had taken place. Everything else — creation, roster load, save, eligibility, level — went through the real UI and API.
- Single operator (Coordinator), single class, one session. Multi-operator concurrency and the PIC/notification side effects (email, Google Calendar) were not exercised; SMTP/Google are not configured locally.
- `D2`/`D3` fixes protect a **fresh** database. An environment already seeded with the old script still has an empty `eng_levels`; it must be re-migrated or re-inserted.

## Unresolved questions

- L1: should a filter change re-seed the visible week (jump to the first matching session), or should filtering be scoped to the visible week only?
- L4: enforce "cannot mark before the session starts" server-side, or keep it a UI affordance (e.g. so an operator can pre-fill)?
- Does an already-deployed environment need an `eng_levels` backfill, or is every environment re-migrated from scratch?
