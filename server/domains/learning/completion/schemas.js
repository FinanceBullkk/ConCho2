const { z } = require('zod');
const { objectId } = require('../../../schemas/common');

// Completion status for a learner in a cohort. learnerId optional (Admin/Teacher
// may target a learner; a Participant is forced to self in the use-case).
const completionQuery = z.object({
  cohortId: objectId,
  learnerId: objectId.optional(),
});

// Issue a certificate for a specific learner who has completed the cohort.
const issueCertificateBody = z.object({
  cohortId: objectId,
  userId: objectId,
});

const listCertificatesQuery = z.object({
  cohortId: objectId.optional(),
  learnerId: objectId.optional(),
});

const revokeCertificateBody = z.object({
  reason: z.string().trim().max(500).optional(),
});

// Public verification code (opaque hex token).
const verifyCertificateParams = z.object({
  code: z.string().trim().min(8).max(128),
});

module.exports = {
  completionQuery,
  issueCertificateBody,
  listCertificatesQuery,
  revokeCertificateBody,
  verifyCertificateParams,
};
