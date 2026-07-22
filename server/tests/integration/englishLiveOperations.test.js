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
const { toVN } = require('../../helpers/dayjsConfig');
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

    const leavePath = `/api/english-training/workspace/course-runs/${courseRunId}`
      + `/enrollments/${enrollment.body.data.enrollmentId}/leave`;
    const deniedLeave = await authorized(request(app).post(leavePath), tokens.teacher).send({
      lastActiveDate: '2026-07-20',
      reason: 'Teacher must not change enrollment state',
    });
    expect(deniedLeave.status).toBe(403);
    expect((await query(
      'SELECT status FROM eng_run_enrollments WHERE id = $1',
      [enrollment.body.data.enrollmentId],
    )).rows[0].status).toBe('active');

    const left = await authorized(request(app).post(leavePath), tokens.admin).send({
      lastActiveDate: '2026-07-20',
      reason: 'Work schedule changed',
    });
    expect(left.status).toBe(200);
    expect(left.body.data).toMatchObject({
      enrollmentId: enrollment.body.data.enrollmentId,
      membershipId: enrollment.body.data.membershipId,
      before: { status: 'active' },
      after: { status: 'dropped', lastActiveDate: '2026-07-20' },
      membershipEnded: true,
    });

    const [leftEnrollment, endedMembership, preservedAttendance, leaveAudit] = await Promise.all([
      query('SELECT status FROM eng_run_enrollments WHERE id = $1', [enrollment.body.data.enrollmentId]),
      query('SELECT status, end_date FROM eng_cohort_memberships WHERE id = $1', [enrollment.body.data.membershipId]),
      query('SELECT status FROM eng_attendance_records WHERE session_unit_id = $1', [sessionUnitId]),
      query(`SELECT action FROM eng_audit_events
        WHERE entity_key = $1 AND action = 'run_enrollment.leave'`, [enrollment.body.data.enrollmentId]),
    ]);
    expect(leftEnrollment.rows[0].status).toBe('dropped');
    expect(endedMembership.rows[0].status).toBe('cancelled');
    expect(toVN(endedMembership.rows[0].end_date).format('YYYY-MM-DD')).toBe('2026-07-20');
    expect(preservedAttendance.rows[0].status).toBe('present');
    expect(leaveAudit.rowCount).toBe(1);

    const detail = await authorized(
      request(app).get(`/api/english-training/workspace/classes/${cohortId}`),
      tokens.admin,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.data.runs[0].roster[0]).toMatchObject({
      employeeId,
      enrollmentStatus: 'dropped',
      presentCount: 1,
      markedCount: 1,
    });
  });

  test('adopted imported Meeting reschedules and cancels through the real PostgreSQL stack', async () => {
    const suffix = `${Date.now()}`.slice(-8);
    const courseId = `eng-adopt-course-${suffix}`;
    const meetingId = `eng-adopt-meeting-${suffix}`;
    const sessionUnitId = `eng-adopt-unit-${suffix}`;
    const sourceStartsAt = '2099-02-01T09:00:00.000Z';
    const operationalStartsAt = '2099-02-01T02:00:00.000Z';
    const movedStartsAt = '2099-02-02T02:00:00.000Z';
    const movedEndsAt = '2099-02-02T03:00:00.000Z';

    await query(`INSERT INTO eng_courses (
      id, course_code, course_name, expected_units, max_absences_allowed, is_active, meta
    ) VALUES ($1,$2,$3,16,2,true,'{}'::jsonb)`, [
      courseId, `ADOPT_${suffix}`, 'Adopted Meeting Integration',
    ]);

    const classResult = await authorized(
      request(app).post('/api/english-training/workspace/classes'),
      tokens.admin,
    ).send({
      classCode: `EA${suffix.slice(-4)}`,
      displayName: 'Adopted Meeting Integration',
      courseId,
      startDate: '2099-01-01',
      capacity: 12,
      status: 'active',
      picLabel: 'People Team',
    });
    expect(classResult.status).toBe(201);
    const { courseRunId } = classResult.body.data;

    // Imported evidence is fixture data. Every business mutation below goes
    // through the production HTTP stack.
    await query(`INSERT INTO eng_meetings (
      id, course_run_id, starts_at, duration_minutes, status, meta,
      source_starts_at, source_duration_minutes, operational_at,
      operational_by, operational_reason
    ) VALUES ($1,$2,$3,60,'planned',$4,$5,60,NOW(),'migration:050',$6)`, [
      meetingId,
      courseRunId,
      operationalStartsAt,
      JSON.stringify({ source: 'imported', sourceBaselinePreserved: true }),
      sourceStartsAt,
      'Owner-approved future imported schedule handoff',
    ]);
    await query(`INSERT INTO eng_session_units (
      id, course_run_id, meeting_id, session_number, held_at, status,
      source_sheet, source_row, unit_number_in_meeting, unit_type, meta
    ) VALUES ($1,$2,$3,1,$4,'scheduled','English schedule',42,1,'normal','{}'::jsonb)`, [
      sessionUnitId, courseRunId, meetingId, operationalStartsAt,
    ]);
    await query(`INSERT INTO eng_audit_events (
      actor_user_id, actor_emp_code, action, entity_type, entity_key, details
    ) VALUES (NULL,'SYSTEM','meeting.future_import.adopt','meeting',$1,$2)`, [
      meetingId,
      JSON.stringify({ sourceStartsAt, operationalStartsAt }),
    ]);

    const path = `/api/english-training/workspace/course-runs/${courseRunId}`
      + `/meetings/${meetingId}`;

    const denied = await authorized(request(app).patch(path), tokens.teacher).send({
      startsAt: movedStartsAt,
      endsAt: movedEndsAt,
      reason: 'Teacher must not control the schedule',
    });
    expect(denied.status).toBe(403);

    const beforeDenied = await query(
      'SELECT starts_at FROM eng_meetings WHERE id = $1', [meetingId],
    );
    expect(beforeDenied.rows[0].starts_at.toISOString()).toBe(operationalStartsAt);

    const moved = await authorized(request(app).patch(path), tokens.admin).send({
      startsAt: movedStartsAt,
      endsAt: movedEndsAt,
      reason: 'PIC requested another day',
    });
    expect(moved.status).toBe(200);
    expect(moved.body.data).toMatchObject({
      meetingId,
      sessionUnitId,
      before: { startsAt: operationalStartsAt, status: 'planned' },
      after: { startsAt: movedStartsAt, status: 'planned' },
    });

    const afterMove = await query(`SELECT
      m.starts_at, m.duration_minutes, m.source_starts_at,
      m.source_duration_minutes, m.operational_by, su.held_at
    FROM eng_meetings m
    JOIN eng_session_units su ON su.meeting_id = m.id
    WHERE m.id = $1`, [meetingId]);
    expect(afterMove.rows[0]).toMatchObject({
      duration_minutes: 60,
      source_duration_minutes: 60,
      operational_by: 'migration:050',
    });
    expect(afterMove.rows[0].starts_at.toISOString()).toBe(movedStartsAt);
    expect(afterMove.rows[0].held_at.toISOString()).toBe(movedStartsAt);
    expect(afterMove.rows[0].source_starts_at.toISOString()).toBe(sourceStartsAt);

    const cancelled = await authorized(request(app).delete(path), tokens.admin).send({
      cancellationReason: 'Course calendar changed',
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data).toMatchObject({
      meetingId,
      sessionUnitId,
      before: { status: 'planned', startsAt: movedStartsAt },
      after: {
        status: 'cancelled',
        startsAt: movedStartsAt,
        cancellationReason: 'Course calendar changed',
      },
    });

    const [preserved, domainAudit, globalAudit] = await Promise.all([
      query(`SELECT m.status, m.starts_at, m.source_starts_at,
          m.source_duration_minutes, su.status AS session_unit_status
        FROM eng_meetings m
        JOIN eng_session_units su ON su.meeting_id = m.id
        WHERE m.id = $1`, [meetingId]),
      query(`SELECT action FROM eng_audit_events
        WHERE entity_key = $1 ORDER BY created_at, id`, [meetingId]),
      query(`SELECT action FROM audit_log
        WHERE entity = 'EnglishMeeting' AND entity_id = $1
        ORDER BY created_at, seq`, [meetingId]),
    ]);
    expect(preserved.rows[0].status).toBe('cancelled');
    expect(preserved.rows[0].session_unit_status).toBe('cancelled');
    expect(preserved.rows[0].starts_at.toISOString()).toBe(movedStartsAt);
    expect(preserved.rows[0].source_starts_at.toISOString()).toBe(sourceStartsAt);
    expect(preserved.rows[0].source_duration_minutes).toBe(60);
    expect(domainAudit.rows.map((row) => row.action)).toEqual([
      'meeting.future_import.adopt',
      'meeting.reschedule',
      'meeting.cancel',
    ]);
    expect(globalAudit.rows.map((row) => row.action)).toEqual(['updated', 'cancelled']);
  });
});
