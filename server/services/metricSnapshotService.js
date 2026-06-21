const repository = require('./metrics-repository');

// ──────────────────────────────────────────────────────────
// Metric snapshot service (Investment Build Plan #1)
// ──────────────────────────────────────────────────────────
// Aggregates the L&D funnel metrics into one durable value per metric, per
// scope (global + per-program), per UTC day. The nightly snapshotJob calls
// takeDailySnapshot(); the backfill script calls backfillHistory() to
// seed the derivable history. analyticsSeriesService reads the rows back.
//
// Metrics:
//   active_enrollments — point-in-time count of status:'Active' (NOT derivable
//                        historically — starts collecting from the first run)
//   enrollments        — cumulative learners enrolled (excludes Transferred
//                        bookkeeping rows)
//   completions        — cumulative status:'Completed'
//   certs_issued       — cumulative Certificates status:'Issued' (not trashed)
// ──────────────────────────────────────────────────────────

const TRACKED_KEYS = ['active_enrollments', 'enrollments', 'completions', 'certs_issued'];

const utcMidnight = (d = new Date()) => {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
};

/**
 * Compute the CURRENT value of every tracked metric, global + per-program.
 * @returns {Promise<Array<{scope,scopeId,key,value}>>}
 */
async function computeDailyMetrics() {
  const classes = await repository.findProgramClasses();
  const classToProgram = new Map(classes.map((c) => [String(c._id), String(c.programId)]));

  const [enrollAgg, certAgg] = await Promise.all([
    repository.aggregateEnrollmentsByClassStatus(),
    repository.aggregateIssuedCertsByProgram(),
  ]);

  const blank = () => ({ active_enrollments: 0, enrollments: 0, completions: 0, certs_issued: 0 });
  const global = blank();
  const perProgram = new Map();
  const bump = (pid, key, n) => {
    if (!perProgram.has(pid)) perProgram.set(pid, blank());
    perProgram.get(pid)[key] += n;
  };

  for (const row of enrollAgg) {
    const status = row._id.status;
    if (status === 'Transferred') continue; // bookkeeping artifact — don't count
    const n = row.count;
    global.enrollments += n;
    if (status === 'Active') global.active_enrollments += n;
    if (status === 'Completed') global.completions += n;

    const pid = classToProgram.get(String(row._id.classId));
    if (pid) {
      bump(pid, 'enrollments', n);
      if (status === 'Active') bump(pid, 'active_enrollments', n);
      if (status === 'Completed') bump(pid, 'completions', n);
    }
  }
  for (const row of certAgg) {
    global.certs_issued += row.count;
    if (row._id) bump(String(row._id), 'certs_issued', row.count);
  }

  const metrics = TRACKED_KEYS.map((key) => ({ scope: 'global', scopeId: null, key, value: global[key] }));
  for (const [pid, vals] of perProgram) {
    for (const key of TRACKED_KEYS) {
      metrics.push({ scope: 'program', scopeId: pid, key, value: vals[key] });
    }
  }
  return metrics;
}

/**
 * Upsert one snapshot row per metric for a given day (idempotent — re-running
 * the same day overwrites the value).
 */
async function writeSnapshots(date, metrics) {
  if (!metrics.length) return { upserted: 0, total: 0 };
  const day = utcMidnight(date);
  const res = await repository.upsertSnapshots(day, metrics);
  return { upserted: res.upserted, modified: res.modified, total: metrics.length };
}

/** Take + persist today's snapshot. Called by the nightly cron. */
async function takeDailySnapshot(date = new Date()) {
  const metrics = await computeDailyMetrics();
  const result = await writeSnapshots(date, metrics);
  return { date: utcMidnight(date), ...result };
}

// # of sorted millisecond-timestamps that are <= t (binary search).
const countLE = (sortedTs, t) => {
  let lo = 0;
  let hi = sortedTs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedTs[mid] <= t) lo = mid + 1; else hi = mid;
  }
  return lo;
};

/**
 * Seed historical cumulative metrics that ARE derivable from record timestamps,
 * for BOTH global and per-program scope: enrollments by joinedAt, completions by
 * leftAt (fallback updatedAt), certs by issuedAt. active_enrollments is
 * point-in-time and not historically derivable — it is intentionally NOT
 * backfilled (collected going forward).
 *
 * @param {{ days?: number }} [opts]
 */
async function backfillHistory({ days = 180 } = {}) {
  const today = utcMidnight();
  const start = utcMidnight();
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const classes = await repository.findProgramClasses();
  const classToProgram = new Map(classes.map((c) => [String(c._id), String(c.programId)]));

  const enr = await repository.findNonTransferredEnrollments();
  const certs = await repository.findIssuedCertificates();

  const ms = (d) => +new Date(d);

  // Global timestamp pools + per-program pools (programId → {enrolled,completed,cert}).
  const globalTs = { enrolled: [], completed: [], cert: [] };
  const perProgram = new Map();
  const pool = (pid) => {
    if (!perProgram.has(pid)) perProgram.set(pid, { enrolled: [], completed: [], cert: [] });
    return perProgram.get(pid);
  };

  for (const e of enr) {
    const jt = e.joinedAt || e.createdAt;
    const ct = e.status === 'Completed' ? (e.leftAt || e.updatedAt) : null;
    if (jt) globalTs.enrolled.push(ms(jt));
    if (ct) globalTs.completed.push(ms(ct));
    const pid = classToProgram.get(String(e.classId));
    if (pid) {
      const p = pool(pid);
      if (jt) p.enrolled.push(ms(jt));
      if (ct) p.completed.push(ms(ct));
    }
  }
  for (const c of certs) {
    const it = c.issuedAt || c.createdAt;
    if (it) globalTs.cert.push(ms(it));
    const pid = c.programId ? String(c.programId) : null;
    if (pid && it) pool(pid).cert.push(ms(it));
  }

  const sortNum = (arr) => arr.sort((a, b) => a - b);
  [globalTs.enrolled, globalTs.completed, globalTs.cert].forEach(sortNum);
  for (const p of perProgram.values()) [p.enrolled, p.completed, p.cert].forEach(sortNum);

  let upserted = 0;
  let dayCount = 0;
  for (let d = new Date(start); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = utcMidnight(d);
    const endOfDay = +day + 24 * 60 * 60 * 1000 - 1;
    const rows = [
      { scope: 'global', scopeId: null, key: 'enrollments', value: countLE(globalTs.enrolled, endOfDay) },
      { scope: 'global', scopeId: null, key: 'completions', value: countLE(globalTs.completed, endOfDay) },
      { scope: 'global', scopeId: null, key: 'certs_issued', value: countLE(globalTs.cert, endOfDay) },
    ];
    for (const [pid, p] of perProgram) {
      rows.push(
        { scope: 'program', scopeId: pid, key: 'enrollments', value: countLE(p.enrolled, endOfDay) },
        { scope: 'program', scopeId: pid, key: 'completions', value: countLE(p.completed, endOfDay) },
        { scope: 'program', scopeId: pid, key: 'certs_issued', value: countLE(p.cert, endOfDay) },
      );
    }
    const r = await writeSnapshots(day, rows);
    upserted += r.upserted;
    dayCount += 1;
  }
  return { days: dayCount, upserted, programs: perProgram.size };
}

module.exports = {
  TRACKED_KEYS,
  utcMidnight,
  computeDailyMetrics,
  writeSnapshots,
  takeDailySnapshot,
  backfillHistory,
};
