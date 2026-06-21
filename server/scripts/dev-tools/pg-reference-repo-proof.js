// Phase 2 / 2.6 — reference repository port proof.
// Loads ONE identical synthetic dataset into the migrated Postgres tables AND a
// Mongo memory DB, then runs the SAME funnel interface against BOTH backends
// (services/metrics-funnel) and asserts identical numbers — the Phase-3 port
// pattern proven end-to-end behind one interface. Throwaway. Run from server/:
//   node scripts/dev-tools/pg-reference-repo-proof.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { query, closePool } = require('../../config/pg');
const { impls } = require('../../services/metrics-funnel');

const N_ENR = 5000, N_CERT = 2000, BATCH = 1000;
const rid = (p, n) => `${p}${String(n).padStart(7, '0')}`;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// shared logical dataset (status drives both stores)
const enr = Array.from({ length: N_ENR }, (_, i) => ({ id: rid('E', i), status: pick(['Active', 'Active', 'Completed', 'Dropped', 'Transferred']) }));
const cert = Array.from({ length: N_CERT }, (_, i) => ({ id: rid('K', i), status: pick(['Issued', 'Issued', 'Revoked']), is_deleted: i % 25 === 0 }));

// independent expected counts (sanity oracle)
const expected = {
  enrolled: enr.filter((e) => e.status !== 'Transferred').length,
  completed: enr.filter((e) => e.status === 'Completed').length,
  certified: cert.filter((c) => c.status === 'Issued' && !c.is_deleted).length,
};

async function loadPg() {
  await query('TRUNCATE enrollments, certificates, classes');
  for (let i = 0; i < enr.length; i += BATCH) {
    const chunk = enr.slice(i, i + BATCH);
    const vals = chunk.map((_, j) => `($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3})`).join(',');
    const params = chunk.flatMap((e) => [e.id, 'u', e.status]);
    await query(`INSERT INTO enrollments(id,user_id,status) VALUES ${vals}`, params);
  }
  for (let i = 0; i < cert.length; i += BATCH) {
    const chunk = cert.slice(i, i + BATCH);
    const vals = chunk.map((_, j) => `($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3})`).join(',');
    const params = chunk.flatMap((c) => [c.id, c.status, c.is_deleted]);
    await query(`INSERT INTO certificates(id,status,is_deleted) VALUES ${vals}`, params);
  }
}

async function loadMongo(db) {
  await db.collection('enrollments').insertMany(enr.map((e) => ({ _id: e.id, userId: 'u', status: e.status })));
  // certificateNumber is unique in the Certificate model — give each a distinct value.
  await db.collection('certificates').insertMany(cert.map((c) => ({ _id: c.id, certificateNumber: c.id, status: c.status, isDeleted: c.is_deleted, programId: 'p' })));
}

(async () => {
  console.log(`dataset: ${N_ENR} enrollments · ${N_CERT} certificates`);
  console.log('expected (oracle):', expected);

  // ── Postgres backend ──
  await loadPg();
  const pgFunnel = await impls.pg.getFunnelCounts({});
  console.log('postgres funnel  :', pgFunnel);

  // ── Mongo backend ──
  const mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  await loadMongo(mongoose.connection.db);
  const moFunnel = await impls.mongo.getFunnelCounts({});
  console.log('mongo funnel     :', moFunnel);

  const eq = (a) => a.enrolled === expected.enrolled && a.completed === expected.completed && a.certified === expected.certified;
  const parity = pgFunnel.enrolled === moFunnel.enrolled && pgFunnel.completed === moFunnel.completed && pgFunnel.certified === moFunnel.certified;

  console.log('\n──────── REFERENCE REPO PORT ────────');
  console.log(`postgres == oracle : ${eq(pgFunnel) ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log(`mongo == oracle    : ${eq(moFunnel) ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log(`PG == Mongo parity : ${parity ? 'PASS ✓ (same interface, two backends, identical numbers)' : 'FAIL ✗'}`);
  console.log('─────────────────────────────────────');

  await mongoose.disconnect(); await mem.stop(); await closePool();
  process.exit(parity && eq(pgFunnel) && eq(moFunnel) ? 0 : 1);
})().catch((e) => { console.error('PROOF FAILED:', e); process.exit(2); });
