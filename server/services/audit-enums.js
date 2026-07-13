/**
 * Audit enums — the plain source of truth for the AuditLog `entity` and
 * `actorRole` value sets.
 *
 * Extracted from models/AuditLog.js (Wave K · Phase 2 · D2e-1) so the runtime
 * PG audit repository (services/audit-repository.pg.js) and the coverage unit
 * test (tests/unit/auditEntityEnumCoverage.test.js) no longer require the
 * Mongoose model — a prerequisite for deleting the models + dropping `mongoose`
 * in D2e-2. On Postgres the audit write path validates against these sets
 * app-side (mig 029 decision: no DB CHECK — the enum is a growing ratchet).
 *
 * RATCHET RULE: adding an entity here is one-way. Never REMOVE a value or
 * downstream audit queries (and historical rows) will reject it. Audit writes
 * are fire-and-forget, so a mutation whose `entity` is missing from this set
 * drops its audit row SILENTLY — breaking the "audit every mutation" golden
 * rule with zero visible symptom (the coverage test guards against exactly that).
 */

// Actor roles that may appear on an audit line ('System' = cron/automation).
const AUDIT_ROLE_VALUES = ['Admin', 'Coordinator', 'Teacher', 'Participant', 'System'];

// Every entity a controller/service audits. PascalCase = model/domain name.
const AUDIT_ENTITY_VALUES = [
  'User', 'Team', 'Class', 'LearningProgram', 'Schedule', 'Attendance', 'Evaluation',
  'Enrollment', 'Setting', 'Auth', 'Import', 'Export', 'Report',
  // adminDb writes audit lines for Counter mutations + whitelisted collections.
  'Counter', 'AdminDb',
  // SEC-013 — sheets-sync + reconcile runs produce their own audit lines.
  'Sync', 'Reconcile',
  // re-center Phase 1 — already-audited entities backfilled + 'Office' (new model).
  'Department', 'Office', 'Certificate', 'Assessment',
  'AssessmentAttempt', 'AssessmentQuestion', 'Feedback',
  'Assignment', 'LearningPath',
  // re-center Phase 3 — Office-scoped Rooms.
  'Room',
  // Wave E3 phase-04 slice B — session waitlists.
  'WaitlistEntry',
  // TMS.update Build Plan #5 — Studio scheduling taxonomy.
  'SessionType',
  // Modernization H1 A3 — required-training compliance rules.
  'RequiredTraining',
  // Modernization H1 A1 — budget & cost management.
  'CostEntry', 'Budget',
  // Modernization H1 A5 part 2 — saved report presets.
  'ReportPreset',
  // Modernization H2 A2 — vendor & external-provider catalog.
  'Vendor',
  // Modernization H2 A6 — trainer qualification/availability.
  'TrainerProfile',
  // Modernization H2 A4 — TNA demand intake + annual plan.
  'TrainingRequest', 'TrainingPlan',
  // 2026-06-16 health audit — controllers audited these but the enum lagged, so
  // the writes failed schema validation SILENTLY. Backfilled:
  //   Role, AutomationRule, Skill, TenantConfig, Notification.
  'Role', 'AutomationRule', 'Skill', 'TenantConfig', 'Notification',
];

module.exports = { AUDIT_ENTITY_VALUES, AUDIT_ROLE_VALUES };
