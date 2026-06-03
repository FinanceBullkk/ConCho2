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

module.exports = { buildCompletionReport };
