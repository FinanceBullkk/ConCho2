const { z } = require('zod');
const { objectId } = require('./common');

// ── Evaluation ────────────────────────────────────────────
// Matches the controller (upsertEvaluation) + model (Evaluation.js).
// Each score is 0–10 (inclusive). Empty/optional fields are allowed
// because the controller is an upsert — partial updates are valid.
const score10 = z.coerce.number().min(0).max(10);

const upsertEvaluationBody = z.object({
  userId: objectId,
  classId: objectId,
  level: z.string().trim().max(120).optional(),
  grammarScore: score10.optional(),
  vocabularyScore: score10.optional(),
  pronunciationScore: score10.optional(),
  fluencyScore: score10.optional(),
  teacherComment: z.string().trim().max(2000).optional(),
});

module.exports = { upsertEvaluationBody };
