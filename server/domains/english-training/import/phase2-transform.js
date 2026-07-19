// Phase-2 pure transform: normalized CLASS_SESSIONS + ATTENDANCE rows attach to
// the Phase-1 Course Run / Run Enrollment spine. Source evidence stays staged.

const crypto = require('crypto');
const n = require('./normalize');

const newId = () => crypto.randomBytes(12).toString('hex');
const normClass = (value) => n.normText(value)?.toUpperCase() || null;
const naturalRunKey = (classCode, courseName) => `${normClass(classCode)}||${n.normText(courseName)}`;
const naturalSessionKey = (classCode, courseName, sessionNumber) =>
  `${naturalRunKey(classCode, courseName)}||${Number(sessionNumber)}`;

function toTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function attendanceStatus(value) {
  const status = n.normText(value)?.toLowerCase();
  return status === 'present' || status === 'absent' ? status : null;
}

function transformPhase2(sheets, base, now = new Date()) {
  const issues = [];
  const issue = (code, sheet, row, detail, entityType, entityKey) =>
    issues.push({ code, sheet, sourceRow: row, detail, entityType, entityKey });
  const sessions = [];
  const attendance = [];

  const courseNameById = new Map(base.courses.map((course) => [course.id, course.course_name]));
  const classCodeById = new Map(base.cohorts.map((cohort) => [cohort.id, cohort.class_code]));
  const runByNaturalKey = new Map(base.courseRuns.map((run) => [
    naturalRunKey(classCodeById.get(run.cohort_id), courseNameById.get(run.course_id)), run,
  ]));
  const employeeByCode = new Map(base.employees.map((employee) => [employee.emp_code, employee]));
  const enrollmentByRunEmployee = new Map(base.enrollments.map((enrollment) => [
    `${enrollment.course_run_id}||${enrollment.employee_id}`, enrollment,
  ]));

  const sessionByNaturalKey = new Map();
  for (const row of sheets.CLASS_SESSIONS || []) {
    const key = naturalSessionKey(row['Class Code'], row['Course Name'], row['Session No']);
    const run = runByNaturalKey.get(naturalRunKey(row['Class Code'], row['Course Name']));
    const sessionNumber = Number(row['Session No']);
    const heldAt = toTimestamp(row.Date);
    if (!run) { issue('session_run_unresolved', 'CLASS_SESSIONS', row.__row, { key }); continue; }
    if (!Number.isInteger(sessionNumber) || sessionNumber < 1 || !heldAt) {
      issue('session_invalid', 'CLASS_SESSIONS', row.__row, { key, date: row.Date });
      continue;
    }
    if (sessionByNaturalKey.has(key)) {
      issue('session_duplicate_source_key', 'CLASS_SESSIONS', row.__row, { key }, 'course_run', run.id);
      continue;
    }
    const beyondExpected = sessionNumber > run.expected_units_snapshot;
    const session = {
      id: newId(), course_run_id: run.id, session_number: sessionNumber,
      held_at: heldAt, status: new Date(heldAt) > now ? 'scheduled' : 'held',
      source_sheet: 'CLASS_SESSIONS', source_row: row.__row,
      meta: beyondExpected ? { beyondExpectedUnits: true } : null,
    };
    sessions.push(session); sessionByNaturalKey.set(key, session);
    if (beyondExpected) issue('session_unit_out_of_range', 'CLASS_SESSIONS', row.__row,
      { sessionNumber, expectedUnits: run.expected_units_snapshot }, 'session_unit', session.id);
  }

  const attendanceByKey = new Map();
  let ignoredExactDuplicates = 0;
  let ignoredConflictingDuplicates = 0;
  for (const row of sheets.ATTENDANCE || []) {
    const session = sessionByNaturalKey.get(
      naturalSessionKey(row['Class Code'], row['Course Name'], row['Session No']),
    );
    const employee = employeeByCode.get(n.normCode(row['Emp Code']));
    const run = runByNaturalKey.get(naturalRunKey(row['Class Code'], row['Course Name']));
    const enrollment = run && employee
      ? enrollmentByRunEmployee.get(`${run.id}||${employee.id}`) : null;
    const status = attendanceStatus(row.Status);
    if (!session) { issue('attendance_session_unresolved', 'ATTENDANCE', row.__row); continue; }
    if (!employee) { issue('attendance_employee_unresolved', 'ATTENDANCE', row.__row); continue; }
    if (!enrollment) { issue('attendance_enrollment_unresolved', 'ATTENDANCE', row.__row); continue; }
    if (!status) { issue('attendance_status_unknown', 'ATTENDANCE', row.__row, { status: row.Status }); continue; }

    const key = `${session.id}||${enrollment.id}`;
    const sourceDropped = n.normText(row['Dropped Enrollment'])?.toLowerCase() === 'yes';
    const sourceDate = toTimestamp(row.Date);
    const dateMismatch = sourceDate !== session.held_at;
    const existing = attendanceByKey.get(key);
    if (existing) {
      const exactCanonicalEvidence = existing.status === status
        && (existing.meta?.sourceDate || existing.meta?.canonicalSessionDate || session.held_at) === sourceDate;
      if (exactCanonicalEvidence) ignoredExactDuplicates += 1;
      else ignoredConflictingDuplicates += 1;
      existing.source_enrollment_dropped ||= sourceDropped;
      existing.meta = {
        ...(existing.meta || {}), duplicateSourceRows: [
          ...(existing.meta?.duplicateSourceRows || []), row.__row,
        ],
      };
      issue(exactCanonicalEvidence ? 'attendance_duplicate_exact' : 'attendance_duplicate_conflict',
        'ATTENDANCE', row.__row,
        { originalSourceRow: existing.source_row, originalStatus: existing.status, conflictingStatus: status,
          originalDate: existing.meta?.sourceDate || session.held_at, conflictingDate: sourceDate },
        'attendance', existing.id);
      continue;
    }

    const record = {
      id: newId(), session_unit_id: session.id, run_enrollment_id: enrollment.id,
      status, source_enrollment_dropped: sourceDropped,
      source_sheet: 'ATTENDANCE', source_row: row.__row,
      meta: dateMismatch ? { sourceDate, canonicalSessionDate: session.held_at } : null,
    };
    attendance.push(record); attendanceByKey.set(key, record);
    if (dateMismatch) issue('attendance_date_mismatch', 'ATTENDANCE', row.__row,
      { sourceDate, canonicalSessionDate: session.held_at }, 'attendance', record.id);
  }

  return { sessions, attendance, issues, ignoredExactDuplicates, ignoredConflictingDuplicates };
}

module.exports = { transformPhase2, toTimestamp, attendanceStatus, naturalRunKey, naturalSessionKey };
