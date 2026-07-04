/**
 * ──────────────────────────────────────────────────────────
 * PG test utilities — the DB_BACKEND=postgres full-suite lane (Wave G)
 * ──────────────────────────────────────────────────────────
 * The Mongo side of the test infra gives every jest file its own private
 * database (tests/setup.js → TEST_DB_NAME). Postgres has ONE shared database
 * for the whole run, so without help the suites contaminate each other AND
 * fixtures seeded via raw Mongoose never reach the ported read-paths.
 *
 * Two building blocks fix that:
 *   1. resetPgDatabase()  — truncates every app table (jest runs --runInBand,
 *      so a truncate at file-setup time gives the same per-file isolation as
 *      Mongo's private database).
 *   2. mirror*ToPg(doc)   — inserts a Mongoose-created fixture into the
 *      migrated PG tables with the SAME ObjectId-hex id (and, for users, the
 *      SAME bcrypt hash), so ported readers (auth middleware, classes, groups)
 *      see the same world on either backend.
 *
 * Every export is a NO-OP unless DB_BACKEND=postgres — converted suites can
 * call these unconditionally and stay 100% inert on the default Mongo lane.
 */
const { isPostgres } = require('../config/db-backend');
const { query } = require('../config/pg');

// Tables that belong to knex's own bookkeeping — never truncated.
const KNEX_TABLES = ["'knex_migrations'", "'knex_migrations_lock'"];

/**
 * Truncate all application tables (RESTART IDENTITY CASCADE). Called once per
 * test file from tests/setup.js — the PG twin of Mongo's per-file database.
 */
const resetPgDatabase = async () => {
  if (!isPostgres) return;
  const { rows } = await query(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT IN (${KNEX_TABLES.join(',')})`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
  await query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
};

// Mongoose doc/POJO → plain object (keeps in-memory-only fields like the
// freshly hashed password, which is select:false on later reads).
const plain = (doc) => (typeof doc?.toObject === 'function' ? doc.toObject({ virtuals: false }) : { ...doc });
const id = (v) => (v == null ? null : String(v));

/**
 * Mirror a User doc into the PG `users` table (migrations 001/004/030/031).
 * Reads the bcrypt hash off the in-memory doc (present right after
 * User.create()), so PG logins verify against the identical hash.
 */
const mirrorUserToPg = async (doc) => {
  if (!isPostgres) return;
  const d = plain(doc);
  const password = doc.password || d.password || null;
  await query(
    `INSERT INTO users(
       id, emp_code, email, name, department, role, status,
       department_id, manager_id, position, office_id,
       password, password_changed_at, must_change_password,
       mfa_enabled, mfa_secret, mfa_backup_codes, mfa_last_used_counter,
       failed_login_attempts, lock_until, notification_preferences,
       entrance_level, current_level, drop_reason, last_active_at,
       is_deleted, deleted_at, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
               $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)`,
    [
      id(d._id), d.empCode, d.email ?? null, d.name, d.department ?? '', d.role, d.status ?? 'Active',
      id(d.departmentId), id(d.managerId), d.position ?? null, id(d.officeId),
      password, d.passwordChangedAt ?? null, d.mustChangePassword ?? false,
      d.mfaEnabled ?? false, d.mfaSecret ?? null, d.mfaBackupCodes ?? [], d.mfaLastUsedCounter ?? null,
      d.failedLoginAttempts ?? 0, d.lockUntil ?? null, d.notificationPreferences ?? null,
      d.entranceLevel ?? '', d.currentLevel ?? '', d.dropReason ?? '', d.lastActiveAt ?? null,
      d.isDeleted ?? false, d.deletedAt ?? null, d.createdAt ?? new Date(), d.updatedAt ?? new Date(),
    ],
  );
};

/** Mirror a Class doc into the PG `classes` table. */
const mirrorClassToPg = async (doc) => {
  if (!isPostgres) return;
  const d = plain(doc);
  await query(
    `INSERT INTO classes(
       id, class_code, course_name, program_id, total_sessions, status,
       teacher_ids, custom_fields, is_deleted, deleted_at, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id(d._id), d.classCode, d.courseName ?? null, id(d.programId), d.totalSessions ?? null,
      d.status ?? null, (d.teacherIds || []).map(id), d.customFields ?? null,
      d.isDeleted ?? false, d.deletedAt ?? null, d.createdAt ?? new Date(), d.updatedAt ?? new Date(),
    ],
  );
};

/** Mirror a Team doc into PG `teams` + the `team_members` junction. */
const mirrorTeamToPg = async (doc) => {
  if (!isPostgres) return;
  const d = plain(doc);
  await query(
    `INSERT INTO teams(id, name, class_id, leader_id, is_deleted, deleted_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id(d._id), d.name, id(d.classId), id(d.leaderId),
      d.isDeleted ?? false, d.deletedAt ?? null, d.createdAt ?? new Date(), d.updatedAt ?? new Date(),
    ],
  );
  const members = (d.members || []).map(id);
  if (members.length) {
    await query(
      `INSERT INTO team_members(team_id, user_id)
       VALUES ${members.map((_, j) => `($1,$${j + 2})`).join(',')}`,
      [id(d._id), ...members],
    );
  }
};

/**
 * Mirror the tests/setup.js core fixtures in FK-safe order
 * (classes → users → teams → members).
 */
const mirrorCoreSeedToPg = async ({ users = [], classes = [], teams = [] }) => {
  if (!isPostgres) return;
  for (const c of classes) await mirrorClassToPg(c);
  for (const u of users) await mirrorUserToPg(u);
  for (const t of teams) await mirrorTeamToPg(t);
};

module.exports = {
  resetPgDatabase,
  mirrorUserToPg,
  mirrorClassToPg,
  mirrorTeamToPg,
  mirrorCoreSeedToPg,
};
