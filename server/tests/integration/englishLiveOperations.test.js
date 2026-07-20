/**
 * Canonical English Operations vertical smoke.
 *
 * The HTTP flow follows the pinned ConMeoGauGau authority: stable class + PIC,
 * Run Enrollment, Meeting + logical Session Unit, then one atomic full P/A
 * roster. Imported evidence and the superseded generic English projection are
 * deliberately outside this live-write test.
 */
const request = require('supertest');
const { query } = require('../../config/pg');
const {
  getApp, getTokens, getSeedData, getCsrfHeaders, teardown,
} = require('../setup');

let app;
let tokens;
let seed;
let csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
});

afterAll(async () => {
  await teardown();
});

const authorized = (req, token) => req
  .set('Authorization', `Bearer ${token}`)
  .set(csrf);

describe('English Operations — canonical live vertical flow', () => {
  test('PIC-owned class → learner start → Meeting → exact P/A roster', async () => {
    const suffix = Date.now().toString().slice(-8);
    const courseId = `eng-course-${suffix}`;
    const employeeId = `eng-employee-${suffix}`;

    // Course definitions and the employee crosswalk are fixture/reference data;
    // every business transition below goes through the production HTTP stack.
    await query(`INSERT INTO eng_courses (
      id, course_code, course_name, expected_units, max_absences_allowed, is_active, meta
    ) VALUES ($1,$2,$3,16,2,true,'{}'::jsonb)`, [
      courseId, `ENG_${suffix}`, 'Canonical English Integration',
    ]);
    await query(`INSERT INTO eng_employees (
      id, emp_code, full_name, employment_status, user_id, meta
    ) VALUES ($1,$2,$3,'active',$4,'{}'::jsonb)`, [
      employeeId, seed.member1.empCode, seed.member1.name, seed.member1._id,
    ]);

    const classResult = await authorized(
      request(app).post('/api/english-training/workspace/classes'),
      tokens.admin,
    ).send({
      classCode: `EL${suffix.slice(-3)}`,
      displayName: 'Canonical English Integration',
      courseId,
      startDate: '2026-07-20',
      capacity: 12,
      status: 'active',
      picLabel: 'People Team',
    });
    expect(classResult.status).toBe(201);
    const { cohortId, courseRunId } = classResult.body.data;

    const enrollment = await authorized(
      request(app).post(`/api/english-training/workspace/course-runs/${courseRunId}/enrollments`),
      tokens.admin,
    ).send({
      employeeId,
      startDate: '2026-07-20',
      confirmedStartSessionNumber: 1,
    });
    expect(enrollment.status).toBe(201);
    expect(enrollment.body.data).toMatchObject({ startSessionNumber: 1 });

    // 09:00-10:00 Vietnam on an otherwise empty far-future date.
    const session = await authorized(
      request(app).post(`/api/english-training/workspace/course-runs/${courseRunId}/sessions`),
      tokens.admin,
    ).send({
      startsAt: '2099-01-05T02:00:00.000Z',
      endsAt: '2099-01-05T03:00:00.000Z',
      confirmedSessionNumber: 1,
    });
    expect(session.status).toBe(201);
    expect(session.body.data).toMatchObject({ sessionNumber: 1 });
    const { meetingId, sessionUnitId } = session.body.data;

    const rosterPath = `/api/english-training/workspace/course-runs/${courseRunId}`
      + `/session-units/${sessionUnitId}/attendance`;
    const roster = await authorized(request(app).get(rosterPath), tokens.admin);
    expect(roster.status).toBe(200);
    expect(roster.body.data.rosterToken).toHaveLength(64);
    expect(roster.body.data.rows).toEqual([
      expect.objectContaining({
        runEnrollmentId: enrollment.body.data.enrollmentId,
        empCode: seed.member1.empCode,
        status: 'present',
        attendanceId: null,
      }),
    ]);

    const save = await authorized(request(app).put(rosterPath), tokens.admin).send({
      rosterToken: roster.body.data.rosterToken,
      records: [{
        runEnrollmentId: enrollment.body.data.enrollmentId,
        status: 'present',
      }],
    });
    expect(save.status).toBe(200);
    expect(save.body.data).toMatchObject({ count: 1, createdCount: 1, updatedCount: 0 });

    const [meeting, unit, attendance, domainAudit] = await Promise.all([
      query('SELECT status FROM eng_meetings WHERE id = $1', [meetingId]),
      query('SELECT status FROM eng_session_units WHERE id = $1', [sessionUnitId]),
      query('SELECT status, original_status FROM eng_attendance_records WHERE session_unit_id = $1', [sessionUnitId]),
      query(`SELECT action FROM eng_audit_events
        WHERE entity_key = $1 AND action = 'attendance.roster.save'`, [sessionUnitId]),
    ]);
    expect(meeting.rows[0].status).toBe('completed');
    expect(unit.rows[0].status).toBe('held');
    expect(attendance.rows[0]).toMatchObject({ status: 'present', original_status: 'present' });
    expect(domainAudit.rowCount).toBe(1);

    // The first token captured the planned roster. Completion changes its
    // state, so retrying with that stale token must not overwrite anything.
    const stale = await authorized(request(app).put(rosterPath), tokens.admin).send({
      rosterToken: roster.body.data.rosterToken,
      records: [{ runEnrollmentId: enrollment.body.data.enrollmentId, status: 'absent' }],
    });
    expect(stale.status).toBe(409);
    expect(stale.body.message).toMatch(/roster changed/i);

    const detail = await authorized(
      request(app).get(`/api/english-training/workspace/classes/${cohortId}`),
      tokens.admin,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.data.runs[0].roster[0]).toMatchObject({
      employeeId,
      presentCount: 1,
      markedCount: 1,
    });
  });
});
