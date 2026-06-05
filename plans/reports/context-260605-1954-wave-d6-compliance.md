---
title: Wave D6 v1.1 compliance rollout note
date: 2026-06-05
plan: plans/260605-1954-wave-d6-compliance-reporting-recertification/plan.md
status: completed
---

# Wave D6 v1.1 Compliance Rollout Note

## Summary

D6 v1.1 is wired end to end for internal HR/L&D compliance reporting:

- Admin-only compliance API and xlsx export over active D4 assignments.
- Department/manager/program rollups from D3 org fields and D4 status resolver.
- Certificate validity windows with `issued`/`expiring`/`expired`/`revoked` states.
- Admin Learning -> Reports -> Compliance UI with filters, summary, table, and export.
- Teacher keeps completion-only Reports; Participant remains blocked by `read:reports`.

## Verification

| Gate | Result |
|---|---|
| Backend focused tests | `npm test -- --runTestsByPath ...` -> 7 suites, 34 tests passed |
| Client focused tests | `npm run test:run -- ReportsTab ComplianceReportTable useRole` -> 3 files, 29 tests passed |
| Root syntax | `npm run scripts:check` -> 39 files passed |
| Client build | `npm run build` -> passed |
| Client lint | `npm run lint` -> 0 errors, 81 existing warnings |
| Diff hygiene | `git diff --check` -> passed |

Backend suite covered:

- Compliance report read/export, Admin-only access, filters, audit log, export cap.
- Completion report regression and export formula guard.
- Certificate expiry issue path and expired compliance/completion states.
- Certificate state unit rules.

## Manual Smoke

Local Vite app: `http://127.0.0.1:3000/learning?tab=reports`.

Smoke used seeded API fixtures for one assignment, two learners, one expired cert,
and one expiring cert:

1. Open Learning -> Reports as Admin.
2. Switch to Compliance.
3. Select assignment status `overdue`.
4. Select certificate state `expired`.
5. Load report.
6. Verify request URL:
   `/api/learning/reports/compliance?status=overdue&certificateState=expired`.
7. Verify rows render for Alice Nguyen and Bob Tran.
8. Verify certificate states `Expired` and `Expiring` are visible in the table.
9. Click Export Excel.
10. Verify export URL:
    `/api/learning/reports/compliance/export?status=overdue&certificateState=expired`.
11. Verify downloaded filename:
    `compliance-report-2026-06-05.xlsx`.
12. Verify no console errors and no document-level horizontal overflow.

## Rollout

- Feature is safe to expose to Admins after deploy.
- No data migration required for legacy certificates; `validUntil: null` remains
  non-expiring.
- New `LearningProgram.certificateValidityDays` is optional; set only where HR
  confirms validity policy.
- Export remains capped server-side and formula-guarded.

## Deferred

- Certificate expiry reminder emails.
- Auto-create recertification assignment near expiry.
- Saved report presets.
- In-app notification center and admin notification log UI.

## Unresolved Questions

- HR monthly report exact columns: all department, manager, program, certification, overdue, or a smaller default?
- Default certificate validity policy: per program only, or later global fallback?
- Recertification trigger: report/email first, or automatically create a new assignment after approval?
