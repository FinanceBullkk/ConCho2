const { z } = require('zod');
const { objectId } = require('../../schemas/common');

// ──────────────────────────────────────────────────────────
// trainer/schemas — zod request validation for A6 (trainer-management, H2).
// ──────────────────────────────────────────────────────────

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be HH:MM (24h)');

const availability = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  from: hhmm.optional(),
  to: hhmm.optional(),
}).strict();

// Upsert a trainer's profile. userId is the path param; the body carries the
// editable fields. All optional so a PUT can patch just qualifications.
const upsertProfileBody = z.object({
  canDeliver: z.array(objectId).max(200).optional(),
  availability: z.array(availability).max(21).optional(),
  note: z.string().max(1000).optional(),
  status: z.enum(['active', 'archived']).optional(),
});

const ratingBody = z.object({
  value: z.coerce.number().int().min(1, 'rating must be 1–5').max(5, 'rating must be 1–5'),
  note: z.string().max(500).optional(),
});

const listTrainersQuery = z.object({
  qualifiedFor: objectId.optional(),       // program id — only trainers who can deliver it
  at: z.coerce.date().optional(),          // a slot start — pair with `atEnd` to filter to free trainers
  atEnd: z.coerce.date().optional(),
  status: z.enum(['active', 'archived']).optional(),
  includeCandidates: z.coerce.boolean().optional(), // also return Teacher/Admin users with no profile yet
});

const loadQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const userIdParam = z.object({ userId: objectId });

module.exports = {
  upsertProfileBody,
  ratingBody,
  listTrainersQuery,
  loadQuery,
  userIdParam,
};
