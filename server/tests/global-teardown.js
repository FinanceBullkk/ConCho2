// ──────────────────────────────────────────────────────────
// Jest globalTeardown — stop the shared replica set + F3 write-gate verdict
// ──────────────────────────────────────────────────────────
// Runs ONCE after the whole test run. Stops the single MongoMemoryReplSet that
// global-setup.js started, so no mongod is left orphaned.
//
// F3 (Phase 5 slice 5): then reads the write-gate JSONL that tests/
// pg-write-gate.js appended during the run. Any surviving violation = a
// production code path still writing raw Mongoose on the pg lane = a cutover
// blocker → THROW. A globalTeardown exception fails the whole jest run
// (--forceExit does NOT skip globalTeardown, and it would clobber
// process.exitCode — throwing is the only reliable red).
// ──────────────────────────────────────────────────────────
module.exports = async () => {
  const replSet = global.__MONGO_REPLSET__;
  if (replSet) await replSet.stop();

  const file = process.env.PG_WRITE_GATE_FILE;
  if (!file) return; // mongo lane
  const fs = require('fs');
  let lines = [];
  try {
    lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    fs.unlinkSync(file);
  } catch { /* no sink → nothing recorded */ }
  if (!lines.length) return;

  const entries = lines
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);

  // Gate on MAPPED models only (phase-05 F3 definition): a model with no PG
  // table is tracked by the phase doc, not here.
  // tableFor() reuses the auto-mirror's explicit-mapper + reflective resolver.
  const { tableFor } = require('./pg-auto-mirror');
  const { closePool } = require('../config/pg');
  const grouped = new Map(); // "model ← frame" → Set<op>
  try {
    for (const e of entries) {
      if (!(await tableFor(e.model))) continue; // eslint-disable-line no-await-in-loop
      const key = `${e.model} ← ${e.frame}`;
      if (!grouped.has(key)) grouped.set(key, new Set());
      grouped.get(key).add(e.op);
    }
  } finally {
    await closePool(); // parent-process pool opened by tableFor's reflection
  }
  if (!grouped.size) return;

  const report = [...grouped.entries()]
    .map(([key, ops]) => `  ${key}  [${[...ops].join(', ')}]`)
    .join('\n');
  throw new Error(
    `[pg-write-gate] ${grouped.size} raw-Mongoose PRODUCTION write site(s) fired on the PG lane.\n` +
    `Each would write into a dead Mongo after cutover — port to a dual-backend repository seam\n` +
    `(see plans/260612-2042-postgresql-migration/phase-05-cutover-decommission.md):\n${report}`,
  );
};
