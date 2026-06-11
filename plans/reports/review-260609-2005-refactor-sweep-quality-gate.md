# Quality-Gate Review — Refactor Sweep (2026-06-09)

**Scope:** the 11-commit Phase-1 modularization sweep (`b6b76e7`…`c150005`) + the
behaviour-changing scheduling work it sits on (capacity 422 Wave E2, exact-slot
grid Wave E1 client, `schedulingMode` legacy-path enforcement).
**Reviewer goal:** confirm "behaviour-preserving" actually holds — wiring, guards,
audit, data-consistency, tests — before opening a new capability.
**Method:** re-run the real CI gates + targeted static review of the spots tests
under-cover (facade export parity, guard/audit survival, behaviour-change precedence).

---

## Verdict: PASS (no blocking issues)

The sweep is clean. Routes were never touched, so every route-level guard is
structurally intact; mutation handlers kept their audit + policy/re-auth calls;
facade export parity holds for the most complex split; capacity precedence matches
spec. One low-priority pre-existing hygiene note (bilingual server error strings),
not introduced by this sweep.

---

## Gate results (re-run, this session)

| Gate | Result |
|------|--------|
| client lint (`eslint . --max-warnings 81`) | ✅ 0 errors / 81 warnings (at cap) |
| client tests (`vitest run`) | ✅ 196 passed / 43 files |
| server tests (`jest --runInBand`) | ✅ 699 passed / 72 suites (251.9s) |
| (build/secrets/audit/e2e) | not re-run this session — unchanged by sweep |

## Static review findings (all green)

1. **Routes untouched → guards intact.** Every refactor commit (`c150005`,
   `3a0b7ee`, `8c46d8b`, `ccb35e5`, `ae71e0c`, `e774f50`, `65e7e12`, `483e8c4`,
   `a5f6081`, `c877ad3`) changed only `controllers/*` or `services/*`. The
   scheduleService extract (`b6b76e7`) additionally repointed two `domains/*`
   imports by 2 lines each. **Zero route files modified** → `roleGuard`,
   `requireCapability`, `validate`, rate limiters, CSRF all structurally preserved.

2. **Export parity (facade split risk).** A missing facade export = `undefined`
   handler = Express crash at mount = whole suite fails on boot, so a green server
   suite proves parity for every mounted route. Spot-checked the hardest split
   manually: `scheduleService` facade re-exports all 10 symbols its external
   callers reference (`bookSlot`/`bookCohortSlot`/`adminCreate`/`cancelSlot`/
   `ServiceError` + 5 reads) — no gap.

3. **Audit survived the splits.** `auditService` present in every mutation module:
   `controllers/{auth,team,user,enrollment,class}/*` mutation files + `services/auth/auth-login.js`.

4. **Policy / re-auth gates survived.** `auth-admin.js` keeps `authPolicy.requireReauth`
   on both admin overrides; `class-queries.js` keeps `classPolicy.canRead`;
   `user-mutations.js` keeps the **BUG #9 re-auth gate** (bcrypt + `sensitiveChange`
   → `currentPassword` required for cross-user role/password change).

5. **Capacity precedence correct (Wave E2).** `assertBookable` enforces, in order:
   weekly cap (400) → collision (409) → capacity (422). Effective per-session cap =
   `program.capacityPolicy.maxParticipantsPerSession ?? Schedule.capacity ?? 9`;
   capacity branch only runs when `incomingCount != null` (paths that don't know
   roster size correctly skip it). Matches the spec + capacity-audit report.

## Observations (non-blocking)

- **Bilingual server error strings (pre-existing, low priority).**
  `domains/schedule/session-booking-policy.js` user-facing 4xx messages are
  Vietnamese–English (`'Khung giờ này đã bị đặt — This time slot is already taken'`,
  weekly-cap, capacity). Surfaced to users via toast → technically breaches the
  English-only golden rule. Moved verbatim by consolidation commit `2b1c4ae`, **not**
  introduced by this sweep. Cleanup candidate, not a sweep regression.
- **Test hygiene (pre-existing).** `tests/unit/cronAuth.test.js` logs a Jest
  "import after environment torn down" async-leak warning under `--detectOpenHandles`.
  Cosmetic unless it flakes; predates the sweep.

## Unresolved questions

- Re-run full CI matrix (build / secrets-scan / npm-audit / e2e) before next
  capability, or trust they're unaffected by an internal-only refactor? (Recommend:
  trust — no route/dep/client-build surface changed; e2e is slow ~5–10 min.)
- Schedule the English-only cleanup of `session-booking-policy.js` error strings as
  a small follow-up, or fold into the next scheduling touch?
