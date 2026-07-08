// Migration 036 — FK REFERENCES + CHECK enum hardening (Phase 5 cutover, Wave J).
//
// ⚠ apply ONLY after the production ETL reconciliation shows zero dangling FK
// refs (Wave J step 5) — see cutover-checklist.md. NOT applied to CI docker yet.
//
// Mongo never enforced referential integrity, so every earlier migration
// deferred FK constraints ("FK-column indexes now, constraints after cleanup" —
// mig 001). This is that hardening pass:
//   • FOREIGN KEY on the MAIN relationships only (children → parents; the
//     canonical `<table>.id` text PKs). Plain ADD CONSTRAINT (validates
//     immediately) — no NOT VALID needed because it runs post-ETL-verified.
//   • Every FK defaults to ON DELETE NO ACTION. That is safe app-wide because
//     the app soft-deletes (is_deleted flag) — user/attendance/evaluation rows
//     are NEVER hard-deleted, so parent deletes basically don't happen. The two
//     prod hard-delete paths are both FK-safe by construction:
//       – room_bookings rows are hard-deleted (lock release / orphan sweep /
//         waitlist promotion) — they are pure CHILDREN here and NOTHING
//         references room_bookings, so their deletion can never be blocked.
//       – empty-placeholder Schedule rows are hard-deleted by the roster-sync
//         sweep (domains/schedule/roster-sync.js promoteAndSweep). See the
//         per-FK notes on attendances / waitlist_entries / room_bookings below.
//   • CHECK (col IN (…)) for the stable enum columns, values copied verbatim
//     from the Mongoose schema enum arrays (server/models/*.js). NULL passes a
//     CHECK by definition, so nullable enum columns stay writable as NULL.
//
// Naming: fk_<table>_<col> / chk_<table>_<col>. exports.down drops everything
// in reverse order. Deliberately-omitted relationships are listed at EOF.

// ── FOREIGN KEYS ─────────────────────────────────────────────────────────────
// [table, column, referenced table, onDelete override]
// All referenced columns are the `id` text PK. Nullable FK columns (most of
// them) tolerate NULL by SQL default — no special casing needed.
const FKS = [
  // schedules → the booking spine
  ['schedules', 'class_id', 'classes'],
  ['schedules', 'booked_team_id', 'teams'],        // nullable (cohort-mode sessions)
  ['schedules', 'room_id', 'rooms'],               // nullable (roomless sessions)

  // enrollments — both modes (team mode: team_id set; direct mode: team_id NULL)
  ['enrollments', 'user_id', 'users'],
  ['enrollments', 'class_id', 'classes'],          // nullable
  ['enrollments', 'team_id', 'teams'],             // nullable = direct cohort enrollment
  ['enrollments', 'transferred_to', 'teams'],      // nullable; set when status='Transferred' (mig 024)

  // attendances — NO ACTION is safe against the empty-placeholder sweep:
  // attendance cannot be marked on a FUTURE session (domains/attendance/
  // marking.js rejects it), and the sweep only hard-deletes FUTURE empty
  // schedules — so a swept schedule structurally has zero attendance children.
  // If that invariant ever broke, blocking the delete is the DESIRED outcome
  // (golden rule: never lose attendance evidence).
  ['attendances', 'schedule_id', 'schedules'],
  ['attendances', 'user_id', 'users'],

  // teams
  ['teams', 'class_id', 'classes'],                // nullable in PG
  ['teams', 'leader_id', 'users'],                 // nullable in PG

  // team_members junction (composite PK; prod + test mirrors resync via
  // delete+reinsert of CHILD rows — always FK-safe)
  ['team_members', 'team_id', 'teams'],
  ['team_members', 'user_id', 'users'],

  // evaluations (legacy 4-skill rubric)
  ['evaluations', 'class_id', 'classes'],
  ['evaluations', 'user_id', 'users'],

  // certificates (immutable completion record; soft-deleted only)
  ['certificates', 'user_id', 'users'],
  ['certificates', 'program_id', 'learning_programs'],
  ['certificates', 'cohort_id', 'classes'],

  // assignments — the XOR target pair (ck_assignments_single_target, mig 023,
  // guarantees exactly one of the two is set per row)
  ['assignments', 'program_id', 'learning_programs'],
  ['assignments', 'path_id', 'learning_paths'],

  // feedbacks (end-of-cohort survey)
  ['feedbacks', 'cohort_id', 'classes'],
  ['feedbacks', 'user_id', 'users'],

  // waitlist_entries — schedule_id is CASCADE, the ONE deviation from
  // NO ACTION: the empty-placeholder sweep (roster-sync promoteAndSweep)
  // dissolves live waiters to status='cancelled' (rows KEPT as history —
  // release-resources.js) and then hard-deletes the schedule in the SAME
  // transaction; promoted/withdrawn history rows may also linger. NO ACTION
  // would abort that sweep. On Mongo those rows become dangling orphans;
  // CASCADE keeps PG referentially clean instead — waitlist history for a
  // deleted empty placeholder carries no reporting value (attendance/
  // enrollment/audit are the evidence tables, and none of them cascade).
  ['waitlist_entries', 'schedule_id', 'schedules', 'CASCADE'],
  ['waitlist_entries', 'user_id', 'users'],

  // room_bookings — pure child rows, hard-deleted by design (lock release,
  // reconcile orphan-sweep, waitlist promotion): deleting a CHILD is always
  // FK-safe, and nothing references room_bookings, so no FK can ever block
  // RoomBooking.deleteMany. schedule_id NO ACTION is safe because every
  // schedule hard-delete path releases the room lock FIRST in the same tx
  // (releaseScheduleResources → releaseRoomLock precedes deleteSchedulesByIds).
  ['room_bookings', 'room_id', 'rooms'],
  ['room_bookings', 'schedule_id', 'schedules'],

  // classes → program catalog
  ['classes', 'program_id', 'learning_programs'],  // nullable (program-less legacy class)

  // users → org spine (all nullable; manager_id is a self-reference)
  ['users', 'department_id', 'departments'],
  ['users', 'office_id', 'offices'],
  ['users', 'manager_id', 'users'],
];

// ── CHECK enum constraints ───────────────────────────────────────────────────
// [table, column, allowed values] — values verbatim from the Mongoose enums.
const CHECKS = [
  // users (models/User.js) — role is the 4-role model; custom Role keys from
  // the access domain are capability bundles, never written into users.role.
  ['users', 'role', ['Admin', 'Coordinator', 'Teacher', 'Participant']],
  ['users', 'status', ['Active', 'Inactive', 'Dropped', 'Transferred', 'On-hold', 'Waiting for class']],

  // core training spine
  ['classes', 'status', ['Ongoing', 'Completed']],
  ['enrollments', 'status', ['Active', 'On-hold', 'Completed', 'Dropped', 'Transferred']],
  ['schedules', 'status', ['scheduled', 'cancelled']],
  ['attendances', 'status', ['P', 'A', 'L', 'EL']],
  ['attendances', 'sync_status', ['PENDING', 'EXPORTING', 'EXPORTED']],
  ['certificates', 'status', ['Issued', 'Revoked']],
  ['waitlist_entries', 'status', ['waiting', 'promoted', 'withdrawn', 'cancelled']],

  // learning catalog (models/LearningProgram.js / LearningPath.js)
  ['learning_programs', 'scheduling_mode', ['leader_booking', 'admin_scheduled', 'self_enroll', 'nomination']],
  ['learning_programs', 'delivery_mode', ['online', 'offline', 'hybrid']],
  ['learning_programs', 'category', ['english', 'onboarding', 'compliance', 'soft_skills', 'technical', 'workshop', 'other']],
  ['learning_programs', 'status', ['active', 'inactive', 'archived']],
  ['learning_paths', 'status', ['active', 'inactive', 'archived']],

  // capability domains
  ['trainer_profiles', 'status', ['active', 'archived']],
  ['vendors', 'status', ['active', 'archived']],
  ['vendors', 'type', ['provider', 'individual', 'platform']],
  ['cost_entries', 'type', ['trainer', 'venue', 'material', 'vendor', 'travel', 'other']],
  ['assignments', 'status', ['active', 'archived']],
  ['assessment_questions', 'type', ['single_choice', 'multiple_choice', 'short_text']],
  ['custom_field_definitions', 'entity', ['Program', 'User', 'Cohort', 'Session']],
  ['custom_field_definitions', 'type', ['text', 'number', 'select', 'multiselect', 'date', 'toggle', 'user']],
  ['report_presets', 'kind', ['hours', 'compliance', 'evidence']],
  ['report_presets', 'schedule', ['none', 'monthly', 'quarterly']],
  ['required_training', 'applies_to_type', ['role', 'department', 'office', 'all']],
  ['required_training', 'target_kind', ['program', 'path']],
  ['required_training', 'recurrence', ['once', 'annual', 'biennial']],
  ['training_requests', 'status', ['submitted', 'in-review', 'approved', 'planned', 'rejected']],
  ['training_requests', 'priority', ['low', 'med', 'high']],
  ['training_requests', 'target_kind', ['program', 'skill']],

  // ops / infra tables
  ['metric_snapshots', 'scope', ['global', 'program', 'office']],
  ['notification_logs', 'channel', ['email', 'in_app']],
  ['notification_logs', 'status', ['pending', 'sent', 'skipped', 'failed']],
  ['cron_runs', 'last_status', ['running', 'ok', 'error']],
  ['token_blocklist', 'reason', ['logout', 'force-logout', 'password-change', 'admin-action', 'mfa-upgrade']],
];

const sqlList = (values) => values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ');

exports.up = async (knex) => {
  for (const [table, col, ref, onDelete] of FKS) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(
      `ALTER TABLE ${table} ADD CONSTRAINT fk_${table}_${col} ` +
      `FOREIGN KEY (${col}) REFERENCES ${ref}(id) ON DELETE ${onDelete || 'NO ACTION'}`,
    );
  }
  for (const [table, col, values] of CHECKS) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(
      `ALTER TABLE ${table} ADD CONSTRAINT chk_${table}_${col} CHECK (${col} IN (${sqlList(values)}))`,
    );
  }
};

exports.down = async (knex) => {
  for (const [table, col] of [...CHECKS].reverse()) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS chk_${table}_${col}`);
  }
  for (const [table, col] of [...FKS].reverse()) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS fk_${table}_${col}`);
  }
};

// ── DELIBERATELY LEFT UN-FK'd (and un-CHECK'd) ──────────────────────────────
// • audit_log.actor_id — audit must NEVER fail on a deleted/parked/system
//   actor (system jobs write NULL + role 'System'); the log is append-only
//   evidence, not a relational child.
// • audit_log.{entity,actor_role,action} — no CHECK: growing ratchet enforced
//   app-side from the shared schema enumValues (mig 029 decision).
// • notification_logs.{recipient_user_id,assignment_id,learner_id} — fail-soft
//   logging path; rows may legitimately reference purged/parked entities and a
//   notify write must never abort a booking/cron transaction.
// • notification_logs.type — no CHECK: growing enum list (same ratchet logic).
// • assignments.target_type — no CHECK needed: ck_assignments_single_target
//   (mig 023) already restricts it to 'program'|'path'.
// • assignments.source_certificate_id — recert idempotency backstop; already
//   partial-unique (mig 023), outside the MAIN-relationship scope.
// • waitlist_entries.class_id / room_bookings.class_id — denormalised copies
//   for scoped reads; the FK truth travels via schedule_id.
// • feedbacks.program_id — denormalised program tag (cohort_id is the truth).
// • required_training.target_id / metric_snapshots.scope_id /
//   training_requests.target_id — POLYMORPHIC refs (program|path / program|
//   office / program|skill): SQL FKs cannot express them.
// • rooms.office_id, schedules.office_id, skills.parent_id,
//   budgets.{department_id,program_id}, cost_entries.scope_*,
//   trainer_profiles.user_id, push_subscriptions.user_id,
//   token_blocklist.user_id, assessments.{cohort_id,program_id},
//   assessment_attempts.{assessment_id,user_id,cohort_id},
//   assessment_questions.{program_id,cohort_id},
//   training_requests.{requested_by,department_id} — real refs, but outside
//   the MAIN-relationship scope of this pass (candidates for a later slice).
// • created_by / issued_by / submitted_by / joined_by / cancelled_by /
//   requested_by actor stamps — historical who-did-it stamps, same fail-soft
//   rationale as audit actors.
// • text[] multikey refs (schedules.enrolled_users, schedules.
//   session_instructor_ids, classes.teacher_ids, assignments.user_ids/
//   department_ids, skills.program_ids, learning_paths.programs,
//   vendors.delivers, trainer_profiles.can_deliver, learning_programs.
//   prerequisite_programs) — PG has no array-element FKs.
// • NOTHING references room_bookings (by explicit design): its rows are
//   hard-deleted in prod (lock release / promotion / orphan sweep) and must
//   never be blockable by an inbound FK.
