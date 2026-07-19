# English Training — Phase 3 Decision Questions (for HR / business owner)

- **Date:** 2026-07-19
- **Author:** platform (ConCho2)
- **Purpose:** Phase 3 (evaluation, levels, completion rules, certificate) is
  deliberately **not started** until the rules below are confirmed with HR /
  the business owner (`kyphucclv/ConMeoGauGau` is the model authority). This
  doc is the exact list of decisions needed to unblock Phase 3 planning.
- **Status:** partially answered (owner, 2026-07-19) — see "Answers received" below.

## Answers received (owner, 2026-07-19)

- **Completion (A1):** Completion requires **passing a final exam**; the exam
  result **is a level**. → ConCho2 must add exam-result (level) capture.
- **Absence gate (A2/A3):** A learner with **more than 2 absences cannot sit the
  exam** (≤2 absences = eligible to sit; ≥3 = blocked). Treat this as the
  eligibility gate to the exam.
- **Certificate (C/Q9):** Certificates exist but **HR issues them separately in
  another file** → **ConCho2 does NOT build a certificate pipeline.** Out of
  scope for Phase 3.

**Follow-up answers (owner, 2026-07-19):**
- (a) **Levels** — 13 ordered levels (low → high):
  1. Foundation
  2. Beginner
  3. Beginner 2
  4. Beginner 3
  5. Pre-Intermediate
  6. Pre-Intermediate 1
  7. Pre-Intermediate 2
  8. Pre-Intermediate 3
  9. Intermediate
  10. Intermediate 1
  11. Intermediate 2
  12. Upper-Intermediate
  13. Advanced
- (b) **Who enters** — **HR** enters the exam results.
- (c) **Result shape** — the level is recorded **directly** (no numeric score,
  **no fail state**). Anyone who sits the exam receives some level. The gate is
  eligibility to *sit* (>2 absences ⇒ cannot sit).

**Build-shaping confirmations (owner, 2026-07-19) — RESOLVED:**
- HR enters exam results via a **manual screen in the app** (not file import).
- Exam-sit absence gate is a **blanket max of 2 absences** for every course
  (>2 ⇒ cannot sit). The per-course `max_absences_allowed` stays as imported
  historical data but does **not** drive the exam gate.

→ All Phase 3 rules confirmed. Plan:
`plans/english-integration-phase-3-evaluation.md`.

Phases 1–2 already shipped on dev: identity, cohort/course/run structure,
984 historical sessions, 5,962 attendance records, and **derived absence
eligibility** (`eligible` / `within_limit` / `not_eligible` / `unknown` /
`not_applicable`). Phase 3 turns "attended enough" into "passed / certified".

---

## A. Completion & eligibility rules (highest priority — blocks Phase 3)

1. **What defines "completed" a course run?**
   - (a) attendance eligibility alone (≤ max absences), or
   - (b) attendance **plus** a passing exit evaluation/placement score, or
   - (c) something else (e.g. minimum % present sessions)?
2. **Max absences** — is it per *course* (current data has a
   `max_absences_allowed` per course) or global? Please confirm the numbers per
   course are authoritative.
3. **Unknown absence policy** — when a course run has no configured max-absence
   value, should a learner be treated as `eligible`, `blocked`, or flagged
   `unknown` for HR review? (Today they silently fall through to "within limit".)
4. **Make-up / catch-up sessions** — do they exist? If a learner exceeds the
   absence limit, can a make-up restore eligibility, and how is that recorded?

## B. Evaluation / level model (defines the Phase-3 data model)

5. **Levels** — do English courses have levels (e.g. Starter → Advanced, or
   CEFR A1–C1)? Is a learner placed at entry and promoted on completion?
6. **Placement test** — is there an entry placement test? Score scale, pass
   threshold, who administers it?
7. **Exit evaluation** — is there an end-of-course score/grade? Scale
   (numeric / pass-fail / band)? Pass threshold?
8. **Who scores** — PIC, teacher, or external? (affects roles/permissions and
   whether we need a live scoring UI.)

## C. Certificate (only if issued)

9. Is a **certificate** issued on completion? If yes: validity period,
   recertification interval, and does it reuse the existing platform certificate
   pipeline or a separate English-specific one?

## D. Live vs historical (defines whether we build entry UIs)

10. Going forward, will attendance/evaluation be **entered live** (teacher/PIC
    marks each session in ConCho2), or remain **import-only** from the workbook?
    This decides whether Phase 3 builds live-entry screens or stays read-only.

## E. Data-quality resolutions (218 open issues — HR/source owner decisions)

11. **`multi_active_enrollment` (2 cases)** — is a learner in two active course
    runs at once **valid** (e.g. two different courses) or a **data error**?
    (Today both are kept active as a soft/reporting flag.)
12. **`employee_resigned` (16)** — confirm the 16 are correctly inactive; should
    their history stay visible for audit but be excluded from active reports?
13. **`missing_bu` (7) / `missing_role` (7)** — who fills these in source, or
    should they stay `unknown`? (A correction overlay already exists in the app
    for BU/role — HR can fix them there without touching the workbook.)
14. **`missing_membership_start` (3)** — leave as NULL (no invented date) or can
    HR supply the real start dates?
15. **`cohort_without_course_run` (1, EL036)** — confirm EL036 is a real cohort.

---

## Review findings folded in (platform side — no HR action, tracked here)

From the Phase 1–2 domain review (2026-07-19). None are blockers; listed so
they're not lost:

- **F1 (minor/UX):** list endpoints return `count = page size`, not total —
  admin pagination can't show "page X of Y". Add `COUNT(*) OVER()` if needed.
- **F2 (edge/correctness):** eligibility is silent when max-absence is NULL —
  should surface `unknown` instead of falling through to "within limit"
  (tie to question A3).
- **F3 (design gap, by scope):** only `missing_bu`/`missing_role` have an
  in-app resolution path; the other 4 DQ codes are view-only and will
  accumulate — needs a resolution workflow (tie to section E).
- **F4 (semantic/minor):** the org-correction route reuses capability
  `enrollment.manage`; fine for now, revisit if a dedicated capability emerges.

Positives confirmed: parameterized SQL throughout; the one mutation runs in a
transaction with `FOR UPDATE` + audit + history; corrections re-apply
idempotently after re-import; feature-flagged off in production; two-layer
authz consistent between client route guard and server `roleGuard` +
`requireCapability`.

## Unresolved questions (for the platform, after HR answers)

- Does Phase 3 need its own certificate pipeline or can it reuse the existing
  platform one? (depends on answer to Q9)
- Live-entry scope (Q10) determines whether Phase 3 is a build-heavy or
  read-mostly phase — plan can't be sized until this is known.
