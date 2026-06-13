# Recertification Auto-Assignment (close the recert loop)

> Final goal slice ("push phase 3/4/5 → done"). Owner picked this as the next
> big investment. Closes the `compliance-and-recertification` deferral
> "auto-creating recertification assignments". Status: **archived / shipped**
> (2026-06-13) — folded into `compliance-and-recertification` spec.

## Why
The certificate-expiry cron (#83/#85) *signals* an upcoming expiry to the learner
and their manager — but turning that signal into an **action** still needs an
Admin to hand-create a recert Assignment. This closes the loop: an expiring
certificate, for an opted-in program, auto-creates a recert Assignment so the
learner is prompted (home feed + reminder cron + manager escalation already
exist) to recertify before it lapses.

## Behaviour
- **Opt-in per program**: `LearningProgram.recertifyPolicy.autoAssign` (default
  **false** → zero change for existing programs).
- During the daily cert-lifecycle cron, for each Issued, non-deleted certificate
  whose program has `autoAssign` and whose `validUntil` is within 30 days:
  create a **recert `Assignment`** (targetType `program`, the program, the single
  learner, `dueDate = validUntil`, `createdBy: null`, auto title), tagged
  `sourceCertificateId = cert._id`.
- **Idempotent**: one recert Assignment **ever** per certificate — a partial
  unique index on `sourceCertificateId` + an existence check (incl. archived, so
  an Admin archiving it is respected and it is NOT recreated). Race → E11000 →
  skip.
- The new Assignment flows through the existing assignment machinery (learner
  `/home` feed, reminder cadence, manager overdue digest) for free.

## Files
**Backend**
- `models/LearningProgram.js` — `recertifyPolicy.autoAssign`.
- `models/Assignment.js` — `sourceCertificateId` + partial-unique index.
- `domains/learning/schemas.js` — `recertifyPolicy` on create/update program body.
- `domains/learning/dto.js` — `programDto` returns `recertifyPolicy`.
- `domains/learning/completion/recert-assignment-service.js` (new) —
  `createRecertificationAssignments({ now }) → { created, skipped }`.
- `routes/cronRoutes.js` — the `certificate-expiry-reminders` job composes
  reminders + recert creation (merged summary), still one monitored run.

**Frontend**
- `features/learning/ProgramFormModal.jsx` — `recertifyPolicy.autoAssign` toggle
  in the Policies section + i18n.

## Tests
- recert-assignment-service: creates for an autoAssign program; idempotent
  (second run → skip, incl. when archived); skips non-autoAssign programs; skips
  when `validUntil` outside the window; respects soft-deleted certs.
- ProgramFormModal: create payload carries `recertifyPolicy.autoAssign`.

## Out of scope (deferred)
- Recert for ALREADY-expired certs (v1 acts in the pre-expiry window; Admins
  still handle long-expired via the compliance report).
- Path-based recert (program target only in v1).
- Configurable lead window / due-date offset (fixed to the 30-day scan +
  due = validUntil).
