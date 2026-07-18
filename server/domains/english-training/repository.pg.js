// English-training domain — PostgreSQL repository (Phase 1).
// All SQL for the eng_* canonical tables + lossless import staging lives here.
// Consumed by the import pipeline (import/*) and the HTTP command/read layer.
// Generic parameterized insert keeps this DRY; a withTransaction helper gives the
// import an all-or-nothing load. No business rules here — those live in use-cases.

const crypto = require('crypto');
const { getPool, query } = require('../../config/pg');

const newId = () => crypto.randomBytes(12).toString('hex');

// Bind either a pooled query or an in-transaction client's query.
const runner = (client) => (client ? client.query.bind(client) : query);

// Generic INSERT … RETURNING * for a plain column→value object.
async function insert(table, obj, client) {
  const keys = Object.keys(obj);
  const cols = keys.map((k) => `"${k}"`).join(', ');
  const ph = keys.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await runner(client)(
    `INSERT INTO ${table} (${cols}) VALUES (${ph}) RETURNING *`,
    keys.map((k) => obj[k]),
  );
  return rows[0];
}

// Append-only raw staging; idempotent per (checksum, sheet, source_row).
async function stageRaw(row, client) {
  await runner(client)(
    `INSERT INTO raw_eng_workbook_rows (id, workbook_checksum, sheet, source_row, row_hash, payload)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (workbook_checksum, sheet, source_row) DO NOTHING`,
    [newId(), row.checksum, row.sheet, row.sourceRow, row.rowHash, JSON.stringify(row.payload)],
  );
}

// Record a durable data-quality issue (never drop a source row silently).
async function recordIssue(issue, client) {
  return insert('eng_data_quality_issues', {
    id: newId(),
    issue_code: issue.code,
    entity_type: issue.entityType || null,
    entity_key: issue.entityKey || null,
    source_sheet: issue.sheet || null,
    source_row: issue.sourceRow || null,
    detail: issue.detail ? JSON.stringify(issue.detail) : null,
  }, client);
}

async function count(table, client) {
  const { rows } = await runner(client)(`SELECT count(*)::int AS n FROM ${table}`);
  return rows[0].n;
}

// All-or-nothing unit of work for the import load.
async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const res = await fn(client);
    await client.query('COMMIT');
    return res;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Dev-only: wipe canonical + issues (NOT raw staging) so the import is re-runnable
// against the prototype DB. Dependency order matters (FKs).
async function resetCanonical(client) {
  const order = [
    'eng_data_quality_issues', 'eng_cohort_pic', 'eng_run_enrollments',
    'eng_course_runs', 'eng_cohort_memberships', 'eng_employees',
    'eng_cohorts', 'eng_courses',
  ];
  for (const t of order) {
    // eslint-disable-next-line no-await-in-loop
    await runner(client)(`DELETE FROM ${t}`);
  }
}

module.exports = {
  newId, insert, stageRaw, recordIssue, count, withTransaction, resetCanonical, query,
};
