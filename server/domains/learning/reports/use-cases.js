const repository = require('./repository');
const completionUseCases = require('../completion/use-cases');
const { ServiceError } = require('../../../helpers/ServiceError');

const round2 = (n) => Math.round(n * 100) / 100;

// Build a cohort completion report: per-learner completion breakdown (reusing
// the completion engine) + certificate status, with a rolled-up summary.
// Read-only; never mutates.
const buildCompletionReport = async (cohortId) => {
  const cohort = await repository.findCohort(cohortId);
  if (!cohort || cohort.isDeleted) {
    throw new ServiceError('Cohort not found', 404);
  }

  const [programName, learnerIds, certificates] = await Promise.all([
    repository.findProgramName(cohort.programId),
    repository.listCohortLearnerIds(cohortId),
    repository.listCohortCertificates(cohortId),
  ]);

  const users = await repository.findUsers(learnerIds);
  const userById = new Map(users.map((u) => [u._id.toString(), u]));
  const certByUser = new Map(certificates.map((c) => [c.userId.toString(), c]));

  const rows = await Promise.all(
    learnerIds.map(async (learnerId) => {
      const completion = await completionUseCases.evaluateCompletion(cohortId, learnerId);
      const user = userById.get(learnerId);
      const cert = certByUser.get(learnerId);
      return {
        learner: {
          id: learnerId,
          empCode: user?.empCode || '',
          name: user?.name || '',
          department: user?.department || '',
        },
        attendancePercent: completion.attendance.percent,
        attendanceMet: completion.attendance.met,
        assessmentRequired: completion.assessment.required,
        assessmentMet: completion.assessment.met,
        feedbackRequired: completion.feedback.required,
        feedbackMet: completion.feedback.met,
        complete: completion.complete,
        certificate: cert
          ? { number: cert.certificateNumber, status: cert.status }
          : null,
      };
    }),
  );

  rows.sort((a, b) => a.learner.name.localeCompare(b.learner.name));

  const total = rows.length;
  const completeCount = rows.filter((r) => r.complete).length;
  const certificatesIssued = rows.filter((r) => r.certificate && r.certificate.status === 'Issued').length;

  return {
    cohort: {
      id: cohort._id,
      code: cohort.classCode,
      programId: cohort.programId || null,
      programName: programName || cohort.courseName || '',
    },
    summary: {
      total,
      complete: completeCount,
      completionRate: total > 0 ? round2((completeCount / total) * 100) : 0,
      certificatesIssued,
    },
    rows,
  };
};

const emptyRollupRow = (key, label) => ({
  key,
  label,
  cohorts: 0,
  learners: 0,
  complete: 0,
  completionRate: 0,
  certificatesIssued: 0,
});

const addToRollup = (map, key, label, report, rowFilter = () => true) => {
  const row = map.get(key) || emptyRollupRow(key, label);
  const rows = report.rows.filter(rowFilter);
  row.cohorts += 1;
  row.learners += rows.length;
  row.complete += rows.filter((r) => r.complete).length;
  row.certificatesIssued += rows.filter((r) => r.certificate?.status === 'Issued').length;
  row.completionRate = row.learners > 0 ? round2((row.complete / row.learners) * 100) : 0;
  map.set(key, row);
};

const buildCompletionRollup = async () => {
  const cohorts = await repository.listActiveCohorts();
  const reports = await Promise.all(cohorts.map((cohort) => buildCompletionReport(cohort._id)));
  const programs = new Map();
  const departments = new Map();

  reports.forEach((report) => {
    const programKey = report.cohort.programId
      ? report.cohort.programId.toString()
      : `legacy:${report.cohort.programName || report.cohort.code}`;
    addToRollup(programs, programKey, report.cohort.programName || report.cohort.code, report);

    const departmentNames = new Set(report.rows.map((r) => r.learner.department || 'Unassigned'));
    departmentNames.forEach((department) => {
      addToRollup(
        departments,
        department,
        department,
        report,
        (r) => (r.learner.department || 'Unassigned') === department,
      );
    });
  });

  const sortByLabel = (a, b) => a.label.localeCompare(b.label);
  const learners = reports.reduce((sum, report) => sum + report.summary.total, 0);
  const complete = reports.reduce((sum, report) => sum + report.summary.complete, 0);

  return {
    summary: {
      cohorts: reports.length,
      learners,
      complete,
      completionRate: learners > 0 ? round2((complete / learners) * 100) : 0,
      certificatesIssued: reports.reduce((sum, report) => sum + report.summary.certificatesIssued, 0),
    },
    programs: [...programs.values()].sort(sortByLabel),
    departments: [...departments.values()].sort(sortByLabel),
  };
};

module.exports = { buildCompletionReport, buildCompletionRollup };
