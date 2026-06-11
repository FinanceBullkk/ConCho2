const { z } = require('zod');
const { objectId } = require('../../../schemas/common');

const rating = z.coerce.number().int().min(1).max(5);

// Submit feedback for a cohort. userId optional (Admin may submit on behalf; a
// Participant is forced to self in the use-case).
const submitFeedbackBody = z.object({
  cohortId: objectId,
  userId: objectId.optional(),
  rating,
  contentRating: rating.optional(),
  instructorRating: rating.optional(),
  comment: z.string().trim().max(2000).optional(),
});

const listFeedbackQuery = z.object({
  cohortId: objectId.optional(),
  learnerId: objectId.optional(),
});

module.exports = { submitFeedbackBody, listFeedbackQuery };
