const repository = require('./repository');
const EVENTS = require('../_shared/events');

// The build-spec §9 flows, seeded as DISABLED system rules so they appear in
// the Studio UI ready to enable — without changing behaviour or double-firing
// the existing hardcoded paths. Flows on not-yet-published events
// (overdue/recert/unmarked) are documented here; they fire once those events
// publish (a noted follow-up). Idempotent: only inserts when missing.
const SYSTEM_RULES = [
  {
    name: 'Notify learner on certificate issued',
    trigger: EVENTS.CERTIFICATE_ISSUED,
    conditions: [],
    actions: [{ type: 'notify', params: { message: 'Your certificate has been issued.' } }],
    enabled: false, system: true,
  },
  {
    name: 'Welcome on cohort enrollment',
    trigger: EVENTS.ENROLLMENT_CREATED,
    conditions: [{ field: 'actorIsSelf', op: 'falsy', value: null }],
    actions: [{ type: 'notify', params: { message: 'You have been enrolled in a new program.' } }],
    enabled: false, system: true,
  },
  // Documented §9 flows on cron-driven events not yet on the bus — visible in
  // the UI; inert until those events publish (follow-up).
  { name: 'Manager escalation for overdue', trigger: 'assignment.overdue', conditions: [], actions: [{ type: 'log', params: {} }], enabled: false, system: true },
  { name: 'Recertification before expiry', trigger: 'certificate.expiring', conditions: [], actions: [{ type: 'log', params: {} }], enabled: false, system: true },
  { name: 'Nudge unmarked attendance', trigger: 'attendance.unmarked', conditions: [], actions: [{ type: 'log', params: {} }], enabled: false, system: true },
];

// Dual-backend (Phase 5 slice 3 — A8): the seed writes follow DB_BACKEND via
// the repository's insert-if-missing (a soft-deleted system rule stays deleted).
const seedSystemRules = async () => {
  for (const rule of SYSTEM_RULES) {
    await repository.upsertSystemRuleByName(rule);
  }
};

module.exports = { seedSystemRules, SYSTEM_RULES };
