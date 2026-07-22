/**
 * ──────────────────────────────────────────────────────────
 * Shared Test Setup — PG-native seed (Wave K · Phase 2 · D2e-2a)
 * ──────────────────────────────────────────────────────────
 * The Mongo test harness (MongoMemoryReplSet + mongoose.connect + the
 * Mongoose→PG auto-mirror) is retired: every suite now authors fixtures
 * PG-natively (D2c → D2e-1), so the shared core seed is the last Mongoose
 * fixture path. It seeds admin/teacher/cohorts/team/settings straight into
 * Postgres via `fixtures/pg-fixtures` (`fx.*`).
 *
 * Postgres has ONE shared database for the whole run, so `resetPgDatabase()`
 * truncates every table at file setup — the per-file isolation Mongo's private
 * database used to provide.
 *
 * Usage in test files:
 *   const { getApp, getTokens, getSeedData } = require('../setup');
 *   beforeAll(async () => {
 *     app = await getApp(); tokens = getTokens(); seed = getSeedData();
 *   });
 */

const { isPostgres } = require('../config/db-backend');
const DEFAULT_TIME_SLOTS = require('../config/default-time-slots');
const pgTestUtils = require('./pg-test-utils');
const fx = require('./fixtures/pg-fixtures');

let app;
let tokens = {};
let seedData = {};
let initialized = false;

const setup = async () => {
  if (initialized) return app;

  // Set test environment BEFORE importing app
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-key-for-jest-only';
  process.env.JWT_EXPIRE = '1h';
  // SEC-006 (audit PR E) — supertest never sets an Origin header. The
  // production no-origin guard is enabled in server.js based on
  // NODE_ENV=production. Some tests legitimately toggle NODE_ENV for a
  // single assertion (e.g. p2-regression.test.js verifies the import
  // env fail-fast). Set the bypass flag here so those tests don't have
  // to add an Origin header to every request.
  process.env.CORS_BYPASS_NO_ORIGIN = 'true';

  // Server tests are Postgres-only since Wave K retired Mongo. Fail fast with a
  // clear message rather than silently no-op the PG helpers (empty fixtures).
  if (!isPostgres) {
    throw new Error('Server tests are Postgres-only (Wave K) — run with DB_BACKEND=postgres.');
  }

  // PG has ONE shared database for the whole run — truncate it at file setup so
  // each file starts as clean as Mongo's old private database.
  await pgTestUtils.resetPgDatabase();

  // Import app AFTER env vars are set
  app = require('../server');

  // ── Seed core fixtures straight into Postgres (fx.* — no Mongoose) ──
  // FK-safe order: settings, cohorts, users, then the team (refs cohort + users).
  await fx.createSetting({
    key: 'ALLOWED_TIME_SLOTS',
    value: DEFAULT_TIME_SLOTS,
  });

  const cls = await fx.createClass({ classCode: 'TEST001', courseName: 'Test English Class', totalSessions: 20 });
  const cls2 = await fx.createClass({ classCode: 'TEST002', courseName: 'Test Business English', totalSessions: 10 });

  const admin = await fx.createUser({ empCode: '000001', name: 'Admin User', role: 'Admin', department: 'Management', password: 'admin12345' });
  const teacher = await fx.createUser({ empCode: '000002', name: 'Teacher User', role: 'Teacher', department: 'English', password: 'teacher12345' });
  const leader = await fx.createUser({ empCode: '000010', name: 'Team Leader', role: 'Participant', department: 'Sales', password: 'leader12345' });
  const member1 = await fx.createUser({ empCode: '000011', name: 'Member One', role: 'Participant', department: 'Sales', password: 'member12345' });
  const member2 = await fx.createUser({ empCode: '000012', name: 'Member Two', role: 'Participant', department: 'Sales', password: 'member12345' });
  const inactiveUser = await fx.createUser({ empCode: '000099', name: 'Inactive Guy', role: 'Participant', department: 'HR', password: 'inactive12345', status: 'Inactive' });

  const team = await fx.createTeam({
    name: 'Alpha Team', classId: cls._id,
    leaderId: leader._id, members: [leader._id, member1._id, member2._id],
  });

  // Generate tokens directly — avoids coupling to login response shape.
  // Bearer token auth is accepted by the protect middleware.
  const jwt = require('jsonwebtoken');
  const sign = (userId) =>
    jwt.sign({ id: userId.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });

  tokens = {
    admin: sign(admin._id),
    leader: sign(leader._id),
    teacher: sign(teacher._id),
  };

  seedData = {
    admin, teacher, leader, member1, member2, inactiveUser,
    class1: cls, class2: cls2, team,
  };

  initialized = true;
  return app;
};

const teardown = async () => {
  // Release the PG pool's sockets so jest can exit cleanly.
  const { closePool } = require('../config/pg');
  await closePool();
  initialized = false;
};

const getApp = () => setup();
const getTokens = () => tokens;
const getSeedData = () => seedData;

/**
 * Returns a supertest request agent that carries a valid CSRF token
 * (double-submit cookie + header pair). Use for POST/PUT/DELETE requests.
 *
 * Usage:
 *   const agent = await getCsrfAgent(app);
 *   await agent.post('/api/foo').set('Authorization', `Bearer ${token}`).send({...});
 *
 * The agent remembers the csrf-token cookie across calls, and automatically
 * adds the X-CSRF-Token header via the helper below. For one-off requests
 * you can use getCsrfHeaders(app) instead and spread the result.
 */
const getCsrfHeaders = async (appInstance) => {
  const request = require('supertest');
  // A GET request triggers the middleware to set (and return) the csrf cookie.
  const res = await request(appInstance).get('/api/auth/csrf');
  const setCookie = res.headers['set-cookie'] || [];
  const cookieHeader = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
  // Extract raw token value from the cookie string "csrf-token=<value>; ..."
  const match = cookieHeader.match(/csrf-token=([^;]+)/);
  const csrfToken = match ? match[1] : (res.body.data && res.body.data.csrfToken);
  return {
    // Include as Cookie header so middleware can read req.cookies.csrf-token
    'Cookie': `csrf-token=${csrfToken}`,
    // Include as X-CSRF-Token header so the double-submit check passes
    'X-CSRF-Token': csrfToken,
  };
};

module.exports = { getApp, getTokens, getSeedData, teardown, getCsrfHeaders };
