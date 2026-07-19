# P0 — People as managed users (login-disabled)

**Priority:** Foundation (blocks all live paths) · **Status:** 🔴 proposed
**Context:** [plan.md](plan.md) · [fit-gap §1–2](fit-gap-analysis.md)

## Objective

English learners exist as `users` rows that appear in rosters/reports but
**cannot authenticate**. Link existing accounts by `emp_code`; provision the rest
as managed directory records. This gates every later phase (generic
attendance/enrollment/schedule all FK to `users`).

## Key changes

- Add an explicit **login-disabled** account state (e.g. `canLogin=false` /
  `accountType='managed'`). `middleware/auth.js` + the login path reject it
  **before** password logic — an affirmative refusal, never a silent hole.
- Provision/link service: for each `eng_employees` row, find `users` by `emp_code`
  → link; else create a managed user (emp_code, name, org snapshot, no credentials).
- Populate `eng_employees.user_id` (the existing crosswalk) as the archive↔live
  bridge. Audited; soft-delete respected.

## Files

- Modify: `server/middleware/auth.js` (reject managed accounts), user model/schema
  + migration (new flag), a provisioning script/use-case under
  `server/domains/english-training/` or `domains/org`.
- Tests: auth refuses managed accounts (login + middleware); provisioning
  links-by-emp_code and creates-missing; no self-login path opens.

## Risks

- **Auth weakening** — highest risk. The managed flag must be checked at the auth
  boundary with dedicated tests; a managed record must never yield a session.
- emp_code collisions / dirty emp_codes → provisioning must be idempotent + report
  unmatched rows (do not guess).

## Success / DoD

- Every English learner resolvable to a `users` row; managed accounts cannot log
  in (proven by test). Audit entries for provisioning. Tests + lint green. Spec:
  add the managed-account state to `capability-authz` + `english-training` specs.
