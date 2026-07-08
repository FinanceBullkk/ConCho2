// ETL Mongo→PG — per-model transforms + column coercion (Wave H).
//
// The ETL maps each raw Mongo document onto the LIVE PG schema by reflection
// (information_schema columns, snake_case ⇔ camelCase) — the same proven
// approach as tests/pg-auto-mirror.js, but FAIL-LOUD (an unmappable NOT NULL
// column must abort the collection, not skip the row) and with the per-model
// fixes the test mirror deliberately skips:
//   • SessionType / CustomFieldDefinition  — `order` → display_order rename
//   • CostEntry                            — nested scope.{…} → scope_*_id cols
//   • RequiredTraining                     — appliesTo.{type,value} + target.{kind,id}
//   • TrainingRequest                      — target.{kind,id} → target_kind/target_id
//   • User   — meta packing (customFields, _softDeletedEmail — B1 parking)
//   • Schedule — meta packing (externalTrainer, vendorId, sessionTypeId,
//     agenda, materials, customFields, googleEventId — read back by the pg
//     repos via `...(r.meta)`)
//
// Junction: Team.members[] → team_members(team_id,user_id) (handled by the
// main script — delete + reinsert per team).

// Mongo collection → model name (mongoose pluralization; no overrides exist).
// ORDER = parents before children (not required pre-FK/mig-036, but keeps the
// dangling-refs report meaningful on partial runs).
const COLLECTIONS = [
  ['users', 'User'],
  ['offices', 'Office'],
  ['departments', 'Department'],
  ['rooms', 'Room'],
  ['learningprograms', 'LearningProgram'],
  ['classes', 'Class'],
  ['teams', 'Team'],
  ['schedules', 'Schedule'],
  ['enrollments', 'Enrollment'],
  ['attendances', 'Attendance'],
  ['certificates', 'Certificate'],
  ['evaluations', 'Evaluation'],
  ['feedbacks', 'Feedback'],
  ['assessments', 'Assessment'],
  ['assessmentquestions', 'AssessmentQuestion'],
  ['assessmentattempts', 'AssessmentAttempt'],
  ['assignments', 'Assignment'],
  ['learningpaths', 'LearningPath'],
  ['skills', 'Skill'],
  ['trainerprofiles', 'TrainerProfile'],
  ['vendors', 'Vendor'],
  ['budgets', 'Budget'],
  ['costentries', 'CostEntry'],
  ['trainingplans', 'TrainingPlan'],
  ['trainingrequests', 'TrainingRequest'],
  ['requiredtrainings', 'RequiredTraining'],
  ['sessiontypes', 'SessionType'],
  ['customfielddefinitions', 'CustomFieldDefinition'],
  ['roles', 'Role'],
  ['automationrules', 'AutomationRule'],
  ['tenantconfigs', 'TenantConfig'],
  ['reportpresets', 'ReportPreset'],
  ['settings', 'Setting'],
  ['metricsnapshots', 'MetricSnapshot'],
  ['notificationlogs', 'NotificationLog'],
  ['pushsubscriptions', 'PushSubscription'],
  ['waitlistentries', 'WaitlistEntry'],
  ['roombookings', 'RoomBooking'],
  ['auditlogs', 'AuditLog'],
  ['counters', 'Counter'],
  ['tokenblocklists', 'TokenBlocklist'],
  ['cronruns', 'CronRun'], // needs mig 035 — main script skips if table absent
];

// Collections deliberately NOT copied.
const SKIP_COLLECTIONS = {
  reconcilereports: 'reconcile RETIRES at cutover (owner 2026-07-08) — reports die with it',
};

const toSnake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const toCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

// Model name → PG table candidates (same heuristic as tests/pg-auto-mirror.js).
const tableCandidates = (modelName) => {
  const s = toSnake(modelName);
  return [`${s}s`, `${s}es`, s, s.replace(/y$/, 'ies')];
};

// Pack a curated field subset into a `meta` object (only defined values).
const packMeta = (doc, fields) => {
  const meta = {};
  for (const f of fields) if (doc[f] !== undefined && doc[f] !== null) meta[f] = doc[f];
  return Object.keys(meta).length ? meta : null;
};

// Per-model doc pre-transforms — run BEFORE reflective column mapping.
const PRE_TRANSFORMS = {
  SessionType: (d) => ({ ...d, displayOrder: d.order }),
  CustomFieldDefinition: (d) => ({ ...d, displayOrder: d.order }),
  CostEntry: (d) => ({
    ...d,
    scopeProgramId: d.scope && d.scope.programId,
    scopeCohortId: d.scope && d.scope.cohortId,
    scopeSessionId: d.scope && d.scope.sessionId,
    scopeDepartmentId: d.scope && d.scope.departmentId,
    scopeVendorId: d.scope && d.scope.vendorId,
  }),
  RequiredTraining: (d) => ({
    ...d,
    appliesToType: d.appliesTo && d.appliesTo.type,
    appliesToValue: d.appliesTo && d.appliesTo.value,
    targetKind: d.target && d.target.kind,
    targetId: d.target && d.target.id,
  }),
  TrainingRequest: (d) => ({
    ...d,
    targetKind: d.target && d.target.kind,
    targetId: d.target && d.target.id,
  }),
  User: (d) => ({ ...d, meta: packMeta(d, ['customFields', '_softDeletedEmail']) }),
  Schedule: (d) => ({
    ...d,
    meta: packMeta(d, [
      'externalTrainer', 'vendorId', 'sessionTypeId', 'agenda',
      'materials', 'customFields', 'googleEventId',
    ]),
  }),
};

/**
 * Map one raw Mongo doc onto a PG row for the given live column list.
 * Returns { row } where row keys are column names; columns with an undefined
 * source value are OMITTED (so PG column defaults apply on insert — an
 * explicit NULL would override a NOT NULL DEFAULT and abort).
 *
 * Coercion by column type (⇔ tests/pg-auto-mirror.js genericRow, ETL-hardened):
 *   id / *_id   → String(value)         (ObjectId → 24-hex text)
 *   ARRAY       → value.map(String)     (ObjectId[]/string[]/int[] — PG casts)
 *   jsonb       → JSON.stringify(value) (ALWAYS — a bare scalar passed raw is
 *                                        invalid json and node-pg won't wrap it)
 *   everything else passes through (node-pg serializes Date → timestamptz).
 */
const mapRow = (modelName, rawDoc, cols) => {
  const pre = PRE_TRANSFORMS[modelName];
  const d = pre ? pre(rawDoc) : rawDoc;
  const row = {};
  for (const [col, type] of cols) {
    let v = col === 'id' ? d._id : d[toCamel(col)];
    if (v === undefined) continue; // let PG defaults fill (created_at/updated_at/…)
    if (v === null) { row[col] = null; continue; }
    if (col === 'id' || col.endsWith('_id')) v = String(v);
    else if (type === 'ARRAY') v = Array.isArray(v) ? v.map(String) : v;
    else if (type === 'jsonb') v = JSON.stringify(v);
    row[col] = v;
  }
  return row;
};

// Dangling-reference checks (child.col → parent) — printed post-run.
// MUST stay in lock-step with the `FKS` array in
// db/pg/migrations-cutover/036_fk_check_hardening.js: every FK mig 036 adds is
// a REFERENCES that will REJECT the ETL'd data if the child points at a
// missing parent. An INCOMPLETE list here gives false confidence — the
// 2026-07-08 real-data dry-run reported "1 dangling" (feedbacks.user_id) while
// mig 036 actually failed on assignments.program_id first, because the three
// entries below were missing. Keep all 30; if you edit mig 036's FKS, edit
// this too (both were hand-maintained on purpose — no runtime coupling between
// a scripts/ file and a migrations-cutover/ file).
const DANGLING_CHECKS = [
  ['schedules', 'class_id', 'classes'],
  ['schedules', 'booked_team_id', 'teams'],
  ['schedules', 'room_id', 'rooms'],
  ['enrollments', 'user_id', 'users'],
  ['enrollments', 'class_id', 'classes'],
  ['enrollments', 'team_id', 'teams'],
  ['enrollments', 'transferred_to', 'teams'],
  ['attendances', 'schedule_id', 'schedules'],
  ['attendances', 'user_id', 'users'],
  ['teams', 'class_id', 'classes'],
  ['teams', 'leader_id', 'users'],
  ['team_members', 'team_id', 'teams'],
  ['team_members', 'user_id', 'users'],
  ['evaluations', 'class_id', 'classes'],
  ['evaluations', 'user_id', 'users'],
  ['certificates', 'user_id', 'users'],
  ['certificates', 'program_id', 'learning_programs'],
  ['certificates', 'cohort_id', 'classes'],
  ['assignments', 'program_id', 'learning_programs'],
  ['assignments', 'path_id', 'learning_paths'],
  ['feedbacks', 'cohort_id', 'classes'],
  ['feedbacks', 'user_id', 'users'],
  ['waitlist_entries', 'schedule_id', 'schedules'],
  ['waitlist_entries', 'user_id', 'users'],
  ['room_bookings', 'room_id', 'rooms'],
  ['room_bookings', 'schedule_id', 'schedules'],
  ['classes', 'program_id', 'learning_programs'],
  ['users', 'department_id', 'departments'],
  ['users', 'office_id', 'offices'],
  ['users', 'manager_id', 'users'],
];

module.exports = { COLLECTIONS, SKIP_COLLECTIONS, tableCandidates, mapRow, DANGLING_CHECKS };
