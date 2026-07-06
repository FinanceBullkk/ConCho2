/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — audit tamper-evident hash chain (Build Plan #3a)
 * ──────────────────────────────────────────────────────────
 * Proves the chain is real: every write links to the prior row by hash,
 * verify re-derives it, and tampering (field edit or row deletion) is caught
 * at the exact seq. Also covers the verify endpoint's auth.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData, getCsrfHeaders } = require('../setup');
const AuditLog = require('../../models/AuditLog');
const auditService = require('../../services/auditService');
const { computeHash, verifyChain, GENESIS_PREV_HASH } = require('../../services/audit-chain');
const {
  findActiveAuditChain, updateActiveAuditRowBySeq, deleteActiveAuditRowBySeq,
} = require('../pg-test-utils');

let app, tokens, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  getSeedData();
  csrf = await getCsrfHeaders(app);
});

afterAll(async () => {
  await mongoose.disconnect();
});

// Build a clean chain of N entries from genesis and return the stored rows.
const seedChain = async (n) => {
  await AuditLog.deleteMany({});
  auditService.__resetChainCache();
  for (let i = 0; i < n; i += 1) {
    auditService.record({
      req: null,
      action: 'updated',
      entity: 'User',
      entityId: new mongoose.Types.ObjectId(),
      diff: { field: { before: i, after: i + 1 } },
      note: `entry ${i}`,
    });
  }
  await auditService.flush();
  // Read the chain from the ACTIVE backend — on the pg lane the rows the service
  // just wrote live in PG, not Mongo (a Mongoose find would return []).
  return findActiveAuditChain();
};

describe('Audit hash chain — write side', () => {
  test('writes form a genesis-seeded, self-consistent chain', async () => {
    const rows = await seedChain(3);

    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(rows[0].prevHash).toBe(GENESIS_PREV_HASH);

    for (let i = 0; i < rows.length; i += 1) {
      // Each row's stored hash re-derives from its own fields.
      expect(rows[i].hash).toBe(computeHash(rows[i]));
      // …and links to the prior row.
      if (i > 0) expect(rows[i].prevHash).toBe(rows[i - 1].hash);
    }
  });
});

describe('Audit hash chain — verifyChain', () => {
  test('reports ok for an intact chain', async () => {
    await seedChain(4);
    const res = await verifyChain({});
    expect(res.ok).toBe(true);
    expect(res.checked).toBe(4);
    expect(res.firstBrokenSeq).toBeNull();
    expect(res.reason).toBe('verified');
  });

  test('detects a field tamper at the altered seq (hash-mismatch)', async () => {
    await seedChain(4);
    // Alter a stored field WITHOUT recomputing the hash — simulates tampering.
    await updateActiveAuditRowBySeq(2, { note: 'TAMPERED' });

    const res = await verifyChain({});
    expect(res.ok).toBe(false);
    expect(res.firstBrokenSeq).toBe(2);
    expect(res.reason).toBe('hash-mismatch');
  });

  test('detects a deleted middle row (missing-rows)', async () => {
    await seedChain(4);
    await deleteActiveAuditRowBySeq(2);

    const res = await verifyChain({});
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('missing-rows');
    expect(res.firstBrokenSeq).toBe(3);
  });

  test('detects a re-linked row whose own hash is self-consistent (broken-link)', async () => {
    const rows = await seedChain(4);
    // Tamper row 2's prevHash to a bogus value, then RECOMPUTE its hash so the
    // row stays self-consistent (passes the hash-mismatch check) and its seq is
    // still contiguous (passes the missing-rows check) — only the LINK to row 1
    // is broken. This is the one verify reason the suite never exercised.
    const row2 = rows[1];
    const forgedPrev = 'f'.repeat(64);
    const rehashed = computeHash({ ...row2, prevHash: forgedPrev });
    await updateActiveAuditRowBySeq(2, { prevHash: forgedPrev, hash: rehashed });

    const res = await verifyChain({});
    expect(res.ok).toBe(false);
    expect(res.firstBrokenSeq).toBe(2);
    expect(res.reason).toBe('broken-link');
  });

  test('an empty chain verifies ok', async () => {
    await AuditLog.deleteMany({});
    auditService.__resetChainCache();
    const res = await verifyChain({});
    expect(res.ok).toBe(true);
    expect(res.checked).toBe(0);
  });
});

describe('POST /api/admin/audit/verify', () => {
  test('admin gets an intact-chain verdict', async () => {
    await seedChain(2);
    const r = await request(app)
      .post('/api/admin/audit/verify')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.ok).toBe(true);
    expect(r.body.data.checked).toBe(2);
  });

  test('a non-admin role is forbidden', async () => {
    const r = await request(app)
      .post('/api/admin/audit/verify')
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf);

    expect(r.status).toBe(403);
  });
});
