#!/usr/bin/env node

// Read-only verification for English-training canonical/import counts.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { query, closePool } = require('../config/pg');

const TABLES = [
  'eng_employees', 'eng_course_runs', 'eng_run_enrollments',
  'eng_session_units', 'eng_attendance_records',
  'eng_data_quality_issues', 'raw_eng_workbook_rows',
];

(async () => {
  const result = {};
  for (const table of TABLES) {
    // Table names are a closed constant above, never user input.
    // eslint-disable-next-line no-await-in-loop
    result[table] = (await query(`SELECT count(1)::int AS n FROM ${table}`)).rows[0].n;
  }
  result.openIssues = (await query(`
    SELECT issue_code, count(1)::int AS count
    FROM eng_data_quality_issues WHERE status = 'open'
    GROUP BY issue_code ORDER BY count DESC, issue_code
  `)).rows;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  await closePool();
})().catch(async (error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  try { await closePool(); } catch { /* ignore */ }
  process.exitCode = 1;
});

