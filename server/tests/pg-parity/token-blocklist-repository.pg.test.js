/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — token blocklist (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * services/auth/token-blocklist-repository — JWT revocation (SECURITY: auth
 * middleware consults isJtiRevoked on EVERY authed request). Runs only when a
 * Postgres URL is present; SKIPS otherwise. Asserts identical behaviour + traps:
 *   • revoke → isJtiRevoked true; unknown JTI → false
 *   • duplicate revocation is a no-op that keeps the ORIGINAL row
 *     (Mongo upsert-$setOnInsert ⇔ PG ON CONFLICT (jti) DO NOTHING)
 *   • userId is optional (system/anonymous revocations store null)
 *   • expired-but-unpurged rows still read revoked (purge is retention,
 *     not semantics — see retention-purge.pg.test.js for the E2 window)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const { impls } = require('../../services/auth/token-blocklist-repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000);

describePg('PG-parity: token-blocklist repository', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await query('TRUNCATE token_blocklist');
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(impls.mongo), fn(impls.pg)]);

  test('revoke → revoked true; unknown JTI → false — identical', async () => {
    await both((r) => r.insertRevocation('jti-logout-1', {
      userId: hex(0xa1), expiresAt: inOneHour(), reason: 'logout',
    }));
    const [m, p] = await both((r) => r.isJtiRevoked('jti-logout-1'));
    expect(m).toBe(true); expect(p).toBe(true);

    const [mU, pU] = await both((r) => r.isJtiRevoked('jti-never-revoked'));
    expect(mU).toBe(false); expect(pU).toBe(false);
  });

  test('duplicate revocation is a no-op keeping the ORIGINAL row — identical', async () => {
    const first = { userId: hex(0xa2), expiresAt: inOneHour(), reason: 'logout' };
    await both((r) => r.insertRevocation('jti-double', first));
    // Second revoke with a DIFFERENT reason/user must not overwrite.
    await both((r) => r.insertRevocation('jti-double', {
      userId: hex(0xa3), expiresAt: inOneHour(), reason: 'admin-action',
    }));

    const mRow = await mongoose.model('TokenBlocklist').findOne({ jti: 'jti-double' }).lean();
    const { rows } = await query('SELECT * FROM token_blocklist WHERE jti = $1', ['jti-double']);
    expect(rows).toHaveLength(1);
    expect(mRow.reason).toBe('logout');
    expect(rows[0].reason).toBe('logout');
    expect(String(mRow.userId)).toBe(hex(0xa2));
    expect(rows[0].user_id).toBe(hex(0xa2));
  });

  test('userId optional → stored null — identical', async () => {
    await both((r) => r.insertRevocation('jti-system', {
      userId: null, expiresAt: inOneHour(), reason: 'password-change',
    }));
    const mRow = await mongoose.model('TokenBlocklist').findOne({ jti: 'jti-system' }).lean();
    const { rows } = await query('SELECT * FROM token_blocklist WHERE jti = $1', ['jti-system']);
    expect(mRow.userId).toBeNull();
    expect(rows[0].user_id).toBeNull();
    const [m, p] = await both((r) => r.isJtiRevoked('jti-system'));
    expect(m).toBe(true); expect(p).toBe(true);
  });

  test('expired-but-unpurged JTI still reads revoked — identical', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    // Mongo's TTL sweeper is lazy (~60s cadence) — an expired doc can linger;
    // insert directly so neither backend has purged it yet.
    await both((r) => r.insertRevocation('jti-expired', {
      userId: null, expiresAt: past, reason: 'logout',
    }));
    const [m, p] = await both((r) => r.isJtiRevoked('jti-expired'));
    expect(m).toBe(true); expect(p).toBe(true);
  });
});
