// ──────────────────────────────────────────────────────────
// Class Controller (facade)
// ──────────────────────────────────────────────────────────
// The legacy 323-line classController was split by concern (Phase 1
// modular-monolith refactor) into controllers/class/*:
//   - class-queries.js   → list (matrix) / course catalogue / by-id (gated)
//   - class-mutations.js → create / update / delete (referential guards + cascade)
// This module re-exports the same surface so classRoutes.js is unchanged.

const { getClasses, getCourseList, getClassById } = require('./class/class-queries');
const { createClass, updateClass, deleteClass } = require('./class/class-mutations');

module.exports = { getClasses, getCourseList, getClassById, createClass, updateClass, deleteClass };
