---
title: Wave D6 v1.1 - Compliance reporting depth + recertification
description: >-
  Compliance report/export over assignments, certificates, manager/department
  rollups, and certificate validity windows.
status: in-progress
priority: P2
branch: main
tags:
  - wave-d
  - compliance
  - reports
  - certificates
  - recertification
blockedBy: []
blocks: []
created: '2026-06-05T12:59:03.122Z'
createdBy: 'ck:plan'
source: skill
---

# Wave D6 v1.1 - Compliance reporting depth + recertification

## Overview

Build the first D6 codeable slice after D1/D3/D4/D5: HR/L&D can answer who is compliant, overdue, certified, expiring, or expired by assignment, program, department, and manager. Keep it internal-LTMS sized for ~1000 employees; no commercial LMS breadth, no saved presets until HR confirms repeated monthly filters.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Discovery and report contract](./phase-01-discovery-and-report-contract.md) | In Progress |
| 2 | [Backend compliance report API](./phase-02-backend-compliance-report-api.md) | Pending |
| 3 | [Certificate expiry and recertification](./phase-03-certificate-expiry-and-recertification.md) | Pending |
| 4 | [Frontend compliance report UI](./phase-04-frontend-compliance-report-ui.md) | Pending |
| 5 | [Verification docs and rollout](./phase-05-verification-docs-and-rollout.md) | Pending |

## Dependencies

- Depends on D3 org model for `Department` + `User.managerId`.
- Depends on D4 assignments for due dates and derived learner statuses.
- Depends on D5 reminders for notification logs and monitored reminder execution.
- D2 Google Directory sync is optional for D6 v1.1; manual org assignment remains source of truth until owner inputs arrive.

## Scope Guard

- In: compliance report API + xlsx export, certificate validity metadata, recertification signal, UI surface, tests, docs.
- Out for v1.1: saved report presets, in-app notification center, broad BI dashboard, SCORM/content, auto-enroll-next-cycle without explicit assignment approval.

## Unresolved Questions

- HR monthly report exact columns: all of department, manager, program, certification, overdue?
- Default certificate validity: per program, per certificate, or global fallback?
- Recertification trigger: automatically create a new assignment near expiry, or only report + email first?
