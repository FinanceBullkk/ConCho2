/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — soft-delete frees empCode/email (PR Q / DATA-008)
 * ──────────────────────────────────────────────────────────
 * Before this PR, soft-deleting a user permanently locked their
 * empCode and email — admin could not create a replacement with the
 * same identifier. PR I tried partial unique indexes; that crashed
 * MongoMemoryReplSet on Windows. PR Q sidesteps the index by mutating
 * the empCode + parking the email at delete-time, then reversing
 * those mutations on restore.
 *
 * Invariants this suite locks:
 *   1. After soft-delete, a NEW user with the freed empCode succeeds
 *   2. After soft-delete, a NEW user with the freed email succeeds
 *   3. Restore without a clash returns the original empCode+email
 *   4. Restore WITH an empCode clash returns 409
 *   5. Restore WITH an email clash returns 409
 *   6. getDeletedUsers still surfaces the soft-deleted user (with
 *      the mutated empCode visible) so admin can find them
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
// Slice-4 ports write through DB_BACKEND repos — assert on the ACTIVE backend.
const { readActiveRow } = require('../pg-test-utils');

let app, tokens, seed, csrf;
let User;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
  User = require('../../models/User');
});

afterAll(async () => {
  await teardown();
});

// Generate unique-per-test identifiers so re-runs don't collide.
let counter = 0;
const fresh = () => {
  counter += 1;
  return {
    empCode: `Q008_${counter}_${String(Date.now()).slice(-5)}`.toUpperCase(),
    email:   `pr-q-${counter}-${Date.now()}@example.com`,
  };
};

const createUser = async ({ empCode, email, password = 'temp-password-1', role = 'Participant' }) =>
  request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .set(csrf)
    .send({ empCode, email, password, role, name: empCode });

describe('Soft-delete frees empCode + email (PR Q / DATA-008)', () => {
  test('a NEW user with the freed empCode succeeds after soft-delete', async () => {
    const { empCode, email } = fresh();

    // 1. Create + soft-delete the original
    const a = await createUser({ empCode, email });
    expect(a.status).toBe(201);
    const aId = a.body.data._id;

    const delRes = await request(app)
      .delete(`/api/users/${aId}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);
    expect(delRes.status).toBe(200);

    // 2. Replacement with the SAME empCode succeeds — slot is free.
    const repl = await createUser({
      empCode,
      email: `replacement-${counter}-${Date.now()}@example.com`,
    });
    expect(repl.status).toBe(201);
    expect(repl.body.data.empCode).toBe(empCode);
  });

  test('a NEW user with the freed email succeeds after soft-delete', async () => {
    const { empCode, email } = fresh();
    const a = await createUser({ empCode, email });
    expect(a.status).toBe(201);

    const aId = a.body.data._id;
    await request(app)
      .delete(`/api/users/${aId}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);

    const repl = await createUser({
      empCode: `${empCode}_R`,
      email, // same email
    });
    expect(repl.status).toBe(201);
    expect(repl.body.data.email).toBe(email);
  });

  test('the soft-deleted user keeps the suffixed empCode in the trash view', async () => {
    const { empCode, email } = fresh();
    const a = await createUser({ empCode, email });
    const aId = a.body.data._id;
    await request(app)
      .delete(`/api/users/${aId}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);

    // Raw DB read — the deleted user's empCode now carries __DEL_<ts>.
    // _id from API is a string; raw collection needs an ObjectId instance.
    const tombstone = await readActiveRow('User', aId);
    expect(tombstone.empCode).toMatch(new RegExp(`^${empCode}__DEL_[A-Z0-9]+$`));
    expect(tombstone.email).toBeNull();
    // Parking field: top-level on Mongo, users.meta jsonb on PG.
    expect(tombstone._softDeletedEmail ?? tombstone.meta?._softDeletedEmail).toBe(email);
  });

  test('restore with no clash returns the original empCode + email', async () => {
    const { empCode, email } = fresh();
    const a = await createUser({ empCode, email });
    const aId = a.body.data._id;

    await request(app)
      .delete(`/api/users/${aId}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);

    const restoreRes = await request(app)
      .post(`/api/users/${aId}/restore`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);
    expect(restoreRes.status).toBe(200);

    const restored = await readActiveRow('User', aId);
    expect(restored.empCode).toBe(empCode);
    expect(restored.email).toBe(email);
  });

  test('restore with an empCode clash returns 409 (admin must rename first)', async () => {
    const { empCode, email } = fresh();
    const a = await createUser({ empCode, email });
    const aId = a.body.data._id;

    // Delete the original, then create a replacement that takes the slot.
    await request(app)
      .delete(`/api/users/${aId}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);
    const replEmail = `clash-${counter}-${Date.now()}@example.com`;
    const repl = await createUser({ empCode, email: replEmail });
    expect(repl.status).toBe(201);

    // Restore the original — empCode is taken now → 409.
    const restoreRes = await request(app)
      .post(`/api/users/${aId}/restore`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);
    expect(restoreRes.status).toBe(409);
    expect(restoreRes.body.message).toMatch(/empCode.*in use/i);
  });

  test('restore with an email clash returns 409', async () => {
    const { empCode, email } = fresh();
    const a = await createUser({ empCode, email });
    const aId = a.body.data._id;
    await request(app)
      .delete(`/api/users/${aId}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);

    // Replacement with a DIFFERENT empCode but the same email.
    const repl = await createUser({ empCode: `${empCode}_R`, email });
    expect(repl.status).toBe(201);

    const restoreRes = await request(app)
      .post(`/api/users/${aId}/restore`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);
    expect(restoreRes.status).toBe(409);
    expect(restoreRes.body.message).toMatch(/email.*in use/i);
  });
});
