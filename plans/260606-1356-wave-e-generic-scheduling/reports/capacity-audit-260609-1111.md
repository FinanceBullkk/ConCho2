# Wave E2 — Capacity Enforcement: Audit & Decision Brief

**Date:** 2026-06-09 · **Method:** 6-agent read-only workflow (4 investigators → synthesize → adversarial verify) · **Status:** awaiting product decisions (no code changed)

## Code-truth (what's real today)

- **`Schedule.capacity`**: `Number, min 1, default 9`, admin-editable (in `ALLOWED_UPDATE_FIELDS`,
  `domains/schedule/use-cases.js:14`). Virtuals `enrolledCount` / `availableSpots` are derived (can't drift).
- **It is NOT enforced on any booking path.** A 15-member team books into a `capacity:9`
  session today (all 3 create paths auto-enroll the whole snapshot with no check).
  The **only** enforcement that exists is the Google-Sheets bulk sync (`syncController.js:235`).
- **`LearningProgram.capacityPolicy.{maxParticipants, maxParticipantsPerSession}`**: persisted +
  zod-validated + in the DTO, but **never read by any business logic** — inert metadata
  (marked "persisted, not enforced" in 4 specs). Not linked to `Schedule.capacity`.
- **One shared chokepoint** already funnels invariants for all 3 create paths:
  `bookingPolicy.assertBookable` (`domains/schedule/session-booking-policy.js`), called
  in-transaction before `Schedule.create` (weekly-cap + collision live here). Roster size is
  already in hand at each call (`snapshotActiveMembers(team)` / `enrolledUserIds`).
- **Adversarial finding (was missed):** admin **adding** team members
  (`teamController` PATCH → `Team.syncSchedulesForTeamUpdate`, `Team.js:196-204`) `$push`-grows
  `enrolledUsers` on existing future sessions **with no capacity check** — a 4th overflow path
  beyond create + capacity-edit. (Dropping a member auto-releases via `User.js` middleware; only
  adds grow the roster.)

## Recommended first slice (verified sound)

Enforce **`Schedule.capacity`** as a **hard reject (HTTP 422)** inside `assertBookable`
(in-transaction, before create) → covers `bookSlot` / `bookCohortSlot` / `adminCreate` by
construction. Add `CAPACITY_MESSAGE` next to the existing `COLLISION_MESSAGE`/`WEEKLY_CAP_MESSAGE`.
Pass `incomingCount` + applicable `capacity` in (no new query — snapshot already computed).
**Defer** program `capacityPolicy` (enrollment-time, separate feature), waitlists, roster auto-cap.

### Decisions (brief recommends A on each)
- **D1 scope** → **A**: `Schedule.capacity` first; defer program `capacityPolicy`.
- **D2 overflow** → **A**: hard reject **422** (matches transaction all-or-nothing; 422 distinct
  from 400 weekly-cap / 409 collision).
- **D3 capacity edit** → **A**: reject an edit that drops capacity below current `enrolledCount`
  (422). *Verdict correction:* compare against the **final** roster being written (new-team
  snapshot when `bookedTeamId` changes, else existing) and read it **inside** the transaction.

## Must resolve before implementing (from adversarial verdict — "caveated")

1. **Team-member-ADD path** (`Team.syncSchedulesForTeamUpdate`): either guard it (reject a team
   grow that would overflow a future session — mirror `syncController.js:235`, in-transaction) or
   explicitly document the residual overflow. D3's "invariant true everywhere" wording is wrong
   until this is decided. *(→ Decision D5 below.)*
2. **Default-9 sharp edge** (operational, the real product call): program-less/legacy classes use
   the field default `9`. Teams/cohorts legitimately larger than 9 would be **blocked from booking**
   until an admin raises capacity. Must be a deliberate decision, not shipped by accident.
   *(→ Decision D4 below.)*
3. Fix citation drift (`findClassSchedulingMode` vs `resolveSchedulingMode`; `use-cases.js` anchors)
   and soften "fully known inside the transaction" (cohort count is read pre-transaction at
   `learning/session/use-cases.js:110`, internally consistent).

### Open product decisions for the human
- **D4 — default-9 edge:** (a) enforce 9 now (block >9 until raised); (b) raise the default to N
  first; (c) only enforce when capacity is **explicitly set** (treat the default as "uncapped").
- **D5 — team-add overflow:** (a) guard the team-add path too (keep invariant true everywhere);
  (b) booking-paths only this slice, document residual team-add overflow as a known gap.

## Test plan (once decided)
Unit (boundary: `==capacity` passes, `+1` → 422; ordering: weekly-cap 400 fires before capacity) ·
integration per path (bookSlot / adminCreate / bookCohortSlot: overflow → 422 + **no Schedule
persisted**; happy path 201) · D3 edit guard (incl. simultaneous reassign+shrink) · program-less
default-9 case (makes the sharp edge explicit) · regression: weekly-cap/collision unchanged ·
spec conformance. Fold into `scheduling-and-booking/spec.md` (status `evolving`: session-capacity
enforced, `capacityPolicy` still persisted-not-enforced).

## Unresolved questions
- D4 (default-9 policy) and D5 (team-add handling) — **block implementation**; need the user.
- Typical team/cohort sizes vs default 9 (informs D4) — unknown; needs product/ops input.
