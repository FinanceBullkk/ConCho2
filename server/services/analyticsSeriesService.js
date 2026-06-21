const repository = require('./metrics-repository');

// ──────────────────────────────────────────────────────────
// Analytics series service (Investment Build Plan #1)
// ──────────────────────────────────────────────────────────
// Reads the durable MetricSnapshot history back as trend series, and computes
// the live enroll → complete → certify funnel. Backs /api/analytics/*.
//
// Series come from stored snapshots (real day-by-day history). The funnel is
// the CURRENT cross-section (live counts) — point-in-time by nature, so it does
// not need a stored series. Empty series degrade gracefully on the client
// ("collecting data") — we never synthesise a fake line.
// ──────────────────────────────────────────────────────────

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90, '180d': 180, '365d': 365, '1y': 365 };

const parseRangeDays = (range) => RANGE_DAYS[range] || 90;

/**
 * Trend for one metric within a date range.
 * @returns {Promise<Array<{date: Date, value: number}>>} ascending by date
 */
async function getSeries({ key, scope = 'global', scopeId = null, range = '90d' }) {
  const days = parseRangeDays(range);
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const rows = await repository.findSnapshotSeries({ key, scope, scopeId, since });

  return rows.map((r) => ({ date: r.date, value: r.value }));
}

/**
 * Live enroll → complete → certify funnel, optionally scoped to one program.
 * @returns {Promise<{stages: Array, conversion: object}>}
 */
async function getFunnel({ programId = null } = {}) {
  let classIds = null;
  if (programId) {
    const classes = await repository.findClassIdsForProgram(programId);
    classIds = classes.map((c) => c._id);
  }

  const enrollMatch = { status: { $ne: 'Transferred' } };
  if (classIds) enrollMatch.classId = { $in: classIds };

  const certMatch = { status: 'Issued', isDeleted: { $ne: true } };
  if (programId) certMatch.programId = programId;

  const [enrolled, completed, certified] = await Promise.all([
    repository.countEnrollments(enrollMatch),
    repository.countEnrollments({ ...enrollMatch, status: 'Completed' }),
    repository.countCertificates(certMatch),
  ]);

  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

  return {
    stages: [
      { key: 'enrolled', label: 'Enrolled', value: enrolled },
      { key: 'completed', label: 'Completed', value: completed },
      { key: 'certified', label: 'Certified', value: certified },
    ],
    conversion: {
      enrolledToCompleted: pct(completed, enrolled),
      completedToCertified: pct(certified, completed),
      overall: pct(certified, enrolled),
    },
  };
}

/**
 * Per-program Analytics tab payload: that program's stored trend series + its
 * live funnel.
 */
async function getProgramAnalytics(programId, range = '90d') {
  const [completions, activeEnrollments, certsIssued, funnel] = await Promise.all([
    getSeries({ key: 'completions', scope: 'program', scopeId: programId, range }),
    getSeries({ key: 'active_enrollments', scope: 'program', scopeId: programId, range }),
    getSeries({ key: 'certs_issued', scope: 'program', scopeId: programId, range }),
    getFunnel({ programId }),
  ]);

  const collecting = completions.length === 0 && activeEnrollments.length === 0 && certsIssued.length === 0;
  return {
    programId,
    range,
    series: { completions, active_enrollments: activeEnrollments, certs_issued: certsIssued },
    funnel,
    collecting,
  };
}

module.exports = { parseRangeDays, getSeries, getFunnel, getProgramAnalytics };
