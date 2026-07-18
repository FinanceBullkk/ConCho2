// English-training domain — PostgreSQL repository (Phase 1).
// All SQL for the eng_* canonical tables + lossless import staging lives here.
// Consumed by the import pipeline (import/*) and the HTTP command/read layer.
// Generic parameterized insert keeps this DRY; a withTransaction helper gives the
// import an all-or-nothing load. No business rules here — those live in use-cases.

const crypto = require('crypto');
const { getPool, query } = require('../../config/pg');

const newId = () => crypto.randomBytes(12).toString('hex');

// Bind either a pooled query or an in-transaction client's query.
const runner = (client) => (client ? client.query.bind(client) : query);

// Generic INSERT … RETURNING * for a plain column→value object.
async function insert(table, obj, client) {
  const keys = Object.keys(obj);
  const cols = keys.map((k) => `"${k}"`).join(', ');
  const ph = keys.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await runner(client)(
    `INSERT INTO ${table} (${cols}) VALUES (${ph}) RETURNING *`,
    keys.map((k) => obj[k]),
  );
  return rows[0];
}

// Batch inserts keep workbook imports bounded to a handful of database round
// trips. Callers must pass a trusted internal table name and uniform row shape.
async function insertMany(table, objects, client, { onConflict = '' } = {}) {
  if (!objects.length) return;
  const keys = Object.keys(objects[0]);
  const cols = keys.map((k) => `"${k}"`).join(', ');
  const values = [];
  const tuples = objects.map((obj, rowIndex) => {
    const offset = rowIndex * keys.length;
    values.push(...keys.map((k) => obj[k]));
    return `(${keys.map((_, columnIndex) => `$${offset + columnIndex + 1}`).join(', ')})`;
  });
  await runner(client)(
    `INSERT INTO ${table} (${cols}) VALUES ${tuples.join(', ')} ${onConflict}`,
    values,
  );
}

// Append-only raw staging; idempotent per (checksum, sheet, source_row).
async function stageRaw(row, client) {
  await runner(client)(
    `INSERT INTO raw_eng_workbook_rows (id, workbook_checksum, sheet, source_row, row_hash, payload)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (workbook_checksum, sheet, source_row) DO NOTHING`,
    [newId(), row.checksum, row.sheet, row.sourceRow, row.rowHash, JSON.stringify(row.payload)],
  );
}

// Record a durable data-quality issue (never drop a source row silently).
async function recordIssue(issue, client) {
  return insert('eng_data_quality_issues', {
    id: newId(),
    issue_code: issue.code,
    entity_type: issue.entityType || null,
    entity_key: issue.entityKey || null,
    source_sheet: issue.sheet || null,
    source_row: issue.sourceRow || null,
    detail: issue.detail ? JSON.stringify(issue.detail) : null,
  }, client);
}

async function count(table, client) {
  const { rows } = await runner(client)(`SELECT count(*)::int AS n FROM ${table}`);
  return rows[0].n;
}

// All-or-nothing unit of work for the import load.
async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const res = await fn(client);
    await client.query('COMMIT');
    return res;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Dev-only: wipe canonical + issues (NOT raw staging) so the import is re-runnable
// against the prototype DB. Dependency order matters (FKs).
async function resetCanonical(client) {
  const order = [
    'eng_data_quality_issues', 'eng_attendance_records', 'eng_session_units',
    'eng_cohort_pic', 'eng_run_enrollments',
    'eng_course_runs', 'eng_cohort_memberships', 'eng_employees',
    'eng_cohorts', 'eng_courses',
  ];
  for (const t of order) {
    // eslint-disable-next-line no-await-in-loop
    await runner(client)(`DELETE FROM ${t}`);
  }
}

async function findEmployeeForCorrection(empCode, client) {
  const { rows } = await runner(client)(
    `SELECT id, emp_code, full_name FROM eng_employees WHERE lower(emp_code) = lower($1) FOR UPDATE`,
    [empCode],
  );
  return rows[0] || null;
}

async function getEmployeeCorrection(empCode, client) {
  const { rows } = await runner(client)(
    `SELECT * FROM eng_employee_corrections WHERE lower(emp_code) = lower($1)`,
    [empCode],
  );
  return rows[0] || null;
}

async function saveEmployeeCorrection({ empCode, businessUnit, jobRole, reason, correctedBy }, client) {
  const { rows } = await runner(client)(`
    INSERT INTO eng_employee_corrections
      (emp_code, business_unit, job_role, reason, corrected_by)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (emp_code) DO UPDATE SET
      business_unit = EXCLUDED.business_unit,
      job_role = EXCLUDED.job_role,
      reason = EXCLUDED.reason,
      corrected_by = EXCLUDED.corrected_by,
      updated_at = NOW()
    RETURNING *
  `, [empCode, businessUnit, jobRole, reason, correctedBy]);
  return rows[0];
}

async function backfillUnknownEnrollmentSnapshots(empCode, { businessUnit, jobRole }, client) {
  const { rowCount } = await runner(client)(`
    UPDATE eng_run_enrollments en SET
      business_unit_id_snapshot = CASE
        WHEN $2::text IS NOT NULL AND (en.business_unit_id_snapshot IS NULL OR lower(en.business_unit_id_snapshot) = 'unknown')
          THEN $2 ELSE en.business_unit_id_snapshot END,
      job_role_id_snapshot = CASE
        WHEN $3::text IS NOT NULL AND (en.job_role_id_snapshot IS NULL OR lower(en.job_role_id_snapshot) = 'unknown')
          THEN $3 ELSE en.job_role_id_snapshot END,
      updated_at = NOW()
    FROM eng_employees e
    WHERE en.employee_id = e.id AND lower(e.emp_code) = lower($1)
  `, [empCode, businessUnit, jobRole]);
  return rowCount;
}

async function resolveEmployeeIssues(empCode, fields, { reason, correctedBy }, client) {
  const codes = [];
  if (fields.businessUnit) codes.push('missing_bu');
  if (fields.jobRole) codes.push('missing_role');
  if (!codes.length) return 0;
  const { rowCount } = await runner(client)(`
    UPDATE eng_data_quality_issues SET
      status = 'resolved', resolution_note = $3, resolved_by = $4, resolved_at = NOW()
    WHERE status = 'open' AND entity_type = 'employee'
      AND lower(entity_key) = lower($1) AND issue_code = ANY($2::text[])
  `, [empCode, codes, reason, correctedBy]);
  return rowCount;
}

async function recordEmployeeCorrectionHistory({ empCode, before, after, reason, correctedBy }, client) {
  await runner(client)(`
    INSERT INTO eng_employee_correction_history
      (id, emp_code, before, after, reason, corrected_by)
    VALUES ($1,$2,$3,$4,$5,$6)
  `, [newId(), empCode, JSON.stringify(before), JSON.stringify(after), reason, correctedBy]);
}

// Re-apply persistent overlays after a canonical reset/import. Only source
// placeholders are backfilled; legitimate historical snapshots are untouched.
async function applyEmployeeCorrections(client) {
  await runner(client)(`
    UPDATE eng_run_enrollments en SET
      business_unit_id_snapshot = CASE
        WHEN c.business_unit IS NOT NULL AND (en.business_unit_id_snapshot IS NULL OR lower(en.business_unit_id_snapshot) = 'unknown')
          THEN c.business_unit ELSE en.business_unit_id_snapshot END,
      job_role_id_snapshot = CASE
        WHEN c.job_role IS NOT NULL AND (en.job_role_id_snapshot IS NULL OR lower(en.job_role_id_snapshot) = 'unknown')
          THEN c.job_role ELSE en.job_role_id_snapshot END,
      updated_at = NOW()
    FROM eng_employees e
    JOIN eng_employee_corrections c ON lower(c.emp_code) = lower(e.emp_code)
    WHERE en.employee_id = e.id
  `);
  await runner(client)(`
    UPDATE eng_data_quality_issues i SET
      status = 'resolved',
      resolution_note = 'Persisted employee correction re-applied during import',
      resolved_by = c.corrected_by,
      resolved_at = NOW()
    FROM eng_employee_corrections c
    WHERE i.status = 'open' AND i.entity_type = 'employee'
      AND lower(i.entity_key) = lower(c.emp_code)
      AND ((i.issue_code = 'missing_bu' AND c.business_unit IS NOT NULL)
        OR (i.issue_code = 'missing_role' AND c.job_role IS NOT NULL))
  `);
}

// ── Phase 3: exam result & level (evaluation) ───────────────────────────────

async function getLevelByCode(code, client) {
  const { rows } = await runner(client)(
    'SELECT code, display_name, rank FROM eng_levels WHERE code = $1 AND is_active = true',
    [code],
  );
  return rows[0] || null;
}

// Load the enrollment for the exam gate. Locks the enrollment row and returns the
// run status + absence count so the use-case can enforce the ≤2-absence rule
// atomically. Returns null when the enrollment does not exist.
async function getEnrollmentForExam(enrollmentId, client) {
  const { rows } = await runner(client)(`
    SELECT en.id, en.status AS enrollment_status, r.status AS run_status,
      (SELECT count(*) FROM eng_attendance_records ar
        WHERE ar.run_enrollment_id = en.id AND ar.status = 'absent')::int AS absence_count
    FROM eng_run_enrollments en
    JOIN eng_course_runs r ON r.id = en.course_run_id
    WHERE en.id = $1
    FOR UPDATE OF en`, [enrollmentId]);
  return rows[0] || null;
}

async function getActiveExamResult(enrollmentId, client) {
  const { rows } = await runner(client)(
    `SELECT * FROM eng_exam_results WHERE run_enrollment_id = $1 AND is_deleted = false`,
    [enrollmentId],
  );
  return rows[0] || null;
}

// Upsert the single active result: update the existing active row in place, else
// insert a new one. The partial unique index guarantees at most one active row.
async function upsertExamResult({ enrollmentId, levelCode, examDate, note, enteredBy }, client) {
  const existing = await getActiveExamResult(enrollmentId, client);
  if (existing) {
    const { rows } = await runner(client)(`
      UPDATE eng_exam_results SET
        level_code = $2, exam_date = $3, note = $4, entered_by = $5, updated_at = NOW()
      WHERE id = $1 RETURNING *`, [existing.id, levelCode, examDate, note, enteredBy]);
    return { result: rows[0], created: false };
  }
  const { rows } = await runner(client)(`
    INSERT INTO eng_exam_results (id, run_enrollment_id, level_code, exam_date, note, entered_by)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [newId(), enrollmentId, levelCode, examDate, note, enteredBy]);
  return { result: rows[0], created: true };
}

async function softDeleteActiveExamResult(enrollmentId, client) {
  const { rows } = await runner(client)(`
    UPDATE eng_exam_results SET is_deleted = true, deleted_at = NOW(), updated_at = NOW()
    WHERE run_enrollment_id = $1 AND is_deleted = false RETURNING *`, [enrollmentId]);
  return rows[0] || null;
}

module.exports = {
  newId, insert, insertMany, stageRaw, recordIssue, count, withTransaction, resetCanonical, query,
  findEmployeeForCorrection, getEmployeeCorrection, saveEmployeeCorrection,
  backfillUnknownEnrollmentSnapshots, resolveEmployeeIssues,
  recordEmployeeCorrectionHistory, applyEmployeeCorrections,
  getLevelByCode, getEnrollmentForExam, getActiveExamResult,
  upsertExamResult, softDeleteActiveExamResult,
};
