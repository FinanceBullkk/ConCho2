---
capability: required-training-compliance
status: stable
owners: [domains/compliance, models/RequiredTraining]
last_updated: 2026-06-16
related_code:
  - server/models/RequiredTraining.js
  - server/domains/compliance/
  - server/domains/compliance/derivation.js
  - server/policy/capabilities.js
  - server/domains/_shared/events.js
  - client/src/features/compliance/ComplianceMatrixPage.jsx
related_plans: []
---

# Capability: Required-Training Compliance (matrix)

> **Source of truth for BEHAVIOR.** Modernization Horizon 1 (A3). Define
> required-training rules per role/department/office and see a **derived** live
> compliance matrix. Distinct from `compliance-and-recertification` (certificate
> expiry → recert) and `reporting-and-rollups` (cohort completion).

## Purpose

The legal/audit backbone for L&D: declare "this role / department / office (or
everyone) must complete this program within N days, repeating on a cadence", and
get a live matrix of who is compliant / pending / overdue. Compliance is
**derived** per user from their Certificate state — never stored.

## Business Requirements (BR)

- **BR-1:** Admins/Coordinators define required-training rules (`RequiredTraining`).
- **BR-2:** Compliance is DERIVED per user (matching rules vs Certificate state),
  never persisted as per-user status.
- **BR-3:** A user is **overdue** when the due window (`dueWithinDays` from when
  the rule first applies) has passed without completion; **recurrence** re-opens
  the rule on its cadence.
- **BR-4:** The matrix shows compliant / total / % per requirement with drill-down
  to the non-compliant people.
- **BR-5:** Defining rules needs `compliance.manage` (Admin + Coordinator);
  reading rolls into `report.read`. Every mutation is audited.
- **BR-6:** Rule mutations publish `requirement.changed` so A8 (auto-assign) can
  re-evaluate.

## Actors & Use Cases (UC)

- **UC-1 (Admin/Coordinator, `compliance.manage`):** create / edit / archive a rule.
- **UC-2 (`report.read`):** view the matrix (`GET /api/compliance/matrix`).
- **UC-3 (`report.read`):** view one person's required-vs-done
  (`GET /api/compliance/user/:id`).

## Entities

- **RequiredTraining** (`server/models/RequiredTraining.js`): `appliesTo {type:
  role|department|office|all, value}`, `target {kind: program|path, id}`,
  `dueWithinDays`, `recurrence (once|annual|biennial)`, `mandatory`, `label`,
  soft-delete, `createdBy`. Stores the RULE only.
- Compliance status is derived (`domains/compliance/derivation.js`): a user is
  **done** when they hold an Issued `Certificate` for the target program (a path
  target requires every program step certified). The clock anchors on
  `max(user.createdAt, requirement.createdAt)` (no hire-date field today).

## Functional Requirements (FR)

### Requirement: Define rules (audited, event) [BR-1, BR-5, BR-6, UC-1]

`GET /api/compliance/requirements` (`report.read`) lists rules.
`POST /api/compliance/requirements` (`compliance.manage`) creates;
`PUT /:id` edits; `DELETE /:id` soft-archives. Every mutation audits
(`entity:'RequiredTraining'`) and publishes `requirement.changed`. Validation:
`appliesTo.value` required unless `type:'all'`.

#### Scenario: Create reflects immediately
- **GIVEN** an Admin creates a rule for a department + program
- **WHEN** the matrix is requested
- **THEN** that requirement appears with its matched workforce evaluated — no
  rebuild step
- **AND** a `RequiredTraining` audit line is written and `requirement.changed` published

### Requirement: Derived compliance [BR-2, BR-3, BR-4, UC-2, UC-3]

`GET /api/compliance/matrix?departmentId=&role=` returns one row per rule with
`{ total, compliant, pending, overdue, pct, nonCompliant[] }`. `GET
/api/compliance/user/:id` returns that user's matched rules with per-rule status.
Status: **compliant** when the target is certified (within cadence for recurring
rules); **overdue** when past `anchor + dueWithinDays`; else **pending**.

#### Scenario: Compliant vs overdue
- **GIVEN** two matched employees — one holds an Issued certificate for the
  target, the other does not and the due window has passed
- **WHEN** the matrix is computed
- **THEN** the row reports `compliant:1`, `overdue:1`, and the overdue person
  appears in `nonCompliant` with status `overdue`

## Non-Functional Requirements (NFR)

- **Authz:** read = `report.read`; manage = `compliance.manage` (Admin +
  Coordinator); all mutations audited.
- **Derived, not stored:** no per-user compliance rows; recomputed on read over
  the active workforce + Certificate state.
- **Events:** `requirement.changed` published post-mutation (tolerates no
  subscriber until A8 ships).

## Acceptance Criteria (AC)

- [ ] Rule CRUD + soft-delete; `compliance.manage` to write, `report.read` to read.
- [ ] Matrix shows compliant/total/% + overdue per rule, drill to non-compliant.
- [ ] Overdue derived from `dueWithinDays`; recurrence re-opens on cadence.
- [ ] Completion = Issued certificate for the target program (path = all steps).
- [ ] Mutations audited + publish `requirement.changed`.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Manage without `compliance.manage` | 403 | Admin/Coordinator |
| Read matrix without `report.read` | 403 | use a reporting role |
| `appliesTo.value` empty for non-`all` | 400 (zod) | provide the role/dept/office |
| Rule target has no matched workforce | row `total:0`, `pct:null` | none |

## Out of Scope / Deferred

- A8 HRIS auto-assign — consumes `requirement.changed` to create `Assignment`s
  (separate Horizon 1 initiative).
- Hire-date anchoring (no `hireDate` field today — anchors on user/rule creation).
- Path-target partial-credit (a path is done only when every program step is
  certified).
