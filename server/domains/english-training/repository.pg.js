// English-training domain — PostgreSQL repository (Phase 1).
// All SQL for the eng_* canonical tables + lossless import staging lives here.
// Consumed by the import pipeline (import/*) and the HTTP command/read layer.
// Generic parameterized insert keeps this DRY; a withTransaction helper gives the
// import an all-or-nothing load. No business rules here — those live in use-cases.

const crypto = require('crypto');
const { getPool, query } = require('../../config/pg');
const { ServiceError } = require('../../helpers/ServiceError');

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
    'eng_meetings',
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

const SESSION_TIME_NATURAL_KEY_SQL =
  `lower(concat_ws('|', co.class_code, c.course_code, r.run_number, su.session_number))`;
const COURSE_RUN_NATURAL_KEY_SQL =
  `lower(concat_ws('|', co.class_code, c.course_code, r.run_number))`;

async function listSessionsForTimeAllocation(client, { lock = false } = {}) {
  const { rows } = await runner(client)(`
    SELECT su.id,
      ${SESSION_TIME_NATURAL_KEY_SQL} AS natural_key,
      co.class_code,
      ${COURSE_RUN_NATURAL_KEY_SQL} AS course_run_key,
      su.session_number,
      COALESCE(tc.original_held_at, su.held_at) AS held_at
    FROM eng_session_units su
    JOIN eng_course_runs r ON r.id = su.course_run_id
    JOIN eng_cohorts co ON co.id = r.cohort_id
    JOIN eng_courses c ON c.id = r.course_id
    LEFT JOIN eng_session_time_corrections tc
      ON tc.natural_key = ${SESSION_TIME_NATURAL_KEY_SQL}
    ORDER BY held_at, co.class_code COLLATE "C", c.course_code COLLATE "C",
      r.run_number, su.session_number
    ${lock ? 'FOR UPDATE OF su' : ''}`);
  return rows.map((row) => ({
    id: row.id,
    naturalKey: row.natural_key,
    classCode: row.class_code,
    courseRunKey: row.course_run_key,
    sessionNumber: row.session_number,
    heldAt: row.held_at,
  }));
}

async function saveSessionTimeAllocation({ batchId, assignments, summary, reason, correctedBy }, client) {
  await runner(client)(`
    INSERT INTO eng_session_time_correction_batches (id, reason, corrected_by, summary)
    VALUES ($1,$2,$3,$4)
  `, [batchId, reason, correctedBy, JSON.stringify(summary)]);

  const changed = assignments.filter((row) => row.changedTime);
  if (changed.length) {
    await runner(client)(`
      INSERT INTO eng_session_time_corrections (
        natural_key, class_code, course_run_key, session_number,
        original_held_at, corrected_held_at, slot_label, moved_date,
        reason, corrected_by, batch_id
      )
      SELECT x.natural_key, x.class_code, x.course_run_key, x.session_number,
        x.original_held_at, x.corrected_held_at, x.slot_label, x.moved_date,
        $2, $3, $4
      FROM jsonb_to_recordset($1::jsonb) AS x(
        natural_key text, class_code text, course_run_key text, session_number integer,
        original_held_at timestamptz, corrected_held_at timestamptz,
        slot_label text, moved_date boolean
      )
      ON CONFLICT (natural_key) DO UPDATE SET
        class_code = EXCLUDED.class_code,
        course_run_key = EXCLUDED.course_run_key,
        session_number = EXCLUDED.session_number,
        corrected_held_at = EXCLUDED.corrected_held_at,
        slot_label = EXCLUDED.slot_label,
        moved_date = EXCLUDED.moved_date,
        reason = EXCLUDED.reason,
        corrected_by = EXCLUDED.corrected_by,
        batch_id = EXCLUDED.batch_id,
        updated_at = NOW()
    `, [JSON.stringify(changed.map((row) => ({
      natural_key: row.naturalKey,
      class_code: row.classCode,
      course_run_key: row.courseRunKey,
      session_number: row.sessionNumber,
      original_held_at: row.originalHeldAt,
      corrected_held_at: row.assignedStartAt,
      slot_label: row.slotLabel,
      moved_date: row.movedDate,
    }))), reason, correctedBy, batchId]);
  }

  const { rowCount } = await runner(client)(`
    WITH planned AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
        id text, original_held_at timestamptz, corrected_held_at timestamptz,
        assigned_end_at timestamptz, slot_label text, moved_date boolean
      )
    )
    UPDATE eng_session_units su SET
      held_at = planned.corrected_held_at,
      status = CASE
        WHEN su.status = 'cancelled' THEN su.status
        WHEN planned.corrected_held_at > NOW() THEN 'scheduled'
        ELSE 'held'
      END,
      meta = COALESCE(su.meta, '{}'::jsonb) || jsonb_build_object(
        'timeCorrection', jsonb_build_object(
          'originalHeldAt', planned.original_held_at,
          'correctedHeldAt', planned.corrected_held_at,
          'assignedEndAt', planned.assigned_end_at,
          'slotLabel', planned.slot_label,
          'movedDate', planned.moved_date,
          'batchId', $2::text
        )
      ),
      updated_at = NOW()
    FROM planned
    WHERE su.id = planned.id
  `, [JSON.stringify(assignments.map((row) => ({
    id: row.id,
    original_held_at: row.originalHeldAt,
    corrected_held_at: row.assignedStartAt,
    assigned_end_at: row.assignedEndAt,
    slot_label: row.slotLabel,
    moved_date: row.movedDate,
  }))), batchId]);
  return { updatedSessions: rowCount, persistedCorrections: changed.length };
}

async function verifySessionTimeAllocation(assignments, client) {
  const { rows } = await runner(client)(`
    WITH planned AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(id text, corrected_held_at timestamptz)
    ), actual AS (
      SELECT su.id, su.held_at, r.cohort_id, co.class_code
      FROM eng_session_units su
      JOIN eng_course_runs r ON r.id = su.course_run_id
      JOIN eng_cohorts co ON co.id = r.cohort_id
    ), overlap_rows AS (
      SELECT date_trunc('minute', held_at AT TIME ZONE 'UTC')
      FROM actual GROUP BY 1 HAVING count(*) > 1
    ), duplicate_class_dates AS (
      SELECT class_code, (held_at AT TIME ZONE 'UTC')::date
      FROM actual GROUP BY 1,2 HAVING count(*) > 1
    )
    SELECT
      (SELECT count(*)::int FROM actual) AS total,
      (SELECT count(*)::int FROM planned p
        LEFT JOIN actual a ON a.id = p.id
        WHERE a.id IS NULL OR a.held_at <> p.corrected_held_at) AS mismatches,
      (SELECT count(*)::int FROM overlap_rows) AS overlaps,
      (SELECT count(*)::int FROM duplicate_class_dates) AS class_date_duplicates
  `, [JSON.stringify(assignments.map((row) => ({
    id: row.id,
    corrected_held_at: row.assignedStartAt,
  })))]);
  const result = rows[0];
  return {
    total: result.total,
    mismatches: result.mismatches,
    overlaps: result.overlaps,
    classDateDuplicates: result.class_date_duplicates,
  };
}

async function applySessionTimeCorrections(client) {
  const { rowCount } = await runner(client)(`
    UPDATE eng_session_units su SET
      held_at = tc.corrected_held_at,
      status = CASE
        WHEN su.status = 'cancelled' THEN su.status
        WHEN tc.corrected_held_at > NOW() THEN 'scheduled'
        ELSE 'held'
      END,
      meta = COALESCE(su.meta, '{}'::jsonb) || jsonb_build_object(
        'timeCorrection', jsonb_build_object(
          'originalHeldAt', tc.original_held_at,
          'correctedHeldAt', tc.corrected_held_at,
          'slotLabel', tc.slot_label,
          'movedDate', tc.moved_date,
          'batchId', tc.batch_id
        )
      ),
      updated_at = NOW()
    FROM eng_course_runs r, eng_cohorts co, eng_courses c, eng_session_time_corrections tc
    WHERE su.course_run_id = r.id
      AND co.id = r.cohort_id
      AND c.id = r.course_id
      AND tc.natural_key = lower(concat_ws('|', co.class_code, c.course_code, r.run_number, su.session_number))
  `);
  return rowCount;
}

// Imported Meetings are inserted as cancelled staging rows so the active-slot
// uniqueness guard cannot observe pre-correction workbook clocks. After every
// correction overlay is applied, open their final lifecycle state in one SQL
// statement. Any remaining slot collision aborts the whole import transaction.
async function finalizeImportedMeetings(client) {
  const { rowCount } = await runner(client)(`
    UPDATE eng_meetings m SET
      starts_at = su.held_at,
      status = CASE su.status
        WHEN 'cancelled' THEN 'cancelled'
        WHEN 'held' THEN 'completed'
        ELSE 'planned'
      END,
      cancellation_reason = CASE
        WHEN su.status = 'cancelled' THEN 'Imported cancellation'
        ELSE NULL
      END,
      updated_at = NOW()
    FROM eng_session_units su
    WHERE su.meeting_id = m.id
      AND m.meta->>'source' = 'imported'
  `);
  return rowCount;
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
      r.attendance_threshold_ratio_snapshot,
      (SELECT count(*) FROM eng_attendance_records ar
        WHERE ar.run_enrollment_id = en.id)::int AS marked_count,
      (SELECT count(*) FROM eng_attendance_records ar
        WHERE ar.run_enrollment_id = en.id AND ar.status = 'present')::int AS present_count,
      (SELECT count(*) FROM eng_attendance_records ar
        WHERE ar.run_enrollment_id = en.id AND ar.status = 'absent')::int AS absence_count,
      (SELECT count(*) FILTER (WHERE ar.status = 'present')::numeric / nullif(count(*), 0)
        FROM eng_attendance_records ar
        WHERE ar.run_enrollment_id = en.id) AS attendance_ratio
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

const archiveState = (row) => ({
  isFrozen: Boolean(row?.is_frozen),
  cutoverAt: row?.cutover_at || null,
  frozenBy: row?.frozen_by || null,
  reason: row?.reason || null,
});

async function getArchiveState(client) {
  const { rows } = await runner(client)(
    'SELECT * FROM english_archive_control WHERE singleton = true',
  );
  return archiveState(rows[0]);
}

async function assertArchiveWritable(client) {
  const state = await getArchiveState(client);
  if (state.isFrozen) {
    throw new ServiceError('English archive is read-only after live cutover', 409);
  }
  return state;
}

async function freezeArchive({ actorId, reason }) {
  return withTransaction(async (client) => {
    const { rows: locked } = await client.query(
      'SELECT * FROM english_archive_control WHERE singleton = true FOR UPDATE',
    );
    if (locked[0]?.is_frozen) return { changed: false, state: archiveState(locked[0]) };
    const { rows } = await client.query(`
      UPDATE english_archive_control SET
        is_frozen = true, cutover_at = now(), frozen_by = $1, reason = $2, updated_at = now()
      WHERE singleton = true AND is_frozen = false
      RETURNING *`, [actorId == null ? null : String(actorId), reason]);
    return { changed: true, state: archiveState(rows[0]) };
  });
}

async function listArchiveAttendanceHistory() {
  const { rows } = await query(`
    SELECT 'archive' AS source, ar.id AS source_identity, e.emp_code,
      c.course_code AS program_code, co.class_code AS english_group_code,
      concat(co.class_code, ':', c.course_code, ':', r.run_number) AS cohort_run_code,
      su.session_number, su.held_at AS event_date,
      CASE ar.status WHEN 'present' THEN 'P' WHEN 'absent' THEN 'A' ELSE ar.status END AS attendance_status,
      lower(concat_ws('|', e.emp_code, c.course_code, co.class_code, r.run_number, su.session_number)) AS natural_key
    FROM eng_attendance_records ar
    JOIN eng_session_units su ON su.id = ar.session_unit_id
    JOIN eng_run_enrollments en ON en.id = ar.run_enrollment_id
    JOIN eng_employees e ON e.id = en.employee_id
    JOIN eng_course_runs r ON r.id = en.course_run_id
    JOIN eng_courses c ON c.id = r.course_id
    JOIN eng_cohorts co ON co.id = r.cohort_id
    ORDER BY su.held_at, e.emp_code COLLATE "C"
    LIMIT 20000`);
  return rows;
}

async function listLiveAttendanceHistory() {
  const { rows } = await query(`
    SELECT 'live' AS source, a.id AS source_identity, u.emp_code,
      p.code AS program_code, coalesce(cl.english_group_code, cl.class_code) AS english_group_code,
      cl.class_code AS cohort_run_code, ordered.session_number, s.start_time AS event_date,
      a.status AS attendance_status,
      lower(concat_ws('|', u.emp_code, p.code, coalesce(cl.english_group_code, cl.class_code), cl.class_code, ordered.session_number)) AS natural_key
    FROM attendances a
    JOIN schedules s ON s.id = a.schedule_id
    JOIN classes cl ON cl.id = s.class_id AND cl.is_deleted = false
    JOIN learning_programs p ON p.id = cl.program_id AND p.category = 'english'
    JOIN users u ON u.id = a.user_id AND u.is_deleted = false
    JOIN LATERAL (
      SELECT numbered.session_number FROM (
        SELECT sx.id, row_number() OVER (ORDER BY sx.start_time, sx.id)::int AS session_number
        FROM schedules sx WHERE sx.class_id = cl.id AND sx.status <> 'cancelled'
      ) numbered WHERE numbered.id = s.id
    ) ordered ON true
    ORDER BY s.start_time, u.emp_code COLLATE "C"
    LIMIT 20000`);
  return rows;
}

async function listArchiveEvaluationHistory() {
  const { rows } = await query(`
    SELECT 'archive' AS source, xr.id AS source_identity, e.emp_code,
      c.course_code AS program_code, co.class_code AS english_group_code,
      concat(co.class_code, ':', c.course_code, ':', r.run_number) AS cohort_run_code,
      xr.exam_date::timestamptz AS event_date, xr.level_code,
      lower(concat_ws('|', e.emp_code, c.course_code, co.class_code, r.run_number, 'level')) AS natural_key
    FROM eng_exam_results xr
    JOIN eng_run_enrollments en ON en.id = xr.run_enrollment_id
    JOIN eng_employees e ON e.id = en.employee_id
    JOIN eng_course_runs r ON r.id = en.course_run_id
    JOIN eng_courses c ON c.id = r.course_id
    JOIN eng_cohorts co ON co.id = r.cohort_id
    WHERE xr.is_deleted = false
    ORDER BY xr.exam_date, e.emp_code COLLATE "C"
    LIMIT 20000`);
  return rows;
}

async function listLiveEvaluationHistory() {
  const { rows } = await query(`
    SELECT 'live' AS source, ev.id AS source_identity, u.emp_code,
      p.code AS program_code, coalesce(cl.english_group_code, cl.class_code) AS english_group_code,
      cl.class_code AS cohort_run_code, coalesce(ev.evaluated_at, ev.updated_at) AS event_date,
      ev.level_code,
      lower(concat_ws('|', u.emp_code, p.code, coalesce(cl.english_group_code, cl.class_code), cl.class_code, 'level')) AS natural_key
    FROM evaluations ev
    JOIN classes cl ON cl.id = ev.class_id AND cl.is_deleted = false
    JOIN learning_programs p ON p.id = cl.program_id AND p.category = 'english'
    JOIN users u ON u.id = ev.user_id AND u.is_deleted = false
    WHERE ev.is_deleted = false AND ev.result_kind = 'english_level'
    ORDER BY coalesce(ev.evaluated_at, ev.updated_at), u.emp_code COLLATE "C"
    LIMIT 20000`);
  return rows;
}

module.exports = {
  newId, insert, insertMany, stageRaw, recordIssue, count, withTransaction, resetCanonical, query,
  findEmployeeForCorrection, getEmployeeCorrection, saveEmployeeCorrection,
  backfillUnknownEnrollmentSnapshots, resolveEmployeeIssues,
  recordEmployeeCorrectionHistory, applyEmployeeCorrections,
  listSessionsForTimeAllocation, saveSessionTimeAllocation,
  verifySessionTimeAllocation, applySessionTimeCorrections, finalizeImportedMeetings,
  getLevelByCode, getEnrollmentForExam, getActiveExamResult,
  upsertExamResult, softDeleteActiveExamResult,
  getArchiveState, assertArchiveWritable, freezeArchive,
  listArchiveAttendanceHistory, listLiveAttendanceHistory,
  listArchiveEvaluationHistory, listLiveEvaluationHistory,
};
