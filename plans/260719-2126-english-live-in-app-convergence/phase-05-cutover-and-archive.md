# P5 — Cutover, archive freeze, and complete English workspace

**Priority:** Closing · **Status:** 🟡 implemented; operational cutover pending

**Context:** [plan.md](plan.md) · [fit-gap §11](fit-gap-analysis.md)

**Operations:** [English live cutover and Archive DR runbook](../../docs/runbook-english-archive-cutover.md)

## Objective

Make the generic spine the sole production write model for English operations,
freeze imported `eng_*` history as enforceably read-only, and complete a clear
English Operations journey across live work and historical evidence.

## Cutover contract

- Record an immutable `englishLiveCutoverAt` setting and an auditable cutover
  event after P2–P4 smoke flows pass.
- Before the flip, verify every live operator loop: managed learner → Program/run
  → Enrollment → Session/Room → Attendance → eligibility → level → report.
- Before the flip, preview and execute the audited active-boundary handoff. It
  carries `status=active` course runs plus linked rosters into generic
  Programs/Cohorts/PIC Teams/Enrollments. Missing current rosters are reconstructed in a
  deterministic order: current active Enrollment, current-run Attendance
  evidence, then the latest prior non-dropped Attendance-evidenced roster for
  the same stable class. The preview exposes inferred counts and each inferred
  Enrollment keeps source provenance. Each run gets exactly one Team; a linked
  PIC becomes leader and a name-only PIC remains explicitly unresolved. The
  handoff is retry-safe and copies no historical events.
- At/after the flip, remove or disable production HTTP mutations for employee
  corrections and `eng_exam_results`, and fail production import attempts before
  opening a transaction.
- Add a database/application archive guard that rejects INSERT/UPDATE/DELETE on
  `eng_*` and `raw_eng_workbook_rows` in the live environment. Reads remain
  available. The guard must be reversible only through an explicit audited
  disaster-recovery procedure.
- Keep `server/scripts/eng-import.js` and its pipeline for reproducible
  staging/disposable reconstruction. It is not permitted to target the frozen
  production archive and is not advertised as a one-off backfill mechanism.

## Workspace completion

- English Operations contains Overview, Learners, Classes, Schedule, Attendance,
  Evaluation, and **Archive**.
- Overview counts/tasks use live generic data after cutover and link into the
  corresponding live workspace section.
- Archive is visibly labelled **Historical · Read-only** and contains imported
  classes/runs, sessions, attendance, levels, DQ issues, and correction history.
  It has no edit affordance and direct write calls are rejected.
- Live pages never mix archived rows into editable tables or booking grids.

## Reporting across both sources

- Reports define the temporal boundary: Archive rows are eligible before
  `englishLiveCutoverAt`; generic rows are eligible at/after it.
- Every row carries `source=archive|live`, source identity, stable employee code,
  Program/course identity, and event date.
- Deduplication is based on the cutover boundary plus a documented natural key;
  a source tag alone is not sufficient.
- Full-history exports expose source/cutover metadata so HR can reconcile totals.

## Authorization and operations

- Workspace switching remains UI-only. All Archive reads retain authenticated
  report scope; live sections retain their domain capabilities/resource policy.
- Participant/managed users cannot enter English Operations. Assigned Teachers
  receive only live schedule/attendance/evaluation views relevant to them and no
  Archive/DQ administration unless separately authorized.
- Document a smoke checklist, rollback boundary, archive-unlock DR procedure, and
  monitoring for rejected archive writes.

## Tests

- Production-mode Archive insert/update/delete/import attempts fail; reads pass.
- Live English mutations continue through generic tables after the flip.
- Combined report covers rows on both sides of the cutover exactly once,
  including a boundary-time and same-natural-key fixture.
- English workspace navigation/role matrices match desktop and mobile; direct
  route/API access is denied consistently.
- No data-loss regression: canonical archive counts and hashes remain unchanged
  across cutover.
- Active handoff creates every active course-run Cohort, PIC Team, and linked roster once;
  deterministic roster inference excludes dropped learners, a retry creates zero
  duplicates, and unlinked learners remain explicit skips.

## Success / DoD

- English is operated entirely through generic live domains from the dedicated
  workspace; `eng_*` is an immutable historical archive.
- Combined reporting is reconciled and anti-double-count proven.
- Cutover/rollback/DR smoke procedures are documented and exercised.
- Tests, lint, build, and manual smoke pass.
- Update `english-training`, reporting/export, and affected generic specs;
  update the registry, current-system map, route-permission matrix, and
  development roadmap when this phase ships.
