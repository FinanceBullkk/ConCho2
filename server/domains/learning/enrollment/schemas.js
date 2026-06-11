const { z } = require('zod');
const { objectId } = require('../../../schemas/common');

// Enroll a learner into a cohort. userId optional: when omitted, the caller
// enrolls themselves (self-enrollment, gated by program scheduling mode).
const enrollBody = z.object({
  cohortId: objectId,
  userId: objectId.optional(),
});

const listEnrollmentsQuery = z.object({
  cohortId: objectId.optional(),
  learnerId: objectId.optional(),
});

module.exports = { enrollBody, listEnrollmentsQuery };
