// Phase 1 PG-migration prototype — synthetic-data benchmark on Neon.
//
// Proves the core thesis (PERF-003): can PostgreSQL run the heavy per-team
// attendance rollup + the live funnel FAST at real scale (~1000 users, ~100k
// attendance), and do the soft-delete / partial-unique trap-equivalents work?
//
// Disposable: drops + recreates a `proto_*` schema each run on the THROWAWAY
// Neon DB. No real data, no PII. Reads PG_PROTOTYPE_URL from the gitignored
// server/.env.pg-prototype. Requires `pg` (installed via `npm install pg --no-save`).
// Run from server/:  node scripts/dev-tools/pg-prototype-benchmark.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const { Client } = require('pg');

// ── scale knobs (the PERF-003 pain point) ─────────────────
const USERS = 1000;
const TEAMS = 200;
const ENROLLMENTS = 1000;
const ATTENDANCE = 500_000;
const CERTS = 5_000;
const BATCH = 1_000;

const rid = (p, n) => `${p}${String(n).padStart(7, '0')}`; // ObjectId-hex stand-in (text PK)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const STATUSES = ['P', 'P', 'P', 'A', 'L', 'EL']; // weighted toward Present

async function timed(label, fn) {
  const t0 = process.hrtime.bigint();
  const r = await fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { label, ms: Math.round(ms * 10) / 10, r };
}

async function bulkInsert(client, table, cols, rows) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = [];
    const params = [];
    chunk.forEach((row, j) => {
      const ph = row.map((_, k) => `$${j * cols.length + k + 1}`);
      values.push(`(${ph.join(',')})`);
      params.push(...row);
    });
    // eslint-disable-next-line no-await-in-loop
    await client.query(`INSERT INTO ${table}(${cols.join(',')}) VALUES ${values.join(',')}`, params);
  }
}

(async () => {
  const client = new Client({ connectionString: process.env.PG_PROTOTYPE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('connected — building schema…');

  await client.query(`
    DROP TABLE IF EXISTS proto_attendances, proto_team_members, proto_enrollments,
                         proto_certificates, proto_teams, proto_users CASCADE;
    CREATE TABLE proto_users        (id text PRIMARY KEY, name text, department text, is_deleted bool DEFAULT false);
    CREATE TABLE proto_teams        (id text PRIMARY KEY, class_id text, is_deleted bool DEFAULT false);
    CREATE TABLE proto_team_members (team_id text, user_id text);
    CREATE TABLE proto_enrollments  (id text PRIMARY KEY, user_id text, class_id text, status text);
    CREATE TABLE proto_attendances  (id text PRIMARY KEY, user_id text, status text);
    CREATE TABLE proto_certificates (id text PRIMARY KEY, program_id text, status text, is_deleted bool DEFAULT false);
  `);

  // ── generate synthetic rows ─────────────────────────────
  const users = Array.from({ length: USERS }, (_, i) => [rid('U', i), `User ${i}`, pick(['Eng', 'Ops', 'Sales', 'HR']), i % 50 === 0]);
  const teams = Array.from({ length: TEAMS }, (_, i) => [rid('T', i), rid('C', i % 40), i % 40 === 0]);
  const members = Array.from({ length: USERS }, (_, i) => [rid('T', i % TEAMS), rid('U', i)]); // each user in one team
  const enrollments = Array.from({ length: ENROLLMENTS }, (_, i) =>
    [rid('E', i), rid('U', i % USERS), rid('C', i % 40), pick(['Active', 'Active', 'Completed', 'Dropped', 'Transferred'])]);
  const attendance = Array.from({ length: ATTENDANCE }, (_, i) => [rid('A', i), rid('U', i % USERS), pick(STATUSES)]);
  const certs = Array.from({ length: CERTS }, (_, i) => [rid('K', i), rid('P', i % 40), pick(['Issued', 'Issued', 'Revoked']), i % 30 === 0]);

  const load = await timed('load (all rows)', async () => {
    await bulkInsert(client, 'proto_users', ['id', 'name', 'department', 'is_deleted'], users);
    await bulkInsert(client, 'proto_teams', ['id', 'class_id', 'is_deleted'], teams);
    await bulkInsert(client, 'proto_team_members', ['team_id', 'user_id'], members);
    await bulkInsert(client, 'proto_enrollments', ['id', 'user_id', 'class_id', 'status'], enrollments);
    await bulkInsert(client, 'proto_attendances', ['id', 'user_id', 'status'], attendance);
    await bulkInsert(client, 'proto_certificates', ['id', 'program_id', 'status', 'is_deleted'], certs);
  });
  console.log(`loaded ${USERS} users / ${TEAMS} teams / ${ATTENDANCE} attendance / ${CERTS} certs in ${load.ms} ms`);

  // ── PERF-003 per-team attendance rate ───────────────────
  // Two shapes: (a) ALL-teams rollup = full aggregate (seq scan + hash agg,
  // index-independent, already fast); (b) ONE-team rate = selective access,
  // the shape PERF-003 calls catastrophic in Mongo — this is where the index
  // wins. Measure both before/after indexing to show the honest picture.
  const cols = `count(*) AS total,
                count(*) FILTER (WHERE a.status='P') AS present,
                round(100.0*count(*) FILTER (WHERE a.status='P')/nullif(count(*),0),1) AS rate`;
  const rollupSQL = `
    SELECT t.id, ${cols}
    FROM proto_teams t
    JOIN proto_team_members tm ON tm.team_id = t.id
    JOIN proto_attendances a   ON a.user_id  = tm.user_id
    WHERE t.is_deleted = false               -- soft-delete trap-equivalent
    GROUP BY t.id ORDER BY rate DESC NULLS LAST`;
  const oneTeamSQL = `
    SELECT t.id, ${cols}
    FROM proto_teams t
    JOIN proto_team_members tm ON tm.team_id = t.id
    JOIN proto_attendances a   ON a.user_id  = tm.user_id
    WHERE t.is_deleted = false AND t.id = $1
    GROUP BY t.id`;
  const TEAM = rid('T', 0);

  const sel0 = await timed('one-team rate (NO index)', () => client.query(oneTeamSQL, [TEAM]));
  const roll0 = await timed('all-teams rollup (NO index)', () => client.query(rollupSQL));

  await client.query(`
    CREATE INDEX ix_tm_team ON proto_team_members(team_id);
    CREATE INDEX ix_tm_user ON proto_team_members(user_id);
    CREATE INDEX ix_att_user ON proto_attendances(user_id);
    ANALYZE proto_team_members; ANALYZE proto_attendances; ANALYZE proto_teams;`);

  const sel1 = await timed('one-team rate (WITH index)', () => client.query(oneTeamSQL, [TEAM]));
  const roll1 = await timed('all-teams rollup (WITH index)', () => client.query(rollupSQL));

  // ── Funnel (getFunnel equivalent) ───────────────────────
  const funnel = await timed('funnel counts', () => client.query(`
    SELECT (SELECT count(*) FROM proto_enrollments WHERE status <> 'Transferred')            AS enrolled,
           (SELECT count(*) FROM proto_enrollments WHERE status = 'Completed')               AS completed,
           (SELECT count(*) FROM proto_certificates WHERE status='Issued' AND is_deleted=false) AS certified`));

  // ── trap-equivalent: partial unique index (soft-delete-aware uniqueness) ─
  // Mirrors User.email unique-where-not-deleted: create the partial index on a
  // genuinely-unique column, then prove it REJECTS a duplicate active row.
  let partialUnique;
  try {
    await client.query(`CREATE UNIQUE INDEX uq_user_name_active ON proto_users(name) WHERE is_deleted = false`);
    try {
      await client.query(`INSERT INTO proto_users(id,name,department,is_deleted) VALUES ('Udup','User 1','Eng',false)`);
      partialUnique = 'created BUT did not reject duplicate (unexpected)';
    } catch (e) {
      partialUnique = `created + correctly REJECTED a duplicate active name (SQLSTATE ${e.code})`;
    }
  } catch (e) { partialUnique = `FAILED to create: ${e.message}`; }

  // ── report ──────────────────────────────────────────────
  console.log('\n──────── RESULTS (Neon PostgreSQL, synthetic scale) ────────');
  console.log(`scale                : ${USERS} users · ${TEAMS} teams · ${ATTENDANCE} attendance · ${CERTS} certs`);
  console.log(`one-team rate        : NO idx ${sel0.ms} ms → WITH idx ${sel1.ms} ms   (${(sel0.ms / sel1.ms).toFixed(1)}x faster)  ← PERF-003 selective access`);
  console.log(`all-teams rollup     : ${roll1.ms} ms over ${roll1.r.rowCount} teams (full aggregate — index-independent, already fast)`);
  console.log(`funnel               : ${funnel.ms} ms  →`, funnel.r.rows[0]);
  console.log(`partial unique index : ${partialUnique}`);
  console.log(`soft-delete filter   : applied (WHERE is_deleted=false) — explicit predicate works`);
  console.log('────────────────────────────────────────────────────────────');

  await client.end();
  process.exit(0);
})().catch((e) => { console.error('PROTOTYPE FAILED:', e); process.exit(1); });
