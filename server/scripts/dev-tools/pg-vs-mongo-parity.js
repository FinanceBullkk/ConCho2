// Phase 2 opener — Postgres (Neon) vs Mongo (in-memory) head-to-head.
//
// Closes the gate check deferred from Phase 1: load ONE identical synthetic
// dataset into BOTH stores, run the equivalent heavy reads, and assert the
// NUMBERS match (correctness parity) + report latency on each. No PII.
//
// Latency caveat: Mongo runs in-memory LOCALLY (no network); Neon is REMOTE
// (network round-trips). So local Mongo has an unfair latency edge — parity of
// RESULTS is the definitive gate signal; latency is directional only.
//
// Requires: pg (npm i pg --no-save) + mongodb-memory-server (dev dep).
// Run from server/:  node scripts/dev-tools/pg-vs-mongo-parity.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const { Client } = require('pg');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const USERS = 1000, TEAMS = 200, ENROLLMENTS = 1000, ATTENDANCE = 100_000, CERTS = 5_000, BATCH = 5_000;
const rid = (p, n) => `${p}${String(n).padStart(7, '0')}`;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ST = ['P', 'P', 'P', 'A', 'L', 'EL'];

async function timed(fn) { const t = process.hrtime.bigint(); const r = await fn(); return { ms: Math.round(Number(process.hrtime.bigint() - t) / 1e5) / 10, r }; }

// ── one shared dataset (identical rows feed both stores) ──
const users = Array.from({ length: USERS }, (_, i) => ({ id: rid('U', i), name: `User ${i}`, department: pick(['Eng', 'Ops', 'Sales', 'HR']), is_deleted: i % 50 === 0 }));
const teams = Array.from({ length: TEAMS }, (_, i) => ({ id: rid('T', i), class_id: rid('C', i % 40), is_deleted: i % 40 === 0 }));
const members = Array.from({ length: USERS }, (_, i) => ({ team_id: rid('T', i % TEAMS), user_id: rid('U', i) }));
const enrollments = Array.from({ length: ENROLLMENTS }, (_, i) => ({ id: rid('E', i), user_id: rid('U', i % USERS), class_id: rid('C', i % 40), status: pick(['Active', 'Active', 'Completed', 'Dropped', 'Transferred']) }));
const attendance = Array.from({ length: ATTENDANCE }, (_, i) => ({ id: rid('A', i), user_id: rid('U', i % USERS), status: pick(ST) }));
const certs = Array.from({ length: CERTS }, (_, i) => ({ id: rid('K', i), program_id: rid('P', i % 40), status: pick(['Issued', 'Issued', 'Revoked']), is_deleted: i % 30 === 0 }));

const sortRows = (rows) => rows.map((r) => ({ id: String(r.id ?? r._id), total: Number(r.total), present: Number(r.present) })).sort((a, b) => a.id.localeCompare(b.id));
const eqRollup = (a, b) => a.length === b.length && a.every((x, i) => x.id === b[i].id && x.total === b[i].total && x.present === b[i].present);

async function runPg() {
  const c = new Client({ connectionString: process.env.PG_PROTOTYPE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query(`DROP TABLE IF EXISTS p_att,p_tm,p_enr,p_cert,p_teams,p_users CASCADE;
    CREATE TABLE p_users(id text primary key,name text,department text,is_deleted bool);
    CREATE TABLE p_teams(id text primary key,class_id text,is_deleted bool);
    CREATE TABLE p_tm(team_id text,user_id text);
    CREATE TABLE p_enr(id text primary key,user_id text,class_id text,status text);
    CREATE TABLE p_att(id text primary key,user_id text,status text);
    CREATE TABLE p_cert(id text primary key,program_id text,status text,is_deleted bool);`);
  const ins = async (t, cols, rows) => {
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH), vals = [], params = [];
      chunk.forEach((r, j) => { vals.push(`(${cols.map((_, k) => `$${j * cols.length + k + 1}`).join(',')})`); params.push(...cols.map((col) => r[col])); });
      await c.query(`INSERT INTO ${t}(${cols.join(',')}) VALUES ${vals.join(',')}`, params);
    }
  };
  await ins('p_users', ['id', 'name', 'department', 'is_deleted'], users);
  await ins('p_teams', ['id', 'class_id', 'is_deleted'], teams);
  await ins('p_tm', ['team_id', 'user_id'], members);
  await ins('p_enr', ['id', 'user_id', 'class_id', 'status'], enrollments);
  await ins('p_att', ['id', 'user_id', 'status'], attendance);
  await ins('p_cert', ['id', 'program_id', 'status', 'is_deleted'], certs);
  await c.query(`CREATE INDEX ON p_tm(team_id); CREATE INDEX ON p_tm(user_id); CREATE INDEX ON p_att(user_id); ANALYZE;`);
  const rollup = await timed(() => c.query(`
    SELECT t.id, count(*) total, count(*) FILTER (WHERE a.status='P') present
    FROM p_teams t JOIN p_tm tm ON tm.team_id=t.id JOIN p_att a ON a.user_id=tm.user_id
    WHERE t.is_deleted=false GROUP BY t.id`));
  const funnel = await timed(() => c.query(`SELECT
    (SELECT count(*) FROM p_enr WHERE status<>'Transferred') enrolled,
    (SELECT count(*) FROM p_enr WHERE status='Completed') completed,
    (SELECT count(*) FROM p_cert WHERE status='Issued' AND is_deleted=false) certified`));
  await c.end();
  return { rollup: { ms: rollup.ms, rows: sortRows(rollup.r.rows) }, funnel: { ms: funnel.ms, r: funnel.r.rows[0] } };
}

async function runMongo() {
  const mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  const db = mongoose.connection.db;
  const ins = async (name, rows) => { for (let i = 0; i < rows.length; i += BATCH) await db.collection(name).insertMany(rows.slice(i, i + BATCH)); };
  await Promise.all([ins('users', users), ins('teams', teams), ins('tm', members), ins('enr', enrollments), ins('att', attendance), ins('cert', certs)]);
  await Promise.all([db.collection('teams').createIndex({ id: 1 }), db.collection('tm').createIndex({ team_id: 1 }), db.collection('tm').createIndex({ user_id: 1 }), db.collection('att').createIndex({ user_id: 1 })]);
  const rollup = await timed(() => db.collection('tm').aggregate([
    { $lookup: { from: 'teams', localField: 'team_id', foreignField: 'id', as: 't' } }, { $unwind: '$t' },
    { $match: { 't.is_deleted': false } },
    { $lookup: { from: 'att', localField: 'user_id', foreignField: 'user_id', as: 'a' } }, { $unwind: '$a' },
    { $group: { _id: '$team_id', total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ['$a.status', 'P'] }, 1, 0] } } } },
  ], { allowDiskUse: true }).toArray());
  const funnel = await timed(async () => ({
    enrolled: await db.collection('enr').countDocuments({ status: { $ne: 'Transferred' } }),
    completed: await db.collection('enr').countDocuments({ status: 'Completed' }),
    certified: await db.collection('cert').countDocuments({ status: 'Issued', is_deleted: false }),
  }));
  await mongoose.disconnect(); await mem.stop();
  return { rollup: { ms: rollup.ms, rows: sortRows(rollup.r) }, funnel: { ms: funnel.ms, r: funnel.r } };
}

(async () => {
  console.log(`scale: ${USERS} users · ${TEAMS} teams · ${ATTENDANCE} attendance · ${CERTS} certs\nrunning Postgres (Neon)…`);
  const pg = await runPg();
  console.log('running Mongo (in-memory)…');
  const mo = await runMongo();

  const rollupMatch = eqRollup(pg.rollup.rows, mo.rollup.rows);
  const funnelMatch = ['enrolled', 'completed', 'certified'].every((k) => Number(pg.funnel.r[k]) === Number(mo.funnel.r[k]));

  console.log('\n──────── HEAD-TO-HEAD ────────');
  console.log(`per-team rollup PARITY : ${rollupMatch ? 'PASS ✓ (identical numbers)' : 'FAIL ✗'}  — ${pg.rollup.rows.length} teams`);
  console.log(`funnel PARITY          : ${funnelMatch ? 'PASS ✓' : 'FAIL ✗'}  PG=${JSON.stringify(pg.funnel.r)} Mongo=${JSON.stringify(mo.funnel.r)}`);
  console.log(`rollup latency         : Postgres(Neon, remote) ${pg.rollup.ms} ms  |  Mongo(in-mem, local) ${mo.rollup.ms} ms`);
  console.log(`funnel latency         : Postgres ${pg.funnel.ms} ms  |  Mongo ${mo.funnel.ms} ms`);
  console.log('(Mongo is LOCAL in-memory — no network; Neon is REMOTE. Parity of numbers is the gate signal.)');
  console.log('──────────────────────────────');
  process.exit(rollupMatch && funnelMatch ? 0 : 1);
})().catch((e) => { console.error('PARITY RUN FAILED:', e); process.exit(2); });
