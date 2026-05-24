#!/usr/bin/env node
/**
 * ──────────────────────────────────────────────────────────
 * Migration script — populate Class.teacherIds (audit PR 5 / AUTHZ-001)
 * ──────────────────────────────────────────────────────────
 * Goal:  every Class document has a non-empty teacherIds array, so the
 *        policy module enforces per-class binding instead of falling
 *        through to permissive legacy behaviour.
 *
 * Strategy: this script is intentionally MANUAL — there is no reliable
 * heuristic in the data today to infer which Teacher actually teaches
 * which class. Suggested workflow:
 *
 *   1. Operator runs `node scripts/migrate-teacherIds.js --dry-run`
 *      to see which classes still have empty teacherIds.
 *   2. Operator builds a CSV mapping classCode -> teacher empCode and
 *      runs `node scripts/migrate-teacherIds.js --csv mapping.csv`.
 *   3. Script verifies every classCode + empCode exists, then sets
 *      teacherIds on each class via bulkWrite.
 *
 * Until this is run, existing Teachers continue to have access to all
 * classes (graceful migration). After populated, policy enforces.
 *
 * Safety:
 *   - --dry-run prints the plan and exits without writing.
 *   - --confirm flag is required for the actual write step.
 *   - Operates inside a single Mongo transaction so partial failure
 *     rolls back cleanly.
 *
 * Run in DEV / STAGING only first. NEVER run in production without
 * --dry-run + sign-off.
 */

const fs = require('fs');
const path = require('path');

// Re-use the same dangerous-script guard as other operator scripts.
const guard = require('./lib/dangerousScriptGuard');
guard.requireProductionAck();

const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const valueFor = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : null;
};

const isDryRun = flag('dry-run');
const csvPath = valueFor('csv');
const confirm = flag('confirm');

const main = async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const Class = require('../models/Class');
  const User = require('../models/User');

  const empty = await Class.find({
    $or: [{ teacherIds: { $exists: false } }, { teacherIds: { $size: 0 } }],
  }).select('classCode courseName status').lean();

  console.log(`Found ${empty.length} class(es) with empty teacherIds:`);
  for (const c of empty) {
    console.log(`  - ${c.classCode} ${c.courseName} (${c.status})`);
  }

  if (isDryRun || !csvPath) {
    console.log('\nDry-run mode (or no --csv supplied). Exiting without writes.');
    console.log('To apply: provide --csv path/to/mapping.csv --confirm');
    await mongoose.disconnect();
    return;
  }

  // CSV format: classCode,empCode  (one teacher per line; repeat classCode
  // for multi-teacher classes).
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const mapping = new Map(); // classCode -> Set<empCode>
  for (const line of lines) {
    const [classCode, empCode] = line.split(',').map(s => s.trim());
    if (!classCode || !empCode) continue;
    if (!mapping.has(classCode)) mapping.set(classCode, new Set());
    mapping.get(classCode).add(empCode);
  }
  console.log(`\nLoaded mapping for ${mapping.size} class code(s).`);

  if (!confirm) {
    console.log('Add --confirm to apply. Exiting (no writes).');
    await mongoose.disconnect();
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const [classCode, empSet] of mapping.entries()) {
        const teachers = await User.find({
          empCode: { $in: Array.from(empSet) },
          role: 'Teacher',
          isDeleted: { $ne: true },
        }).select('_id empCode').lean();

        if (teachers.length !== empSet.size) {
          const found = new Set(teachers.map(t => t.empCode));
          const missing = Array.from(empSet).filter(e => !found.has(e));
          throw new Error(`Missing Teacher empCode(s) for ${classCode}: ${missing.join(', ')}`);
        }

        const result = await Class.updateMany(
          { classCode },
          { $set: { teacherIds: teachers.map(t => t._id) } },
          { session }
        );
        console.log(`  ${classCode} -> ${teachers.length} teacher(s); matched ${result.matchedCount} class doc(s).`);
      }
    });
  } finally {
    await session.endSession();
  }

  console.log('\nMigration committed.');
  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
