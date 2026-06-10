const Enrollment = require('../models/Enrollment');
const ReconcileReport = require('../models/ReconcileReport');
const logger = require('../lib/logger');
const {
  checkMissingAttendance,
  checkEmptyFutureSchedules,
  checkOrphanScheduleClass,
  checkOrphanRoomBookings,
} = require('./reconcile/schedule-checks');
const {
  checkOrphanedEnrollments,
  checkGhostMembers,
  checkUnattachedParticipants,
  checkDuplicateActiveEnrollments,
} = require('./reconcile/enrollment-checks');
const {
  checkMultiTeamClass,
  checkSoftDeletedInTeamMembers,
} = require('./reconcile/team-checks');
const { checkCounterDrift } = require('./reconcile/counter-checks');

// ──────────────────────────────────────────────────────────
// Reconciliation Service (orchestrator)
// ──────────────────────────────────────────────────────────
// Runs 10 independent data-integrity checks and persists the
// result as a ReconcileReport document.
//
// All checks are READ-ONLY — this service never mutates data.
// Fixes should be applied by admins via the normal CRUD routes
// after reviewing the report. The check implementations live in
// ./reconcile/* grouped by concern (schedule / enrollment / team /
// counter); this file only orchestrates and persists.
//
// CHECKS:
//  1. missing_attendance        — past session with incomplete roll-call
//  2. orphaned_enrollment       — Active enrollment but user not in team
//  3. ghost_member              — in team.members but no Active enrollment
//  4. empty_future_schedule     — future schedule with 0 enrolled users
//  5. unattached_participant    — Active Participant with no Active enrollment
//  6. duplicate_active_enrollment — two+ Active enrollments for one user
//  7. orphan_schedule_class     — schedule references a deleted Class
//  8. multi_team_class          — one class claimed by 2+ teams
//  9. counter_drift             — counter seq < max code already in use
// 10. soft_deleted_in_team_members — team.members holds a soft-deleted user
// 11. orphan_room_booking       — RoomBooking row for a deleted session (bricked slot)
// ──────────────────────────────────────────────────────────

/**
 * Run all checks, persist the report, and return it.
 *
 * @param {'scheduled'|'manual'} triggeredBy
 * @returns {Promise<ReconcileReport>}
 */
async function runReconciliation(triggeredBy = 'manual') {
  const start = Date.now();
  logger.info({ triggeredBy }, 'Reconciliation run started');

  // PERF-004 (audit PR G): memoise the Active-enrollments fetch.
  // Checks 2 (orphaned), 3 (ghost members), and 5 (unattached
  // participants) all need the same list — pre-fetching once and
  // passing via ctx eliminates 2 redundant full-collection reads.
  const activeEnrollments = await Enrollment.find({ status: 'Active' })
    .select('_id userId teamId classId').lean()
    .catch((err) => {
      logger.error({ err }, 'reconcile: pre-fetch active enrollments failed');
      return [];
    });
  const ctx = { activeEnrollments };

  // Run all 10 checks in parallel — they are independent read-only queries.
  // PR C added the bottom 5 (DATA-011 reconcile expansion).
  const swallow = (label) => (err) => {
    logger.error({ err }, `reconcile: ${label} failed`);
    return [];
  };
  const [
    missingAttendance,
    orphanedEnrollments,
    ghostMembers,
    emptyFutureSchedules,
    unattachedParticipants,
    duplicateActiveEnrollments,
    orphanScheduleClass,
    multiTeamClass,
    counterDrift,
    softDeletedInTeamMembers,
    orphanRoomBookings,
  ] = await Promise.all([
    checkMissingAttendance(ctx).catch(swallow('check_missing_attendance')),
    checkOrphanedEnrollments(ctx).catch(swallow('check_orphaned_enrollments')),
    checkGhostMembers(ctx).catch(swallow('check_ghost_members')),
    checkEmptyFutureSchedules(ctx).catch(swallow('check_empty_future_schedules')),
    checkUnattachedParticipants(ctx).catch(swallow('check_unattached_participants')),
    checkDuplicateActiveEnrollments(ctx).catch(swallow('check_duplicate_active_enrollment')),
    checkOrphanScheduleClass(ctx).catch(swallow('check_orphan_schedule_class')),
    checkMultiTeamClass(ctx).catch(swallow('check_multi_team_class')),
    checkCounterDrift(ctx).catch(swallow('check_counter_drift')),
    checkSoftDeletedInTeamMembers(ctx).catch(swallow('check_soft_deleted_in_team_members')),
    checkOrphanRoomBookings(ctx).catch(swallow('check_orphan_room_booking')),
  ]);

  const allIssues = [
    ...missingAttendance,
    ...orphanedEnrollments,
    ...ghostMembers,
    ...emptyFutureSchedules,
    ...unattachedParticipants,
    ...duplicateActiveEnrollments,
    ...orphanScheduleClass,
    ...multiTeamClass,
    ...counterDrift,
    ...softDeletedInTeamMembers,
    ...orphanRoomBookings,
  ];

  const summary = {
    missing_attendance:           missingAttendance.length,
    orphaned_enrollment:          orphanedEnrollments.length,
    ghost_member:                 ghostMembers.length,
    empty_future_schedule:        emptyFutureSchedules.length,
    unattached_participant:       unattachedParticipants.length,
    duplicate_active_enrollment:  duplicateActiveEnrollments.length,
    orphan_schedule_class:        orphanScheduleClass.length,
    multi_team_class:             multiTeamClass.length,
    counter_drift:                counterDrift.length,
    soft_deleted_in_team_members: softDeletedInTeamMembers.length,
    orphan_room_booking:          orphanRoomBookings.length,
    total:                        allIssues.length,
  };

  const durationMs = Date.now() - start;

  const report = await ReconcileReport.create({
    runAt: new Date(start),
    durationMs,
    triggeredBy,
    issues: allIssues,
    summary,
    status: allIssues.length > 0 ? 'issues' : 'ok',
  });

  logger.info(
    { triggeredBy, durationMs, total: summary.total, summary },
    `Reconciliation run complete — ${summary.total} issue(s) found`
  );

  return report;
}

module.exports = { runReconciliation };
