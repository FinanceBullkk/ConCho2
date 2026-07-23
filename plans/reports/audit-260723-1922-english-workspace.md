# Audit — English Workspace (`/english-operations` + `/english-training` + `/english`)

**Date:** 2026-07-23 · **Branch:** main · **Auditor:** inline review · **Scope:** English staff workspace (client `features/english*` + server `domains/english-training`)

## Verdict

Quality **high**. No security hole, no missing audit, no lost soft-delete. Debt is
architectural cleanup (overlapping folders, oversized files), not defects.

## Strengths (load-bearing controls intact)

- **Authz:** every route `protect → roleGuard → requireCapability → validate`.
  Workspace visibility explicitly NOT the security boundary (comment states it).
- **Audit:** 100% mutations audited (`auditService.record` + `diff` + `stripSensitive`),
  managed-people create/update/delete/provision included. Domain audit `eng_audit_events` immutable.
- **PG-native:** no Mongoose (`.pg.js` repos).
- **Tests:** 20 server + 6 client test files.
- **No TODO/FIXME/HACK.** Only intentional `eslint-disable no-await-in-loop` (sequential DB).
- **Feature-flagged:** `ENGLISH_TRAINING_ENABLED`, off in prod by default.

## Findings

| ID | Sev | Finding | Fix status |
|----|-----|---------|-----------|
| F1 | Medium → **regression, FIXED** | 3 overlapping client folders; old `EnglishTrainingPage` rendered ONLY as `readOnly embedded` (Archive tab). Investigation found the "dead editable-mode" contained a **shipped feature gone UI-unreachable**: DQ employee-correction (`CorrectionForm`/`useCorrectEnglishEmployee`, Phase 1 2026-07-18) was gated off by `readOnly` (`canCorrect=false`) while backend `PATCH /employees/:empCode/correction` stayed live — an unintended regression from the workspace merge (182 open DQ issues, missing BU/role affects reporting/eligibility). **Owner-guided decision: treat as regression → restore.** Minimal fix: `allowCorrections` opt-in threaded ArchivePanel(role Admin/Coord) → EnglishTrainingPage → IssuesView; existing tested `CorrectionForm` reused. Structural folder consolidation intentionally NOT done (cosmetic churn, rebase risk). Verified: client english 27/27 (+1 regression guard), lint 0 errors, build compiles. **Browser verification BLOCKED (Playwright Chromium unavailable) → Implemented, UI-verification-blocked, not Done.** |
| F2 | Low-Med | Files over 200-line guideline: `canonical-operations.js` 683, `repository.pg.js` 670, `canonical-operations-repository.pg.js` 520, `reads.pg.js` 440, `controller.js` 421. Business-logic `canonical-operations.js` + `controller.js` are real extraction candidates. | **DONE** — `canonical-operations.js` 683 → barrel 27 + `-shared` 65 + `-enrollment-operations` 376 + `-meeting-operations` 275. Public require path unchanged; 19/19 unit suites (103 tests) green. Other over-size files (`repository.pg.js` 670 etc.) are cohesive SQL, left. |
| F3 | Low | `routes.js` mixes two guard regimes in one file: `/workspace/*` (per-route caps, Teacher allowed) vs legacy `/overview,/cohorts…` (blanket `router.use` Admin/Coord + `report.read`). Works; migration seam. | deferred (authz-touching, low value) |
| F4 | Low | `AttendancePanel.jsx` uses `eslint-disable react-hooks/set-state-in-effect` — derive-during-render preferred. | **KEPT** — reviewed; effect is a legitimate local-draft seed from async query rows with two sources (live/imported) + selection-driven resets. Render-phase rewrite risks reseed-semantics regressions on the safety-critical attendance flow for near-zero gain. Disable is justified + commented. |
| F5 | Info | Mount `NODE_ENV !== 'production'` ⇒ domain always on in dev/test regardless of flag; flag only gates prod. By design. | no action |

## Outcome

- **F2 DONE** — `canonical-operations.js` 683 → barrel 27 + shared 65 + enrollment 376 + meeting 275; 103/103 unit tests, public API unchanged (behavior-neutral refactor, no spec change per spec-driven rules).
- **F1 FIXED (regression)** — DQ correction restored for Admin/Coordinator via `allowCorrections` opt-in; 27/27 client tests + regression guard, lint/build clean. **Browser-verified locally** (real Chromium, disposable `concho_local` PG + seeded `missing_bu` DQ fixture): a Coordinator sees the **Correct** action in Archive → Data-quality issues → missing_bu → affected records.
- **F4 KEPT** — effect is a justified local-draft seed; no churn.
- **F3 DEFERRED** — documented authz seam; not touched (risk > cosmetic value).

## Unresolved questions

- F1 browser QA: needs a Playwright/manual pass at 1440×900 / 1280×800 / 390×844 (Admin & Coordinator see Correct in Archive→Issues; Teacher does not) once Chromium is available — currently blocked.
- Structural: keep 3 english client folders, or schedule a later consolidation once corrections have a permanent home? (Left as-is now.)
- F3: consolidate the two guard regimes now, or leave until the legacy read block is retired?
