const crypto = require('crypto');
const repository = require('./repository');
const { ServiceError } = require('../../../helpers/ServiceError');
const { getNextSequence } = require('../../../helpers/counter');

const sameId = (a, b) => a && b && a.toString() === b.toString();
const round2 = (n) => Math.round(n * 100) / 100;

// Evaluate a learner's completion of a cohort against its program's
// completionPolicy. Pure read — never mutates. Returns the per-dimension
// breakdown plus an overall `complete` flag.
const evaluateCompletion = async (cohortId, userId) => {
  const cohort = await repository.findCohort(cohortId);
  if (!cohort || cohort.isDeleted) {
    throw new ServiceError('Cohort not found', 404);
  }

  const { policy, programId, programName } = await repository.resolveCompletionContext(cohort);

  const [totalSessions, attendedSessions, evaluation, feedback, passingAttempt] = await Promise.all([
    repository.countCohortSessions(cohortId),
    repository.countAttendedSessions(cohortId, userId),
    repository.findEvaluation(cohortId, userId),
    repository.findFeedback(cohortId, userId),
    repository.findPassingAttempt(cohortId, userId),
  ]);

  const attendancePercent = totalSessions > 0
    ? round2((attendedSessions / totalSessions) * 100)
    : 0;
  const attendanceMet = attendancePercent >= (policy.attendanceThresholdPercent || 0);

  // Assessment satisfied by the legacy 4-skill Evaluation OR a passing attempt
  // from the generic assessment engine.
  const assessmentMet = !policy.requiresAssessment || Boolean(evaluation) || Boolean(passingAttempt);
  const averageScore = evaluation ? evaluation.averageScore : null;

  // A required-feedback policy is satisfied once the learner submits feedback.
  const feedbackSubmitted = Boolean(feedback);
  const feedbackMet = !policy.requiresFeedback || feedbackSubmitted;

  return {
    cohortId,
    userId,
    programId,
    programName,
    cohortCode: cohort.classCode,
    complete: attendanceMet && assessmentMet && feedbackMet,
    attendance: {
      attendedSessions,
      totalSessions,
      percent: attendancePercent,
      thresholdPercent: policy.attendanceThresholdPercent || 0,
      met: attendanceMet,
    },
    assessment: {
      required: Boolean(policy.requiresAssessment),
      met: assessmentMet,
      averageScore,
      attemptScorePercent: passingAttempt ? passingAttempt.scorePercent : null,
    },
    feedback: {
      required: Boolean(policy.requiresFeedback),
      met: feedbackMet,
      submitted: feedbackSubmitted,
      reason: policy.requiresFeedback && !feedbackSubmitted ? 'feedback-not-submitted' : undefined,
    },
  };
};

// Build a unique human serial: CERT-<year>-NNNNNN (atomic Counter).
const nextCertificateNumber = async () => {
  const seq = await getNextSequence('certificateNumber');
  return `CERT-${new Date().getFullYear()}-${String(seq).padStart(6, '0')}`;
};

// Issue a certificate for a learner who meets the cohort's completion policy.
// 422 when not complete, 409 when an active certificate already exists.
const issueCertificate = async ({ cohortId, userId }, actor) => {
  const completion = await evaluateCompletion(cohortId, userId);
  if (!completion.complete) {
    throw new ServiceError('Learner has not met the completion policy for this cohort', 422);
  }

  const existing = await repository.findActiveCertificate(userId, cohortId);
  if (existing) {
    throw new ServiceError('An active certificate already exists for this learner and cohort', 409);
  }

  const learner = await repository.findLearnerName(userId);
  const certificateNumber = await nextCertificateNumber();
  const verificationCode = crypto.randomBytes(16).toString('hex');

  return repository.createCertificate({
    certificateNumber,
    verificationCode,
    userId,
    cohortId,
    programId: completion.programId,
    learnerName: learner?.name || '',
    programName: completion.programName,
    cohortCode: completion.cohortCode,
    completionSnapshot: {
      attendancePercent: completion.attendance.percent,
      attendanceThresholdPercent: completion.attendance.thresholdPercent,
      assessmentRequired: completion.assessment.required,
      assessmentMet: completion.assessment.met,
      averageScore: completion.assessment.averageScore,
      feedbackRequired: completion.feedback.required,
      feedbackMet: completion.feedback.met,
    },
    issuedBy: actor?._id || null,
    issuedAt: new Date(),
    status: 'Issued',
  });
};

// Revoke (soft, lifecycle status) an issued certificate. Admin only at route.
const revokeCertificate = async (id, reason) => {
  const before = await repository.findCertificateById(id);
  if (!before) {
    throw new ServiceError('Certificate not found', 404);
  }
  if (before.status !== 'Issued') {
    throw new ServiceError('Certificate is not in an issued state', 409);
  }
  const after = await repository.markRevoked(id, reason);
  return { before, after };
};

const listCertificates = ({ cohortId, learnerId }, actor) => {
  const scopedLearner = actor.role === 'Participant' ? actor._id.toString() : learnerId;
  return repository.listCertificates({ cohortId, learnerId: scopedLearner });
};

// Participants may only ask about their own completion.
const getCompletion = ({ cohortId, learnerId }, actor) => {
  const targetId = actor.role === 'Participant' ? actor._id.toString() : (learnerId || actor._id.toString());
  if (actor.role === 'Participant' && learnerId && !sameId(learnerId, actor._id)) {
    throw new ServiceError('Not authorized to view another learner\'s completion', 403);
  }
  return evaluateCompletion(cohortId, targetId);
};

const verifyCertificate = (code) => repository.findByVerificationCode(code);

module.exports = {
  evaluateCompletion,
  getCompletion,
  issueCertificate,
  revokeCertificate,
  listCertificates,
  verifyCertificate,
};
