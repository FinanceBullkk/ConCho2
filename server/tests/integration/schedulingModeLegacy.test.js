/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — schedulingMode on the LEGACY paths (Pass C)
 * ──────────────────────────────────────────────────────────
 * Before Pass C, the legacy /api/schedules/book-slot (leader-reachable) and
 * /api/schedules (admin create) had NO schedulingMode gate, so a team leader
 * could self-book an admin_scheduled program and an admin could team-book a
 * cohort-based program. These tests prove the gate now fires on the legacy
 * paths too, while program-less (leader_booking-fallback) classes still book.
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const {
  readActiveRow, deleteActiveRowsWhere, updateActiveRow, addAllowedTimeSlot,
} = require('../pg-test-utils');
const fx = require('../fixtures/pg-fixtures');

let app, tokens, seed, csrf, classId;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);

  await addAllowedTimeSlot({ sh: 10, sm: 0, eh: 11, em: 0 });

  const team = await readActiveRow('Team', seed.team._id);
  classId = team.classId;
});

afterAll(async () => {
  await teardown();
});

afterEach(async () => {
  // Reset shared fixtures so other suites see the seed's program-less state.
  await deleteActiveRowsWhere('Schedule', {});
  await updateActiveRow('Class', classId, { programId: null });
  await deleteActiveRowsWhere('LearningProgram', {});
});

const vnSlot = (offsetDays = 0) => {
  const d = new Date();
  const dayOfWeek = d.getUTCDay();
  const daysToNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  d.setUTCDate(d.getUTCDate() + daysToNextMonday + offsetDays);
  d.setUTCHours(3, 0, 0, 0); // 03:00 UTC = 10:00 VN
  return { start: new Date(d), end: new Date(d.getTime() + 60 * 60 * 1000) };
};

const linkProgram = async (schedulingMode, code) => {
  const program = await fx.createLearningProgram({ code, name: `${code} Program`, schedulingMode });
  await updateActiveRow('Class', classId, { programId: program._id });
  return program;
};

// ── Leader path: POST /api/schedules/book-slot ────────────

describe('legacy /api/schedules/book-slot — schedulingMode gate', () => {
  test('leader booking an admin_scheduled program is rejected with 403 (closed bypass)', async () => {
    await linkProgram('admin_scheduled', 'LGAS1');
    const { start, end } = vnSlot();

    const res = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({ teamId: seed.team._id.toString(), startTime: start.toISOString(), endTime: end.toISOString() });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/admin-scheduled/i);
  });

  test('leader booking a cohort-based program against the team is rejected with 400', async () => {
    await linkProgram('self_enroll', 'LGSE1');
    const { start, end } = vnSlot();

    const res = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({ teamId: seed.team._id.toString(), startTime: start.toISOString(), endTime: end.toISOString() });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cohort-based/i);
  });

  test('leader_booking program still books (gate is permissive for team modes)', async () => {
    await linkProgram('leader_booking', 'LGLB1');
    const { start, end } = vnSlot();

    const res = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({ teamId: seed.team._id.toString(), startTime: start.toISOString(), endTime: end.toISOString() });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('program-less class still books via the leader_booking fallback', async () => {
    // No program linked (afterEach reset) -> fallback leader_booking -> allowed.
    const { start, end } = vnSlot();

    const res = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({ teamId: seed.team._id.toString(), startTime: start.toISOString(), endTime: end.toISOString() });

    expect(res.status).toBe(201);
  });
});

// ── Admin create path: POST /api/schedules ────────────────

describe('legacy POST /api/schedules — schedulingMode gate (admin override preserved)', () => {
  test('admin team-booking a cohort-based program is rejected with 400', async () => {
    await linkProgram('nomination', 'LGNM1');
    const { start, end } = vnSlot(1);

    const res = await request(app)
      .post('/api/schedules')
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({
        classId: classId.toString(),
        bookedTeamId: seed.team._id.toString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cohort-based/i);
  });

  test('admin team-booking an admin_scheduled program still succeeds (BR-6 override)', async () => {
    await linkProgram('admin_scheduled', 'LGAS2');
    const { start, end } = vnSlot(2);

    const res = await request(app)
      .post('/api/schedules')
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({
        classId: classId.toString(),
        bookedTeamId: seed.team._id.toString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});
