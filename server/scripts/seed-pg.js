/**
 * TMS v2 — PostgreSQL Seed Script (Wave K Phase 2, Batch A)
 * ─────────────────────────────────────────────────────────
 * PG-native twin of scripts/seed.js. Truncates every application table (FK-safe
 * via CASCADE) and inserts the SAME canonical sample set + logins, so dev and
 * the e2e gate can seed a Postgres backend directly (no Mongoose / no ETL).
 *
 * Self-contained by design: it talks to config/pg.js only — it does NOT import
 * the Mongo models, the test-only pg-row-mappers, or DB_BACKEND. That keeps it
 * alive after the Mongo test infra is retired (Batches C/D). Row shapes here are
 * the real migrated columns (verified against db/pg/migrations/*).
 *
 * Usage: npm run seed            (DB_BACKEND-independent — always seeds PG_URL)
 *
 * Default credentials (identical to the Mongo seed):
 *   Admin:        000001 / admin12345   (mustChangePassword)
 *   Teachers:     000002 / teacher123, 000003 / teacher123
 *   Participants: 000004–000009 / participant123
 *   Coordinator:  000010 / coordinator123
 */

require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query, closePool } = require('../config/pg');
const DEFAULT_TIME_SLOTS = require('../config/default-time-slots');
const dangerousScriptGuard = require('./lib/dangerousScriptGuard');

// ── Small helpers ─────────────────────────────────────────
// 24-hex id: ObjectId-format-compatible (passes the app's ObjectId regexes)
// without depending on mongoose/bson — survives the Mongo removal.
const genId = () => crypto.randomBytes(12).toString('hex');

// Match models/User.js pre('save'): bcrypt 12 rounds + passwordChangedAt just
// before "now" (so a token minted at login has iat ≥ passwordChangedAt).
const hashPassword = (plain) => bcrypt.hash(plain, 12);
const PASSWORD_CHANGED_AT = new Date(Date.now() - 1000);

const futureDateTime = (daysFromNow, hour, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d;
};

// Generic parameterized INSERT. Callers pass values already in PG-wire shape:
//   jsonb  → a JSON string (JSON.stringify)   text[] → a real JS array
//   scalars/Date → as-is. Omitted columns fall back to their DB defaults.
const insertRow = (table, row) => {
  const cols = Object.keys(row);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  return query(
    `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders.join(', ')})`,
    cols.map((c) => row[c]),
  );
};

// Truncate every application table (mirrors tests/pg-test-utils.resetPgDatabase).
const truncateAll = async () => {
  const { rows } = await query(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT LIKE 'knex_%'`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
  await query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
};

const hostAndDb = () => {
  try {
    const u = new URL(process.env.PG_URL || process.env.PG_PROTOTYPE_URL || '');
    return { host: u.hostname || '(unknown)', dbName: (u.pathname || '').replace(/^\//, '') || '(unknown)' };
  } catch {
    return { host: '(unparsed)', dbName: '(unparsed)' };
  }
};

const seed = async () => {
  const { host, dbName } = hostAndDb();
  dangerousScriptGuard({ scriptName: 'seed-pg.js — TRUNCATEs ALL tables', host, dbName });
  console.log('\n🌱 Seeding TMS v2 (PostgreSQL)...\n');

  console.log('🗑️  Truncating all tables...');
  await truncateAll();

  // ── Sequence counters (so the NEXT new user/class continues the series) ──
  // Mongo seed pre-set empCode→10, classCode→2; helpers/counter increments
  // from there (ON CONFLICT seq+1) → next codes 000011 / EL003.
  await insertRow('counters', { id: 'empCode', seq: 10 });
  await insertRow('counters', { id: 'classCode', seq: 2 });

  // ── Settings (English-only descriptions) ──────────────────
  console.log('⚙️  Creating settings...');
  await insertRow('settings', {
    id: genId(),
    key: 'ALLOWED_TIME_SLOTS',
    description: 'Bookable time-slot windows (VN wall-clock, 24h)',
    value: JSON.stringify(DEFAULT_TIME_SLOTS),
  });
  await insertRow('settings', {
    id: genId(),
    key: 'COURSE_SESSIONS',
    description: 'Default session count per course',
    value: JSON.stringify({
      Foundation: 16,
      'Extension of Foundation': 16,
      'Communication 1': 10,
      'Communication 2': 16,
      'Communication 3': 16,
      'Business English': 16,
    }),
  });

  // ── Learning programs ─────────────────────────────────────
  console.log('📘 Creating learning programs...');
  const businessEnglishId = genId();
  const communication2Id = genId();
  const complianceId = genId();
  const englishPolicy = JSON.stringify({ attendanceThresholdPercent: 0, requiresAssessment: true, requiresFeedback: false });
  await insertRow('learning_programs', {
    id: businessEnglishId, code: 'ENG_BUSINESS_ENGLISH', name: 'Business English', category: 'english',
    default_session_count: 16, delivery_mode: 'online', scheduling_mode: 'leader_booking', status: 'active',
    completion_policy: englishPolicy, legacy_course_name: 'Business English',
  });
  await insertRow('learning_programs', {
    id: communication2Id, code: 'ENG_COMMUNICATION_2', name: 'Communication 2', category: 'english',
    default_session_count: 16, delivery_mode: 'online', scheduling_mode: 'leader_booking', status: 'active',
    completion_policy: englishPolicy, legacy_course_name: 'Communication 2',
  });
  // Cohort-world sample: a self-enroll program so the generic Learning surfaces
  // are non-empty out of the box.
  await insertRow('learning_programs', {
    id: complianceId, code: 'COMP_DATA_PRIVACY', name: 'Data Privacy Basics', category: 'compliance',
    default_session_count: 4, delivery_mode: 'online', scheduling_mode: 'self_enroll', status: 'active',
    completion_policy: JSON.stringify({ attendanceThresholdPercent: 75, requiresAssessment: false, requiresFeedback: false }),
  });

  // ── Users ─────────────────────────────────────────────────
  console.log('👤 Creating users...');
  const USERS = [
    { empCode: '000001', name: 'Admin User', role: 'Admin', department: 'Management', status: 'Active', password: 'admin12345', mustChangePassword: true },
    { empCode: '000002', name: 'Teacher Nguyen', role: 'Teacher', department: 'English Department', status: 'Active', password: 'teacher123' },
    { empCode: '000003', name: 'Teacher Tran', role: 'Teacher', department: 'English Department', status: 'Active', password: 'teacher123' },
    { empCode: '000004', name: 'Participant Le (Team Lead A)', role: 'Participant', department: 'Sales', status: 'Active', password: 'participant123' },
    { empCode: '000005', name: 'Participant Pham', role: 'Participant', department: 'Sales', status: 'Active', password: 'participant123' },
    { empCode: '000006', name: 'Participant Vo', role: 'Participant', department: 'Sales', status: 'Active', password: 'participant123' },
    { empCode: '000007', name: 'Participant Hoang (Team Lead B)', role: 'Participant', department: 'Marketing', status: 'Active', password: 'participant123' },
    { empCode: '000008', name: 'Participant Do', role: 'Participant', department: 'Marketing', status: 'Active', password: 'participant123' },
    { empCode: '000009', name: 'Participant Bui', role: 'Participant', department: 'Marketing', status: 'On-hold', password: 'participant123' },
    { empCode: '000010', name: 'Coordinator Vu', role: 'Coordinator', department: 'HR', status: 'Active', password: 'coordinator123' },
  ];
  const u = {}; // empCode → id
  for (const spec of USERS) {
    const id = genId();
    u[spec.empCode] = id;
    // eslint-disable-next-line no-await-in-loop
    await insertRow('users', {
      id, emp_code: spec.empCode, name: spec.name, role: spec.role, department: spec.department,
      status: spec.status, password: await hashPassword(spec.password),
      password_changed_at: PASSWORD_CHANGED_AT, must_change_password: spec.mustChangePassword ?? false,
    });
  }
  console.log(`   ✅ Created ${USERS.length} users`);

  // ── Offices + assignments ─────────────────────────────────
  console.log('🏢 Creating offices...');
  const officeHcmId = genId();
  const officeHnId = genId();
  await insertRow('offices', { id: officeHcmId, name: 'Ho Chi Minh Office', code: 'HCM', address: 'District 1, Ho Chi Minh City', timezone: 'Asia/Ho_Chi_Minh' });
  await insertRow('offices', { id: officeHnId, name: 'Ha Noi Office', code: 'HN', address: 'Cau Giay, Ha Noi', timezone: 'Asia/Ho_Chi_Minh' });
  await query(`UPDATE users SET office_id = $1 WHERE emp_code = ANY($2)`, [officeHcmId, ['000001', '000010', '000004', '000005']]);
  await query(`UPDATE users SET office_id = $1 WHERE emp_code = ANY($2)`, [officeHnId, ['000002', '000007']]);
  console.log('   ✅ Created 2 offices (HCM, HN)');

  // ── Classes ───────────────────────────────────────────────
  console.log('📚 Creating classes...');
  const class1Id = genId();
  const class2Id = genId();
  const class3Id = genId();
  await insertRow('classes', { id: class1Id, class_code: 'EL001', course_name: 'Business English', program_id: businessEnglishId, total_sessions: 16, status: 'Ongoing' });
  await insertRow('classes', { id: class2Id, class_code: 'EL002', course_name: 'Communication 2', program_id: communication2Id, total_sessions: 16, status: 'Ongoing' });
  await insertRow('classes', { id: class3Id, class_code: 'LD001', course_name: 'Data Privacy Basics', program_id: complianceId, total_sessions: 4, status: 'Ongoing' });
  console.log('   ✅ Created 3 classes (2 English team-world, 1 cohort-world)');

  // ── Teams (1:1 class) + members junction ──────────────────
  console.log('👥 Creating teams...');
  const teamAId = genId();
  const teamBId = genId();
  await insertRow('teams', { id: teamAId, name: 'Sales Team Alpha', class_id: class1Id, leader_id: u['000004'] });
  await insertRow('teams', { id: teamBId, name: 'Marketing Team Beta', class_id: class2Id, leader_id: u['000007'] });
  const teamMembers = [
    [teamAId, '000004'], [teamAId, '000005'], [teamAId, '000006'],
    [teamBId, '000007'], [teamBId, '000008'], [teamBId, '000009'],
  ];
  for (const [teamId, empCode] of teamMembers) {
    // eslint-disable-next-line no-await-in-loop
    await insertRow('team_members', { team_id: teamId, user_id: u[empCode] });
  }
  console.log('   ✅ Created 2 teams (each assigned to a class)');

  // ── Enrollments (team-based, mode:group) ──────────────────
  console.log('📋 Creating enrollment records...');
  const now = new Date();
  const enrollments = [
    ['000004', teamAId, class1Id], ['000005', teamAId, class1Id], ['000006', teamAId, class1Id],
    ['000007', teamBId, class2Id], ['000008', teamBId, class2Id], ['000009', teamBId, class2Id],
  ];
  for (const [empCode, teamId, classId] of enrollments) {
    // eslint-disable-next-line no-await-in-loop
    await insertRow('enrollments', { id: genId(), user_id: u[empCode], team_id: teamId, class_id: classId, status: 'Active', joined_at: now });
  }
  console.log('   ✅ Created 6 enrollment records');

  // ── Schedules (leader-created sessions; status 'scheduled') ─
  console.log('📅 Creating schedules...');
  const teamAUsers = [u['000004'], u['000005'], u['000006']];
  const teamBUsers = [u['000007'], u['000008'], u['000009']];
  await insertRow('schedules', { id: genId(), class_id: class1Id, booked_team_id: teamAId, start_time: futureDateTime(3, 10, 0), end_time: futureDateTime(3, 11, 0), status: 'scheduled', enrolled_users: teamAUsers });
  await insertRow('schedules', { id: genId(), class_id: class1Id, booked_team_id: teamAId, start_time: futureDateTime(3, 14, 0), end_time: futureDateTime(3, 15, 0), status: 'scheduled', enrolled_users: teamAUsers });
  await insertRow('schedules', { id: genId(), class_id: class2Id, booked_team_id: teamBId, start_time: futureDateTime(4, 10, 0), end_time: futureDateTime(4, 11, 0), status: 'scheduled', enrolled_users: teamBUsers });
  console.log('   ✅ Created 3 schedules (Team A: 2, Team B: 1)');

  // ── Summary ───────────────────────────────────────────────
  const count = async (t) => (await query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
  console.log('\n════════════════════════════════════════');
  console.log('  🎉 PG seed complete!');
  console.log('════════════════════════════════════════');
  console.log('\n📊 Summary:');
  console.log(`   Users:      ${await count('users')}`);
  console.log(`   Teams:      ${await count('teams')}`);
  console.log(`   Classes:    ${await count('classes')}`);
  console.log(`   Schedules:  ${await count('schedules')}`);
  console.log('\n🔑 Login credentials:');
  console.log('   Admin:        000001 / admin12345');
  console.log('   Teachers:     000002 / teacher123, 000003 / teacher123');
  console.log('   Participants: 000004–000009 / participant123');
  console.log('   Coordinator:  000010 / coordinator123');
  console.log('');
};

seed()
  .then(async () => { await closePool(); process.exit(0); })
  .catch(async (error) => {
    console.error('❌ PG seed failed:', error.message);
    console.error(error);
    await closePool();
    process.exit(1);
  });
