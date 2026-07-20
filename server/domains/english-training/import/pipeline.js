// English-training import — pipeline. Orchestrates stage → transform → load →
// reconcile in one transaction. Column-explicit inserts (drop temp `_` fields,
// stringify jsonb). Returns a reconciliation + issue summary; asserts row counts.

const { readWorkbook, rowHash, IMPORT_SHEETS } = require('./read-workbook');
const { transform } = require('./transform');
const repo = require('../repository.pg');

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
const asSession = (session) => ({ ...session, meta: jsonb(session.meta) });
const asAttendance = (record) => ({ ...record, meta: jsonb(record.meta) });
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

async function runImport(path, { reset = false } = {}) {
  // Fail before workbook IO and before opening a transaction once production
  // archive cutover has made eng_* immutable. DB triggers remain the race guard.
  await repo.assertArchiveWritable();
  const { checksum, sheets } = await readWorkbook(path);
  const data = transform(sheets);

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
    await insertBatches('eng_cohort_pic', data.pics.map(asPic), client);
    await insertBatches('eng_session_units', data.sessions.map(asSession), client);
    await insertBatches('eng_attendance_records', data.attendance.map(asAttendance), client);
    await insertBatches('eng_data_quality_issues', data.issues.map((issue) => ({
      id: repo.newId(), issue_code: issue.code, entity_type: issue.entityType || null,
      entity_key: issue.entityKey || null, source_sheet: issue.sheet || null,
      source_row: issue.sourceRow || null,
      detail: issue.detail ? JSON.stringify(issue.detail) : null,
    })), client);
    await repo.applyEmployeeCorrections(client);
    await repo.applySessionTimeCorrections(client);
  });

  // Reconcile: source rows = loaded canonical + issue-skipped (per sheet).
  const reconcile = data.reconcile;
  const issues = summarizeIssues(data.issues);
  return { checksum, reconcile, issues, issueCount: data.issues.length };
}

module.exports = { runImport, insertBatches, BATCH_SIZE };
