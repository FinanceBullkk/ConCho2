// Schedule-roster sync helper lives on the Team model module; re-exported here
// so callers reach it through the repository rather than importing the model.
const { syncSchedulesForTeamUpdate } = require('../../models/Team');

// ──────────────────────────────────────────────────────────
// groups/repository — the domain façade (audit round 9 consolidated model
// access here; Wave-G moved the read bodies to the ./read-repository
// dual-backend seam — mongo impl is the verbatim move, behaviour 1:1).
// Callers (queries.js / mutations.js) keep requiring './repository' unchanged.
// ──────────────────────────────────────────────────────────

// ── Moved to dual-backend seams ───────────────────────────
// Wave-D slice 1 → ./lifecycle-repository (soft-delete cascade: markTeamDeleted /
//   markTeamRestored / closeActiveEnrollments + their pre-reads);
// Wave-D slice 2 → ./team-write-repository (insertTeam / updateTeamDoc /
//   unassignTeamClass + the member-array ⇄ team_members junction bridge);
// Wave-D slice 3 → ./enrollment-sync-repository (findTeamForEnrollmentContext /
//   findActiveEnrollmentInOtherTeam / transferEnrollment / findActiveEnrollmentInTeam /
//   dropEnrollment / pullTeamMember / findUserContact);
// Wave-G → ./read-repository (the 13 reads below: team lists / single reads /
//   mutation guards). syncSchedulesForTeamUpdate stays Mongo-only BY DESIGN —
//   it ports with the schedule/waitlist concern, not the groups reads.
const {
  findTeamsPage, findAllTeams, countTeams,
  findTeamByIdPopulated, findTeamsForUser, findDeletedTeams,
  findTeamForProgress, findTeamScheduledSessions, findAttendanceForSchedules,
  findTeamByIdLean, findTeamByClass, findTeamByClassExcluding, findTeamsByMembers,
} = require('./read-repository');

module.exports = {
  syncSchedulesForTeamUpdate,
  // list reads
  findTeamsPage,
  findAllTeams,
  countTeams,
  // single reads
  findTeamByIdPopulated,
  findTeamsForUser,
  findDeletedTeams,
  findTeamForProgress,
  findTeamScheduledSessions,
  findAttendanceForSchedules,
  // mutation pre-reads / guards
  findTeamByIdLean,
  findTeamByClass,
  findTeamByClassExcluding,
  findTeamsByMembers,
};
