/**
 * ──────────────────────────────────────────────────────────
 * PG-native test fixture builders (Wave K · Phase 2 · Batch D2c)
 * ──────────────────────────────────────────────────────────
 * The endgame of Wave K is dropping `mongoose` + `mongodb-memory-server` from
 * the server. Today most suites still author fixtures with raw Mongoose and the
 * `pg-auto-mirror` plugin mirrors each write into Postgres. These builders are
 * the replacement: they INSERT directly into the migrated PG tables — no
 * Mongoose, no mirror — so a converted suite can drop `require('mongoose')`.
 *
 * Design: reuse the SAME column map the auto-mirror uses (pg-row-mappers.toRow),
 * so a fixture row is byte-identical to what `Model.create(doc)` mirrors today.
 * Converting `await Model.create(doc)` → `await fx.createX(doc)` yields the same
 * PG row (minus the Mongo twin, which converted suites no longer read). Model
 * defaults/hooks the plain doc can't run are replicated here (User password →
 * bcrypt 12; passwordChangedAt; status/mustChangePassword defaults).
 *
 * PG-only by design: the Mongo server-test lane was retired 2026-07-10, so these
 * write to Postgres unconditionally (config/pg). Add a builder per model as D2d
 * converts the suites that need it — only MAPPERS-covered models are supported
 * (an unmapped model throws, pointing you at pg-row-mappers.js).
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query } = require('../../config/pg');
const { MAPPERS, toRow } = require('../pg-row-mappers');

// 24-hex id — ObjectId-format-compatible (passes the app's ObjectId regexes)
// without depending on mongoose/bson. Same generator as scripts/seed-pg.js.
const genId = () => crypto.randomBytes(12).toString('hex');

// Match models/User.js pre('save'): bcrypt 12 rounds + passwordChangedAt just
// before "now" (so a token minted at login has iat ≥ passwordChangedAt).
const hashPassword = (plain) => bcrypt.hash(plain, 12);
const PASSWORD_CHANGED_AT = new Date(Date.now() - 1000);

// Per-file unique empCode source. Jest gives each test file a fresh module
// registry (empSeq resets to 0) and the PG db is truncated per file, so a bare
// counter never collides. Uppercase to survive User.empCode's uppercase setter.
let empSeq = 0;
const nextEmpCode = () => `F${String((empSeq += 1)).padStart(5, '0')}`;

/**
 * INSERT a plain doc (camelCase fields + `_id`) into its mapped PG table via
 * the auto-mirror's own row map. Resyncs the team_members junction for Team.
 */
const insertDoc = async (modelName, doc) => {
  const mapper = MAPPERS[modelName];
  if (!mapper) {
    throw new Error(`pg-fixtures: no row-mapper for "${modelName}" — add one in tests/pg-row-mappers.js`);
  }
  const row = toRow(modelName, doc);
  const cols = Object.keys(row);
  await query(
    `INSERT INTO "${mapper.table}" (${cols.map((c) => `"${c}"`).join(', ')})
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
    cols.map((c) => row[c]),
  );
  if (mapper.junction) {
    const { table, sync } = mapper.junction;
    const j = sync(doc);
    if (j.user_ids.length) {
      await query(
        `INSERT INTO "${table}" (team_id, user_id) VALUES ${j.user_ids.map((_, i) => `($1, $${i + 2})`).join(', ')}`,
        [j.team_id, ...j.user_ids],
      );
    }
  }
  return doc;
};

// ── Builders ────────────────────────────────────────────────
// Each merges caller overrides over model-default-matching values, INSERTs, and
// returns the plain doc (with its `_id`). `over` fields are camelCase (== the
// Mongoose schema field names).

/** users row. `over.password` is PLAINTEXT (hashed here). Returns doc + passwordPlain. */
const createUser = async (over = {}) => {
  const plain = over.password || 'fixture-pw-12345';
  const doc = {
    _id: genId(),
    empCode: nextEmpCode(),
    name: 'Fixture User',
    role: 'Participant',
    department: '',
    status: 'Active',
    mustChangePassword: false,
    ...over,
    password: await hashPassword(plain),
    passwordChangedAt: over.passwordChangedAt || PASSWORD_CHANGED_AT,
  };
  await insertDoc('User', doc);
  doc.passwordPlain = plain;
  return doc;
};

/** classes row (cohort). */
const createClass = async (over = {}) => {
  const doc = {
    _id: genId(),
    classCode: `FXC${genId().slice(0, 6).toUpperCase()}`,
    courseName: 'Fixture Course',
    totalSessions: 8,
    status: 'Ongoing',
    teacherIds: [],
    ...over,
  };
  await insertDoc('Class', doc);
  return doc;
};

/** teams row (+ team_members junction from `over.members`). */
const createTeam = async (over = {}) => {
  const doc = {
    _id: genId(),
    name: 'Fixture Team',
    classId: null,
    leaderId: null,
    members: [],
    isDeleted: false,
    ...over,
  };
  await insertDoc('Team', doc);
  return doc;
};

/** enrollments row (team-based `mode:group` when teamId set, else cohort direct). */
const createEnrollment = async (over = {}) => {
  const doc = {
    _id: genId(),
    userId: null,
    classId: null,
    teamId: null,
    status: 'Active',
    joinedAt: new Date(),
    ...over,
  };
  await insertDoc('Enrollment', doc);
  return doc;
};

/** schedules row (a booked session). `capacity` matches models/Schedule default (9). */
const createSchedule = async (over = {}) => {
  const doc = {
    _id: genId(),
    classId: null,
    startTime: null,
    endTime: null,
    status: 'scheduled',
    enrolledUsers: [],
    capacity: 9,
    ...over,
  };
  await insertDoc('Schedule', doc);
  return doc;
};

/** attendances row. syncStatus/remark/photoUrl match models/Attendance defaults
 *  (NOT NULL columns with no DB default — the plain doc can't run Mongoose defaults). */
const createAttendance = async (over = {}) => {
  const doc = {
    _id: genId(),
    scheduleId: null,
    userId: null,
    status: 'P',
    syncStatus: 'PENDING',
    remark: '',
    photoUrl: '',
    ...over,
  };
  await insertDoc('Attendance', doc);
  return doc;
};

module.exports = {
  genId,
  insertDoc,
  createUser,
  createClass,
  createTeam,
  createEnrollment,
  createSchedule,
  createAttendance,
};
