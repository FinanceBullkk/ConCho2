const { z } = require('zod');
const { objectId } = require('./common');

// ── Evaluation ────────────────────────────────────────────
const upsertEvaluationBody = z.object({
  userId: objectId,
  classId: objectId,
  scheduleId: objectId.optional(),
  score: z.coerce.number().min(0).max(100).optional(),
  feedback: z.string().max(2000).optional(),
  criteria: z.record(z.coerce.number().min(0).max(10)).optional(),
});

module.exports = { upsertEvaluationBody };
