/* eslint-disable no-console */
// ──────────────────────────────────────────────────────────
// Migration — Schedule {classId,startTime} unique → PARTIAL-unique
// (Wave E3 phase-04 slice A: durable cancellation)
// ──────────────────────────────────────────────────────────
// Durable cancellation keeps cancelled Schedule docs forever, so the full
// unique index on {classId,startTime} would block re-booking a freed slot.
// This script migrates an EXISTING deployment in three idempotent steps:
//   1. Backfill status:'scheduled' onto docs that predate the field.
//      (The partial filter {status:'scheduled'} only matches docs where the
//      field EQUALS the value — a missing field would silently escape the
//      double-booking guard.)
//   2. Drop the old full-unique classId_1_startTime_1 index (if present
//      without a partialFilterExpression).
//   3. Recreate it as unique + partialFilterExpression:{status:'scheduled'}.
//
// Safe to re-run: every step no-ops when already applied. Run BEFORE
// deploying the code that defines the partial index (Mongoose autoIndex
// cannot replace a same-key index with different options by itself).
//
// Usage:  node server/scripts/migrate-schedule-partial-unique-index.js
// Env:    MONGO_URI (same as the server)
// ──────────────────────────────────────────────────────────

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const INDEX_NAME = 'classId_1_startTime_1';

const run = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set — aborting.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const collection = mongoose.connection.db.collection('schedules');

  // ── 1. Backfill status on pre-migration docs ─────────────
  const backfill = await collection.updateMany(
    { status: { $exists: false } },
    { $set: { status: 'scheduled' } },
  );
  console.log(`1/3 status backfill: ${backfill.modifiedCount} doc(s) updated`);

  // ── 2+3. Swap the index when the old full-unique one is live ──
  const indexes = await collection.indexes();
  const existing = indexes.find((ix) => ix.name === INDEX_NAME);

  if (existing && !existing.partialFilterExpression) {
    await collection.dropIndex(INDEX_NAME);
    console.log(`2/3 dropped full-unique ${INDEX_NAME}`);
  } else {
    console.log(`2/3 skip drop — ${existing ? 'already partial' : 'index absent'}`);
  }

  const after = await collection.indexes();
  if (!after.find((ix) => ix.name === INDEX_NAME)) {
    await collection.createIndex(
      { classId: 1, startTime: 1 },
      { unique: true, partialFilterExpression: { status: 'scheduled' }, name: INDEX_NAME },
    );
    console.log(`3/3 created partial-unique ${INDEX_NAME}`);
  } else {
    console.log('3/3 skip create — index already present');
  }

  await mongoose.disconnect();
  console.log('Migration complete.');
};

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
