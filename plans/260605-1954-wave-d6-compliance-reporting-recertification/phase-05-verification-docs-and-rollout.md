---
phase: 5
title: Verification docs and rollout
status: completed
priority: P1
effort: 0.5d
dependencies:
  - 2
  - 3
  - 4
---

# Phase 5: Verification docs and rollout

## Overview

Close the D6 loop with tests, manual smoke, roadmap updates, and a short rollout note. D6 should not be marked done unless report, export, and expiry are wired end to end.

## Requirements

- Functional: focused server and client tests pass.
- Functional: roadmap reflects actual D6 scope, not aspirational scope.
- Functional: manual smoke steps documented in report or roadmap entry.
- Non-functional: no syntax errors, client production bundle passes, lint stays at current warning cap or better.
- Non-functional: audit, export, and formula-injection behavior explicitly checked.

## Architecture

Validation commands:

- Server integration: compliance report, completion report regression, certificate expiry.
- Server unit: compliance export formula guard and email templates if expiry emails are included.
- Client unit: Reports tab and compliance table.
- Client production bundle.
- Client lint.
- Root script syntax check.

Docs:

- Modify: `docs/development-roadmap.md`
- Modify: `docs/lms-roadmap.md` if D6 scope/status changes.
- Optional report: `plans/reports/context-260605-1954-wave-d6-compliance.md`

## Implementation Steps

1. Run focused backend tests for compliance report, completion report regression, certificate expiry, and export formula guard.
2. Run focused frontend tests for Reports tab and compliance table.
3. Run client bundle, lint, and root syntax gates.
4. Manually smoke:
   - create or seed assignment with due date;
   - assign users/departments;
   - issue or seed certificate;
   - load compliance report;
   - export xlsx;
   - verify expected row count and certificate state.
5. Update docs:
   - current status paragraph;
   - Wave D table;
   - changelog entry with verified commands.
6. List unresolved HR policy questions at end of report.

## Success Criteria

- [x] Backend focused tests pass.
- [x] Client focused tests pass.
- [x] Client bundle, lint, and syntax gates pass.
- [x] Manual smoke flow recorded.
- [x] `docs/development-roadmap.md` says exactly what D6 v1.1 delivered and what remains.
- [x] No new unresolved D2 dependency introduced.

## Verification Evidence

- Backend: 7 focused suites / 34 tests passed across compliance reports,
  completion report regression, certificate expiry, and formula guards.
- Client: 3 focused files / 29 tests passed for Reports tab, Compliance table,
  and role access.
- Gates: root syntax check 39 files passed; client production bundle passed;
  client lint passed at 0 errors / 81 existing warnings; `git diff --check`
  passed.
- Manual smoke: recorded in
  `plans/reports/context-260605-1954-wave-d6-compliance.md`; verified filtered
  report URL, export URL, downloaded filename, expired/expiring states, and no
  page overflow.
- Deferred: expiry emails, auto-recertification assignment creation, saved
  presets, in-app notification center/admin notification log UI.

## Risk Assessment

- Risk: docs claim full recertification when only report and expiry shipped.
  Mitigation: wording must say v1.1 and list deferred automation.
- Risk: export works in tests but not browser.
  Mitigation: smoke browser download from `/learning` if dev server is available.
