# P0 — Managed people + English Operations shell

**Priority:** Foundation; blocks every live English path · **Status:** 🟢 implemented

**Context:** [plan.md](plan.md) · [fit-gap §1–3](fit-gap-analysis.md)

## Objective

Deliver a first-class managed learner record that participates in rosters and
reports without receiving credentials, plus the third client workspace shell:
**English Operations**. This phase is independently useful: HR can enter the
workspace, maintain/link English learners, and verify that managed users cannot
authenticate before any live course run exists.

## Locked behavior

- Add `users.can_login BOOLEAN NOT NULL DEFAULT true`. It is independent of
  `status`; a managed learner remains `Active` for training operations.
- A missing English learner is created with `can_login=false`, role
  `Participant`, no password, and optional email. Never generate a shared,
  random, or placeholder password.
- If `emp_code` already resolves to a normal ConCho2 user, link that user and do
  **not** change `can_login`, role, password, MFA, or existing access.
- `can_login=false` fails closed in password login, MFA second leg, auth
  middleware, forgot/reset password, password change, and MFA setup. Disabling a
  user clears auth cache and invalidates existing sessions.
- Admin user management gains an explicit managed-record create/update mode.
  The one-time `eng_employees` linker is idempotent and reports linked, created,
  already-linked, collision, and rejected rows; it never guesses dirty codes.
- `eng_employees.user_id` is populated as the archive↔live crosswalk before the
  archive freezes. Provision/link mutations are audited with a batch summary and
  per-record failures.

## Workspace entrypoint

- Extend `PersonaContext`/workspace switch from `admin|learner` to
  `admin|english|learner` for staff.
- English Operations initially exposes **Learners** and a setup-state Overview;
  later phases add Classes, Schedule, Attendance, Evaluation, and Archive.
- Participant remains locked to My Learning. Workspace selection is persisted,
  included in breadcrumbs/mobile navigation, and never used as authorization.
- Learners UI uses the managed-user API; it does not write `eng_employees` for
  new live people.

## Implementation surface

- Migration + user repositories/projections for `can_login`.
- `services/auth/*`, `middleware/auth.js`, password-reset/change, and MFA flows.
- Admin user schemas/controllers/repositories and English provisioning use-case.
- `client/src/context/PersonaContext.jsx`, `components/nav/PersonaSwitch.jsx`,
  sidebar/nav config, Topbar breadcrumb, English workspace shell, and `en.json`.

## Tests

- Managed user: password login denied before bcrypt; valid pre-existing token is
  rejected after disabling; forgot/reset/change-password and MFA paths denied.
- Existing linked user remains login-enabled and unchanged.
- Managed create accepts no password/optional email; normal create retains its
  existing credential requirements.
- Provisioning is idempotent and reports an emp-code collision without guessing.
- Admin/Coordinator can enter English Operations as permitted; Teacher sees the
  workspace shell/assigned-work placeholder but cannot mutate learners;
  Participant cannot select the workspace.

## Risks

- **Authentication regression:** every auth repository projection must include
  `can_login`; cache invalidation and tests are release gates.
- **Directory duplication:** normalized `emp_code` uniqueness is the only
  automatic link key. Name/email similarity is never enough.
- **UI as authz:** hiding Learners from Teacher is convenience only; the server
  must deny the mutation.

## Success / DoD

- New and existing English people resolve to generic users without weakening or
  unexpectedly disabling auth.
- Managed people can be created after the historical import is retired.
- English Operations is selectable and its Learners flow is wired end to end.
- Audit, permission denial, edge-case tests, lint, and manual smoke pass.
- Update `users-and-roles`, `auth-and-sessions`, `capability-authz`, and
  `english-training` specs when this phase ships.
