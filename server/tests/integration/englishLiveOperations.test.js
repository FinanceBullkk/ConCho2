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
    ) VALUES ($1,$2,$3,'active',$4,'{"businessUnit":"Finance","jobRole":"Analyst"}'::jsonb)`, [
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

    const targetClassResult = await authorized(
      request(app).post('/api/english-training/workspace/classes'),
      tokens.admin,
    ).send({
      classCode: `ET${suffix.slice(-3)}`,
      displayName: 'Canonical English Transfer Target',
      courseId,
      startDate: '2026-07-20',
      capacity: 12,
      status: 'active',
      picLabel: 'People Team',
    });
    expect(targetClassResult.status).toBe(201);
    const { cohortId: targetCohortId, courseRunId: targetCourseRunId } = targetClassResult.body.data;

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

    // The session list reports the full match count (windowed, ignoring LIMIT)
    // so the client can fetch remaining pages in parallel. With limit=1 the page
    // holds one row while `total` still reflects everything that matches.
    const listed = await authorized(
      request(app).get('/api/english-training/sessions?limit=1'), tokens.admin,
    );
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(typeof listed.body.total).toBe('number');
    expect(listed.body.total).toBeGreaterThanOrEqual(listed.body.count);

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

    // Attendance is now complete and at 100%, so the learner may sit the exam.
    // This FIRST entry has no previous result (before = null) — the path that
    // used to write the row and then 500 inside the audit diff.
    const examPath = `/api/english-training/enrollments/${enrollment.body.data.enrollmentId}/exam-result`;
    const exam = await authorized(request(app).post(examPath), tokens.admin).send({
      levelCode: 'foundation',
      examDate: '2099-01-06',
    });
    expect(exam.status).toBe(201);
    expect(exam.body.data).toMatchObject({ levelCode: 'foundation' });

    const [examRow, examAudit] = await Promise.all([
      query(`SELECT level_code, is_deleted FROM eng_exam_results
        WHERE run_enrollment_id = $1`, [enrollment.body.data.enrollmentId]),
      query(`SELECT action FROM audit_log
        WHERE entity = 'EnglishTrainingExamResult' AND entity_id = $1`,
      [enrollment.body.data.enrollmentId]),
    ]);
    expect(examRow.rows[0]).toMatchObject({ level_code: 'foundation', is_deleted: false });
    expect(examAudit.rowCount).toBe(1);

    // The first token captured the planned roster. Completion changes its
    // state, so retrying with that stale token must not overwrite anything.
    const stale = await authorized(request(app).put(rosterPath), tokens.admin).send({
      rosterToken: roster.body.data.rosterToken,
      records: [{ runEnrollmentId: enrollment.body.data.enrollmentId, status: 'absent' }],
    });
    expect(stale.status).toBe(409);
    expect(stale.body.message).toMatch(/roster changed/i);

    const transferPath = `/api/english-training/workspace/course-runs/${courseRunId}`
      + `/enrollments/${enrollment.body.data.enrollmentId}/transfer`;
    const deniedTransfer = await authorized(request(app).post(transferPath), tokens.teacher).send({
      targetCourseRunId, transferDate: '2026-07-20', confirmedStartSessionNumber: 1,
    });
    expect(deniedTransfer.status).toBe(403);
    expect((await query(
      'SELECT status FROM eng_run_enrollments WHERE id = $1',
      [enrollment.body.data.enrollmentId],
    )).rows[0].status).toBe('active');

    const transferred = await authorized(request(app).post(transferPath), tokens.admin).send({
      targetCourseRunId, transferDate: '2026-07-20', confirmedStartSessionNumber: 1,
    });
    expect(transferred.status).toBe(200);
    expect(transferred.body.data).toMatchObject({
      fromEnrollmentId: enrollment.body.data.enrollmentId,
      fromMembershipId: enrollment.body.data.membershipId,
      startSessionNumber: 1,
    });

    const [sourceEnrollment, sourceMembership, targetEnrollment, preservedAfterTransfer, transferAudit] = await Promise.all([
      query('SELECT status FROM eng_run_enrollments WHERE id = $1', [enrollment.body.data.enrollmentId]),
      query('SELECT status, end_date, transfer_to_membership_id FROM eng_cohort_memberships WHERE id = $1', [enrollment.body.data.membershipId]),
      query('SELECT status, transfer_from_enrollment_id FROM eng_run_enrollments WHERE id = $1', [transferred.body.data.enrollmentId]),
      query('SELECT status FROM eng_attendance_records WHERE session_unit_id = $1', [sessionUnitId]),
      query(`SELECT action FROM eng_audit_events
        WHERE entity_key = $1 AND action = 'learner.transfer'`, [transferred.body.data.enrollmentId]),
    ]);
    expect(sourceEnrollment.rows[0].status).toBe('transferred');
    expect(sourceMembership.rows[0].status).toBe('transferred');
    expect(toVN(sourceMembership.rows[0].end_date).format('YYYY-MM-DD')).toBe('2026-07-20');
    expect(sourceMembership.rows[0].transfer_to_membership_id).toBe(transferred.body.data.membershipId);
    expect(targetEnrollment.rows[0]).toMatchObject({
      status: 'active', transfer_from_enrollment_id: enrollment.body.data.enrollmentId,
    });
    expect(preservedAfterTransfer.rows[0].status).toBe('present');
    expect(transferAudit.rowCount).toBe(1);

    const leavePath = `/api/english-training/workspace/course-runs/${targetCourseRunId}`
      + `/enrollments/${transferred.body.data.enrollmentId}/leave`;

    const left = await authorized(request(app).post(leavePath), tokens.admin).send({
      lastActiveDate: '2026-07-20',
      reason: 'Work schedule changed',
    });
    expect(left.status).toBe(200);
    expect(left.body.data).toMatchObject({
      enrollmentId: transferred.body.data.enrollmentId,
      membershipId: transferred.body.data.membershipId,
      before: { status: 'active' },
      after: { status: 'dropped', lastActiveDate: '2026-07-20' },
      membershipEnded: true,
    });

    const [leftEnrollment, endedMembership, preservedAttendance, leaveAudit] = await Promise.all([
      query('SELECT status FROM eng_run_enrollments WHERE id = $1', [transferred.body.data.enrollmentId]),
      query('SELECT status, end_date FROM eng_cohort_memberships WHERE id = $1', [transferred.body.data.membershipId]),
      query('SELECT status FROM eng_attendance_records WHERE session_unit_id = $1', [sessionUnitId]),
      query(`SELECT action FROM eng_audit_events
        WHERE entity_key = $1 AND action = 'run_enrollment.leave'`, [transferred.body.data.enrollmentId]),
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
      enrollmentStatus: 'transferred',
      presentCount: 1,
      markedCount: 1,
    });

    const targetDetail = await authorized(
      request(app).get(`/api/english-training/workspace/classes/${targetCohortId}`),
      tokens.admin,
    );
    expect(targetDetail.body.data.runs[0].roster[0]).toMatchObject({
      employeeId, enrollmentStatus: 'dropped', presentCount: 0, markedCount: 0,
    });
  });

  test('concurrent transfer requests create exactly one active target chain', async () => {
    const suffix = `${Date.now()}`.slice(-8);
    const courseId = `eng-transfer-course-${suffix}`;
    const employeeId = `eng-transfer-employee-${suffix}`;
    await query(`INSERT INTO eng_courses (
      id, course_code, course_name, expected_units, max_absences_allowed, is_active, meta
    ) VALUES ($1,$2,$3,16,2,true,'{}'::jsonb)`, [
      courseId, `TRANSFER_${suffix}`, 'Concurrent Transfer Integration',
    ]);
    await query(`INSERT INTO eng_employees (
      id, emp_code, full_name, employment_status, user_id, meta
    ) VALUES ($1,$2,$3,'active',$4,'{"businessUnit":"Finance","jobRole":"Analyst"}'::jsonb)`, [
      employeeId, seed.member2.empCode, seed.member2.name, seed.member2._id,
    ]);
    const createClass = async (prefix, name) => {
      const response = await authorized(
        request(app).post('/api/english-training/workspace/classes'), tokens.admin,
      ).send({
        classCode: `${prefix}${suffix.slice(-4)}`, displayName: name, courseId,
        startDate: '2026-07-20', capacity: 12, status: 'active', picLabel: 'People Team',
      });
      expect(response.status).toBe(201);
      return response.body.data;
    };
    const source = await createClass('XS', 'Concurrent Transfer Source');
    const targetA = await createClass('XA', 'Concurrent Transfer Target A');
    const targetB = await createClass('XB', 'Concurrent Transfer Target B');
    const enrollment = await authorized(
      request(app).post(`/api/english-training/workspace/course-runs/${source.courseRunId}/enrollments`),
      tokens.admin,
    ).send({ employeeId, startDate: '2026-07-20', confirmedStartSessionNumber: 1 });
    expect(enrollment.status).toBe(201);
    const transferPath = `/api/english-training/workspace/course-runs/${source.courseRunId}`
      + `/enrollments/${enrollment.body.data.enrollmentId}/transfer`;

    const responses = await Promise.all([targetA, targetB].map((target) => authorized(
      request(app).post(transferPath), tokens.admin,
    ).send({
      targetCourseRunId: target.courseRunId,
      transferDate: '2026-07-20',
      confirmedStartSessionNumber: 1,
    })));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);

    const [activeCount, targetCount, auditCount] = await Promise.all([
      query(`SELECT count(*)::int AS count FROM eng_run_enrollments
        WHERE employee_id = $1 AND status = 'active'`, [employeeId]),
      query(`SELECT count(*)::int AS count FROM eng_run_enrollments
        WHERE transfer_from_enrollment_id = $1`, [enrollment.body.data.enrollmentId]),
      query(`SELECT count(*)::int AS count FROM eng_audit_events
        WHERE action = 'learner.transfer' AND details->>'employeeId' = $1`, [employeeId]),
    ]);
    expect(activeCount.rows[0].count).toBe(1);
    expect(targetCount.rows[0].count).toBe(1);
    expect(auditCount.rows[0].count).toBe(1);
  });

  test('reasoned capacity override admits one transfer above the class limit and retries safely', async () => {
    const suffix = `${Date.now()}`.slice(-8);
    const courseId = `eng-override-course-${suffix}`;
    const sourceEmployeeId = `eng-override-source-${suffix}`;
    const occupantEmployeeId = `eng-override-occupant-${suffix}`;
    await query(`INSERT INTO eng_courses (
      id, course_code, course_name, expected_units, max_absences_allowed, is_active, meta
    ) VALUES ($1,$2,$3,16,2,true,'{}'::jsonb)`, [
      courseId, `OVERRIDE_${suffix}`, 'Capacity Override Integration',
    ]);
    await query(`INSERT INTO eng_employees (
      id, emp_code, full_name, employment_status, user_id, meta
    ) VALUES
      ($1,$2,$3,'active',$4,'{"businessUnit":"Operations","jobRole":"Analyst"}'::jsonb),
      ($5,$6,$7,'active',NULL,'{"businessUnit":"Finance","jobRole":"Specialist"}'::jsonb)`, [
      sourceEmployeeId, seed.leader.empCode, seed.leader.name, seed.leader._id,
      occupantEmployeeId, `OVR${suffix}`, 'Existing Target Learner',
    ]);
    const createClass = async (prefix, name, capacity) => {
      const response = await authorized(
        request(app).post('/api/english-training/workspace/classes'), tokens.admin,
      ).send({
        classCode: `${prefix}${suffix.slice(-4)}`, displayName: name, courseId,
        startDate: '2026-07-20', capacity, status: 'active', picLabel: 'People Team',
      });
      expect(response.status).toBe(201);
      return response.body.data;
    };
    const source = await createClass('OS', 'Override Source', 12);
    const target = await createClass('OT', 'Override Target', 1);
    const occupant = await authorized(
      request(app).post(`/api/english-training/workspace/course-runs/${target.courseRunId}/enrollments`),
      tokens.admin,
    ).send({ employeeId: occupantEmployeeId, startDate: '2026-07-20', confirmedStartSessionNumber: 1 });
    expect(occupant.status).toBe(201);
    const enrollment = await authorized(
      request(app).post(`/api/english-training/workspace/course-runs/${source.courseRunId}/enrollments`),
      tokens.admin,
    ).send({ employeeId: sourceEmployeeId, startDate: '2026-07-20', confirmedStartSessionNumber: 1 });
    expect(enrollment.status).toBe(201);
    const path = `/api/english-training/workspace/course-runs/${source.courseRunId}`
      + `/enrollments/${enrollment.body.data.enrollmentId}/transfer`;
    const body = {
      targetCourseRunId: target.courseRunId,
      transferDate: '2026-07-20', confirmedStartSessionNumber: 1,
    };

    const rejected = await authorized(request(app).post(path), tokens.admin).send(body);
    expect(rejected.status).toBe(409);
    expect((await query('SELECT status FROM eng_run_enrollments WHERE id = $1', [enrollment.body.data.enrollmentId])).rows[0].status).toBe('active');
    expect((await query('SELECT count(*)::int AS count FROM eng_cohort_capacity_overrides')).rows[0].count).toBe(0);

    const approved = await authorized(request(app).post(path), tokens.admin).send({
      ...body, capacityOverrideReason: '  HR approved   an additional seat  ',
    });
    expect(approved.status).toBe(200);
    expect(approved.body.data).toMatchObject({
      capacityOverrideApplied: true,
      capacityOverrideId: expect.any(String),
    });
    const [override, auditCounts, activeCount] = await Promise.all([
      query(`SELECT previous_capacity, resulting_active_learner_count, reason, actor_user_id
        FROM eng_cohort_capacity_overrides WHERE id = $1`, [approved.body.data.capacityOverrideId]),
      query(`SELECT action, count(*)::int AS count FROM eng_audit_events
        WHERE action IN ('cohort.capacity.override','learner.transfer')
          AND details->>'employeeId' = $1 GROUP BY action ORDER BY action`, [sourceEmployeeId]),
      query(`SELECT count(*)::int AS count FROM eng_run_enrollments
        WHERE employee_id = $1 AND status = 'active'`, [sourceEmployeeId]),
    ]);
    expect(override.rows[0]).toMatchObject({
      previous_capacity: 1,
      resulting_active_learner_count: 2,
      reason: 'HR approved an additional seat',
      actor_user_id: seed.admin._id,
    });
    expect(auditCounts.rows).toEqual([
      { action: 'cohort.capacity.override', count: 1 },
      { action: 'learner.transfer', count: 1 },
    ]);
    expect(activeCount.rows[0].count).toBe(1);

    const retry = await authorized(request(app).post(path), tokens.admin).send({
      ...body, capacityOverrideReason: 'HR approved an additional seat',
    });
    expect(retry.status).toBe(409);
    expect((await query('SELECT count(*)::int AS count FROM eng_cohort_capacity_overrides')).rows[0].count).toBe(1);
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
