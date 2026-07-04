/**
 * ──────────────────────────────────────────────────────────
 * PG-parity — auth login/middleware repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * The load-bearing security read/write surface (Phase 3 Wave-E slice E3,
 * mig 030): services/auth/auth-repository under auth-login.js +
 * middleware/auth.js. No transactions → standalone mongod. Runs only when a
 * Postgres URL is present (the pg-parity CI job); SKIPS otherwise.
 *
 * Pinned identical on both backends:
 *   1. findForLogin: full security row (password hash bcrypt-comparable,
 *      counters, mfaSecret), soft-deleted user invisible, unknown → null;
 *   2. recordFailedLoginAttempt: atomic roll — counter 1,2,…; at max →
 *      resets to 0 AND sets lockUntil ≈ now+lockMinutes (same transition);
 *   3. resetLoginCounters clears both fields;
 *   4. findForMfaVerify: secret + backup codes + replay counter (bigint →
 *      Number), deleted → null;
 *   5. saveMfaLastUsedCounter / saveMfaBackupCodes persist;
 *   6. findAuthUserById (middleware projection): EXACT 10-key shape — never
 *      carries password/mfaSecret/lockout fields (the select:false parity),
 *      deleted → null.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const authRepo = require('../../services/auth/auth-repository');
require('../../models/User');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);

const U1 = hex(0xe301); // active, no MFA, mustChangePassword
const U2 = hex(0xe302); // active, MFA enabled
const U3 = hex(0xe303); // soft-deleted
const D1 = hex(0xe311); // departmentId

const PASSWORD = 'secret-pass-123';
let passwordHash; // bcrypt(12) — computed once, seeded identically on both

const PCA = new Date('2026-07-01T00:00:00.000Z'); // passwordChangedAt for U1

const BACKENDS = {
  mongo: { repo: null, id: (h) => oid(h) }, // repo filled in beforeAll
  pg: { repo: null, id: (h) => h },
};

// Normalize a row for cross-backend equality: ObjectId → hex, Date → ISO.
const norm = (r) => (r == null ? null : JSON.parse(JSON.stringify({ ...r, _id: String(r._id) })));

const seed = async () => {
  const users = mongoose.connection.db.collection('users');
  await users.deleteMany({});
  // Explicit nulls everywhere a projection selects the field, so the Mongo
  // lean rows carry the same key set as the PG rows.
  await users.insertMany([
    {
      _id: oid(U1), empCode: 'E3001', email: null, name: 'Login One', role: 'Participant',
      department: 'Ops', departmentId: oid(D1), status: 'Active',
      password: passwordHash, passwordChangedAt: PCA, mustChangePassword: true,
      mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [], mfaLastUsedCounter: null,
      failedLoginAttempts: 0, lockUntil: null, isDeleted: false,
    },
    {
      _id: oid(U2), empCode: 'E3002', email: null, name: 'MFA Two', role: 'Admin',
      department: 'IT', departmentId: null, status: 'Active',
      password: passwordHash, passwordChangedAt: null, mustChangePassword: false,
      mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP', mfaBackupCodes: ['bh-1', 'bh-2'],
      mfaLastUsedCounter: 5, failedLoginAttempts: 0, lockUntil: null, isDeleted: false,
    },
    {
      _id: oid(U3), empCode: 'E3003', email: null, name: 'Gone Three', role: 'Teacher',
      department: 'Ops', departmentId: null, status: 'Active',
      password: passwordHash, passwordChangedAt: null, mustChangePassword: false,
      mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [], mfaLastUsedCounter: null,
      failedLoginAttempts: 0, lockUntil: null, isDeleted: true, deletedAt: new Date(),
    },
  ]);

  await query('TRUNCATE users');
  const insert = (id, empCode, name, role, dept, deptId, pca, mustChange, mfaEnabled, mfaSecret, codes, counter, deleted) =>
    query(
      `INSERT INTO users(
         id, emp_code, email, name, role, department, department_id, status,
         password, password_changed_at, must_change_password,
         mfa_enabled, mfa_secret, mfa_backup_codes, mfa_last_used_counter,
         failed_login_attempts, lock_until, is_deleted)
       VALUES ($1,$2,NULL,$3,$4,$5,$6,'Active',$7,$8,$9,$10,$11,$12,$13,0,NULL,$14)`,
      [id, empCode, name, role, dept, deptId, passwordHash, pca, mustChange,
       mfaEnabled, mfaSecret, codes, counter, deleted]
    );
  await insert(U1, 'E3001', 'Login One', 'Participant', 'Ops', D1, PCA, true, false, null, [], null, false);
  await insert(U2, 'E3002', 'MFA Two', 'Admin', 'IT', null, null, false, true, 'JBSWY3DPEHPK3PXP', ['bh-1', 'bh-2'], 5, false);
  await insert(U3, 'E3003', 'Gone Three', 'Teacher', 'Ops', null, null, false, false, null, [], null, true);
};

describePg('pg-parity: auth login/middleware repository', () => {
  let mongod;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 12);
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri('pg-parity-auth'));
    BACKENDS.mongo.repo = authRepo.impls.mongo;
    BACKENDS.pg.repo = authRepo.impls.pg;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
    await closePool();
  });

  beforeEach(seed);

  test('findForLogin: identical security row; hash bcrypt-comparable; deleted/unknown → null', async () => {
    const rows = {};
    for (const [name, b] of Object.entries(BACKENDS)) {
      const row = await b.repo.findForLogin('E3001');
      expect(await bcrypt.compare(PASSWORD, row.password)).toBe(true);
      expect(await bcrypt.compare('wrong', row.password)).toBe(false);
      expect(row.failedLoginAttempts).toBe(0);
      expect(row.lockUntil).toBeNull();
      expect(row.mustChangePassword).toBe(true);
      rows[name] = norm(row);

      expect(await b.repo.findForLogin('E3003')).toBeNull(); // soft-deleted
      expect(await b.repo.findForLogin('NOPE')).toBeNull();
    }
    expect(rows.mongo).toEqual(rows.pg);
  });

  test('recordFailedLoginAttempt: counts up, then at max resets to 0 + locks — same transition', async () => {
    const MAX = 3;
    const LOCK_MIN = 15;
    for (const b of Object.values(BACKENDS)) {
      const id = b.id(U1);
      const r1 = await b.repo.recordFailedLoginAttempt(id, { maxAttempts: MAX, lockMinutes: LOCK_MIN });
      expect(r1).toMatchObject({ failedLoginAttempts: 1, lockUntil: null });
      const r2 = await b.repo.recordFailedLoginAttempt(id, { maxAttempts: MAX, lockMinutes: LOCK_MIN });
      expect(r2).toMatchObject({ failedLoginAttempts: 2, lockUntil: null });

      const r3 = await b.repo.recordFailedLoginAttempt(id, { maxAttempts: MAX, lockMinutes: LOCK_MIN });
      expect(r3.failedLoginAttempts).toBe(0); // counter restarts after locking
      const lockMs = new Date(r3.lockUntil).getTime() - Date.now();
      expect(lockMs).toBeGreaterThan((LOCK_MIN - 2) * 60 * 1000);
      expect(lockMs).toBeLessThan((LOCK_MIN + 2) * 60 * 1000);

      // The lock is visible to the next login attempt.
      const row = await b.repo.findForLogin('E3001');
      expect(new Date(row.lockUntil) > new Date()).toBe(true);
    }
  });

  test('resetLoginCounters clears both fields on both backends', async () => {
    for (const b of Object.values(BACKENDS)) {
      const id = b.id(U1);
      for (let i = 0; i < 3; i++) {
        await b.repo.recordFailedLoginAttempt(id, { maxAttempts: 3, lockMinutes: 15 });
      }
      await b.repo.resetLoginCounters(id);
      const row = await b.repo.findForLogin('E3001');
      expect(row.failedLoginAttempts).toBe(0);
      expect(row.lockUntil).toBeNull();
    }
  });

  test('findForMfaVerify: secret + backup codes + Number counter; deleted → null', async () => {
    const rows = {};
    for (const [name, b] of Object.entries(BACKENDS)) {
      const row = await b.repo.findForMfaVerify(b.id(U2));
      expect(row.mfaSecret).toBe('JBSWY3DPEHPK3PXP');
      expect(row.mfaBackupCodes).toEqual(['bh-1', 'bh-2']);
      expect(row.mfaLastUsedCounter).toBe(5);
      expect(typeof row.mfaLastUsedCounter).toBe('number');
      rows[name] = norm(row);

      expect(await b.repo.findForMfaVerify(b.id(U3))).toBeNull();
    }
    expect(rows.mongo).toEqual(rows.pg);
  });

  test('saveMfaLastUsedCounter + saveMfaBackupCodes persist on both backends', async () => {
    for (const b of Object.values(BACKENDS)) {
      const id = b.id(U2);
      await b.repo.saveMfaLastUsedCounter(id, 42);
      await b.repo.saveMfaBackupCodes(id, ['bh-2']); // one code consumed
      const row = await b.repo.findForMfaVerify(id);
      expect(row.mfaLastUsedCounter).toBe(42);
      expect(row.mfaBackupCodes).toEqual(['bh-2']);
    }
  });

  test('findAuthUserById: EXACT middleware projection — no security fields leak', async () => {
    const EXPECTED_KEYS = [
      '_id', 'empCode', 'name', 'role', 'department', 'departmentId',
      'status', 'passwordChangedAt', 'mfaEnabled', 'mustChangePassword',
    ].sort();

    const rows = {};
    for (const [name, b] of Object.entries(BACKENDS)) {
      const row = await b.repo.findAuthUserById(b.id(U1));
      expect(Object.keys(row).sort()).toEqual(EXPECTED_KEYS);
      // The select:false parity — the middleware cache must NEVER hold these.
      expect(row).not.toHaveProperty('password');
      expect(row).not.toHaveProperty('mfaSecret');
      expect(row).not.toHaveProperty('mfaBackupCodes');
      expect(row).not.toHaveProperty('failedLoginAttempts');
      expect(row).not.toHaveProperty('lockUntil');
      expect(new Date(row.passwordChangedAt).toISOString()).toBe(PCA.toISOString());
      rows[name] = norm(row);

      expect(await b.repo.findAuthUserById(b.id(U3))).toBeNull(); // soft-deleted
    }
    expect(rows.mongo).toEqual(rows.pg);
  });
});
