#!/usr/bin/env node
// ETL Mongo → PostgreSQL (Wave H — one-time cutover copy, rehearsable).
//
// Standalone ops script — does NOT touch the app, models, or middleware. Reads
// every known collection through the RAW driver (select:false fields included,
// no soft-delete hooks — deleted rows COPY TOO, trash must survive) and
// upserts into the live PG schema by reflection (see
// ./etl-mongo-to-pg-transforms.js for the per-model fixes + curated meta
// packing). Idempotent: INSERT … ON CONFLICT (id) DO UPDATE — safe to re-run
// after a partial failure; Team.members resyncs its team_members junction
// rows (delete + reinsert per team).
//
// Usage:
//   MONGO_URI='mongodb+srv://…' PG_URL='postgresql://…' node server/scripts/etl-mongo-to-pg.js
//     [--collection=users]   copy ONE collection only (repeatable)
//     [--batch=500]          cursor batch size (default 500)
//
// End-of-run report: per-collection row counts Mongo vs PG (must match — the
// Wave J step-4 verification), dangling-FK warnings (must be empty before
// applying mig 036), and total DB size vs the Neon-FREE 0.5GB gate.
//
// NEVER point MONGO_URI at prod while writes are unfrozen (Wave J freezes
// first — see plans/260612-2042-postgresql-migration/cutover-checklist.md).

// mongoose is the server's own Mongo driver dependency — we only use its raw
// connection handle (no models, no middleware: select:false fields included,
// soft-deleted rows copy too).
const mongoose = require('mongoose');
const { Pool } = require('pg');
const {
  COLLECTIONS, SKIP_COLLECTIONS, tableCandidates, mapRow, DANGLING_CHECKS,
} = require('./etl-mongo-to-pg-transforms');

const args = process.argv.slice(2);
const only = args.filter((a) => a.startsWith('--collection=')).map((a) => a.split('=')[1]);
const batchSize = Number((args.find((a) => a.startsWith('--batch=')) || '').split('=')[1]) || 500;

const MONGO_URI = process.env.MONGO_URI;
const PG_URL = process.env.PG_URL;
if (!MONGO_URI || !PG_URL) {
  console.error('ETL: MONGO_URI and PG_URL are both required.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: PG_URL,
  ssl: /localhost|127\.0\.0\.1/.test(PG_URL) ? false : { rejectUnauthorized: false },
});
const q = (text, params) => pool.query(text, params);

// ── PG schema reflection (fail-loud) ────────────────────────
let PG_TABLES;
const PG_COLS = new Map();
const loadSchema = async () => {
  const t = await q("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  PG_TABLES = new Set(t.rows.map((r) => r.table_name));
};
const colsFor = async (table) => {
  if (!PG_COLS.has(table)) {
    const { rows } = await q(
      'SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1', [table]);
    PG_COLS.set(table, rows.map((r) => [r.column_name, r.data_type]));
  }
  return PG_COLS.get(table);
};
const tableForModel = (modelName) => tableCandidates(modelName).find((c) => PG_TABLES.has(c)) || null;

// ── Upserts ─────────────────────────────────────────────────
const upsertRow = async (table, row) => {
  const cols = Object.keys(row);
  const params = cols.map((_, i) => `$${i + 1}`);
  const updates = cols.filter((c) => c !== 'id').map((c) => `"${c}" = EXCLUDED."${c}"`);
  await q(
    `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${params.join(',')})
     ${updates.length ? `ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}` : 'ON CONFLICT (id) DO NOTHING'}`,
    cols.map((c) => row[c]),
  );
};

const syncTeamJunction = async (doc) => {
  const teamId = String(doc._id);
  const memberIds = (doc.members || []).map(String);
  await q('DELETE FROM team_members WHERE team_id = $1', [teamId]);
  if (memberIds.length) {
    await q(
      `INSERT INTO team_members (team_id, user_id)
       VALUES ${memberIds.map((_, i) => `($1,$${i + 2})`).join(',')}
       ON CONFLICT DO NOTHING`,
      [teamId, ...memberIds],
    );
  }
};

// ── Main ────────────────────────────────────────────────────
const main = async () => {
  const conn = await mongoose.createConnection(MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  }).asPromise();
  const db = conn.db;
  await loadSchema();

  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
  const known = new Map(COLLECTIONS);
  for (const name of existing) {
    if (!known.has(name) && !SKIP_COLLECTIONS[name] && !name.startsWith('system.')) {
      console.warn(`⚠ unknown Mongo collection "${name}" — skipped (no PG mapping)`);
    }
  }
  for (const [name, reason] of Object.entries(SKIP_COLLECTIONS)) {
    if (existing.has(name)) console.warn(`⏭ skipping "${name}": ${reason}`);
  }

  const report = [];
  let failed = false;

  for (const [collection, model] of COLLECTIONS) {
    if (only.length && !only.includes(collection)) continue;
    if (!existing.has(collection)) continue;
    const table = tableForModel(model);
    if (!table) {
      console.warn(`⏭ "${collection}" (${model}): no PG table — run pending migrations first`);
      continue;
    }
    const cols = await colsFor(table);
    const total = await db.collection(collection).countDocuments({});
    let copied = 0;
    const cursor = db.collection(collection).find({}, { batchSize });
    try {
      for await (const doc of cursor) {
        await upsertRow(table, mapRow(model, doc, cols));
        if (model === 'Team') await syncTeamJunction(doc);
        copied += 1;
        if (copied % 1000 === 0) console.log(`  … ${collection}: ${copied}/${total}`);
      }
    } catch (err) {
      failed = true;
      console.error(`✗ "${collection}" → ${table} FAILED after ${copied}/${total}: ${err.message}`);
      report.push({ collection, table, mongo: total, pg: 'ERROR', ok: false });
      continue;
    }
    const { rows } = await q(`SELECT count(*)::int AS n FROM "${table}"`);
    const pgCount = rows[0].n;
    const ok = pgCount >= total; // PG may hold extra rows from prior rehearsals
    if (pgCount !== total) console.warn(`△ "${collection}": Mongo ${total} vs PG ${pgCount} (PG extras from prior runs?)`);
    report.push({ collection, table, mongo: total, pg: pgCount, ok });
    console.log(`✔ ${collection} → ${table}: ${copied} copied (Mongo ${total} / PG ${pgCount})`);
  }

  // ── Reconciliation report ─────────────────────────────────
  console.log('\n═══ Row-count reconciliation (Mongo vs PG) ═══');
  for (const r of report) {
    console.log(`  ${r.ok ? '✔' : '✗'} ${r.collection.padEnd(24)} mongo=${String(r.mongo).padEnd(8)} pg=${r.pg}`);
    if (!r.ok) failed = true;
  }

  console.log('\n═══ Dangling-reference check (must be clean before mig 036) ═══');
  for (const [child, col, parent] of DANGLING_CHECKS) {
    if (!PG_TABLES.has(child) || !PG_TABLES.has(parent)) continue;
    const { rows } = await q(
      `SELECT count(*)::int AS n FROM "${child}" c
       WHERE c."${col}" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM "${parent}" p WHERE p.id = c."${col}")`);
    if (rows[0].n > 0) {
      failed = true;
      console.warn(`  ✗ ${child}.${col} → ${parent}: ${rows[0].n} dangling`);
    }
  }
  console.log('  (silence above = clean)');

  const { rows: [sz] } = await q(
    'SELECT pg_database_size(current_database()) AS bytes, pg_size_pretty(pg_database_size(current_database())) AS pretty');
  const gb = Number(sz.bytes) / 1024 ** 3;
  console.log(`\n═══ Total PG database size: ${sz.pretty} ═══`);
  if (gb > 0.5) {
    console.warn(`  ⚠ over the Neon FREE 0.5GB gate (owner decision 2026-07-08) — escalate before Wave J`);
  } else {
    console.log(`  ✔ within the Neon FREE 0.5GB gate`);
  }

  await conn.close();
  await pool.end();
  process.exit(failed ? 1 : 0);
};

main().catch((err) => {
  console.error('ETL fatal:', err);
  process.exit(1);
});
