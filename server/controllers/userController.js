// ──────────────────────────────────────────────────────────
// User Controller (facade — Admin only)
// ──────────────────────────────────────────────────────────
// The legacy 556-line userController was split by concern (Phase 1
// modular-monolith refactor) into controllers/user/*:
//   - user-queries.js   → list/search, single fetch, trash view, progress
//   - user-mutations.js → create, update (+ BUG #9 re-auth gate)
//   - user-lifecycle.js → soft-delete cascade, restore
// This module re-exports the same handler surface so userRoutes.js is
// unchanged.

const { getUsers, getUserById, getDeletedUsers, getUserProgress } = require('./user/user-queries');
const { createUser, updateUser } = require('./user/user-mutations');
const { deleteUser, restoreUser } = require('./user/user-lifecycle');

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  restoreUser,
  getDeletedUsers,
  getUserProgress,
};
