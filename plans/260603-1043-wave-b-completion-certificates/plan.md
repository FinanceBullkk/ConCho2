# Plan: Wave B kickoff — Completion enforcement + Certificates

**Status:** ✅ DONE (2026-06-03) — server 492/492 green; 9 new tests · **Wave:** B (Assessment & Certification) · **User-chosen slice:** Completion + Certificates

## Context
Wave A done. `LearningProgram.completionPolicy` (`attendanceThresholdPercent`, `requiresAssessment`, `requiresFeedback`) is modeled but unenforced. Goal: compute completion against that policy and issue verifiable **certificates** on completion — without the generic quiz engine (build-vs-buy deferred). Reuses existing `Attendance` (P/L = attended, per dashboard convention), `Evaluation` (= the one assessment type today), `Schedule` (cohort sessions).

**Honest gap:** no Feedback model exists → `requiresFeedback` is *unverifiable*. We report it as `met:false, reason:'feedback-not-available'` (never fake a pass). Default policy has `requiresFeedback:false`, so typical programs are unaffected.

## Changes
1. **server/models/Certificate.js** (new) — immutable record: `certificateNumber` (unique, Counter `CERT-<yr>-NNNNNN`), `verificationCode` (unique, crypto hex), `userId`/`cohortId`/`programId`, snapshot fields (`learnerName`/`programName`/`cohortCode`), `completionSnapshot{...}`, `issuedBy/issuedAt`, `status` (Issued|Revoked) + `revokedAt/Reason`, soft-delete (`isDeleted/deletedAt`). Unique index on number + verificationCode.
2. **server/domains/learning/completion/** (new sub-domain): `repository.js` (cohort/policy resolve, attendance + evaluation counts, certificate CRUD), `use-cases.js` (`evaluateCompletion`, `issueCertificate`, `listCertificates`, `revokeCertificate`, `verifyCertificate`), `dto.js` (completion / certificate / public-verification — verify omits PII internals), `schemas.js` (issue body, list query), `controller.js` (envelope + audit).
3. **server/domains/learning/routes.js** — wire:
   - PUBLIC `GET /certificates/verify/:code` (before `router.use(protect)`).
   - `GET /completion` → `requireCapability('completion.read')` (Participant self-scoped).
   - `GET /certificates` → `requireCapability('certificate.read')` (self-scoped).
   - `POST /certificates` → `requireCapability('certificate.manage')` (issue, 422 if not complete, 409 dup). Audit.
   - `DELETE /certificates/:id` → `requireCapability('certificate.manage')` (revoke = soft status). Audit.
4. **server/policy/capabilities.js** — add `certificate.manage` (Admin), `certificate.read` + `completion.read` (Admin/Teacher/Participant). Admin auto-gets all.
5. **server/tests/integration/learningCompletionRoutes.test.js** (new) — completion compute (meets/below threshold; requiresAssessment gate); issue 201 + snapshot; issue-when-incomplete 422; dup 409; revoke soft → status Revoked; public verify valid/revoked/unknown; teacher cannot issue (403).

## Completion logic
`attendancePercent = attended(P|L among cohort Schedules) / cohortSessionCount * 100` (0 sessions → 0%). `attendanceMet = pct >= threshold`. `assessmentMet = !requiresAssessment || Evaluation exists`. `feedbackMet = !requiresFeedback`. `complete = all three`. Snapshot frozen onto the certificate at issue (immutable).

## Out of scope (later Wave B)
Generic quiz/assessment engine (build-vs-buy), Feedback model, certificate PDF/render, client UI (API-first; follows like M3 followed M2), auto-issue cron.

## Verify
`cd server && npm test` (new suite + learning suites green) · `cd client && npm run lint` (no client change).

## DoD
Model + completion domain + routes + capabilities · server tests green · tracker updated (Wave B kickoff → in progress/done; changelog; handoff) · committed.
