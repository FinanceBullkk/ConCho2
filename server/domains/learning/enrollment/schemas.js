const { z } = require('zod');
const { objectId } = require('../../../schemas/common');

// Enroll a learner into a cohort. userId optional: when omitted, the caller
// enrolls themselves (self-enrollment, gated by program scheduling mode).
const enrollBody = z.object({
  cohortId: objectId,
  userId: objectId.optional(),
  startSessionNumber: z.coerce.number().int().min(1).max(200).optional(),
});

const listEnrollmentsQuery = z.object({
  cohortId: objectId.optional(),
  learnerId: objectId.optional(),
});

// Bulk-enroll many learners into one cohort (Admin action). Capped at 500 ids
// per call (matches the list pagination hard cap) so one request can't snapshot
// an unbounded roster.
const bulkEnrollBody = z.object({
  cohortId: objectId,
  userIds: z.array(objectId).min(1).max(500),
  startSessionNumber: z.coerce.number().int().min(1).max(200).optional(),
});

module.exports = { enrollBody, listEnrollmentsQuery, bulkEnrollBody };
