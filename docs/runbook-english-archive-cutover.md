# English live cutover and Archive DR runbook

This runbook activates the one-way transition from imported `eng_*` writes to
the generic live training spine. The implementation is migration 043 plus
`POST /api/english-training/archive/cutover`. Do not flip production merely
because the code is deployed.

> **Prototype rehearsal (2026-07-20):** migrations 040–043, the safe write-guard
> probe, and the full 84-suite/790-test PostgreSQL integration lane passed against
> `PG_PROTOTYPE_URL`. This is preflight evidence only: production is not migrated,
> frozen, or cut over.

## Preflight

1. Deploy with server `ENGLISH_TRAINING_ENABLED=true` and a client build using
   `VITE_ENGLISH_TRAINING_ENABLED=true`; apply migrations 040–043 and take a
   verified PostgreSQL backup.
   Before production, apply them to the disposable prototype and run
   `cd server && npm run verify:english-prototype`; the probe refuses a URL that
   matches `server/.env` and rolls back both write-guard checks.
2. Record counts and hashes for every `eng_*` table and
   `raw_eng_workbook_rows`; keep the reconciliation artifact with the change.
3. Resolve or explicitly accept provisioning collisions. Confirm all expected
   archive employees have `user_id`, or have a documented reason not to.
4. Run the live smoke loop as Admin/Coordinator: managed learner → English
   Program → course-run Cohort → direct Enrollment → Office/Room Session →
   Attendance → completed run eligibility → final Level.
5. Repeat read/mark/evaluate as the assigned Teacher; verify an unassigned
   Teacher and Participant receive 403. Verify a managed learner cannot log in.
6. Confirm reports/transcript show the categorical level without a fabricated
   score or pass result.

## Cut over

As Admin, open English Operations → Archive, enter the smoke/reconciliation
change reference as the reason, and choose **Freeze archive and cut over**. The
API requires `{confirm:true, reason}` and returns the immutable `cutoverAt`.
Calling it again is idempotent and does not move the boundary.

Immediately verify:

- Archive shows **Historical · Read-only** and the same preflight counts.
- `GET /api/english-training/archive/status` returns `isFrozen=true`.
- Combined history reports archive events only before the boundary and live
  events at/after it.
- The importer and legacy correction/exam-result endpoints return 409.
- Live generic learner/class/session/attendance/evaluation mutations still work.
- Audit contains the `EnglishArchive` cutover event and reason.

Monitor application 409 responses and PostgreSQL SQLSTATE `55000`; either means
something still attempted an Archive write and should be moved to the live
domain, not bypassed.

## Rollback boundary

Before the cutover command, application code/migrations can be rolled back in
the normal deployment window. After `cutoverAt`, do not move the boundary or
resume importer/HTTP Archive writes: fix forward on generic live tables. The
Archive remains the evidence source for events before the recorded timestamp.

## Disaster-recovery-only Archive repair

There is deliberately no application unfreeze endpoint. If verified corruption
requires repair, the incident commander and database owner must:

1. Stop application and import traffic; open an incident/change record.
2. Take and verify a fresh backup; retain the original Archive hashes.
3. Disable only the named freeze trigger on the exact affected table (trigger
   names are declared in migration 043), apply the smallest reviewed repair in
   one transaction, then re-enable the trigger before traffic resumes.
4. Confirm `english_archive_control.is_frozen=true`, all migration-043 triggers
   are enabled, FK/unique checks pass, and expected hashes/counts reconcile.
5. Record actor, SQL/change artifact, before/after evidence, and reason in the
   incident record and application audit trail.

Never clear `cutoverAt`, bulk-disable all triggers, or use this procedure to
continue normal English operations in `eng_*`.

Migration 043 also protects the control row with
`trg_english_archive_control_immutable`; it rejects attempts to unfreeze the
Archive or move/rewrite the recorded cutover evidence.
