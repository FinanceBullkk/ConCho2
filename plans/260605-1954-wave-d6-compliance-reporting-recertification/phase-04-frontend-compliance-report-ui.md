---
phase: 4
title: "Frontend compliance report UI"
status: pending
priority: P2
effort: "1d"
dependencies: [2, 3]
---

# Phase 4: Frontend compliance report UI

## Overview

Surface D6 in the existing Learning workspace without adding another app area. The UI should let Admins load a compliance report, filter it, scan summary chips, and export Excel.

## Requirements

- Functional: add a Compliance view under Learning -> Reports, or a sub-tab inside the existing Reports tab.
- Functional: filters for assignment, program, department, manager, status, certificate state, and due date range as supported by backend.
- Functional: summary tiles for total, overdue, complete, certified, expiring, expired.
- Functional: table with learner, org, assignment, due date, assignment status, certificate state.
- Functional: export button uses the compliance export endpoint.
- Non-functional: all user-facing strings in `client/src/i18n/locales/en.json`.
- Non-functional: expose compliance report only to Admin in v1.1; do not expose to Teacher or Participant.
- Non-functional: keep dense operational layout, no marketing/landing page treatment.

## Architecture

Modify:

- `client/src/api/api.js`
- `client/src/hooks/queryKeys.js`
- `client/src/hooks/useLearning.js`
- `client/src/pages/learning/ReportsTab.jsx`
- `client/src/pages/learning/CompletionReportTable.jsx` or create a sibling `ComplianceReportTable.jsx`
- `client/src/i18n/locales/en.json`

Create tests:

- `client/src/pages/learning/__tests__/ComplianceReportTable.test.jsx`
- Extend `client/src/pages/learning/__tests__/ReportsTab.test.jsx`

UI shape:

- Existing completion rollup stays available.
- Compliance panel loads on demand to avoid heavy default fetch.
- Export disabled until report has rows.

## Implementation Steps

1. Add API methods:
   - `getComplianceReport(params)`
   - `downloadComplianceReport(params)`
2. Add query keys and hooks:
   - `useComplianceReport(filters, options)`
   - `useDownloadComplianceReport()`
3. Add report controls:
   - select assignment/program/department where available;
   - status and certificate state dropdowns;
   - date inputs for due window.
4. Add table component:
   - stable columns;
   - status badges;
   - empty state and loading skeleton.
5. Add export handling mirroring completion export.
6. Add tests for rendering, filter trigger, export button state, permission-aware tab visibility where applicable.

## Success Criteria

- [ ] Admin can reach compliance report from `/learning`.
- [ ] Teacher and Participant cannot reach compliance report UI through role gates.
- [ ] UI loads report only when requested or filters are valid.
- [ ] Excel export downloads from browser flow.
- [ ] Long labels fit in table/cards on desktop and mobile.
- [ ] New strings are in `en.json`.

## Risk Assessment

- Risk: Reports tab becomes crowded.
  Mitigation: use compact segmented control or internal tabs: Completion, Compliance.
- Risk: too many filters confuse HR.
  Mitigation: default to assignment/program + status first; keep manager/department optional controls.
