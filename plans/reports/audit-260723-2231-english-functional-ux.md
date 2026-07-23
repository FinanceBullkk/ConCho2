# Audit — English module (function / business / UX / flow)

**Date:** 2026-07-23 · **Branch:** fix/english-workspace-audit · **Scope:** `features/english-operations/*` (6 tabs) + `domains/english-training` business rules + spec.

## Verdict

Operational lifecycle is **coherent and largely complete** (identity → class/run →
roster ops → schedule → attendance → eligibility → level). Business rules match
the capability spec. Not fully "Done": manual browser QA outstanding and the live
loop has near-zero real usage yet.

## Coverage

| Tab | Business capability | State |
|-----|---------------------|-------|
| Overview | Task-oriented landing, start-here cards, data-status | ✅ |
| Learners | Managed people CRUD (login-disabled + Employee crosswalk), provision, search | ✅ |
| Classes | PIC-grouped list → class 360° → roster: add / leave / transfer / capacity-override + attendance% + eligibility | ✅ |
| Schedule | Calendar grid, create Meeting, reschedule/cancel, imported/cancelled/past read-only | ✅ |
| Attendance | Filters, roster P/A + stale token, historical read-only | ✅ |
| Evaluation | Exam level entry (13 levels, ≤2-absence gate) | ✅ |
| Archive | Imported evidence read-only + DQ issues + correction (Admin/Coord) | ✅ |

Business rules verified against code: one-active-enrollment (app + DB partial-unique),
capacity guard (add+transfer), override needs reason+actor+audit, leave preserves
history + releases capacity, transfer keeps linked chain + org snapshot, attendance
exactly-once + single transaction + present/absent only, eligibility by absence/ratio.

## Findings

| ID | Sev | Finding | Status |
|----|-----|---------|--------|
| U1 | Med | Teacher lands on English Operations Overview and sees operational data-status counts (managed/linked/unlinked/archive people) they cannot act on — every functional tab is Admin/Coord-gated (nav correctly hides them). | **FIXED** — Teacher Overview now shows only an honest "not available for your role yet" notice; start-here cards + ops counts hidden. New i18n `overview.teacherTitle`. Tests: `Overview.test.jsx` (Admin sees actions+counts; Teacher sees notice only). Assigned-Teacher scope remains spec "known next work". |
| U2 | Med | Live operational loop (create Meeting → mark attendance → eligibility → level) is built + unit/e2e-tested but has ~0 real usage — all 984 sessions are imported evidence; attendance save is live-only. | ACCEPTED — owner has no live sessions yet; not a defect. Real-operator validation pending. |
| U3 | Low | `window.confirm()` for delete-learner + provision — inconsistent with the app's inline/dialog confirm UX. | KEPT — functional; replacing needs a dialog harness, low value (KISS). |
| U4 | Low | Transfer full/override decision uses client-derived `activeMembers` from the class list (can be momentarily stale). | KEPT — server re-checks authoritative `countActiveMemberships` and 409s; client is advisory only. |
| U5 | Low | Managed-learners list capped at `limit:200`, no pagination. | KEPT — fine at 308 employees; revisit if it grows. |

## Verification (U1 fix)

- client english-operations suites: **17/17** (+2 new Overview tests)
- lint: 0 errors (5 pre-existing warnings)
- Browser QA: pending (Playwright Chromium unavailable) — Teacher-vs-Admin Overview to confirm visually.

## Unresolved questions

- U1: keep the Teacher notice, or remove the Overview tab from Teacher nav entirely until assigned-Teacher scope ships?
- U2: when will a real live session be created so the create→mark→level loop gets real-operator validation?
