// ──────────────────────────────────────────────────────────
// Attendance Service (compatibility facade)
// ──────────────────────────────────────────────────────────
// Phase 1 domain extraction (2026-06-10): the attendance logic now lives in
// `domains/attendance/*` (routes → controller → use-cases → marking/analytics/
// scope), matching the modular-monolith convention. This thin facade re-exports
// the domain's public surface so the few callers that import this path directly
// (server integration tests: analyticsPerf, phaseAHardening) stay unchanged.
// Prefer requiring `domains/attendance/use-cases` in new code.

module.exports = require('../domains/attendance/use-cases');
