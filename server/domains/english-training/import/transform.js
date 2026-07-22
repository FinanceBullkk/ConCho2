// English-training import — transform (pure). Turns the 6 source sheets into
// canonical entity sets + data-quality issues, applying the owner-locked mappings
// (plan §4). No DB, no side effects → independently testable. IDs are generated
// here so in-memory FK links are stable before the load.

const crypto = require('crypto');
const n = require('./normalize');
const { transformPhase2 } = require('./phase2-transform');

const newId = () => crypto.randomBytes(12).toString('hex');
const normClass = (v) => { const s = n.normText(v); return s ? s.toUpperCase() : null; };

// sheets: { STUDENTS, COURSE_PLAN, CLASSES, ENROLLMENTS, PIC } (arrays of row objs).
function transform(sheets, now = new Date()) {
  const issues = [];
  const issue = (code, sheet, row, detail, entityType, entityKey, state = {}) => {
    const record = { code, sheet, sourceRow: row, detail, entityType, entityKey, ...state };
    issues.push(record);
    return record;
  };

  // ── courses ← COURSE_PLAN ──────────────────────────────────────────────
  const courses = [];
  const courseByName = new Map();
  for (const r of sheets.COURSE_PLAN) {
    const name = n.normText(r['Course Name']);
    if (!name) { issue('missing_course', 'COURSE_PLAN', r.__row); continue; }
    const c = {
      id: newId(), course_code: n.slug(name), course_name: name,
      expected_units: Number(r['Expected Sessions']) || 0,
      max_absences_allowed: n.ENG_MAX_ABSENCES_DEFAULT, is_active: true,
    };
    courses.push(c); courseByName.set(name, c);
  }

  // ── employees ← STUDENTS ───────────────────────────────────────────────
  const employees = [];
  const empByCode = new Map();
  for (const r of sheets.STUDENTS) {
    const code = n.normCode(r['Emp Code']);
    if (!code) { issue('missing_emp_code', 'STUDENTS', r.__row); continue; }
    const e = {
      id: newId(), emp_code: code, full_name: n.normText(r['Full Name']) || code,
      english_name: null, email: null,
      employment_status: n.employmentStatus(r['Drop reason']),
      user_id: null,
      _bu: n.normText(r['BU']) || 'unknown',
      _role: n.normText(r['ROLE']) || 'unknown',
    };
    if (!n.normText(r['BU'])) issue('missing_bu', 'STUDENTS', r.__row, null, 'employee', code);
    if (!n.normText(r['ROLE'])) issue('missing_role', 'STUDENTS', r.__row, null, 'employee', code);
    if (e.employment_status === 'inactive') issue('employee_resigned', 'STUDENTS', r.__row, null, 'employee', code);
    employees.push(e); empByCode.set(code, e);
  }

  // ── cohorts ← union of class codes (CLASSES ∪ PIC ∪ ENROLLMENTS) ────────
  const cohortByCode = new Map();
  const ensureCohort = (code) => {
    if (!code || cohortByCode.has(code)) return cohortByCode.get(code);
    const c = { id: newId(), class_code: code, display_name: code, status: 'active' };
    cohortByCode.set(code, c); return c;
  };
  for (const r of sheets.CLASSES) ensureCohort(normClass(r['Class Code']));
  const classesCodes = new Set(cohortByCode.keys());
  for (const r of sheets.PIC) {
    const code = normClass(r['Class Code']);
    if (code && !classesCodes.has(code)) issue('cohort_without_course_run', 'PIC', r.__row, null, 'cohort', code);
    ensureCohort(code);
  }
  for (const r of sheets.ENROLLMENTS) ensureCohort(normClass(r['Class Code']));

  // ── course runs ← CLASSES (run_number = 1; no repeats in data) ──────────
  const courseRuns = [];
  const runByKey = new Map(); // `${classCode}||${courseName}`
  for (const r of sheets.CLASSES) {
    const cc = normClass(r['Class Code']);
    const cn = n.normText(r['Course Name']);
    if (!cc) { issue('missing_class_code', 'CLASSES', r.__row); continue; }
    const course = courseByName.get(cn);
    if (!course) { issue('unknown_course', 'CLASSES', r.__row, { course: cn }); continue; }
    const cohort = cohortByCode.get(cc);
    const end = n.toDate(r['End Date']);
    const run = {
      id: newId(), cohort_id: cohort.id, course_id: course.id, run_number: 1,
      status: end && new Date(end) < now ? 'completed' : 'active',
      expected_units_snapshot: Number(r['Expected Sessions']) || course.expected_units,
      max_absences_allowed_snapshot: course.max_absences_allowed,
      start_date: n.toDate(r['Start Date']), end_date: end,
    };
    courseRuns.push(run); runByKey.set(`${cc}||${cn}`, run);
  }

  // ── parse enrollments, derive memberships, link ────────────────────────
  const rawEnr = [];
  for (const r of sheets.ENROLLMENTS) {
    const emp = n.normCode(r['Emp Code']);
    const cc = normClass(r['Class Code']);
    const cn = n.normText(r['Course Name']);
    if (!emp || !empByCode.has(emp)) { issue('missing_emp_code', 'ENROLLMENTS', r.__row, { emp }); continue; }
    const run = runByKey.get(`${cc}||${cn}`);
    if (!run) { issue('enrollment_without_run', 'ENROLLMENTS', r.__row, { cc, cn }); continue; }
    const status = n.enrollmentStatus(r['Status']);
    if (!status) { issue('unknown_status', 'ENROLLMENTS', r.__row, { status: r['Status'] }); continue; }
    rawEnr.push({ emp, cc, cn, run, status, start: n.toDate(r['Start Date']), row: r.__row });
  }

  // memberships: distinct (emp, cohort). start = min enrollment start; active if any active enrollment.
  const memberships = [];
  const memByKey = new Map();
  for (const e of rawEnr) {
    const key = `${e.emp}||${e.cc}`;
    let m = memByKey.get(key);
    if (!m) {
      m = {
        id: newId(), cohort_id: cohortByCode.get(e.cc).id, employee_id: empByCode.get(e.emp).id,
        start_date: e.start, end_date: null, status: 'completed', _anyActive: false, _minStart: e.start,
      };
      memByKey.set(key, m); memberships.push(m);
    }
    if (e.start && (!m._minStart || e.start < m._minStart)) m._minStart = e.start;
    if (e.status === 'active') m._anyActive = true;
  }
  for (const m of memberships) {
    m.start_date = m._minStart || null;
    m.status = m._anyActive ? 'active' : 'completed';
    if (!m.start_date) issue('missing_membership_start', 'ENROLLMENTS', null, { membership: m.id }, 'membership', m.id);
    delete m._anyActive; delete m._minStart;
  }

  // Capture source multi-active evidence before Phase 2. Canonical status is
  // reconciled only after attendance has been linked to these enrollments.
  const activeByEmp = new Map();
  for (const e of rawEnr) if (e.status === 'active') {
    const l = activeByEmp.get(e.emp) || [];
    l.push(e); activeByEmp.set(e.emp, l);
  }
  const multiActive = new Set();
  const multiActiveIssueByEmp = new Map();
  for (const [emp, list] of activeByEmp) {
    if (list.length <= 1) continue;
    multiActive.add(emp);
    multiActiveIssueByEmp.set(emp, issue('multi_active_enrollment', 'ENROLLMENTS', null,
      { emp, runs: list.map((x) => `${x.cc}||${x.cn}`) }, 'employee', emp));
  }

  const enrollments = [];
  for (const e of rawEnr) {
    const emp = empByCode.get(e.emp);
    enrollments.push({
      id: newId(), course_run_id: e.run.id, employee_id: emp.id,
      cohort_membership_id: memByKey.get(`${e.emp}||${e.cc}`).id,
      status: e.status, start_session_number: 1,
      business_unit_id_snapshot: emp._bu, job_role_id_snapshot: emp._role,
      // Retain the source status even if canonical reconciliation demotes the row.
      meta: (e.status === 'active' && multiActive.has(e.emp))
        ? { dq: 'multi_active', sourceStatus: 'active' } : null,
    });
  }

  // ── PIC assignments ← PIC ──────────────────────────────────────────────
  const pics = [];
  for (const r of sheets.PIC) {
    const cc = normClass(r['Class Code']);
    if (!cc) { issue('missing_class_code', 'PIC', r.__row); continue; }
    const empCode = n.normCode(r['EMP Code']);
    const emp = empCode ? empByCode.get(empCode) : null;
    const label = n.normText(r['PIC']);
    if (!emp && !label) { issue('unmapped_pic_employee', 'PIC', r.__row, { cc }); continue; }
    if (empCode && !emp) issue('unmapped_pic_employee', 'PIC', r.__row, { cc, empCode });
    const mail = n.normText(r['Mail']);
    if (emp && mail && !emp.email) emp.email = mail; // backfill PIC email onto employee
    pics.push({
      id: newId(), cohort_id: cohortByCode.get(cc).id,
      pic_employee_id: emp ? emp.id : null, pic_label: label,
      start_date: null, end_date: null, meta: mail ? { mail } : null,
    });
  }

  const phase2 = transformPhase2(sheets, {
    courses, cohorts: [...cohortByCode.values()], employees, courseRuns, enrollments,
  }, now);
  issues.push(...phase2.issues);

  // Mirror migration 047 for imports against the current schema: exactly one
  // attendance-evidenced active enrollment wins. Ambiguous evidence is rejected
  // before database writes rather than guessed around the partial unique index.
  const attendanceCountByEnrollment = new Map();
  for (const record of phase2.attendance) {
    attendanceCountByEnrollment.set(
      record.run_enrollment_id,
      (attendanceCountByEnrollment.get(record.run_enrollment_id) || 0) + 1,
    );
  }
  for (const empCode of multiActive) {
    const employee = empByCode.get(empCode);
    const active = enrollments.filter(
      (enrollment) => enrollment.employee_id === employee.id && enrollment.status === 'active',
    );
    const evidenced = active.filter(
      (enrollment) => (attendanceCountByEnrollment.get(enrollment.id) || 0) > 0,
    );
    if (evidenced.length !== 1) {
      throw new Error(
        `Ambiguous multi-active English enrollment for employee ${empCode}: `
        + `expected exactly one attendance-evidenced enrollment, found ${evidenced.length}.`,
      );
    }

    for (const enrollment of active) {
      if (enrollment.id === evidenced[0].id) continue;
      enrollment.status = 'waiting';
      enrollment.meta = {
        ...(enrollment.meta || {}),
        canonicalReconciliation: {
          previousStatus: 'active',
          reason: 'no_attendance_competing_active_enrollment',
          authority: 'ConMeoGauGau@4107cd52ee905e87254e099da23cb58dcbdd82a9',
        },
      };
    }

    for (const membership of memberships) {
      const hasDemotedEnrollment = active.some(
        (enrollment) => enrollment.cohort_membership_id === membership.id
          && enrollment.id !== evidenced[0].id,
      );
      const stillActive = enrollments.some(
        (enrollment) => enrollment.cohort_membership_id === membership.id
          && enrollment.status === 'active',
      );
      if (hasDemotedEnrollment && !stillActive && membership.status === 'active') {
        membership.status = 'cancelled';
      }
    }

    Object.assign(multiActiveIssueByEmp.get(empCode), {
      status: 'resolved',
      resolutionNote: 'Attendance-evidenced enrollment retained; empty competitor set to waiting.',
      resolvedBy: 'system:import-canonical-reconciliation',
      resolvedAt: now,
    });
  }

  return {
    courses, cohorts: [...cohortByCode.values()], employees, memberships, courseRuns,
    enrollments, pics, sessions: phase2.sessions, attendance: phase2.attendance, issues,
    reconcile: {
      COURSE_PLAN: { source: sheets.COURSE_PLAN.length, loaded: courses.length },
      STUDENTS: { source: sheets.STUDENTS.length, loaded: employees.length },
      CLASSES: { source: sheets.CLASSES.length, loaded: courseRuns.length },
      ENROLLMENTS: { source: sheets.ENROLLMENTS.length, loaded: enrollments.length },
      PIC: { source: sheets.PIC.length, loaded: pics.length },
      CLASS_SESSIONS: {
        source: (sheets.CLASS_SESSIONS || []).length, loaded: phase2.sessions.length, ignored: 0,
      },
      ATTENDANCE: {
        source: (sheets.ATTENDANCE || []).length, loaded: phase2.attendance.length,
        ignored: phase2.ignoredExactDuplicates + phase2.ignoredConflictingDuplicates,
      },
      cohorts: cohortByCode.size, memberships: memberships.length,
    },
  };
}

module.exports = { transform };
