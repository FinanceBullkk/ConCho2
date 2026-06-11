const repository = require('./repository');
const { classScopeForActor } = require('../../../helpers/teacher-class-scope');
const { DEFAULT_POLICY } = require('../completion/repository');

const round2 = (n) => Math.round(n * 100) / 100;
const idOf = (value) => value?.toString();
const evidenceKey = (cohortId, userId) => `${idOf(cohortId)}:${idOf(userId)}`;
const emptyRollupRow = (key, label) => ({
  key,
  label,
  cohorts: 0,
  learners: 0,
  complete: 0,
  completionRate: 0,
  certificatesIssued: 0,
});
const addMetrics = (map, key, label, metrics) => {
  const row = map.get(key) || emptyRollupRow(key, label);
  row.cohorts += metrics.cohorts || 0;
  row.learners += metrics.learners || 0;
  row.complete += metrics.complete || 0;
  row.certificatesIssued += metrics.certificatesIssued || 0;
  row.completionRate = row.learners > 0 ? round2((row.complete / row.learners) * 100) : 0;
  map.set(key, row);
};
const buildCohortMeta = async (cohorts) => {
  const programIds = [
    ...new Set(cohorts.map((cohort) => idOf(cohort.programId)).filter(Boolean)),
  ];
  const programs = await repository.listProgramsByIds(programIds);
  const programById = new Map(programs.map((program) => [idOf(program._id), program]));
  return new Map(cohorts.map((cohort) => {
    const cohortId = idOf(cohort._id);
    const programId = idOf(cohort.programId);
    const program = programId ? programById.get(programId) : null;
    const programName = program?.name || cohort.courseName || '';
    return [cohortId, {
      cohort,
      programKey: programId || `legacy:${programName || cohort.classCode}`,
      programLabel: programName || cohort.classCode,
      policy: { ...DEFAULT_POLICY, ...(program?.completionPolicy || {}) },
    }];
  }));
};
const indexMembership = ({ cohorts, schedules, enrollments }) => {
  const cohortIds = cohorts.map((cohort) => idOf(cohort._id));
  const learnersByCohort = new Map(cohortIds.map((id) => [id, new Set()]));
  const sessionCountByCohort = new Map(cohortIds.map((id) => [id, 0]));
  const scheduleIdToCohort = new Map();
  for (const schedule of schedules) {
    const cohortId = idOf(schedule.classId);
    scheduleIdToCohort.set(idOf(schedule._id), cohortId);
    sessionCountByCohort.set(cohortId, (sessionCountByCohort.get(cohortId) || 0) + 1);
    for (const userId of schedule.enrolledUsers || []) {
      learnersByCohort.get(cohortId)?.add(idOf(userId));
    }
  }

  for (const enrollment of enrollments) {
    learnersByCohort.get(idOf(enrollment.classId))?.add(idOf(enrollment.userId));
  }
  return { learnersByCohort, sessionCountByCohort, scheduleIdToCohort };
};
const buildEvidenceSets = async ({ cohortIds, userIds, scheduleIds, scheduleIdToCohort }) => {
  const [attendances, evaluations, feedbacks, attempts, certificates] = await Promise.all([
    repository.listAttendedAttendance({ scheduleIds, userIds }),
    repository.listEvaluations({ cohortIds, userIds }),
    repository.listFeedbackSubmissions({ cohortIds, userIds }),
    repository.listPassingAttempts({ cohortIds, userIds }),
    repository.listIssuedCertificates({ cohortIds, userIds }),
  ]);
  const attendanceCount = new Map();
  for (const attendance of attendances) {
    const cohortId = scheduleIdToCohort.get(idOf(attendance.scheduleId));
    if (!cohortId) continue;
    const key = evidenceKey(cohortId, attendance.userId);
    attendanceCount.set(key, (attendanceCount.get(key) || 0) + 1);
  }
  return {
    attendanceCount,
    evaluations: new Set(evaluations.map((row) => evidenceKey(row.classId, row.userId))),
    feedbacks: new Set(feedbacks.map((row) => evidenceKey(row.cohortId, row.userId))),
    attempts: new Set(attempts.map((row) => evidenceKey(row.cohortId, row.userId))),
    certificates: new Set(certificates.map((row) => evidenceKey(row.cohortId, row.userId))),
  };
};
const evaluateLearner = ({ key, totalSessions, policy, evidence }) => {
  const attendedSessions = evidence.attendanceCount.get(key) || 0;
  const attendancePercent = totalSessions > 0
    ? round2((attendedSessions / totalSessions) * 100)
    : 0;
  const attendanceMet = attendancePercent >= (policy.attendanceThresholdPercent || 0);
  const assessmentMet = !policy.requiresAssessment ||
    evidence.evaluations.has(key) ||
    evidence.attempts.has(key);
  const feedbackMet = !policy.requiresFeedback || evidence.feedbacks.has(key);
  return attendanceMet && assessmentMet && feedbackMet;
};
const buildCompletionRollup = async (actor) => {
  const cohorts = await repository.listActiveCohorts(await classScopeForActor(actor));
  if (!cohorts.length) {
    return {
      summary: {
        cohorts: 0,
        learners: 0,
        complete: 0,
        completionRate: 0,
        certificatesIssued: 0,
      },
      programs: [],
      departments: [],
    };
  }
  const cohortIds = cohorts.map((cohort) => idOf(cohort._id));
  const [cohortMeta, schedules, enrollments] = await Promise.all([
    buildCohortMeta(cohorts),
    repository.listCohortSchedules(cohortIds),
    repository.listCohortEnrollments(cohortIds),
  ]);
  const { learnersByCohort, sessionCountByCohort, scheduleIdToCohort } = indexMembership({
    cohorts,
    schedules,
    enrollments,
  });
  const allLearnerIds = [...new Set([...learnersByCohort.values()].flatMap((set) => [...set]))];
  const users = await repository.findUsers(allLearnerIds);
  const userById = new Map(users.map((user) => [idOf(user._id), user]));
  const activeLearnerIds = [...userById.keys()];
  const evidence = await buildEvidenceSets({
    cohortIds,
    userIds: activeLearnerIds,
    scheduleIds: schedules.map((schedule) => schedule._id),
    scheduleIdToCohort,
  });

  const programs = new Map();
  const departments = new Map();
  const summary = {
    cohorts: cohorts.length,
    learners: 0,
    complete: 0,
    completionRate: 0,
    certificatesIssued: 0,
  };
  for (const cohort of cohorts) {
    const cohortId = idOf(cohort._id);
    const meta = cohortMeta.get(cohortId);
    const totalSessions = sessionCountByCohort.get(cohortId) || 0;
    const learners = [...(learnersByCohort.get(cohortId) || [])].filter((id) => userById.has(id));
    const cohortMetrics = { cohorts: 1, learners: learners.length, complete: 0, certificatesIssued: 0 };
    const departmentMetrics = new Map();

    for (const userId of learners) {
      const key = evidenceKey(cohortId, userId);
      const complete = evaluateLearner({ key, totalSessions, policy: meta.policy, evidence });
      const certificateIssued = evidence.certificates.has(key);
      const department = userById.get(userId)?.department || 'Unassigned';
      const dept = departmentMetrics.get(department) || {
        cohorts: 1, learners: 0, complete: 0, certificatesIssued: 0,
      };
      cohortMetrics.complete += complete ? 1 : 0;
      cohortMetrics.certificatesIssued += certificateIssued ? 1 : 0;
      dept.learners += 1;
      dept.complete += complete ? 1 : 0;
      dept.certificatesIssued += certificateIssued ? 1 : 0;
      departmentMetrics.set(department, dept);
    }
    addMetrics(programs, meta.programKey, meta.programLabel, cohortMetrics);
    for (const [department, metrics] of departmentMetrics.entries()) {
      addMetrics(departments, department, department, metrics);
    }

    summary.learners += cohortMetrics.learners;
    summary.complete += cohortMetrics.complete;
    summary.certificatesIssued += cohortMetrics.certificatesIssued;
  }
  summary.completionRate = summary.learners > 0
    ? round2((summary.complete / summary.learners) * 100)
    : 0;

  const sortByLabel = (a, b) => a.label.localeCompare(b.label);
  return {
    summary,
    programs: [...programs.values()].sort(sortByLabel),
    departments: [...departments.values()].sort(sortByLabel),
  };
};
module.exports = { buildCompletionRollup };
