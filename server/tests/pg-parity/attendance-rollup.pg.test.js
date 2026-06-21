/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — per-team attendance rollup (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Runs ONLY when a Postgres URL is present (the CI "pg-parity" job sets PG_URL
 * to its service container; locally PG_PROTOTYPE_URL points at Neon). Without
 * one it SKIPS, so the normal mongodb-memory-server server-tests job is
 * unaffected. Assumes the schema is already migrated (the CI job runs
 * `knex migrate:latest` first; locally the migration was applied to Neon).
 *
 * Loads ONE identical dataset into Mongo (in-memory, via the REAL analyticsByTeam
 * path) and the migrated Postgres tables, then asserts the dual-backend
 * repository returns IDENTICAL per-team stats.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const rollup = require('../../services/attendance-rollup');

const TEAMS = 20, MEMBERS_PER_TEAM = 5, ATTENDANCE = 5_000, BATCH = 1_000;
const ST = ['P', 'P', 'P', 'A', 'L', 'EL'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (n) => new mongoose.Types.ObjectId(hex(n));
const teamHex = (i) => hex(1_000_000 + i);

describePg('PG-parity: attendance rollup', () => {
  let mem;
  let mongo;
  let pg;

  beforeAll(async () => {
    // shared dataset
    let uc = 0;
    const teams = [];
    const allMembers = [];
    for (let t = 0; t < TEAMS; t += 1) {
      const members = [];
      for (let m = 0; m < MEMBERS_PER_TEAM; m += 1) { members.push(uc); allMembers.push(uc); uc += 1; }
      teams.push({ idx: t, members });
    }
    const attendance = Array.from({ length: ATTENDANCE }, (_, i) => ({ idx: i, userIdx: pick(allMembers), status: pick(ST) }));

    // Mongo (in-memory) — via the real analyticsByTeam path
    mem = await MongoMemoryServer.create();
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
    mongo = await rollup.impls.mongo.getTeamAttendanceRollup();

    // Postgres (migrated tables)
    await query('TRUNCATE teams, team_members, attendances');
    await query(
      `INSERT INTO teams(id,name,is_deleted) VALUES ${teams.map((_, j) => `($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3})`).join(',')}`,
      teams.flatMap((t) => [teamHex(t.idx), `Team ${String(t.idx).padStart(3, '0')}`, false]),
    );
    const members = teams.flatMap((t) => t.members.map((ui) => [teamHex(t.idx), hex(ui)]));
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
    pg = await rollup.impls.pg.getTeamAttendanceRollup();
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('per-team stats are identical across Mongo and Postgres', () => {
    const byId = (rows) => Object.fromEntries(rows.map((r) => [r.teamId, r]));
    const m = byId(mongo);
    const p = byId(pg);
    expect(Object.keys(p).sort()).toEqual(Object.keys(m).sort());
    for (const id of Object.keys(m)) {
      expect(p[id]).toMatchObject({
        memberCount: m[id].memberCount, total: m[id].total, present: m[id].present,
        absent: m[id].absent, late: m[id].late, excused: m[id].excused, rate: m[id].rate,
      });
    }
  });
});
