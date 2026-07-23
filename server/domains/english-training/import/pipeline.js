// English-training import — pipeline. Orchestrates stage → transform → load →
// reconcile in one transaction. Column-explicit inserts (drop temp `_` fields,
// stringify jsonb). Returns a reconciliation + issue summary; asserts row counts.

const { readWorkbook, rowHash, IMPORT_SHEETS } = require('./read-workbook');
const { transform } = require('./transform');
const repo = require('../repository.pg');
const { buildPlan } = require('../session-time-corrections');

const jsonb = (v) => (v ? JSON.stringify(v) : null);

const asEmployee = (e) => ({
  id: e.id, emp_code: e.emp_code, full_name: e.full_name, english_name: e.english_name,
  email: e.email, employment_status: e.employment_status, user_id: e.user_id,
});
const asMembership = (m) => ({
  id: m.id, cohort_id: m.cohort_id, employee_id: m.employee_id,
  start_date: m.start_date, end_date: m.end_date, status: m.status,
});
const asEnrollment = (e) => ({
  id: e.id, course_run_id: e.course_run_id, employee_id: e.employee_id,
  cohort_membership_id: e.cohort_membership_id, status: e.status,
  start_session_number: e.start_session_number,
  business_unit_id_snapshot: e.business_unit_id_snapshot,
  job_role_id_snapshot: e.job_role_id_snapshot, meta: jsonb(e.meta),
});
const asPic = (p) => ({
  id: p.id, cohort_id: p.cohort_id, pic_employee_id: p.pic_employee_id,
  pic_label: p.pic_label, start_date: p.start_date, end_date: p.end_date, meta: jsonb(p.meta),
});
const meetingId = (sessionId) => `meeting:${sessionId}`;
const asMeeting = (session) => ({
  id: meetingId(session.id),
  course_run_id: session.course_run_id,
  starts_at: session.held_at,
  duration_minutes: 60,
  // Keep imported meetings outside the active-slot index until all correction
  // overlays are applied. finalizeImportedMeetings opens them atomically.
  status: 'cancelled',
  cancellation_reason: 'Import transaction staging',
  meta: jsonb({ source: 'imported', sessionUnitId: session.id }),
});
const asSession = (session) => ({
  ...session,
  meeting_id: meetingId(session.id),
  unit_number_in_meeting: 1,
  unit_type: 'normal',
  meta: jsonb(session.meta),
});
const asAttendance = (record) => ({
  ...record,
  original_status: record.status,
  entered_by: null,
  meta: jsonb(record.meta),
});
const asReconciliationAudit = (enrollment) => ({
  actor_user_id: null,
  actor_emp_code: 'SYSTEM',
  action: 'run_enrollment.reconcile',
  entity_type: 'run_enrollment',
  entity_key: enrollment.id,
  details: jsonb({
    beforeStatus: enrollment.meta.canonicalReconciliation.previousStatus,
    afterStatus: enrollment.status,
    reason: enrollment.meta.canonicalReconciliation.reason,
    authority: enrollment.meta.canonicalReconciliation.authority,
  }),
});
const BATCH_SIZE = 400;

async function insertBatches(table, rows, client, options) {
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    // eslint-disable-next-line no-await-in-loop
    await repo.insertMany(table, rows.slice(offset, offset + BATCH_SIZE), client, options);
  }
}

function summarizeIssues(issues) {
  const by = {};
  for (const i of issues) by[i.code] = (by[i.code] || 0) + 1;
  return by;
}

function assertReconciliation(reconcile) {
  for (const [sheet, counts] of Object.entries(reconcile)) {
    if (!counts || typeof counts !== 'object' || !('source' in counts)) continue;
    const ignored = counts.ignored || 0;
    if (counts.source !== counts.loaded + ignored) {
      throw new Error(
        `Reconciliation mismatch for ${sheet}: source=${counts.source}, `
        + `loaded=${counts.loaded}, ignored=${ignored}.`,
      );
    }
  }
}

async function ensureSessionTimeCorrections(data, client) {
  if (!data.sessions.length) return;
  const existingCorrections = await repo.count('eng_session_time_corrections', client);
  if (existingCorrections === 0) {
    const sessions = await repo.listSessionsForTimeAllocation(client, { lock: true });
    const plan = buildPlan(sessions);
    const persisted = await repo.saveSessionTimeAllocation({
      batchId: repo.newId(),
      assignments: plan.assignments,
      summary: plan.summary,
      reason: 'Deterministic current-schema import reconstruction',
      correctedBy: 'system:eng-import',
    }, client);
    const verification = await repo.verifySessionTimeAllocation(plan.assignments, client);
    if (
      persisted.updatedSessions !== plan.summary.total
      || verification.total !== plan.summary.total
      || verification.mismatches !== 0
      || verification.overlaps !== 0
      || verification.classDateDuplicates !== 0
    ) {
      throw new Error(`Imported session-time reconstruction failed: ${JSON.stringify({ persisted, verification })}`);
    }
  }
  // Existing overlays are owner-approved authority; never replace them. The
  // fresh-DB bootstrap above persists the same deterministic overlay first.
  await repo.applySessionTimeCorrections(client);
}

async function runImport(path, { reset = false } = {}) {
  // Fail before workbook IO and before opening a transaction once production
  // archive cutover has made eng_* immutable. DB triggers remain the race guard.
  await repo.assertArchiveWritable();
  const { checksum, sheets } = await readWorkbook(path);
  const data = transform(sheets);
  assertReconciliation(data.reconcile);

  await repo.withTransaction(async (client) => {
    if (reset) await repo.resetCanonical(client);

    for (const sheet of IMPORT_SHEETS) {
      const staged = sheets[sheet].map((r) => ({
        id: repo.newId(), workbook_checksum: checksum, sheet,
        source_row: r.__row, row_hash: rowHash(r), payload: JSON.stringify(r),
      }));
      // eslint-disable-next-line no-await-in-loop
      await insertBatches('raw_eng_workbook_rows', staged, client, {
        onConflict: 'ON CONFLICT (workbook_checksum, sheet, source_row) DO NOTHING',
      });
    }

    await insertBatches('eng_courses', data.courses, client);
    await insertBatches('eng_cohorts', data.cohorts, client);
    await insertBatches('eng_employees', data.employees.map(asEmployee), client);
    await insertBatches('eng_cohort_memberships', data.memberships.map(asMembership), client);
    await insertBatches('eng_course_runs', data.courseRuns, client);
    await insertBatches('eng_run_enrollments', data.enrollments.map(asEnrollment), client);
    await insertBatches('eng_audit_events', data.enrollments
      .filter((enrollment) => enrollment.meta?.canonicalReconciliation)
      .map(asReconciliationAudit), client);
    await insertBatches('eng_cohort_pic', data.pics.map(asPic), client);
    await insertBatches('eng_meetings', data.sessions.map(asMeeting), client);
    await insertBatches('eng_session_units', data.sessions.map(asSession), client);
    await insertBatches('eng_attendance_records', data.attendance.map(asAttendance), client);
    await insertBatches('eng_data_quality_issues', data.issues.map((issue) => ({
      id: repo.newId(), issue_code: issue.code, entity_type: issue.entityType || null,
      entity_key: issue.entityKey || null, source_sheet: issue.sheet || null,
      source_row: issue.sourceRow || null,
      detail: issue.detail ? JSON.stringify(issue.detail) : null,
      status: issue.status || 'open', resolution_note: issue.resolutionNote || null,
      resolved_by: issue.resolvedBy || null, resolved_at: issue.resolvedAt || null,
    })), client);
    await repo.applyEmployeeCorrections(client);
    await ensureSessionTimeCorrections(data, client);
    await repo.finalizeImportedMeetings(client);
    await repo.adoptImportedFutureMeetings(client);
  });

  // Reconcile: source rows = loaded canonical + issue-skipped (per sheet).
  const reconcile = data.reconcile;
  const issues = summarizeIssues(data.issues);
  return { checksum, reconcile, issues, issueCount: data.issues.length };
}

module.exports = {
  runImport, insertBatches, assertReconciliation, ensureSessionTimeCorrections, BATCH_SIZE,
};
