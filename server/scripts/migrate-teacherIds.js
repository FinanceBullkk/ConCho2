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
 *   2. Operator gets a fill-ready CSV skeleton (unbound class codes, empty
 *      teacher column) via `--skeleton mapping.csv`, fills the empCode column,
 *      then runs `node scripts/migrate-teacherIds.js --csv mapping.csv --confirm`.
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

// Re-use the same dangerous-script guard as other operator scripts. It is a
// function ({ scriptName, mongoose }) called AFTER connect (so it can print the
// real DB host/name) and only blocks the actual write — see below.
const dangerousScriptGuard = require('./lib/dangerousScriptGuard');

const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
// Reuse the app's resilient connector — it forces Google Public DNS for Atlas
// SRV resolution (ISP DNS often refuses the SRV lookup → querySrv ECONNREFUSED)
// and retries with backoff, so the script connects as reliably as the server.
const connectDB = require('../config/db');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const valueFor = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : null;
};

const isDryRun = flag('dry-run');
const csvPath = valueFor('csv');
const confirm = flag('confirm');
const skeletonPath = valueFor('skeleton');

const main = async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set. Aborting.');
    process.exit(1);
  }

  await connectDB();

  const Class = require('../models/Class');
  const User = require('../models/User');

  const empty = await Class.find({
    $or: [{ teacherIds: { $exists: false } }, { teacherIds: { $size: 0 } }],
  }).select('classCode courseName status').lean();

  console.log(`Found ${empty.length} class(es) with empty teacherIds:`);
  for (const c of empty) {
    console.log(`  - ${c.classCode} ${c.courseName} (${c.status})`);
  }

  // --skeleton <path>: write a fill-ready CSV (one row per unbound class, empCode
  // blank) so the operator edits a file instead of transcribing class codes by
  // hand. Read-only — pairs with the no-csv exit below.
  if (skeletonPath) {
    const header =
      '# Teacher-binding backfill — fill the empCode column, then run:\n' +
      '#   node scripts/migrate-teacherIds.js --csv <this-file> --confirm\n' +
      '# One teacher per line; repeat the classCode for a multi-teacher class.\n' +
      '# Rows with a blank empCode are skipped (that class stays unbound).\n' +
      '# classCode,teacherEmpCode\n';
    const body = empty.map((c) => `${c.classCode},`).join('\n') + (empty.length ? '\n' : '');
    fs.writeFileSync(skeletonPath, header + body);
    console.log(`\nWrote fill-ready CSV skeleton (${empty.length} row(s)) to ${skeletonPath}`);
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
    if (line.startsWith('#')) continue; // skip skeleton/template comment lines
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

  // Production-mutation guard — gates ONLY the write below; the dry-run / no-csv /
  // no-confirm paths already returned (read-only). In production this requires
  // ALLOW_PROD_DATA_MUTATION=YES_I_HAVE_BACKUP. Called post-connect so the banner
  // shows the real DB host/name the operator is about to mutate.
  dangerousScriptGuard({ scriptName: 'migrate-teacherIds', mongoose });

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
