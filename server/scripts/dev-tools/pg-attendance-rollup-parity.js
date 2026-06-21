// Phase 3 Wave-A — attendance-rollup port parity (Neon vs Mongo).
// Loads ONE identical dataset into Mongo (in-memory, via the REAL analyticsByTeam
// path) and the migrated Postgres tables, runs both impls, asserts per-team
// stats are identical. Throwaway. Run from server/:
//   node scripts/dev-tools/pg-attendance-rollup-parity.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { query, closePool } = require('../../config/pg');
const rollup = require('../../services/attendance-rollup');

const TEAMS = 50, MEMBERS_PER_TEAM = 5, ATTENDANCE = 20_000, BATCH = 2_000;
const ST = ['P', 'P', 'P', 'A', 'L', 'EL'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const hex = (n) => n.toString(16).padStart(24, '0');           // valid ObjectId hex
const oid = (n) => new mongoose.Types.ObjectId(hex(n));

// ── shared dataset ──
let uc = 0;
const teams = [];            // { idx, members:[userIdx] }
const allMembers = [];
for (let t = 0; t < TEAMS; t += 1) {
  const members = [];
  for (let m = 0; m < MEMBERS_PER_TEAM; m += 1) { const ui = uc; uc += 1; members.push(ui); allMembers.push(ui); }
  teams.push({ idx: t, members });
}
const attendance = Array.from({ length: ATTENDANCE }, (_, i) => ({ idx: i, userIdx: pick(allMembers), status: pick(ST) }));
const teamId = (t) => hex(1_000_000 + t.idx);

const sortById = (rows) => [...rows].sort((a, b) => a.teamId.localeCompare(b.teamId));
const KEYS = ['memberCount', 'total', 'present', 'absent', 'late', 'excused', 'rate'];
const eqRow = (a, b) => a.teamId === b.teamId && KEYS.every((k) => a[k] === b[k]);

async function runMongo() {
  const mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  const db = mongoose.connection.db;
  await db.collection('teams').insertMany(teams.map((t) => ({
    _id: oid(1_000_000 + t.idx), name: `Team ${String(t.idx).padStart(3, '0')}`,
    members: t.members.map(oid), isDeleted: false,
  })));
  for (let i = 0; i < attendance.length; i += BATCH) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('attendances').insertMany(attendance.slice(i, i + BATCH).map((a) => ({
      _id: oid(2_000_000 + a.idx), userId: oid(a.userIdx), scheduleId: oid(4_000_000 + a.idx), status: a.status,
    })));
  }
  const r = await rollup.impls.mongo.getTeamAttendanceRollup();
  await mongoose.disconnect(); await mem.stop();
  return r;
}

async function runPg() {
  await query('TRUNCATE teams, team_members, attendances');
  await query(
    `INSERT INTO teams(id,name,is_deleted) VALUES ${teams.map((_, j) => `($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3})`).join(',')}`,
    teams.flatMap((t) => [teamId(t), `Team ${String(t.idx).padStart(3, '0')}`, false]),
  );
  const members = teams.flatMap((t) => t.members.map((ui) => [teamId(t), hex(ui)]));
  await query(
    `INSERT INTO team_members(team_id,user_id) VALUES ${members.map((_, j) => `($${j * 2 + 1},$${j * 2 + 2})`).join(',')}`,
    members.flat(),
  );
  for (let i = 0; i < attendance.length; i += BATCH) {
    const chunk = attendance.slice(i, i + BATCH);
    // eslint-disable-next-line no-await-in-loop
    await query(
      `INSERT INTO attendances(id,user_id,schedule_id,status) VALUES ${chunk.map((_, j) => `($${j * 4 + 1},$${j * 4 + 2},$${j * 4 + 3},$${j * 4 + 4})`).join(',')}`,
      chunk.flatMap((a) => [hex(3_000_000 + a.idx), hex(a.userIdx), hex(4_000_000 + a.idx), a.status]),
    );
  }
  return rollup.impls.pg.getTeamAttendanceRollup();
}

(async () => {
  console.log(`scale: ${TEAMS} teams · ${TEAMS * MEMBERS_PER_TEAM} members · ${ATTENDANCE} attendance`);
  const mo = sortById(await runMongo());
  const pg = sortById(await runPg());
  await closePool();

  const sameLen = mo.length === pg.length;
  const mismatches = sameLen ? mo.filter((m, i) => !eqRow(m, pg[i])) : [];
  const pass = sameLen && mismatches.length === 0;

  console.log('\n──────── ATTENDANCE ROLLUP PARITY ────────');
  console.log(`teams: Mongo ${mo.length} | PG ${pg.length}`);
  console.log(`sample team 0: Mongo`, mo[0], '\n               PG   ', pg[0]);
  if (!pass) console.log('MISMATCHES (first 3):', mismatches.slice(0, 3).map((m) => ({ mongo: m, pg: pg.find((p) => p.teamId === m.teamId) })));
  console.log(`PARITY: ${pass ? 'PASS ✓ (identical per-team stats)' : 'FAIL ✗'}`);
  console.log('──────────────────────────────────────────');
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error('PARITY FAILED:', e); process.exit(2); });
