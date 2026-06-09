// ──────────────────────────────────────────────────────────
// Team Controller (facade — Admin only)
// ──────────────────────────────────────────────────────────
// The legacy 703-line teamController was split by concern (Phase 1
// modular-monolith refactor) into controllers/team/*:
//   - team-enrollment-sync.js → syncEnrollments + flushPendingEmails
//                               (shared by mutations + the enrollment transfer flow)
//   - team-queries.js         → list / by-id / my-teams / trash / progress
//   - team-mutations.js       → create + update (transactional, member conflict guard)
//   - team-lifecycle.js       → soft-delete cascade + restore
// This module re-exports the same surface — the 9 route handlers PLUS the two
// internal helpers consumed by controllers/enrollment/enrollment-transfer.js —
// so teamRoutes.js and the enrollment transfer flow are unchanged.

const {
  getTeams, getTeamById, getMyTeams, getDeletedTeams, getTeamProgress,
} = require('./team/team-queries');
const { createTeam, updateTeam } = require('./team/team-mutations');
const { deleteTeam, restoreTeam } = require('./team/team-lifecycle');
const { syncEnrollments, flushPendingEmails } = require('./team/team-enrollment-sync');

module.exports = {
  getTeams, getTeamById, createTeam, updateTeam, deleteTeam,
  restoreTeam, getDeletedTeams, getMyTeams, getTeamProgress,
  // Internal helpers exported for cross-controller use (enrollment transfers)
  syncEnrollments,
  flushPendingEmails,
};
