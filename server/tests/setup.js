/**
 * ──────────────────────────────────────────────────────────
 * Shared Test Setup — MongoMemoryServer + Seed Data
 * ──────────────────────────────────────────────────────────
 * 
 * Usage in test files:
 *   const { getApp, getTokens, getSeedData } = require('../setup');
 *   
 *   let app, tokens, seed;
 *   beforeAll(async () => {
 *     app = await getApp();
 *     tokens = getTokens();
 *     seed = getSeedData();
 *   });
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { isPostgres } = require('../config/db-backend');
const pgTestUtils = require('./pg-test-utils');
// Wave G batch 2: register the Mongoose→PG auto-mirror as a GLOBAL plugin
// BEFORE any model compiles — raw-Mongoose fixture seeding in legacy suites
// then lands on BOTH backends without per-suite edits. No-op on Mongo lane.
require('./pg-auto-mirror').registerAutoMirror(mongoose);

// tests/global-setup.js starts ONE shared replica set per jest run and exposes
// its URI on process.env.MONGO_URI. Each test file connects under its OWN
// database (TEST_DB_NAME) so files stay isolated while the heavy mongod is
// spawned only once. If MONGO_URI is absent (a file required outside jest),
// we fall back to a per-file server — preserving the original behaviour.
let mongoServer;        // set only in the fallback path → this file owns it
let app;
let tokens = {};
let seedData = {};
let initialized = false;

// Unique DB name per test file. Jest gives each test file a fresh module
// registry, so this evaluates exactly once per file → no cross-file collision.
const TEST_DB_NAME = `jest_${crypto.randomBytes(8).toString('hex')}`;

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

  // Reuse the shared replica set from global-setup; otherwise spin a dedicated
  // one for this file (fallback — required when setup.js runs without jest's
  // globalSetup). Either way transactions work (single-node replica set).
  if (!process.env.MONGO_URI) {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGO_URI = mongoServer.getUri();
  }

  // Connect mongoose to this file's private database on the (shared) server.
  await mongoose.connect(process.env.MONGO_URI, { dbName: TEST_DB_NAME });

  // Wave G (DB_BACKEND=postgres lane): PG has ONE shared database for the whole
  // run — truncate it at file setup so each file starts as clean as its private
  // Mongo database. No-op on the default Mongo lane.
  await pgTestUtils.resetPgDatabase();

  // Import app AFTER env vars are set
  app = require('../server');

  // Seed test data
  const User = require('../models/User');
  const Team = require('../models/Team');
  const Class = require('../models/Class');
  const Setting = require('../models/Setting');

  // Create ALLOWED_TIME_SLOTS setting (required for booking validation)
  await Setting.create({
    key: 'ALLOWED_TIME_SLOTS',
    value: [
      { sh: 8, sm: 0, eh: 9, em: 30, label: '08:00-09:30' },
      { sh: 10, sm: 0, eh: 11, em: 30, label: '10:00-11:30' },
      { sh: 14, sm: 0, eh: 15, em: 30, label: '14:00-15:30' },
    ],
  });

  const admin = await User.create({
    empCode: '000001', name: 'Admin User', role: 'Admin',
    department: 'Management', password: 'admin12345',
  });

  const teacher = await User.create({
    empCode: '000002', name: 'Teacher User', role: 'Teacher',
    department: 'English', password: 'teacher12345',
  });

  const leader = await User.create({
    empCode: '000010', name: 'Team Leader', role: 'Participant',
    department: 'Sales', password: 'leader12345',
  });

  const member1 = await User.create({
    empCode: '000011', name: 'Member One', role: 'Participant',
    department: 'Sales', password: 'member12345',
  });

  const member2 = await User.create({
    empCode: '000012', name: 'Member Two', role: 'Participant',
    department: 'Sales', password: 'member12345',
  });

  const inactiveUser = await User.create({
    empCode: '000099', name: 'Inactive Guy', role: 'Participant',
    department: 'HR', password: 'inactive12345', status: 'Inactive',
  });

  const cls = await Class.create({
    classCode: 'TEST001', courseName: 'Test English Class',
    totalSessions: 20,
  });

  const cls2 = await Class.create({
    classCode: 'TEST002', courseName: 'Test Business English',
    totalSessions: 10,
  });

  const team = await Team.create({
    name: 'Alpha Team', classId: cls._id,
    leaderId: leader._id, members: [leader._id, member1._id, member2._id],
  });

  // Wave G: mirror the core fixtures into PG (same ids, same bcrypt hashes) so
  // the ported read-paths — auth middleware above all — see the same world the
  // Mongoose seeds created. The Setting stays Mongo-only (settings reads are
  // not ported). No-op on the default Mongo lane.
  await pgTestUtils.mirrorCoreSeedToPg({
    users: [admin, teacher, leader, member1, member2, inactiveUser],
    classes: [cls, cls2],
    teams: [team],
  });

  // Generate tokens directly — avoids coupling to login response shape.
  // Bearer token auth is still accepted by the protect middleware.
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
  // Drop this file's private database so the shared server doesn't accumulate
  // state across files, then disconnect. Only stop the server if THIS file
  // created it (fallback path) — the shared one is stopped by global-teardown.
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
    }
  } catch {
    // best-effort cleanup — never let teardown throw and mask a test result
  }
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
  // Release the PG pool's sockets so jest can exit cleanly on the PG lane.
  if (isPostgres) {
    const { closePool } = require('../config/pg');
    await closePool();
  }
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
