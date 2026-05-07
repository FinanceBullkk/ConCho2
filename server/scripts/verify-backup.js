/**
 * verify-backup.js
 *
 * Backup Verification Tool — TMS (Training Management System)
 *
 * Connects to MongoDB via MONGODB_URI, checks connectivity, reports database
 * stats and document counts for key collections, and confirms recent data
 * exists. Designed to be run as part of the monthly backup verification drill.
 *
 * Usage:
 *   node server/scripts/verify-backup.js
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed (connection error, empty critical collection, etc.)
 *
 * Requires:
 *   MONGODB_URI in environment (or .env file at project root)
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');

// ─── Configuration ────────────────────────────────────────────────────────────

const MONGODB_URI = process.env.MONGODB_URI;

// Collections to check document counts for
const COLLECTIONS = [
  'users',
  'classes',
  'schedules',
  'attendances',
  'evaluations',
  'enrollments',
];

// A collection with a createdAt field to use for "recent data" check
const RECENCY_COLLECTION = 'users';
const RECENCY_FIELD = 'createdAt';

// Warn if the most recent document in RECENCY_COLLECTION is older than this
const RECENCY_WARN_DAYS = 90;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pass(msg) {
  console.log(`  ✓  ${msg}`);
}

function fail(msg) {
  console.log(`  ✗  ${msg}`);
}

function info(msg) {
  console.log(`     ${msg}`);
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 52 - title.length))}`);
}

function formatDate(date) {
  if (!date) return 'unknown';
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function daysSince(date) {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const results = { passed: 0, failed: 0 };

  console.log('═'.repeat(56));
  console.log('  TMS Backup Verification Report');
  console.log(`  ${formatDate(new Date())}`);
  console.log('═'.repeat(56));

  // ── 1. Environment check ────────────────────────────────────────────────────
  section('Environment');

  if (!MONGODB_URI) {
    fail('MONGODB_URI is not set');
    console.log('\n  Cannot continue without a connection string.\n');
    process.exit(1);
  }

  // Mask credentials in the URI for display
  const maskedUri = MONGODB_URI.replace(/:\/\/([^:]+):([^@]+)@/, '://<user>:<pass>@');
  pass(`MONGODB_URI is set  →  ${maskedUri}`);
  results.passed++;

  // ── 2. Connectivity check ───────────────────────────────────────────────────
  section('Connectivity');

  let db;
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });

    // Ping the admin database to confirm the connection is live
    const adminDb = mongoose.connection.db.admin();
    const pingResult = await adminDb.ping();

    if (pingResult && pingResult.ok === 1) {
      pass('MongoDB ping succeeded');
      results.passed++;
    } else {
      fail('MongoDB ping returned unexpected result');
      results.failed++;
    }

    db = mongoose.connection.db;
  } catch (err) {
    fail(`MongoDB connection failed: ${err.message}`);
    results.failed++;
    console.log('\n  Cannot continue without a database connection.\n');
    process.exit(1);
  }

  // ── 3. Database stats ───────────────────────────────────────────────────────
  section('Database Stats');

  try {
    const stats = await db.command({ dbStats: 1 });
    const dbName = stats.db || mongoose.connection.name;
    const collCount = stats.collections || 0;
    const dataSize = stats.dataSize || 0;
    const storageMB = (dataSize / (1024 * 1024)).toFixed(2);

    pass(`Database name       : ${dbName}`);
    pass(`Collections         : ${collCount}`);
    info(`Data size           : ${storageMB} MB`);
    results.passed++;
  } catch (err) {
    fail(`Could not retrieve dbStats: ${err.message}`);
    results.failed++;
  }

  // ── 4. Collection document counts ──────────────────────────────────────────
  section('Collection Document Counts');

  let usersCount = 0;
  for (const collName of COLLECTIONS) {
    try {
      const collection = db.collection(collName);
      const count = await collection.countDocuments();
      const label = collName.padEnd(15);

      if (count === 0) {
        fail(`${label}: 0 documents  (collection is empty)`);
        results.failed++;
      } else {
        pass(`${label}: ${count.toLocaleString()} documents`);
        results.passed++;
      }

      if (collName === 'users') {
        usersCount = count;
      }
    } catch (err) {
      fail(`${collName.padEnd(15)}: error — ${err.message}`);
      results.failed++;
    }
  }

  // ── 5. Recent data check ────────────────────────────────────────────────────
  section(`Recent Data (${RECENCY_COLLECTION}.${RECENCY_FIELD})`);

  if (usersCount === 0) {
    fail(`Skipped — ${RECENCY_COLLECTION} collection is empty`);
    results.failed++;
  } else {
    try {
      const collection = db.collection(RECENCY_COLLECTION);
      const latestDoc = await collection
        .find({ [RECENCY_FIELD]: { $exists: true } })
        .sort({ [RECENCY_FIELD]: -1 })
        .limit(1)
        .toArray();

      if (!latestDoc || latestDoc.length === 0) {
        fail(`No documents with field '${RECENCY_FIELD}' found in ${RECENCY_COLLECTION}`);
        results.failed++;
      } else {
        const latestDate = latestDoc[0][RECENCY_FIELD];
        const age = daysSince(new Date(latestDate));

        if (age > RECENCY_WARN_DAYS) {
          fail(
            `Most recent ${RECENCY_COLLECTION} document: ${formatDate(new Date(latestDate))}  (${age} days ago — older than ${RECENCY_WARN_DAYS}-day threshold)`
          );
          results.failed++;
        } else {
          pass(
            `Most recent ${RECENCY_COLLECTION} document: ${formatDate(new Date(latestDate))}  (${age} day${age === 1 ? '' : 's'} ago)`
          );
          results.passed++;
        }
      }
    } catch (err) {
      fail(`Recent data check failed: ${err.message}`);
      results.failed++;
    }
  }

  // ── 6. Summary ──────────────────────────────────────────────────────────────
  const total = results.passed + results.failed;
  const allPassed = results.failed === 0;

  console.log('\n' + '═'.repeat(56));
  console.log(`  Result : ${allPassed ? 'PASS' : 'FAIL'}`);
  console.log(`  Checks : ${results.passed}/${total} passed`);
  if (!allPassed) {
    console.log(`  Issues : ${results.failed} check${results.failed === 1 ? '' : 's'} failed — review output above`);
  }
  console.log('═'.repeat(56) + '\n');

  await mongoose.disconnect();
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('\nUnhandled error:', err.message);
  process.exit(1);
});
