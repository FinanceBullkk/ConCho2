# Session 07 Report - Assessment + Completion + Certificates

**Date:** 2026-06-05
**Verdict:** OK (no P0/P1; 1 P2 data-integrity gap promoted → QB-008)
**Action:** promote QB-008 (cert issue race) to backlog; no code change this session
**Status:** completed

## Goal

Does completion truth match assessment attempts, manual grading, feedback,
attendance, and certificate state?

## Scope

In: assessment attempts, question-bank snapshots, manual grading, feedback,
completion policy, certificate issue/revoke/verify.
Out: certificate PDF rendering, advanced quiz engine features.

## Evidence

- Read: `domains/assessment/{routes,use-cases,grading,manual-grading-use-cases,
  repository,schemas}.js`, `domains/learning/completion/{use-cases,controller,
  repository,dto}.js`, `domains/learning/feedback/use-cases.js`,
  `domains/learning/routes.js`, `policy/capabilities.js`,
  `models/{Certificate,AssessmentAttempt}.js`.
- Tests run green: `assessmentRoutes`, `learningCompletionRoutes`,
  `learningFeedbackRoutes` → **37/37 pass** (`--runInBand`, ~60s).

## Scenario Verdicts

| Scenario | Verdict | Evidence |
|---|---|---|
| Published assessment attemptable only by eligible learner | OK | `submitAttempt`: 422 if `!isPublished`, 403 if not `isCohortParticipant`, 409 over `maxAttempts`. Learner never gets `correctOptionIndexes` (DTO strips; `getAssessment.includeAnswers=manage`). Tested (non-participant 403, unpublished 422, maxAttempts 409, answer-key hidden). |
| Manual grading updates score/pass used by completion | OK | `manualGradeAttempt` recomputes `score/scorePercent/passed` from `pointsEarned`; only `short_text`, score capped at `pointsPossible` (422 otherwise). `findPassingAttempt` (best `passed:true`) feeds `assessment.met`. Tested end-to-end: short_text fail→manual grade→`complete:true`. |
| Required feedback blocks completion until submitted | OK | `feedbackMet = !requiresFeedback || Boolean(feedback)`; `reason:'feedback-not-submitted'` surfaced. Tested before/after submit flips `complete`. |
| Certificate cannot issue when incomplete | OK | `issueCertificate` calls `evaluateCompletion` **live** (not a stale read) → 422 if `!complete`; snapshot frozen onto cert at issue. Tested (25% < 80% → 422). |
| Public verification distinguishes issued/revoked/unknown | OK | `publicVerificationDto`: Issued→`valid:true`, Revoked→`valid:false,status:'Revoked'`, miss→`{valid:false,status:'not_found'}`. No auth, no id/`verificationCode` leak; 128-bit random code (unenumerable). Tested all three + no-leak assertion. |

## Finding promoted

- **QB-008 (P2):** Certificate issuance is **check-then-insert** with no DB
  guard. `issueCertificate` does `findActiveCertificate` → `createCertificate`;
  the only `Certificate` indexes are field-level `unique` on `certificateNumber`
  / `verificationCode`, and a **non-unique** `{userId,cohortId,status}`
  (`Certificate.js:97`). Two concurrent admin issues (double-click / double
  submit) can both pass the null check and create **two Issued certificates**
  for the same learner+cohort (distinct numbers/codes, both verify `valid`).
  Existing test (`learningCompletionRoutes` "409") proves only the **sequential**
  guard. Violates the repo convention "the DB is the final guard, not just app
  logic" (backend-conventions §Concurrency) and mirrors **DI-05b** (Session 05
  enrollment race, fixed with a partial unique index). **Admin-gated → low
  concurrency → P2, not P0/P1**, so promoted not fixed. Recommended focused fix:
  partial unique index `{userId,cohortId}` where `{status:'Issued',
  isDeleted:false}` + map E11000 → 409 (DI-05b pattern). No passing race test is
  added this session — asserting "exactly one cert" would require the fix first.

## Notes (by design — not new findings)

- **Teacher `assessment.manage` is org-wide** (no cohort binding):
  `capabilities.js` grants Teacher `ASSESSMENT_MANAGE`, so a Teacher can author
  /update/archive assessments and **manual-grade attempts in any cohort**, not
  only bound classes (route requires the capability; no resource policy). Same
  root and severity as **QB-007** (teacher org-wide reads, design intent) — not
  a new item; folded under QB-007's product decision.
- **Zero-point assessment auto-passes:** all-`points:0` items → `maxScore=0` →
  `scorePercent=0` → `passed` when `passingScorePercent=0`. Schema allows
  `points:0` and `passingScorePercent:0` (defaults) but requires ≥1 item.
  Operator misconfiguration only; negligible. Note, not a finding.
- **Updating an assessment does not re-grade past attempts** (use-cases.js:57
  comment): attempts are immutable score snapshots of the old definition. By
  design; completion reads the attempt, not a re-grade.

## Verification

- `assessmentRoutes` + `learningCompletionRoutes` + `learningFeedbackRoutes` —
  37/37 pass. All five required scenarios covered by existing green suites.
- No production code changed this session → no regression surface.

## Unresolved Questions

- None.
