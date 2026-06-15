const repository = require('./repository');
const reportsRepository = require('../reports/repository');
const { buildCompletionRollup } = require('../reports/completion-rollup-use-case');
const { resolveAssignmentStatuses } = require('../assignment/status-resolver');
const { findTeacherVisibleClassIds } = require('../../../helpers/teacher-class-scope');
const { composeFailSoft } = require('./compose-fail-soft');

// ──────────────────────────────────────────────────────────
// Operational dashboard — compose existing engines into one read-only bundle.
// Completion comes from the reports rollup (DRY), overdue from the D4 status
// resolver, certificate expiry from D6 validity fields. Each metric resolves
// independently (Promise.allSettled) so one failing aggregation degrades to
// `null` + an errors[] entry instead of failing the whole dashboard.
// ──────────────────────────────────────────────────────────

const DAY_MS = 86400000;
const DEFAULT_WINDOW_DAYS = 30;
const TOP_OVERDUE_LIMIT = 10;
const TOP_EXPIRING_LIMIT = 10;

const round2 = (n) => Math.round(n * 100) / 100;
const ratio = (part, total) => (total > 0 ? round2((part / total) * 100) : 0);

const buildAttendanceBlock = async (cohortIds) => {
  const { totalRecords, presentRecords } = await repository.attendanceTotals(cohortIds);
  return { totalRecords, presentRecords, rate: ratio(presentRecords, totalRecords) };
};

// Org-wide for every caller: D4 already grants Teachers org-wide assignment
// reads (`assignment.read`), so surfacing overdue counts/top-N here adds no
// new exposure beyond the existing Assignments tab.
const buildAssignmentsBlock = async (now) => {
  const assignments = await reportsRepository.listComplianceAssignments({});
  const statusSets = await Promise.all(
    assignments.map((assignment) => resolveAssignmentStatuses(assignment, now)),
  );

  let overdueLearners = 0;
  const topOverdue = [];
  assignments.forEach((assignment, index) => {
    statusSets[index].forEach((row) => {
      if (row.status !== 'overdue') return;
      overdueLearners += 1;
      topOverdue.push({
        assignmentId: assignment._id,
        assignmentTitle: assignment.title,
        dueDate: assignment.dueDate || null,
        learner: {
          id: row.learner?._id || null,
          empCode: row.learner?.empCode || '',
          name: row.learner?.name || '',
          department: row.learner?.department || '',
        },
      });
    });
  });

  topOverdue.sort(
    (a, b) =>
      new Date(a.dueDate || 0) - new Date(b.dueDate || 0)
      || a.learner.name.localeCompare(b.learner.name),
  );
  return {
    activeAssignments: assignments.length,
    overdueLearners,
    topOverdue: topOverdue.slice(0, TOP_OVERDUE_LIMIT),
  };
};

const buildCertificatesBlock = async (cohortIds, now) => {
  const horizon = new Date(now.getTime() + 30 * DAY_MS);
  const [counts, expiringRows] = await Promise.all([
    repository.certificateExpiryCounts(cohortIds, now),
    repository.listExpiringCertificates(cohortIds, now, horizon, TOP_EXPIRING_LIMIT),
  ]);
  return {
    ...counts,
    topExpiring: expiringRows.map((cert) => ({
      certificateNumber: cert.certificateNumber,
      learnerName: cert.learnerName || '',
      programName: cert.programName || '',
      validUntil: cert.validUntil,
    })),
  };
};

const buildAssessmentsBlock = async (cohortIds) => {
  const { totalAttempts, passedAttempts } = await repository.assessmentTotals(cohortIds);
  return { totalAttempts, passedAttempts, passRate: ratio(passedAttempts, totalAttempts) };
};

const buildFeedbackBlock = async (cohortIds) => {
  const { overall, byProgram } = await repository.feedbackStats(cohortIds);
  const programs = await repository.listProgramNames(byProgram.map((row) => row._id));
  const nameById = new Map(programs.map((program) => [program._id.toString(), program.name]));
  return {
    count: overall.count,
    averageRating: overall.avg == null ? null : round2(overall.avg),
    byProgram: byProgram.map((row) => ({
      programId: row._id,
      programName: nameById.get(row._id.toString()) || '',
      count: row.count,
      averageRating: round2(row.avg),
    })),
  };
};

const buildCoverageBlock = async (windowStart, windowDays) => {
  const { activeParticipants, engagedParticipants } = await repository.coverageCounts(windowStart);
  return {
    windowDays,
    activeParticipants,
    engagedParticipants,
    coveragePercent: ratio(engagedParticipants, activeParticipants),
  };
};

const buildOperationalDashboard = async (actor, options = {}) => {
  const now = new Date();
  const windowDays = Number(options.window) || DEFAULT_WINDOW_DAYS;
  const windowStart = new Date(now.getTime() - windowDays * DAY_MS);
  // Teacher = class-scoped (same visibility helper the rollup uses); Admin =
  // org-wide (null scope). Coverage/assignments stay org-wide by design.
  const cohortIds = actor?.role === 'Teacher'
    ? await findTeacherVisibleClassIds(actor._id)
    : null;

  return composeFailSoft([
    ['completion', () => buildCompletionRollup(actor)],
    ['attendance', () => buildAttendanceBlock(cohortIds)],
    ['sessions', () => repository.sessionCounts(cohortIds, now)],
    ['assignments', () => buildAssignmentsBlock(now)],
    ['certificates', () => buildCertificatesBlock(cohortIds, now)],
    ['assessments', () => buildAssessmentsBlock(cohortIds)],
    ['feedback', () => buildFeedbackBlock(cohortIds)],
    ['coverage', () => buildCoverageBlock(windowStart, windowDays)],
  ], { windowDays });
};

// Home onboarding checklist + "this week" at-a-glance (org-wide counts).
const buildSetup = async () => {
  const s = await repository.getSetupSignals();
  const steps = [
    { key: 'directory', done: s.departments > 0 },
    { key: 'program', done: s.programs > 0 },
    { key: 'roles', done: s.customRoles > 0 },
    { key: 'automation', done: s.automationRules > 0 },
    { key: 'policy', done: s.policyPrograms > 0 },
    { key: 'coordinators', done: s.coordinators > 0 },
  ];
  return {
    steps,
    completedSteps: steps.filter((x) => x.done).length,
    totalSteps: steps.length,
    atGlance: {
      activeLearners: s.activeLearners,
      totalEmployees: s.totalEmployees,
      sessionsThisWeek: s.sessionsThisWeek,
      pendingEnrollment: s.pendingEnrollment,
    },
  };
};

module.exports = { buildOperationalDashboard, buildSetup };
