// English-training import — pipeline. Orchestrates stage → transform → load →
// reconcile in one transaction. Column-explicit inserts (drop temp `_` fields,
// stringify jsonb). Returns a reconciliation + issue summary; asserts row counts.

const { readWorkbook, rowHash, PHASE1_SHEETS } = require('./read-workbook');
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

function summarizeIssues(issues) {
  const by = {};
  for (const i of issues) by[i.code] = (by[i.code] || 0) + 1;
  return by;
}

async function runImport(path, { reset = false } = {}) {
  const { checksum, sheets } = await readWorkbook(path);
  const data = transform(sheets);

  await repo.withTransaction(async (client) => {
    if (reset) await repo.resetCanonical(client);

    for (const sheet of PHASE1_SHEETS) {
      for (const r of sheets[sheet]) {
        // eslint-disable-next-line no-await-in-loop
        await repo.stageRaw({ checksum, sheet, sourceRow: r.__row, rowHash: rowHash(r), payload: r }, client);
      }
    }

    for (const c of data.courses) await repo.insert('eng_courses', c, client);          // eslint-disable-line no-await-in-loop
    for (const c of data.cohorts) await repo.insert('eng_cohorts', c, client);           // eslint-disable-line no-await-in-loop
    for (const e of data.employees) await repo.insert('eng_employees', asEmployee(e), client); // eslint-disable-line no-await-in-loop
    for (const m of data.memberships) await repo.insert('eng_cohort_memberships', asMembership(m), client); // eslint-disable-line no-await-in-loop
    for (const r of data.courseRuns) await repo.insert('eng_course_runs', r, client);    // eslint-disable-line no-await-in-loop
    for (const e of data.enrollments) await repo.insert('eng_run_enrollments', asEnrollment(e), client); // eslint-disable-line no-await-in-loop
    for (const p of data.pics) await repo.insert('eng_cohort_pic', asPic(p), client);    // eslint-disable-line no-await-in-loop
    for (const iss of data.issues) await repo.recordIssue(iss, client);                  // eslint-disable-line no-await-in-loop
    await repo.applyEmployeeCorrections(client);
  });

  // Reconcile: source rows = loaded canonical + issue-skipped (per sheet).
  const reconcile = data.reconcile;
  const issues = summarizeIssues(data.issues);
  return { checksum, reconcile, issues, issueCount: data.issues.length };
}

module.exports = { runImport };
