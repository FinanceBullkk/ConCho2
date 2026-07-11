/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — domains/schedule use-cases (isolation)
 * ──────────────────────────────────────────────────────────
 * Exercises the use-case module DIRECTLY (no HTTP / auth / audit layer) so the
 * domain contract is locked at the boundary: return shapes + ServiceError
 * status codes for updateSchedule / deleteSchedule / setTrainers. The route
 * tests (scheduleReassign, dataIntegrity, sessionTrainers) assert the
 * HTTP-translated behaviour; these assert the use-case return values / thrown
 * ServiceError.status that the controller depends on.
 * ──────────────────────────────────────────────────────────
 */

const { getApp, getSeedData, teardown } = require('../setup');
const useCases = require('../../domains/schedule/use-cases');
const fx = require('../fixtures/pg-fixtures');
// deleteSchedule cancels through the ported chokepoint (PG-only on the lane) —
// read the flipped doc from the active backend, not Mongoose.
const { readActiveRow, findActiveRowWhere } = require('../pg-test-utils');

let seed;

beforeAll(async () => {
  await getApp();
  seed = getSeedData();
});

afterAll(async () => {
  await teardown();
});

let ctr = 0;
const uniq = () => String(++ctr).padStart(8, '0');
const futureDate = (days = 7) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

// Two same-class teams + a future schedule booked to teamA.
const makeFixture = async () => {
  const sfx = uniq();
  const cls = await fx.createClass({
    classCode: `SUC_${sfx}`, courseName: 'UseCase Test', totalSessions: 10,
  });
  // 2-char prefix + 8-digit counter = 10 chars exactly (no truncation of the
  // unique counter — a 3-char prefix would get sliced and collide).
  const leaderA = await fx.createUser({
    empCode: `UA${sfx}`, name: `UCA-${sfx}`,
    role: 'Participant', department: 'Sales', password: 'pass12345678',
  });
  const leaderB = await fx.createUser({
    empCode: `UB${sfx}`, name: `UCB-${sfx}`,
    role: 'Participant', department: 'Sales', password: 'pass12345678',
  });
  const memberB = await fx.createUser({
    empCode: `UM${sfx}`, name: `UCM-${sfx}`,
    role: 'Participant', department: 'Sales', password: 'pass12345678',
  });
  const teamA = await fx.createTeam({
    name: `UC-A-${sfx}`, classId: cls._id, leaderId: leaderA._id, members: [leaderA._id],
  });
  const teamB = await fx.createTeam({
    name: `UC-B-${sfx}`, classId: cls._id, leaderId: leaderB._id, members: [leaderB._id, memberB._id],
  });
  const future = futureDate();
  const sched = await fx.createSchedule({
    classId: cls._id, bookedTeamId: teamA._id,
    startTime: future, endTime: new Date(future.getTime() + 60 * 60 * 1000),
    enrolledUsers: [leaderA._id],
  });
  return { cls, leaderA, leaderB, memberB, teamA, teamB, sched };
};

describe('domains/schedule use-cases — updateSchedule', () => {
  test('throws ServiceError 404 for a non-existent schedule', async () => {
    await expect(
      useCases.updateSchedule(fx.genId(), { capacity: 5 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('reassigning bookedTeamId returns the updated doc with a rebuilt roster', async () => {
    const { teamB, leaderB, memberB, sched } = await makeFixture();

    const updated = await useCases.updateSchedule(sched._id.toString(), {
      bookedTeamId: teamB._id.toString(),
    });

    expect(updated.bookedTeamId.toString()).toBe(teamB._id.toString());
    const enrolled = (updated.enrolledUsers || []).map((u) => (u._id ? u._id.toString() : u.toString()));
    expect(enrolled).toContain(leaderB._id.toString());
    expect(enrolled).toContain(memberB._id.toString());
  });

  test('session details (topic/agenda/materials/customFields) persist as metadata', async () => {
    const { sched } = await makeFixture();
    const updated = await useCases.updateSchedule(sched._id.toString(), {
      topic: 'Coaching & feedback',
      agenda: ['Recap', 'GROW model', 'Roleplay'],
      materials: [{ label: 'Deck', url: 'https://x/deck.pdf' }],
      customFields: { room_setup: 'U-shape' },
    });
    expect(updated.topic).toBe('Coaching & feedback');
    expect(updated.agenda).toEqual(['Recap', 'GROW model', 'Roleplay']);
    expect(updated.materials[0]).toMatchObject({ label: 'Deck', url: 'https://x/deck.pdf' });
    expect(updated.customFields).toMatchObject({ room_setup: 'U-shape' });
    // Booking fields untouched.
    expect(updated.bookedTeamId.toString()).toBe(sched.bookedTeamId.toString());
  });
});

describe('domains/schedule use-cases — deleteSchedule', () => {
  test('throws ServiceError 404 for a non-existent schedule', async () => {
    await expect(
      useCases.deleteSchedule(fx.genId()),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('throws ServiceError 409 for a session that has already started', async () => {
    const { cls, teamA, leaderA } = await makeFixture();
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sch = await fx.createSchedule({
      classId: cls._id, bookedTeamId: teamA._id,
      startTime: past, endTime: new Date(past.getTime() + 60 * 60 * 1000),
      enrolledUsers: [leaderA._id],
    });

    await expect(useCases.deleteSchedule(sch._id.toString())).rejects.toMatchObject({ statusCode: 409 });
    // Past session preserved
    expect(await readActiveRow('Schedule', sch._id)).not.toBeNull();
  });

  test('durably cancels a future session — doc flips, attendance preserved', async () => {
    const { sched, leaderA } = await makeFixture();
    await fx.createAttendance({ scheduleId: sched._id, userId: leaderA._id, status: 'P' });

    const result = await useCases.deleteSchedule(sched._id.toString(), {
      cancelledBy: leaderA._id, cancelReason: 'room flooded',
    });

    expect(result.calendarDeleted).toBe(false);
    // Phase-04 slice A: never hard-deleted — the doc persists as history.
    const after = await readActiveRow('Schedule', sched._id);
    expect(after).not.toBeNull();
    expect(after.status).toBe('cancelled');
    expect(after.cancelReason).toBe('room flooded');
    expect(after.cancelledBy.toString()).toBe(leaderA._id.toString());
    expect(after.cancelledAt).toBeInstanceOf(Date);
    // Attendance is preserved (golden rule), not cascaded away.
    expect(await findActiveRowWhere('Attendance', { scheduleId: sched._id })).not.toBeNull();
  });

  test('throws ServiceError 409 when the session is already cancelled', async () => {
    const { sched } = await makeFixture();
    await useCases.deleteSchedule(sched._id.toString());
    await expect(useCases.deleteSchedule(sched._id.toString()))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('domains/schedule use-cases — setTrainers', () => {
  test('throws ServiceError 400 when neither internalIds nor externalTrainer is provided', async () => {
    const { sched } = await makeFixture();
    await expect(useCases.setTrainers(sched._id.toString(), {})).rejects.toMatchObject({ statusCode: 400 });
  });

  test('throws ServiceError 404 for a non-existent schedule', async () => {
    await expect(
      useCases.setTrainers(fx.genId(), { internalIds: [seed.teacher._id.toString()] }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('assigns valid internal trainers and returns a before/after diff', async () => {
    const { sched } = await makeFixture();

    const { before, after, schedule } = await useCases.setTrainers(sched._id.toString(), {
      internalIds: [seed.teacher._id.toString()],
    });

    expect(before.sessionInstructorIds).toEqual([]);
    expect(after.sessionInstructorIds).toContain(seed.teacher._id.toString());
    expect(schedule.sessionInstructorIds.map(String)).toContain(seed.teacher._id.toString());
  });

  test('throws ServiceError 400 when an id is not an active Teacher/Admin', async () => {
    const { sched, leaderA } = await makeFixture();
    // leaderA is a Participant — not a valid session instructor.
    await expect(
      useCases.setTrainers(sched._id.toString(), { internalIds: [leaderA._id.toString()] }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
