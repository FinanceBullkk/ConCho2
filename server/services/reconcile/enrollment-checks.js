const Enrollment = require('../../models/Enrollment');
const Team = require('../../models/Team');
const User = require('../../models/User');

// ──────────────────────────────────────────────────────────
// Reconcile — enrollment-consistency checks (READ-ONLY)
// ──────────────────────────────────────────────────────────
//  2. orphaned_enrollment        — Active enrollment but user not in team
//  3. ghost_member               — in team.members but no Active enrollment
//  5. unattached_participant     — Active Participant with no Active enrollment
//  6. duplicate_active_enrollment— two+ Active enrollments for one user
//
// Checks 2, 3 (and orchestrator check 5) share the Active-enrollments fetch
// via ctx.activeEnrollments (PERF-004) — each falls back to its own query
// when called standalone.

/**
 * CHECK 2 — Active enrollments where the user is no longer
 * in the team's members array.
 * Indicates the admin removed someone from a team without
 * closing (or transferring) their Enrollment record.
 *
 * PERF-004 (audit PR G): activeEnrollments is now passed in as
 * `ctx.activeEnrollments` from runReconciliation so checks 2 and 3
 * share a single Enrollment.find() (each previously refetched).
 */
async function checkOrphanedEnrollments(ctx = {}) {
  const issues = [];
  const activeEnrollments = ctx.activeEnrollments
    ?? await Enrollment.find({ status: 'Active' }).select('_id userId teamId classId').lean();

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
      // No team. A cohort-based enrollment (classId set, teamId null) is valid
      // under the L&D model — not an orphan. Only flag when there is no cohort
      // either (genuinely dangling record).
      if (enr.classId) continue;
      issues.push({
        check: 'orphaned_enrollment',
        description: `Active enrollment ${enr._id} has neither a team nor a cohort`,
        refs: { enrollmentId: enr._id, userId: enr.userId },
        detail: { reason: 'no_team_no_cohort' },
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
 *
 * PERF-004 (audit PR G): accepts ctx.activeEnrollments to share the
 * fetch with check 2.
 */
async function checkGhostMembers(ctx = {}) {
  const issues = [];

  // Fetch all teams that have at least one member
  const teams = await Team.find({ $expr: { $gt: [{ $size: '$members' }, 0] } })
    .select('_id members')
    .lean();

  if (teams.length === 0) return issues;

  const activeEnrollments = ctx.activeEnrollments
    ?? await Enrollment.find({ status: 'Active' }).select('userId teamId').lean();
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

module.exports = {
  checkOrphanedEnrollments,
  checkGhostMembers,
  checkUnattachedParticipants,
  checkDuplicateActiveEnrollments,
};
