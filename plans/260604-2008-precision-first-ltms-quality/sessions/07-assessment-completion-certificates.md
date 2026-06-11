# Session 07 - Assessment + Completion + Certificates

## Goal

Answer: does completion truth match assessment attempts, manual grading,
feedback, attendance, and certificate state?

## Scope

In: assessment attempts, question bank snapshots, manual grading, feedback,
completion policy, certificate issue/revoke/verify.

Out: certificate PDF rendering, advanced quiz engine features.

## Required Evidence

- `server/domains/assessment/*`
- `server/domains/learning/completion/*`
- `server/domains/learning/feedback/*`
- Certificate/Assessment/Feedback models and tests.
- Learning assessment/completion UI tests.

## Required Scenarios

- Published assessment can be attempted only by eligible learner.
- Manual grading updates score/pass state used by completion.
- Required feedback blocks completion until submitted.
- Certificate cannot issue when incomplete.
- Public verification distinguishes issued, revoked, unknown.

## Verification

- assessment route tests.
- learning completion and feedback route tests.
- focused client assessment/completion tests.

## Unresolved Questions

- None.

