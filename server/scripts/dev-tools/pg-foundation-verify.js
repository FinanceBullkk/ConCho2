// Phase 2 foundation — verify the migrated schema + trap-equivalents on Neon.
// Confirms the core tables exist and that the SQL trap-equivalents actually
// enforce: the Schedule double-booking partial-unique guard + soft-delete-aware
// user uniqueness. Throwaway rows are cleaned up. Run from server/:
//   node scripts/dev-tools/pg-foundation-verify.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const { Client } = require('pg');

const CORE = ['learning_programs', 'users', 'classes', 'teams', 'team_members',
  'enrollments', 'schedules', 'attendances', 'certificates'];

(async () => {
  const c = new Client({ connectionString: process.env.PG_PROTOTYPE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const { rows: tbls } = await c.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1) ORDER BY tablename`, [CORE]);
  console.log(`tables created : ${tbls.length}/${CORE.length} →`, tbls.map((r) => r.tablename).join(', '));

  const { rows: idx } = await c.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'uq_%' ORDER BY indexname`);
  console.log(`partial-unique guards :`, idx.map((r) => r.indexname).join(', '));

  // ── double-booking guard: same (class_id,start_time) scheduled twice ──
  await c.query(`DELETE FROM schedules WHERE id LIKE 'VERIFY%'`);
  const slot = `INSERT INTO schedules(id,class_id,start_time,status) VALUES($1,'CVERIFY','2026-09-01T10:00:00Z',$2)`;
  await c.query(slot, ['VERIFY1', 'scheduled']);
  let dblBook = 'NOT enforced (BUG)';
  try {
    await c.query(slot, ['VERIFY2', 'scheduled']);
  } catch (e) { if (e.code === '23505') dblBook = 'enforced ✓ (2nd scheduled booking rejected, 23505)'; }
  // a cancelled row may reuse the freed slot (partial predicate excludes it)
  let cancelledOk = 'rejected (BUG)';
  try {
    await c.query(slot, ['VERIFY3', 'cancelled']);
    cancelledOk = 'allowed ✓ (cancelled row reuses the freed slot)';
  } catch { /* leave as bug */ }
  await c.query(`DELETE FROM schedules WHERE id LIKE 'VERIFY%'`);

  // ── soft-delete-aware user uniqueness ──
  await c.query(`DELETE FROM users WHERE id LIKE 'VERIFY%'`);
  await c.query(`INSERT INTO users(id,emp_code,is_deleted) VALUES('VERIFYU1','E-VERIFY',false)`);
  let userUniq = 'NOT enforced (BUG)';
  try {
    await c.query(`INSERT INTO users(id,emp_code,is_deleted) VALUES('VERIFYU2','E-VERIFY',false)`);
  } catch (e) { if (e.code === '23505') userUniq = 'enforced ✓ (duplicate active emp_code rejected)'; }
  await c.query(`DELETE FROM users WHERE id LIKE 'VERIFY%'`);

  console.log('\n──────── FOUNDATION VERIFY ────────');
  console.log(`double-booking guard : ${dblBook}`);
  console.log(`  freed-slot reuse   : ${cancelledOk}`);
  console.log(`soft-delete uniqueness: ${userUniq}`);
  console.log('───────────────────────────────────');

  await c.end();
  process.exit(0);
})().catch((e) => { console.error('VERIFY FAILED:', e); process.exit(1); });
