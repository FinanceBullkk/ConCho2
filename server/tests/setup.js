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
const { MongoMemoryReplSet } = require('mongodb-memory-server');

// Replica set required for MongoDB transactions (bookSlot, adminCreate, deleteUser cascade).
let mongoServer;
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

  // Start in-memory MongoDB replica set (single node) — required for transactions.
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = mongoServer.getUri();

  // Connect mongoose
  await mongoose.connect(process.env.MONGO_URI);

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
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
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
