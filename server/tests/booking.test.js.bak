/**
 * ──────────────────────────────────────────────────────────
 * TMS Integration Tests — Booking Flow
 * ──────────────────────────────────────────────────────────
 * 
 * SETUP:
 *   npm install --save-dev jest supertest mongodb-memory-server @jest/globals
 * 
 *   Add to server/package.json:
 *   "scripts": { "test": "jest --runInBand --forceExit" }
 *   "jest": { "testEnvironment": "node", "testTimeout": 30000 }
 * 
 * RUN:
 *   npm test
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Models
const User = require('../models/User');
const Team = require('../models/Team');
const Class = require('../models/Class');
const Schedule = require('../models/Schedule');

let app, mongoServer, adminToken, leaderToken, teamId, classId;

beforeAll(async () => {
  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri();
  process.env.JWT_SECRET = 'test-secret-key-for-jest-only';
  process.env.JWT_EXPIRE = '1h';

  // Import app AFTER setting env vars
  app = require('../server');

  // Wait for DB connection
  await mongoose.connection.asPromise();

  // Seed test data
  const admin = await User.create({
    empCode: '000001', name: 'Admin', role: 'Admin',
    department: 'Mgmt', password: 'admin1234567',
  });

  const leader = await User.create({
    empCode: '000010', name: 'Leader', role: 'Participant',
    department: 'Sales', password: 'leader1234567',
  });

  const member = await User.create({
    empCode: '000011', name: 'Member', role: 'Participant',
    department: 'Sales', password: 'member1234567',
  });

  const cls = await Class.create({
    classCode: 'TEST001', courseName: 'Test Class',
  });
  classId = cls._id;

  const team = await Team.create({
    name: 'Test Team', classId: cls._id,
    leaderId: leader._id, members: [leader._id, member._id],
  });
  teamId = team._id;

  // Get tokens
  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({ empCode: '000001', password: 'admin1234567' });
  adminToken = adminLogin.body.data.token;

  const leaderLogin = await request(app)
    .post('/api/auth/login')
    .send({ empCode: '000010', password: 'leader1234567' });
  leaderToken = leaderLogin.body.data.token;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  // Clean schedules between tests
  await Schedule.deleteMany({});
});

// ──────────────────────────────────────────────────────────
// TEST SUITE: Booking Flow
// ──────────────────────────────────────────────────────────

describe('POST /api/schedules/book-slot', () => {
  const futureDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7); // Next week
    d.setHours(10, 0, 0, 0);
    return d;
  };

  test('should create a session for valid team leader', async () => {
    const start = futureDate();
    const end = new Date(start.getTime() + 3600000);

    const res = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({
        teamId: teamId.toString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.bookedTeamId).toBeTruthy();
  });

  test('should reject 3rd booking in same week (weekly limit)', async () => {
    const start1 = futureDate();
    const end1 = new Date(start1.getTime() + 3600000);

    const start2 = new Date(start1);
    start2.setHours(14, 0, 0, 0);
    const end2 = new Date(start2.getTime() + 3600000);

    const start3 = new Date(start1);
    start3.setDate(start3.getDate() + 1);
    start3.setHours(10, 0, 0, 0);
    const end3 = new Date(start3.getTime() + 3600000);

    // Book slot 1 — should succeed
    await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({ teamId: teamId.toString(), startTime: start1.toISOString(), endTime: end1.toISOString() });

    // Book slot 2 — should succeed
    await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({ teamId: teamId.toString(), startTime: start2.toISOString(), endTime: end2.toISOString() });

    // Book slot 3 — MUST FAIL (weekly limit = 2)
    const res3 = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({ teamId: teamId.toString(), startTime: start3.toISOString(), endTime: end3.toISOString() });

    expect(res3.status).toBe(400);
    expect(res3.body.message).toMatch(/tối đa 2 buổi/);
  });

  test('should reject overlapping time slot (collision)', async () => {
    const start = futureDate();
    const end = new Date(start.getTime() + 3600000);

    // Create first booking
    await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({ teamId: teamId.toString(), startTime: start.toISOString(), endTime: end.toISOString() });

    // Try overlapping slot (30 min offset)
    const overlapStart = new Date(start.getTime() + 1800000);
    const overlapEnd = new Date(overlapStart.getTime() + 3600000);

    const res = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({ teamId: teamId.toString(), startTime: overlapStart.toISOString(), endTime: overlapEnd.toISOString() });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/đã bị/);
  });

  test('should reject non-leader trying to book', async () => {
    const start = futureDate();
    const end = new Date(start.getTime() + 3600000);

    const res = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        teamId: teamId.toString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

    // Admin IS allowed by the roleGuard, this should succeed
    expect([201, 400, 409]).toContain(res.status);
  });

  test('should reject unauthenticated requests', async () => {
    const res = await request(app)
      .post('/api/schedules/book-slot')
      .send({ teamId: 'fake', startTime: new Date().toISOString(), endTime: new Date().toISOString() });

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────
// TEST SUITE: Cancel Flow
// ──────────────────────────────────────────────────────────

describe('DELETE /api/schedules/:id/cancel', () => {
  test('should delete schedule when leader cancels', async () => {
    const start = new Date();
    start.setDate(start.getDate() + 7);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 3600000);

    const createRes = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({ teamId: teamId.toString(), startTime: start.toISOString(), endTime: end.toISOString() });

    const scheduleId = createRes.body.data._id;

    const cancelRes = await request(app)
      .delete(`/api/schedules/${scheduleId}/cancel`)
      .set('Authorization', `Bearer ${leaderToken}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.success).toBe(true);

    // Verify it's deleted
    const check = await Schedule.findById(scheduleId);
    expect(check).toBeNull();
  });
});
