# P5 — Cutover & freeze the archive

**Priority:** Closing · **Status:** 🔴 proposed
**Context:** [plan.md](plan.md) · [fit-gap §9](fit-gap-analysis.md)

## Objective

Flip the English section from "import + read view" to "live-managed". Freeze
`eng_*` as a read-only historical archive; make the live model the primary path;
unify the UX so operators work in one place.

## Key changes

- **Freeze `eng_*`:** the current "English Training data" section becomes an
  explicit **Archive** (read-only): historical sessions/attendance/levels + DQ
  issues + corrections, retained for reporting/audit. No new writes.
- **Live section:** the English cohort/class detail (the 360° from PR #324) reads
  from the generic model going forward; operators create/mark/level live.
- Import pipeline retained but demoted — **not** the primary path; do not
  decommission (owner) — kept for any one-off backfill only.
- Reporting reads across **both** (live + archive) where a full history is needed,
  tagged by source.

## Files

- Client English section (archive vs live split), `domains/english-training`
  (mark reads read-only / archive-scoped), reporting reads.
- Tests: archive is read-only (writes blocked); live section drives the generic
  model; combined report spans both.

## Dependencies

P2–P4 (live create/attendance/level must exist before demoting import).

## Risks

- Cutover confusion — must be unambiguous in the UI which data is live vs archive.
- Double-counting in reports — source-tag every row; test the combined read.

## Success / DoD

- English operated entirely in-app; `eng_*` read-only archive intact; no data
  loss. Tests + lint green. Spec: `english-training` MODIFIED (live model of
  record; import demoted; archive defined). Roadmap + registry updated.
