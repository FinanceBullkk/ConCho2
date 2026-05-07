const mongoose = require('mongoose');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');
const Enrollment = require('../models/Enrollment');
const Team = require('../models/Team');
const User = require('../models/User');
const ReconcileReport = require('../models/ReconcileReport');
const logger = require('../lib/logger');

// ──────────────────────────────────────────────────────────
// Reconciliation Service
// ──────────────────────────────────────────────────────────
// Runs 5 independent data-integrity checks and persists the
// result as a ReconcileReport document.
//
// All checks are READ-ONLY — this service never mutates data.
// Fixes should be applied by admins via the normal CRUD routes
// after reviewing the report.
//
// CHECKS:
//  1. missing_attendance    — past session with incomplete roll-call
//  2. orphaned_enrollment   — Active enrollment but user not in team
//  3. ghost_member          — in team.members but no Active enrollment
//  4. empty_future_schedule — future schedule with 0 enrolled users
//  5. unattached_participant— Active Participant with no Active enrollment
// ──────────────────────────────────────────────────────────

const LOOKBACK_DAYS = 90; // how far back to check past schedules (CHECK 1)

/**
 * CHECK 1 — Past schedules with incomplete attendance.
 * Looks at sessions that ended in the last LOOKBACK_DAYS days.
 * A session is flagged if the number of Attendance records is
 * less than the number of enrolledUsers on the Schedule.
 */
async function checkMissingAttendance() {
  const issues = [];
  const now = new Date();
  const lookback = new Date(now - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Fetch past schedules that had enrolled users
  const pastSchedules = await Schedule.find({
    endTime: { $lt: now, $gte: lookback },
    $expr: { $gt: [{ $size: '$enrolledUsers' }, 0] },
  })
    .select('_id classId bookedTeamId startTime endTime enrolledUsers')
    .lean();

  if (pastSchedules.length === 0) return issues;

  // Batch-fetch attendance counts per schedule (one aggregate, no N+1)
  const scheduleIds = pastSchedules.map((s) => s._id);
  const attCounts = await Attendance.aggregate([
    { $match: { scheduleId: { $in: scheduleIds } } },
    { $group: { _id: '$scheduleId', count: { $sum: 1 } } },
  ]);
  const countMap = {};
  attCounts.forEach((a) => { countMap[a._id.toString()] = a.count; });

  for (const sched of pastSchedules) {
    const expected = sched.enrolledUsers.length;
    const actual = countMap[sched._id.toString()] || 0;
    if (actual < expected) {
      issues.push({
        check: 'missing_attendance',
        description: `Schedule on ${sched.startTime.toISOString().slice(0, 10)} has ${actual}/${expected} attendance records`,
        refs: {
          scheduleId: sched._id,
          classId: sched.classId,
          teamId: sched.bookedTeamId,
        },
        detail: { recorded: actual, expected, missingCount: expected - actual },
      });
    }
  }
  return issues;
}

/**
 * CHECK 2 — Active enrollments where the user is no longer
 * in the team's members array.
 * Indicates the admin removed someone from a team without
 * closing (or transferring) their Enrollment record.
 */
async function checkOrphanedEnrollments() {
  const issues = [];

  const activeEnrollments = await Enrollment.find({ status: 'Active' })
    .select('_id userId teamId')
    .lean();

  if (activeEnrollments.length === 0) return issues;

  // Fetch all teams that appear in the enrollment list (one query)
  const teamIds = [...new Set(activeEnrollments.map((e) => e.teamId?.toString()).filter(Boolean))];
  const teams = await Team.find({ _id: { $in: teamIds } })
    .select('_id members')
    .lean();
  const teamMembersMap = {};
  teams.forEach((t) => {
    teamMembersMap[t._id.toString()] = new Set(t.members.map((m) => m.toString()));
  });

  for (const enr of activeEnrollments) {
    const teamId = enr.teamId?.toString();
    if (!teamId) {
      // Team was hard-deleted — definitely orphaned
      issues.push({
        check: 'orphaned_enrollment',
        description: `Active enrollment ${enr._id} references a team that no longer exists`,
        refs: { enrollmentId: enr._id, userId: enr.userId },
        detail: { reason: 'team_not_found' },
      });
      continue;
    }
    const memberSet = teamMembersMap[teamId];
    if (!memberSet || !memberSet.has(enr.userId.toString())) {
      issues.push({
        check: 'orphaned_enrollment',
        description: `User ${enr.userId} has Active enrollment in team ${teamId} but is not in team.members`,
        refs: { enrollmentId: enr._id, userId: enr.userId, teamId: enr.teamId },
        detail: null,
      });
    }
  }
  return issues;
}

/**
 * CHECK 3 — Users in team.members with no Active enrollment
 * for that team.
 * Inverse of CHECK 2: the team was edited directly without
 * creating (or restoring) an Enrollment record.
 */
async function checkGhostMembers() {
  const issues = [];

  // Fetch all teams that have at least one member
  const teams = await Team.find({ $expr: { $gt: [{ $size: '$members' }, 0] } })
    .select('_id members')
    .lean();

  if (teams.length === 0) return issues;

  // Fetch all Active enrollments (one query)
  const activeEnrollments = await Enrollment.find({ status: 'Active' })
    .select('userId teamId')
    .lean();
  const enrolledSet = new Set(
    activeEnrollments.map((e) => `${e.userId}|${e.teamId}`)
  );

  for (const team of teams) {
    for (const memberId of team.members) {
      const key = `${memberId}|${team._id}`;
      if (!enrolledSet.has(key)) {
        issues.push({
          check: 'ghost_member',
          description: `User ${memberId} is in team ${team._id}.members but has no Active enrollment`,
          refs: { userId: memberId, teamId: team._id },
          detail: null,
        });
      }
    }
  }
  return issues;
}

/**
 * CHECK 4 — Future schedules with zero enrolled users.
 * These should have been auto-deleted when the last member
 * was removed (via auto-release or team-sync).
 * Their existence indicates the cleanup path failed silently.
 */
async function checkEmptyFutureSchedules() {
  const issues = [];
  const now = new Date();

  const emptySchedules = await Schedule.find({
    startTime: { $gt: now },
    $expr: { $eq: [{ $size: '$enrolledUsers' }, 0] },
  })
    .select('_id classId bookedTeamId startTime')
    .lean();

  for (const sched of emptySchedules) {
    issues.push({
      check: 'empty_future_schedule',
      description: `Future schedule on ${sched.startTime.toISOString().slice(0, 10)} has 0 enrolled users and should be deleted`,
      refs: { scheduleId: sched._id, classId: sched.classId, teamId: sched.bookedTeamId },
      detail: null,
    });
  }
  return issues;
}

/**
 * CHECK 5 — Active Participants with no Active enrollment.
 * These users are not in any team, cannot book schedules,
 * and will generate zero attendance / evaluation data.
 * They may be new users waiting for assignment, or orphaned
 * after a team was dissolved without re-enrolling them.
 */
async function checkUnattachedParticipants() {
  const issues = [];

  const activeParticipants = await User.find({
    role: 'Participant',
    status: 'Active',
  })
    .select('_id empCode name')
    .lean();

  if (activeParticipants.length === 0) return issues;

  const participantIds = activeParticipants.map((u) => u._id);
  const activeEnrollments = await Enrollment.find({
    userId: { $in: participantIds },
    status: 'Active',
  })
    .select('userId')
    .lean();
  const enrolledSet = new Set(activeEnrollments.map((e) => e.userId.toString()));

  for (const user of activeParticipants) {
    if (!enrolledSet.has(user._id.toString())) {
      issues.push({
        check: 'unattached_participant',
        description: `Active participant ${user.empCode} (${user.name}) has no Active enrollment`,
        refs: { userId: user._id },
        detail: { empCode: user.empCode, name: user.name },
      });
    }
  }
  return issues;
}

// ──────────────────────────────────────────────────────────
// Main entry point
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

  // Run all 5 checks in parallel — they are independent read-only queries
  const [
    missingAttendance,
    orphanedEnrollments,
    ghostMembers,
    emptyFutureSchedules,
    unattachedParticipants,
  ] = await Promise.all([
    checkMissingAttendance().catch((err) => {
      logger.error({ err }, 'reconcile: check_missing_attendance failed');
      return [];
    }),
    checkOrphanedEnrollments().catch((err) => {
      logger.error({ err }, 'reconcile: check_orphaned_enrollments failed');
      return [];
    }),
    checkGhostMembers().catch((err) => {
      logger.error({ err }, 'reconcile: check_ghost_members failed');
      return [];
    }),
    checkEmptyFutureSchedules().catch((err) => {
      logger.error({ err }, 'reconcile: check_empty_future_schedules failed');
      return [];
    }),
    checkUnattachedParticipants().catch((err) => {
      logger.error({ err }, 'reconcile: check_unattached_participants failed');
      return [];
    }),
  ]);

  const allIssues = [
    ...missingAttendance,
    ...orphanedEnrollments,
    ...ghostMembers,
    ...emptyFutureSchedules,
    ...unattachedParticipants,
  ];

  const summary = {
    missing_attendance:     missingAttendance.length,
    orphaned_enrollment:    orphanedEnrollments.length,
    ghost_member:           ghostMembers.length,
    empty_future_schedule:  emptyFutureSchedules.length,
    unattached_participant: unattachedParticipants.length,
    total:                  allIssues.length,
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
