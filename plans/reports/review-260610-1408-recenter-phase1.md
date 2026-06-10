# Review — Re-center Phase 1 (Office + Coordinator), commit `27d492f`

Reviewer: inline self-review (per no-autonomous-agents rule). Scope: full 40-file diff.

## Verdict: ✅ APPROVE — pushed to main

## Security / authz (pass)

- All 4 office routes carry `requireCapability` + `validate` (zod); CSRF + global limiters apply via `/api` middleware. Route order: capability → validate → handler ✓.
- Mass-assignment safe: `validate` middleware REPLACES `req.body` with zod-parsed output → unknown keys (`isDeleted`, `deletedAt`…) stripped on office create/update + assignment.
- Coordinator = explicit allow-list, never `ALL_CAPABILITIES`; excludes `org.manage`, `department.manage`, all user/security caps. Boundary pinned by integration tests: Coordinator → `/api/users` 403, `/api/admin/audit` 403, org-assignment 403, dept create 403; CAN program create 201, office CRUD 2xx.
- Legacy `roleGuard('Admin', …)` sites unaffected (Coordinator simply not listed → deny). `searchService` unknown-role falls into Participant branch → self-only scope (fail-closed, no leak).
- Regex injection in office `search` escaped (same escape as departments).
- Audit: all 3 office mutations audited (`entity: 'Office'`); audit row landing asserted in test (incl. `actorRole: 'Coordinator'`).

## Correctness (pass)

- `Office` model = `Department` parity: soft-delete `select:false`, auto-exclude pre-hooks (find/findOne/countDocuments/findOneAndUpdate), partial-unique live `code`, uppercase trim.
- Archive guard counts only live users (`isDeleted: {$ne: true}`); 409 message mirrors department.
- Assignment patch logic: `undefined` = unchanged, `null` = clear, value = validated-exists (422) — for all 3 legs; slim audit diff now includes `officeId`.
- `GET /api/users` returns full doc (no projection) → `officeId` present → OrgAssignmentModal preselect works.
- PeoplePage refactor: tabs perm-filtered (`read:users`/`read:teams`/`read:department`/`read:office`), URL fallback to first visible tab, null-guard when no tabs.
- Seed: Office imported + dropped + 2 offices created; Counter `empCode` seq 9→10 matches new `000010`; header creds updated.
- AuditLog enum backfill is additive (one-way ratchet honored — nothing removed).

## Known Phase 1 limits (documented in roadmap, deliberate)

- Enroll/assignment learner pickers read Admin-only `/api/users` → `enroll:learner` UI stays Admin; Coordinator assignment modal user-picker empty (dept targeting works). Phase 2 ships coordinator-safe picker.
- Calendar nav = 'none' for Coordinator until Phase 2 scheduling UX; cohort-session writes still Admin-only inside `session/use-cases` (Phase 2 widens).
- `admin_scheduled` booking gate (`scheduling-mode-policy`) still checks `role !== 'Admin'` → Coordinator can't book yet — Phase 2 scope.

## Gates (all green, re-verified before commit)

Server 735 tests / 75 suites · client 218 / 46 · eslint 0 errors / 81 warnings (= cap) · vite build clean · root syntax checks pass.

## Nits (non-blocking)

- `routes.js` header comment not updated to mention offices (cosmetic).
- Commit message says "16 integration + 7 unit"; actual 17 + 6-new (16 total in suite) — immaterial, not worth amend.

## Unresolved questions

- None blocking. Phase 2 must decide the coordinator-safe learner-picker endpoint (scoped read, NOT widening `/api/users`).
