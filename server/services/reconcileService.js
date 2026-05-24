const mongoose = require('mongoose');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');
const Enrollment = require('../models/Enrollment');
const Team = require('../models/Team');
const User = require('../models/User');
const Class = require('../models/Class');
const Counter = require('../models/Counter');
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
// Audit PR C (DATA-011) — 5 new HIGH/MED severity checks
// ──────────────────────────────────────────────────────────

/**
 * CHECK 6 — Two or more Active enrollments for the same user.
 * Invariant #2 says a user may have at most one Active enrollment
 * globally. DATA-001's partial unique index would enforce this at the
 * DB level, but that requires a dedup migration first. Reconcile is the
 * safety net until the index lands.
 */
async function checkDuplicateActiveEnrollments() {
  const issues = [];

  const dupes = await Enrollment.aggregate([
    { $match: { status: 'Active' } },
    { $group: { _id: '$userId', count: { $sum: 1 }, enrollmentIds: { $push: '$_id' }, teamIds: { $push: '$teamId' } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  for (const dupe of dupes) {
    issues.push({
      check: 'duplicate_active_enrollment',
      description: `User ${dupe._id} has ${dupe.count} Active enrollments (one expected)`,
      refs: { userId: dupe._id },
      detail: {
        count: dupe.count,
        enrollmentIds: dupe.enrollmentIds.map(String),
        teamIds: dupe.teamIds.map(String),
      },
    });
  }
  return issues;
}

/**
 * CHECK 7 — Schedule.classId references a Class that no longer exists.
 * Hard-delete of a Class via the dedicated route would have cascaded;
 * direct admin-DB ops or partial migrations can leave dangling refs.
 */
async function checkOrphanScheduleClass() {
  const issues = [];

  // Distinct classIds referenced by ANY schedule (past or future)
  const referencedClassIds = await Schedule.distinct('classId');
  if (referencedClassIds.length === 0) return issues;

  // Class model auto-filters soft-deleted via pre('find'); we explicitly
  // include them by overriding the filter so we only flag truly missing.
  const existing = await Class.find(
    { _id: { $in: referencedClassIds }, isDeleted: { $in: [true, false, null] } }
  ).select('_id').lean();
  const existingSet = new Set(existing.map((c) => String(c._id)));

  const orphanIds = referencedClassIds.filter((id) => !existingSet.has(String(id)));
  if (orphanIds.length === 0) return issues;

  const orphanSchedules = await Schedule.find({ classId: { $in: orphanIds } })
    .select('_id classId bookedTeamId startTime')
    .lean();

  for (const sched of orphanSchedules) {
    issues.push({
      check: 'orphan_schedule_class',
      description: `Schedule ${sched._id} points to deleted Class ${sched.classId}`,
      refs: { scheduleId: sched._id, classId: sched.classId, teamId: sched.bookedTeamId },
      detail: { startTime: sched.startTime },
    });
  }
  return issues;
}

/**
 * CHECK 8 — Two or more non-deleted teams claim the same classId.
 * Invariant #14 says a class is assigned to at most one team.
 * DATA-003's partial unique was deferred for dedup reasons.
 */
async function checkMultiTeamClass() {
  const issues = [];

  // Team.aggregate auto-filters soft-deleted (added in audit PR 6 / DATA-007).
  const dupes = await Team.aggregate([
    { $match: { classId: { $ne: null } } },
    { $group: { _id: '$classId', count: { $sum: 1 }, teamIds: { $push: '$_id' }, teamNames: { $push: '$name' } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  for (const dupe of dupes) {
    issues.push({
      check: 'multi_team_class',
      description: `Class ${dupe._id} is claimed by ${dupe.count} teams (one expected)`,
      refs: { classId: dupe._id },
      detail: {
        count: dupe.count,
        teamIds: dupe.teamIds.map(String),
        teamNames: dupe.teamNames,
      },
    });
  }
  return issues;
}

/**
 * CHECK 9 — Counter sequence is less than the max code already in use.
 * Indicates the counter was reset (e.g. DB restore from an older snapshot
 * without the corresponding User/Class re-import) and the NEXT create
 * will produce a duplicate code — a hard production incident.
 *
 * Checks both empCode (User) and classCode (Class). The counter helper
 * uses _id like '<empCode>' / '<classCode>' as the document key.
 */
async function checkCounterDrift() {
  const issues = [];

  const numericFrom = (s) => {
    if (!s || typeof s !== 'string') return 0;
    const m = s.match(/(\d+)$/); // trailing digits
    return m ? parseInt(m[1], 10) : 0;
  };

  // ── empCode counter ─────────────────────────────────────
  const empCodeCounter = await Counter.findById('empCode').lean();
  if (empCodeCounter) {
    const maxUser = await User.findOne({ empCode: { $regex: /\d+$/ } })
      .sort({ empCode: -1 }).select('empCode').lean();
    const maxNum = numericFrom(maxUser?.empCode);
    if (empCodeCounter.seq < maxNum) {
      issues.push({
        check: 'counter_drift',
        description: `Counter 'empCode' seq=${empCodeCounter.seq} < max in-use empCode numeric=${maxNum}`,
        refs: {},
        detail: { counter: 'empCode', seq: empCodeCounter.seq, maxInUse: maxNum, sampleMaxEmpCode: maxUser?.empCode },
      });
    }
  }

  // ── classCode counter ───────────────────────────────────
  const classCodeCounter = await Counter.findById('classCode').lean();
  if (classCodeCounter) {
    const maxClass = await Class.findOne({ classCode: { $regex: /\d+$/ } })
      .sort({ classCode: -1 }).select('classCode').lean();
    const maxNum = numericFrom(maxClass?.classCode);
    if (classCodeCounter.seq < maxNum) {
      issues.push({
        check: 'counter_drift',
        description: `Counter 'classCode' seq=${classCodeCounter.seq} < max in-use classCode numeric=${maxNum}`,
        refs: {},
        detail: { counter: 'classCode', seq: classCodeCounter.seq, maxInUse: maxNum, sampleMaxClassCode: maxClass?.classCode },
      });
    }
  }
  return issues;
}

/**
 * CHECK 10 — Team.members contains a userId whose User document has
 * isDeleted:true. Populated members surface as null in the UI; analytics
 * pipelines that bypass populate (the team-aggregate hook from PR 6
 * filters teams, NOT user references inside team.members) see ghost rows.
 */
async function checkSoftDeletedInTeamMembers() {
  const issues = [];

  const teams = await Team.find({ $expr: { $gt: [{ $size: '$members' }, 0] } })
    .select('_id members')
    .lean();
  if (teams.length === 0) return issues;

  // Collect every userId across all teams (deduped).
  const allMemberIds = [...new Set(teams.flatMap((t) => t.members.map(String)))];

  // Use the User collection directly (override soft-delete filter) so we
  // can identify which IDs point to a deleted user.
  const usersRaw = await mongoose.connection.db.collection('users')
    .find({ _id: { $in: allMemberIds.map((id) => new mongoose.Types.ObjectId(id)) } })
    .project({ _id: 1, isDeleted: 1 })
    .toArray();
  const deletedSet = new Set(
    usersRaw.filter((u) => u.isDeleted === true).map((u) => String(u._id)),
  );

  if (deletedSet.size === 0) return issues;

  for (const team of teams) {
    for (const memberId of team.members) {
      const idStr = String(memberId);
      if (deletedSet.has(idStr)) {
        issues.push({
          check: 'soft_deleted_in_team_members',
          description: `Team ${team._id} has soft-deleted user ${idStr} in members[]`,
          refs: { teamId: team._id, userId: memberId },
          detail: null,
        });
      }
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
  ] = await Promise.all([
    checkMissingAttendance().catch(swallow('check_missing_attendance')),
    checkOrphanedEnrollments().catch(swallow('check_orphaned_enrollments')),
    checkGhostMembers().catch(swallow('check_ghost_members')),
    checkEmptyFutureSchedules().catch(swallow('check_empty_future_schedules')),
    checkUnattachedParticipants().catch(swallow('check_unattached_participants')),
    checkDuplicateActiveEnrollments().catch(swallow('check_duplicate_active_enrollment')),
    checkOrphanScheduleClass().catch(swallow('check_orphan_schedule_class')),
    checkMultiTeamClass().catch(swallow('check_multi_team_class')),
    checkCounterDrift().catch(swallow('check_counter_drift')),
    checkSoftDeletedInTeamMembers().catch(swallow('check_soft_deleted_in_team_members')),
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
