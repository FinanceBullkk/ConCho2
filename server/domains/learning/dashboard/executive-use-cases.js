const repository = require('./executive-repository');
const operationalRepository = require('./repository');
const { composeFailSoft } = require('./compose-fail-soft');
const { ServiceError } = require('../../../helpers/ServiceError');

// ──────────────────────────────────────────────────────────
// Executive (ROI) dashboard — Admin-only strategic bundle. Financial KPIs are
// computed ONLY when LND_COST_CONFIG is set; absent config yields
// `configured: false`, never fabricated numbers. Kirkpatrick is reported
// honestly: L1 (feedback) + L2 (assessment) are measured today, L3–L5 are not.
// ──────────────────────────────────────────────────────────

const DAY_MS = 86400000;
const TREND_MONTHS = 6;
const DEFAULT_WINDOW_DAYS = 30;

const round2 = (n) => Math.round(n * 100) / 100;
const ratio = (part, total) => (total > 0 ? round2((part / total) * 100) : 0);

// Mirror the compliance report's Admin gate (defence in depth behind the
// coarse `report.read` route capability).
const assertAdmin = (actor) => {
  if (actor?.role !== 'Admin') {
    throw new ServiceError('Only Admins can access the executive dashboard', 403);
  }
};

const getCostConfig = (actor) => {
  assertAdmin(actor);
  return repository.getCostConfig();
};

const setCostConfig = (actor, value) => {
  assertAdmin(actor);
  return repository.upsertCostConfig(value);
};

// Last N month keys (UTC), oldest → newest, e.g. '2026-01'.
const lastMonthKeys = (now, months) => {
  const keys = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(d.toISOString().slice(0, 7));
  }
  return keys;
};

const buildTrendBlock = async (now) => {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (TREND_MONTHS - 1), 1));
  const { enrollments, certificates } = await repository.monthlyEventBuckets(start);
  const enrollByMonth = new Map(enrollments.map((row) => [row._id, row.count]));
  const certsByMonth = new Map(certificates.map((row) => [row._id, row.count]));
  return {
    months: lastMonthKeys(now, TREND_MONTHS).map((month) => ({
      month,
      enrollments: enrollByMonth.get(month) || 0,
      certificatesIssued: certsByMonth.get(month) || 0,
    })),
  };
};

const buildKirkpatrickBlock = async () => {
  const [feedback, assessments] = await Promise.all([
    operationalRepository.feedbackStats(null),
    operationalRepository.assessmentTotals(null),
  ]);
  return {
    l1Reaction: {
      measured: true,
      averageRating: feedback.overall.avg == null ? null : round2(feedback.overall.avg),
      submissions: feedback.overall.count,
    },
    l2Learning: {
      measured: true,
      passRate: ratio(assessments.passedAttempts, assessments.totalAttempts),
      attempts: assessments.totalAttempts,
    },
    l3Behavior: { measured: false, reason: 'Requires a post-training behavior survey (not yet built)' },
    l4Results: { measured: false, reason: 'Requires linking business KPIs to programs' },
    l5Roi: { measured: false, reason: 'Requires L4 results monetisation (Phillips)' },
  };
};

// Certificate-based proxy: a learner completes a path when they hold Issued
// certificates for every program in it (see executive-repository note).
const buildMobilityBlock = async () => {
  const paths = await repository.listActivePaths();
  // Dedupe program ObjectIds across paths by their string form.
  const programIds = [...new Map(
    paths.flatMap((path) => path.programs).map((id) => [id.toString(), id]),
  ).values()];
  const userSets = await repository.issuedProgramSetsByUser(programIds);
  let pathCompletions = 0;
  for (const path of paths) {
    const required = path.programs.map(String);
    if (!required.length) continue;
    for (const user of userSets) {
      const held = new Set(user.programs.map(String));
      if (required.every((programId) => held.has(programId))) pathCompletions += 1;
    }
  }
  return { activePaths: paths.length, certificateBasedPathCompletions: pathCompletions, basis: 'certificates' };
};

const buildCoverageBlock = async (windowStart, windowDays) => {
  const [org, departments] = await Promise.all([
    operationalRepository.coverageCounts(windowStart),
    repository.coverageByDepartment(windowStart),
  ]);
  return {
    windowDays,
    activeParticipants: org.activeParticipants,
    engagedParticipants: org.engagedParticipants,
    coveragePercent: ratio(org.engagedParticipants, org.activeParticipants),
    departments: departments.map((row) => ({ ...row, percent: ratio(row.engaged, row.active) })),
  };
};

// Financials only when the cost config exists — null-safe, never guessed.
const buildFinancialsBlock = async (now) => {
  const config = await repository.getCostConfig();
  if (!config) return { configured: false };
  const yearAgo = new Date(now.getTime() - 365 * DAY_MS);
  const [employees, completions] = await Promise.all([
    repository.activeEmployeeCount(),
    repository.issuedCertificateCount(yearAgo),
  ]);
  return {
    configured: true,
    currency: config.currency,
    annualBudgetMinor: config.annualBudgetMinor,
    activeEmployees: employees,
    completionsTrailing12Months: completions,
    costPerEmployeeMinor: employees > 0 ? Math.round(config.annualBudgetMinor / employees) : null,
    costPerCompletionMinor: completions > 0 ? Math.round(config.annualBudgetMinor / completions) : null,
  };
};

const buildExecutiveDashboard = async (actor, options = {}) => {
  assertAdmin(actor);
  const now = new Date();
  const windowDays = Number(options.window) || DEFAULT_WINDOW_DAYS;
  const windowStart = new Date(now.getTime() - windowDays * DAY_MS);

  return composeFailSoft([
    ['coverage', () => buildCoverageBlock(windowStart, windowDays)],
    ['trend', () => buildTrendBlock(now)],
    ['kirkpatrick', () => buildKirkpatrickBlock()],
    ['mobility', () => buildMobilityBlock()],
    ['certificates', () => repository.certificateValidityRollup(now)],
    ['financials', () => buildFinancialsBlock(now)],
  ], { windowDays });
};

module.exports = { buildExecutiveDashboard, getCostConfig, setCostConfig };
