// ──────────────────────────────────────────────────────────
// Groups (Team) Controller (facade — Admin only)
// ──────────────────────────────────────────────────────────
// Phase 1 domain extraction: relocated from controllers/teamController.js +
// controllers/team/* into domains/groups/ (behavior-preserving — the `Team`
// model and the `/api/teams` URL are unchanged; the target vocabulary is
// LearningGroup, migrated via this module, not a collection rename).
// Concerns are split by file:
//   - enrollment-sync.js → syncEnrollments + flushPendingEmails
//                          (shared by mutations + the enrollment transfer flow)
//   - queries.js         → list / by-id / my-teams / trash / progress
//   - mutations.js       → create + update (transactional, member conflict guard)
//   - lifecycle.js       → soft-delete cascade + restore
// This module re-exports the same surface — the 9 route handlers PLUS the two
// internal helpers consumed by controllers/enrollment/enrollment-transfer.js.

const {
  getTeams, getTeamById, getMyTeams, getDeletedTeams, getTeamProgress,
} = require('./queries');
const { createTeam, updateTeam } = require('./mutations');
const { deleteTeam, restoreTeam } = require('./lifecycle');
const { syncEnrollments, flushPendingEmails } = require('./enrollment-sync');

module.exports = {
  getTeams, getTeamById, createTeam, updateTeam, deleteTeam,
  restoreTeam, getDeletedTeams, getMyTeams, getTeamProgress,
  // Internal helpers exported for cross-controller use (enrollment transfers)
  syncEnrollments,
  flushPendingEmails,
};
