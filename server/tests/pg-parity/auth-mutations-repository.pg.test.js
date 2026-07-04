/**
 * ──────────────────────────────────────────────────────────
 * PG-parity — auth mutations repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Wave-E slice E4: password change/reset, the MFA enrollment lifecycle and
 * the admin overrides (services/auth/auth-repository E4 extension) under
 * controllers/auth/* + policy/auth. No transactions → standalone mongod.
 * Runs only when a Postgres URL is present (the pg-parity CI job); SKIPS
 * otherwise.
 *
 * Pinned identical on both backends:
 *   1. findByIdWithPassword: EXACTLY {_id, password}; deleted → null;
 *   2. updatePassword: hash + passwordChangedAt + mustChangePassword land
 *      (callers replicate the pre('save') -1s skew — pinned by value);
 *   3. MFA lifecycle: pending set → verify-read → clear / promote(enableMfa
 *      wipes pending, sets secret+codes+enabled) → disable (secret null,
 *      codes [], enabled false);
 *   4. findUserRef {_id, empCode, role}; bumpPasswordChangedAt ≈ now;
 *   5. password reset: LOWERCASE empCode lookup still matches (Mongo query
 *      setter ⇄ PG upper()); save/rollback token; consume = single-use
 *      atomic claim (second consume → null; expired token → null).
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

const U1 = hex(0xe401); // active user (password flows)
const U2 = hex(0xe402); // MFA lifecycle user
const U3 = hex(0xe403); // soft-deleted

const OLD_HASH = '$2a$12$oldoldoldoldoldoldoldu1234567890123456789012345678901';

const BACKENDS = {
  mongo: { repo: null, id: (h) => oid(h) },
  pg: { repo: null, id: (h) => h },
};

const seed = async () => {
  const users = mongoose.connection.db.collection('users');
  await users.deleteMany({});
  await users.insertMany([
    {
      _id: oid(U1), empCode: 'E4001', email: 'u1@x.co', name: 'Pw One', role: 'Participant',
      department: 'Ops', status: 'Active', password: OLD_HASH, passwordChangedAt: null,
      mustChangePassword: true, passwordResetToken: null, passwordResetExpires: null,
      mfaEnabled: false, mfaSecret: null, mfaPendingSecret: null, mfaPendingSecretExpires: null,
      mfaBackupCodes: [], failedLoginAttempts: 0, lockUntil: null, isDeleted: false,
    },
    {
      _id: oid(U2), empCode: 'E4002', email: null, name: 'Mfa Two', role: 'Admin',
      department: 'IT', status: 'Active', password: OLD_HASH, passwordChangedAt: null,
      mustChangePassword: false, passwordResetToken: null, passwordResetExpires: null,
      mfaEnabled: false, mfaSecret: null, mfaPendingSecret: null, mfaPendingSecretExpires: null,
      mfaBackupCodes: [], failedLoginAttempts: 0, lockUntil: null, isDeleted: false,
    },
    {
      _id: oid(U3), empCode: 'E4003', email: 'gone@x.co', name: 'Gone Three', role: 'Teacher',
      department: 'Ops', status: 'Active', password: OLD_HASH, passwordChangedAt: null,
      mustChangePassword: false, passwordResetToken: null, passwordResetExpires: null,
      mfaEnabled: false, mfaSecret: null, mfaPendingSecret: null, mfaPendingSecretExpires: null,
      mfaBackupCodes: [], failedLoginAttempts: 0, lockUntil: null,
      isDeleted: true, deletedAt: new Date(),
    },
  ]);

  await query('TRUNCATE users');
  const insert = (id, empCode, email, name, role, mustChange, deleted) =>
    query(
      `INSERT INTO users(
         id, emp_code, email, name, role, department, status, password,
         must_change_password, mfa_enabled, mfa_backup_codes,
         failed_login_attempts, is_deleted)
       VALUES ($1,$2,$3,$4,$5,'Ops','Active',$6,$7,false,'{}'::text[],0,$8)`,
      [id, empCode, email, name, role, OLD_HASH, mustChange, deleted]
    );
  await insert(U1, 'E4001', 'u1@x.co', 'Pw One', 'Participant', true, false);
  await insert(U2, 'E4002', null, 'Mfa Two', 'Admin', false, false);
  await insert(U3, 'E4003', 'gone@x.co', 'Gone Three', 'Teacher', false, true);
};

describePg('pg-parity: auth mutations repository', () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri('pg-parity-auth-mut'));
    BACKENDS.mongo.repo = authRepo.impls.mongo;
    BACKENDS.pg.repo = authRepo.impls.pg;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
    await closePool();
  });

  beforeEach(seed);

  test('findByIdWithPassword: EXACTLY {_id, empCode, password}; deleted → null', async () => {
    for (const b of Object.values(BACKENDS)) {
      const row = await b.repo.findByIdWithPassword(b.id(U1));
      expect(Object.keys(row).sort()).toEqual(['_id', 'empCode', 'password']);
      expect(row.password).toBe(OLD_HASH);
      expect(await b.repo.findByIdWithPassword(b.id(U3))).toBeNull();
    }
  });

  test('updatePassword: hash + changedAt(-1s skew) + mustChangePassword persist', async () => {
    const newHash = await bcrypt.hash('brand-new-pass', 4); // low rounds — test speed
    for (const b of Object.values(BACKENDS)) {
      const changedAt = new Date(Date.now() - 1000);
      await b.repo.updatePassword(b.id(U1), {
        passwordHash: newHash,
        passwordChangedAt: changedAt,
        mustChangePassword: false,
      });
      const login = await b.repo.findForLogin('E4001');
      expect(login.password).toBe(newHash);
      expect(login.mustChangePassword).toBe(false);
      const mw = await b.repo.findAuthUserById(b.id(U1));
      expect(new Date(mw.passwordChangedAt).getTime()).toBe(changedAt.getTime());
    }
  });

  test('MFA lifecycle: pending → promote (enableMfa) → disable — same transitions', async () => {
    const expires = new Date(Date.now() + 15 * 60 * 1000);
    for (const b of Object.values(BACKENDS)) {
      const id = b.id(U2);

      await b.repo.setMfaPendingSecret(id, 'PENDING-SECRET', expires);
      let pending = await b.repo.findForMfaSetupVerify(id);
      expect(pending.mfaPendingSecret).toBe('PENDING-SECRET');
      expect(new Date(pending.mfaPendingSecretExpires).getTime()).toBe(expires.getTime());

      // Expired-path branch: clear wipes both fields.
      await b.repo.clearMfaPendingSecret(id);
      pending = await b.repo.findForMfaSetupVerify(id);
      expect(pending.mfaPendingSecret).toBeNull();
      expect(pending.mfaPendingSecretExpires).toBeNull();

      // Promote: pending → permanent + enabled + backup codes.
      await b.repo.setMfaPendingSecret(id, 'REAL-SECRET', expires);
      await b.repo.enableMfa(id, { secret: 'REAL-SECRET', backupCodes: ['c1', 'c2'] });
      const enabled = await b.repo.findForMfaVerify(id);
      expect(enabled.mfaEnabled).toBe(true);
      expect(enabled.mfaSecret).toBe('REAL-SECRET');
      expect(enabled.mfaBackupCodes).toEqual(['c1', 'c2']);
      expect((await b.repo.findForMfaSetupVerify(id)).mfaPendingSecret).toBeNull();

      // Disable (self + admin share it): secret gone, codes emptied.
      await b.repo.disableMfa(id);
      const disabled = await b.repo.findForMfaDisable(id);
      expect(disabled.mfaEnabled).toBe(false);
      expect(disabled.mfaSecret).toBeNull();
      expect(disabled.mfaBackupCodes).toEqual([]);
    }
  });

  test('findUserRef {_id, empCode, role}; bumpPasswordChangedAt ≈ now (kill switch)', async () => {
    for (const b of Object.values(BACKENDS)) {
      const ref = await b.repo.findUserRef(b.id(U2));
      expect(Object.keys(ref).sort()).toEqual(['_id', 'empCode', 'role']);
      expect(ref).toMatchObject({ empCode: 'E4002', role: 'Admin' });
      expect(await b.repo.findUserRef(b.id(U3))).toBeNull();

      const before = Date.now();
      await b.repo.bumpPasswordChangedAt(b.id(U2));
      const mw = await b.repo.findAuthUserById(b.id(U2));
      const bumped = new Date(mw.passwordChangedAt).getTime();
      expect(bumped).toBeGreaterThanOrEqual(before - 5000); // clock-skew slack (Neon server time)
      expect(bumped).toBeLessThanOrEqual(Date.now() + 5000);
    }
  });

  test('password reset: lowercase empCode lookup matches on BOTH (setter ⇄ upper())', async () => {
    for (const b of Object.values(BACKENDS)) {
      const row = await b.repo.findForPasswordReset('e4001'); // lowercase on purpose
      expect(row).toMatchObject({ email: 'u1@x.co', name: 'Pw One' });
      expect(row.passwordResetToken).toBeNull();
      expect(await b.repo.findForPasswordReset('e4003')).toBeNull(); // soft-deleted
    }
  });

  test('reset token: save → rollback clear; consume is single-use + expiry-guarded', async () => {
    const newHash = await bcrypt.hash('after-reset', 4);
    for (const b of Object.values(BACKENDS)) {
      const id = b.id(U1);
      const future = new Date(Date.now() + 60 * 60 * 1000);

      // Save then rollback (the mail-failure branch).
      await b.repo.savePasswordResetToken(id, 'tok-hash-1', future);
      expect((await b.repo.findForPasswordReset('E4001')).passwordResetToken).toBe('tok-hash-1');
      await b.repo.clearPasswordResetToken(id);
      expect((await b.repo.findForPasswordReset('E4001')).passwordResetToken).toBeNull();

      // Valid consume: returns {_id, empCode}, writes password, clears token.
      await b.repo.savePasswordResetToken(id, 'tok-hash-2', future);
      const claimed = await b.repo.consumePasswordResetToken('tok-hash-2', newHash);
      expect(claimed.empCode).toBe('E4001');
      expect(Object.keys(claimed).sort()).toEqual(['_id', 'empCode']);
      const login = await b.repo.findForLogin('E4001');
      expect(login.password).toBe(newHash);
      expect((await b.repo.findForPasswordReset('E4001')).passwordResetToken).toBeNull();

      // Single-use: the second consume finds nothing (double-spend guard).
      expect(await b.repo.consumePasswordResetToken('tok-hash-2', newHash)).toBeNull();

      // Expired token never consumes.
      await b.repo.savePasswordResetToken(id, 'tok-hash-3', new Date(Date.now() - 1000));
      expect(await b.repo.consumePasswordResetToken('tok-hash-3', newHash)).toBeNull();
    }
  });
});
