const mongoose = require('mongoose');
const Team = require('../../models/Team');

// ──────────────────────────────────────────────────────────
// Reconcile — team-invariant checks (READ-ONLY)
// ──────────────────────────────────────────────────────────
//  8.  multi_team_class               — one class claimed by 2+ teams
//  10. soft_deleted_in_team_members   — team.members holds a soft-deleted user

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

module.exports = {
  checkMultiTeamClass,
  checkSoftDeletedInTeamMembers,
};
