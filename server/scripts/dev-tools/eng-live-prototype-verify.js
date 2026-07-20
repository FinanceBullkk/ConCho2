/*
 * Verify the English live-convergence migrations on the disposable PostgreSQL
 * prototype. This script never selects PG_URL and every mutation probe rolls
 * back, so it cannot cut over or leave fixture data behind.
 *
 * Usage (from server/): npm run verify:english-prototype
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

const serverDir = path.resolve(__dirname, '..', '..');
const prototypeEnv = path.join(serverDir, '.env.pg-prototype');
const productionEnv = path.join(serverDir, '.env');

dotenv.config({ path: prototypeEnv, quiet: true });

const prototypeUrl = process.env.PG_PROTOTYPE_URL;
const productionUrl = fs.existsSync(productionEnv)
  ? dotenv.parse(fs.readFileSync(productionEnv)).PG_URL
  : null;

if (!prototypeUrl) throw new Error('PG_PROTOTYPE_URL is missing');
if (productionUrl && prototypeUrl === productionUrl) {
  throw new Error('Prototype URL matches production PG_URL; refusing to run');
}

const ssl = /localhost|127\.0\.0\.1/.test(prototypeUrl)
  ? false
  : { rejectUnauthorized: false };
const pool = new Pool({ connectionString: prototypeUrl, ssl, max: 2 });

const EXPECTED_MIGRATIONS = [
  '040_users_can_login.js',
  '041_english_live_learning_fields.js',
  '042_english_level_evaluations.js',
  '043_english_archive_freeze.js',
  '044_english_active_handoff_keys.js',
  '045_english_session_time_corrections.js',
  '046_english_pic_teams.js',
  '047_english_canonical_authority.js',
];

async function inspectSchema() {
  const [migrations, columns, triggers, canonicalIndexes, auditTable, state, invariants] = await Promise.all([
    pool.query(
      'SELECT name FROM knex_migrations WHERE name = ANY($1) ORDER BY name',
      [EXPECTED_MIGRATIONS],
    ),
    pool.query(`
      SELECT table_name, column_name
        FROM information_schema.columns
       WHERE (table_name = 'users' AND column_name = 'can_login')
          OR (table_name = 'learning_programs' AND column_name = 'english_policy')
          OR (table_name = 'classes' AND column_name IN (
            'english_group_code', 'english_policy_snapshot', 'english_pic_display',
            'start_date', 'end_date'
          ))
          OR (table_name = 'enrollments' AND column_name = 'start_session_number')
          OR (table_name = 'evaluations' AND column_name IN (
            'result_kind', 'level_code', 'evaluated_at', 'evaluated_by'
          ))
          OR (table_name = 'eng_courses' AND column_name = 'attendance_threshold_ratio')
          OR (table_name = 'eng_course_runs' AND column_name = 'attendance_threshold_ratio_snapshot')`),
    pool.query(`
      SELECT tgname
        FROM pg_trigger
       WHERE NOT tgisinternal
         AND (tgname LIKE 'trg_%_archive_freeze'
           OR tgname = 'trg_english_archive_control_immutable')`),
    pool.query(`SELECT indexname FROM pg_indexes WHERE indexname IN (
      'uq_eng_enrollment_one_active_employee', 'uq_eng_cohort_current_pic'
    )`),
    pool.query(`SELECT to_regclass('eng_audit_events') AS table_name`),
    pool.query('SELECT is_frozen FROM english_archive_control WHERE singleton = true'),
    pool.query(`SELECT
      (SELECT count(*)::int FROM (
        SELECT employee_id FROM eng_run_enrollments WHERE status = 'active'
        GROUP BY employee_id HAVING count(*) > 1
      ) x) AS multi_active_enrollments,
      (SELECT count(*)::int FROM (
        SELECT cohort_id FROM eng_cohort_pic WHERE end_date IS NULL
        GROUP BY cohort_id HAVING count(*) > 1
      ) x) AS multiple_current_pics`),
  ]);

  if (migrations.rowCount !== EXPECTED_MIGRATIONS.length) {
    throw new Error(`Expected ${EXPECTED_MIGRATIONS.length} English live migrations, found ${migrations.rowCount}`);
  }
  if (columns.rowCount !== 14) {
    throw new Error(`Expected 14 English live/canonical columns, found ${columns.rowCount}`);
  }
  const archiveTriggers = triggers.rows.filter((row) => row.tgname.endsWith('_archive_freeze'));
  const controlTriggers = triggers.rows.filter((row) => row.tgname === 'trg_english_archive_control_immutable');
  if (archiveTriggers.length !== 4 || controlTriggers.length !== 1) {
    throw new Error(`Expected 4 imported-evidence archive triggers + 1 control trigger, found ${archiveTriggers.length} + ${controlTriggers.length}: ${archiveTriggers.map((row) => row.tgname).join(', ')}`);
  }
  if (canonicalIndexes.rowCount !== 2) {
    throw new Error(`Expected 2 canonical English invariant indexes, found ${canonicalIndexes.rowCount}`);
  }
  if (!auditTable.rows[0]?.table_name) {
    throw new Error('Expected eng_audit_events to exist');
  }
  if (invariants.rows[0]?.multi_active_enrollments || invariants.rows[0]?.multiple_current_pics) {
    throw new Error(`Canonical English invariants failed: ${JSON.stringify(invariants.rows[0])}`);
  }
  if (state.rows[0]?.is_frozen) {
    throw new Error('Prototype Archive is already frozen; refusing mutation probes');
  }

  return {
    migrations: migrations.rowCount,
    columns: columns.rowCount,
    archiveTriggers: archiveTriggers.length,
    controlTriggers: controlTriggers.length,
    canonicalIndexes: canonicalIndexes.rowCount,
    domainAudit: auditTable.rows[0].table_name,
  };
}

async function expectSqlState55000(run) {
  try {
    await run();
  } catch (error) {
    if (error.code === '55000') return;
    throw error;
  }
  throw new Error('Expected PostgreSQL SQLSTATE 55000, but the write succeeded');
}

async function verifyCanonicalAndRawGuards(client) {
  await client.query('BEGIN');
  try {
    await client.query(`
      INSERT INTO english_archive_control(singleton, is_frozen)
      VALUES (true, false)
      ON CONFLICT (singleton) DO NOTHING`);
    await client.query(`INSERT INTO eng_courses(
      id, course_code, course_name, expected_units
    ) VALUES ($1, $2, $3, $4)`, ['codex-guard-probe', 'CODEX_GUARD_PROBE', 'Guard probe', 1]);
    await client.query(`INSERT INTO raw_eng_workbook_rows(
      id, workbook_checksum, sheet, source_row, row_hash, payload
    ) VALUES ($1,$2,$3,$4,$5,$6)`, ['codex-raw-probe', 'checksum', 'PROBE', 1, 'hash', '{}']);
    await client.query(`
      UPDATE english_archive_control
         SET is_frozen = true, cutover_at = now(), frozen_by = $1, reason = $2
       WHERE singleton = true`,
    ['codex', 'Transactional archive guard probe']);
    await client.query(
      'UPDATE eng_courses SET course_name = $1 WHERE id = $2',
      ['Canonical write remains open', 'codex-guard-probe'],
    );
    await expectSqlState55000(() => client.query(
      'UPDATE raw_eng_workbook_rows SET row_hash = $1 WHERE id = $2',
      ['must-reject', 'codex-raw-probe'],
    ));
  } finally {
    await client.query('ROLLBACK');
  }
}

async function verifyControlGuard(client) {
  await client.query('BEGIN');
  try {
    await client.query(`
      INSERT INTO english_archive_control(singleton, is_frozen)
      VALUES (true, false)
      ON CONFLICT (singleton) DO NOTHING`);
    await client.query(`
      UPDATE english_archive_control
         SET is_frozen = true, cutover_at = now(), frozen_by = $1, reason = $2
       WHERE singleton = true`,
    ['codex', 'Transactional control guard probe']);
    await expectSqlState55000(() => client.query(`
      UPDATE english_archive_control
         SET is_frozen = false, cutover_at = NULL
       WHERE singleton = true`));
  } finally {
    await client.query('ROLLBACK');
  }
}

async function main() {
  const schema = await inspectSchema();
  const client = await pool.connect();
  try {
    await verifyCanonicalAndRawGuards(client);
    await verifyControlGuard(client);
  } finally {
    client.release();
  }
  console.log('English live prototype verification passed', {
    ...schema,
    canonicalWrite: 'allowed',
    rawEvidenceWriteGuard: '55000',
    controlImmutabilityGuard: '55000',
  });
}

main()
  .catch((error) => {
    console.error(`English live prototype verification failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
