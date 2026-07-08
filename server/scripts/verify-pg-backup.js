/**
 * verify-pg-backup.js
 *
 * Backup Verification Tool — TMS on PostgreSQL (Neon) — Wave H/J.
 *
 * PG twin of verify-backup.js (which stays for Mongo until Wave K retires
 * Atlas). Connects to Postgres, checks connectivity, reports database size and
 * row counts for key tables, and confirms recent data exists. Run against:
 *   • a restored dump (CI verify job / quarterly drill / throwaway docker), or
 *   • the live Neon database (monthly drill).
 *
 * Usage:
 *   PG_URL='postgresql://…' node server/scripts/verify-pg-backup.js
 *     [--counts=/path/counts.json]   exact-match mode: compare row counts to a
 *                                    dump-time manifest (CI verify job) —
 *                                    mismatch = FAIL
 *
 * Exit codes: 0 all checks passed · 1 one or more failed.
 *
 * Env: PG_URL in environment, in server/.env, or in a file pointed at by
 * VERIFY_BACKUP_ENV_PATH (staging drills — same override contract as the
 * Mongo script / OPS-009).
 */

'use strict';

const fs = require('fs');
const path = require('path');

if (process.env.VERIFY_BACKUP_ENV_PATH) {
  require('dotenv').config({ path: process.env.VERIFY_BACKUP_ENV_PATH, quiet: true });
}
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
require('dotenv').config({ quiet: true });

const { Pool } = require('pg');

// ─── Configuration ────────────────────────────────────────────────────────────

const PG_URL = process.env.PG_URL;

// Tables to check row counts for (⇔ the Mongo script's key collections).
const TABLES = ['users', 'classes', 'schedules', 'attendances', 'evaluations', 'enrollments'];

const RECENCY_TABLE = 'users';
const RECENCY_COLUMN = 'created_at';
const RECENCY_WARN_DAYS = 90;

const countsArg = (process.argv.find((a) => a.startsWith('--counts=')) || '').split('=')[1];

// ─── Helpers (⇔ verify-backup.js report skeleton) ─────────────────────────────

function pass(msg) { console.log(`  ✓  ${msg}`); }
function fail(msg) { console.log(`  ✗  ${msg}`); }
function info(msg) { console.log(`     ${msg}`); }
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
  console.log('  TMS PG Backup Verification Report');
  console.log(`  ${formatDate(new Date())}`);
  console.log('═'.repeat(56));

  section('Environment');
  if (!PG_URL) {
    fail('PG_URL is not set');
    console.log('\n  Cannot continue without a connection string.\n');
    process.exit(1);
  }
  const maskedUrl = PG_URL.replace(/:\/\/([^:]+):([^@]+)@/, '://<user>:<pass>@');
  pass(`PG_URL is set  →  ${maskedUrl}`);
  results.passed++;

  section('Connectivity');
  const pool = new Pool({
    connectionString: PG_URL,
    ssl: /localhost|127\.0\.0\.1/.test(PG_URL) ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
  try {
    await pool.query('SELECT 1');
    pass('PostgreSQL SELECT 1 succeeded');
    results.passed++;
  } catch (err) {
    fail(`PostgreSQL connection failed: ${err.message}`);
    console.log('\n  Cannot continue without a database connection.\n');
    process.exit(1);
  }

  section('Database Stats');
  try {
    const { rows: [s] } = await pool.query(
      `SELECT current_database() AS db,
              pg_size_pretty(pg_database_size(current_database())) AS size,
              (SELECT count(*)::int FROM information_schema.tables
                WHERE table_schema = 'public') AS tables,
              (SELECT count(*)::int FROM knex_migrations) AS migrations`);
    pass(`Database name       : ${s.db}`);
    pass(`Tables              : ${s.tables}`);
    pass(`Applied migrations  : ${s.migrations}`);
    info(`Data size           : ${s.size}`);
    results.passed++;
  } catch (err) {
    fail(`Could not retrieve database stats: ${err.message}`);
    results.failed++;
  }

  section('Table Row Counts');
  const counted = {};
  for (const table of TABLES) {
    try {
      const { rows: [{ n }] } = await pool.query(`SELECT count(*)::int AS n FROM "${table}"`);
      counted[table] = n;
      const label = table.padEnd(15);
      if (n === 0) {
        fail(`${label}: 0 rows  (table is empty)`);
        results.failed++;
      } else {
        pass(`${label}: ${n.toLocaleString()} rows`);
        results.passed++;
      }
    } catch (err) {
      fail(`${table.padEnd(15)}: error — ${err.message}`);
      results.failed++;
    }
  }

  // Exact-match mode: the pg-backup workflow writes counts.json at dump time;
  // after pg_restore the same tables must count identical.
  if (countsArg) {
    section('Dump Manifest Exact Match (--counts)');
    try {
      const manifest = JSON.parse(fs.readFileSync(countsArg, 'utf8'));
      for (const [table, expected] of Object.entries(manifest.tables || manifest)) {
        if (typeof expected !== 'number') continue;
        const { rows: [{ n }] } = await pool.query(`SELECT count(*)::int AS n FROM "${table}"`); // eslint-disable-line no-await-in-loop
        if (n === expected) {
          pass(`${table.padEnd(15)}: ${n} = manifest`);
          results.passed++;
        } else {
          fail(`${table.padEnd(15)}: ${n} ≠ manifest ${expected}`);
          results.failed++;
        }
      }
    } catch (err) {
      fail(`Manifest check failed: ${err.message}`);
      results.failed++;
    }
  }

  section(`Recent Data (${RECENCY_TABLE}.${RECENCY_COLUMN})`);
  if (!counted[RECENCY_TABLE]) {
    fail(`Skipped — ${RECENCY_TABLE} table is empty`);
    results.failed++;
  } else {
    try {
      const { rows: [{ latest }] } = await pool.query(
        `SELECT max("${RECENCY_COLUMN}") AS latest FROM "${RECENCY_TABLE}"`);
      if (!latest) {
        fail(`No ${RECENCY_COLUMN} values found in ${RECENCY_TABLE}`);
        results.failed++;
      } else {
        const age = daysSince(new Date(latest));
        if (age > RECENCY_WARN_DAYS) {
          fail(`Most recent ${RECENCY_TABLE} row: ${formatDate(new Date(latest))}  (${age} days ago — older than ${RECENCY_WARN_DAYS}-day threshold)`);
          results.failed++;
        } else {
          pass(`Most recent ${RECENCY_TABLE} row: ${formatDate(new Date(latest))}  (${age} day${age === 1 ? '' : 's'} ago)`);
          results.passed++;
        }
      }
    } catch (err) {
      fail(`Recent data check failed: ${err.message}`);
      results.failed++;
    }
  }

  const total = results.passed + results.failed;
  const allPassed = results.failed === 0;
  console.log('\n' + '═'.repeat(56));
  console.log(`  Result : ${allPassed ? 'PASS' : 'FAIL'}`);
  console.log(`  Checks : ${results.passed}/${total} passed`);
  if (!allPassed) {
    console.log(`  Issues : ${results.failed} check${results.failed === 1 ? '' : 's'} failed — review output above`);
  }
  console.log('═'.repeat(56) + '\n');

  await pool.end();
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('\nUnhandled error:', err.message);
  process.exit(1);
});
