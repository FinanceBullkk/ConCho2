/**
 * Backfill the tamper-evident hash chain (seq + prevHash + hash) over existing
 * AuditLog rows (Investment Build Plan #3a).
 *
 * Rows written before the chain shipped have no seq/prevHash/hash. This script
 * rebuilds the WHOLE chain deterministically in (createdAt asc, _id asc) order:
 * seq 1..N from the genesis seed, each row's hash linking to the previous.
 *
 * Idempotent: re-running produces the same chain for the same rows. It first
 * CLEARS the chain fields so the partial-unique seq index can't collide while
 * seq values are being reassigned, then rebuilds.
 *
 * RUN AT DEPLOY, before the new audit-write code serves traffic, so live writes
 * continue from the rebuilt head (auditService loads the head from the DB).
 *
 * Usage:
 *   cd server && node scripts/backfill-audit-hash-chain.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const AuditLog = require('../models/AuditLog');
const { GENESIS_PREV_HASH, computeHash } = require('../services/audit-chain');

async function run() {
  await connectDB();

  // Clear any existing chain fields first — with no seq present, the
  // partial-unique index is empty and reassigning seq 1..N can't conflict.
  await AuditLog.updateMany({}, { $unset: { seq: '', prevHash: '', hash: '' } });

  const cursor = AuditLog.find({})
    .sort({ createdAt: 1, _id: 1 })
    .select('actorId actorRole actorEmpCode action entity entityId diff note')
    .cursor();

  let seq = 0;
  let prevHash = GENESIS_PREV_HASH;
  let n = 0;

  for (let row = await cursor.next(); row; row = await cursor.next()) {
    seq += 1;
    const entry = {
      seq,
      actorId: row.actorId,
      actorRole: row.actorRole,
      actorEmpCode: row.actorEmpCode,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      diff: row.diff,
      note: row.note,
      prevHash,
    };
    const hash = computeHash(entry);
    await AuditLog.updateOne({ _id: row._id }, { $set: { seq, prevHash, hash } });
    prevHash = hash;
    n += 1;
  }

  console.log(JSON.stringify({ success: true, rows: n, headSeq: seq }, null, 2));
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
