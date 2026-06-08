const repository = require('./repository');
const completionUseCases = require('../completion/use-cases');
const { ServiceError } = require('../../../helpers/ServiceError');
const { isTeacherOfClass } = require('../../../policy/classBinding');
const { deriveCertificateState } = require('./compliance-certificate-state');
const { buildCompletionRollup } = require('./completion-rollup-use-case');

const round2 = (n) => Math.round(n * 100) / 100;

const assertCanReadCohortReport = (actor, cohort) => {
  if (actor?.role !== 'Teacher') return;
  const decision = isTeacherOfClass(actor, cohort);
  if (!decision.allowed) {
    throw new ServiceError('You are not permitted to read reports for this cohort', 403);
  }
};

// Build a cohort completion report: per-learner completion breakdown (reusing
// the completion engine) + certificate status, with a rolled-up summary.
// Read-only; never mutates.
const buildCompletionReport = async (cohortId, actor) => {
  const cohort = await repository.findCohort(cohortId);
  if (!cohort || cohort.isDeleted) {
    throw new ServiceError('Cohort not found', 404);
  }
  assertCanReadCohortReport(actor, cohort);

  const [programName, learnerIds, certificates] = await Promise.all([
    repository.findProgramName(cohort.programId),
    repository.listCohortLearnerIds(cohortId),
    repository.listCohortCertificates(cohortId),
  ]);

  const users = await repository.findUsers(learnerIds);
  const userById = new Map(users.map((u) => [u._id.toString(), u]));
  const certByUser = new Map(certificates.map((c) => [c.userId.toString(), c]));

  // QB-009: the completion rate must reflect active learners only. findUsers
  // (User.find) auto-excludes soft-deleted users, so any learnerId missing from
  // userById is an offboarded (soft-deleted) — or otherwise non-resolvable —
  // learner. Drop it instead of emitting a blank row that inflates the
  // denominator (total) and skews completionRate downward.
  const activeLearnerIds = learnerIds.filter((id) => userById.has(id));

  const rows = await Promise.all(
    activeLearnerIds.map(async (learnerId) => {
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
          ? {
            number: cert.certificateNumber,
            status: cert.status,
            issuedAt: cert.issuedAt,
            validFrom: cert.validFrom,
            validUntil: cert.validUntil,
            validityDays: cert.validityDays ?? null,
            state: deriveCertificateState(cert),
          }
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

module.exports = { buildCompletionReport, buildCompletionRollup };
