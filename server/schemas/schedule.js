const { z } = require('zod');
const { objectId, paginationQuery } = require('./common');

// ── Admin manual schedule creation ────────────────────────
const createScheduleBody = z.object({
  classId: objectId,
  bookedTeamId: objectId,
  officeId: objectId.optional(),
  // Physical room (re-center Phase 3) — validated in-tx against the session's
  // Office + the per-room conflict lock.
  roomId: objectId.optional(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  roomLink: z.string().trim().max(500).optional(),
  capacity: z.coerce.number().int().min(1).max(1000).optional(),
});

const updateScheduleBody = z.object({
  classId: objectId.optional(),
  bookedTeamId: objectId.optional(),
  // roomId: set/change a room, or null to clear it. Handled by updateSchedule
  // via the room lock (never the field whitelist) so the ledger stays atomic.
  roomId: objectId.nullable().optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  roomLink: z.string().trim().max(500).optional(),
  capacity: z.coerce.number().int().min(1).max(1000).optional(),
});

const listSchedulesQuery = paginationQuery.extend({
  classId: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  // Durable cancel (phase-04 slice A): lists are live-only by default;
  // staff may request cancelled history explicitly. (Participant scope
  // force-overrides to 'scheduled' in queries.listSchedules.)
  status: z.enum(['scheduled', 'cancelled', 'all']).optional(),
  // English-class separation: scheduling-world filter. team = leader_booking/
  // admin_scheduled + program-less legacy classes; cohort = self_enroll/
  // nomination. Ignored when classId is given (already world-scoped).
  mode: z.enum(['team', 'cohort']).optional(),
});

const availabilityQuery = z.object({
  classId: objectId.optional(),
});

// ── Leader booking (new flow) ─────────────────────────────
const bookTeamSlotBody = z.object({
  teamId: objectId,
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
});

// ── Durable cancel (Wave E3 phase-04, slice A) ────────────
// Optional free-text reason on the cancel/delete DELETE routes. The whole
// object is .optional(): a bare cancel without a JSON body parses as
// undefined and must keep working (existing clients send none).
const cancelScheduleBody = z
  .object({
    cancelReason: z.string().trim().max(500).optional(),
  })
  .optional();

// ── Trainers (re-center Phase 3, DELTA B) ─────────────────
// internalIds → internal trainers (User refs, UNION authz). [] clears them.
// externalTrainer → a lightweight external record (no User). null clears it.
// At least one of the two must be present.
const externalTrainerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  org: z.string().trim().max(120).nullable().optional(),
});

const setTrainersBody = z
  .object({
    internalIds: z
      .array(objectId)
      .max(3)
      .refine((ids) => new Set(ids.map(String)).size === ids.length, {
        message: 'internalIds must not contain duplicates',
      })
      .optional(),
    externalTrainer: externalTrainerSchema.nullable().optional(),
  })
  .refine((b) => b.internalIds !== undefined || b.externalTrainer !== undefined, {
    message: 'Provide internalIds and/or externalTrainer',
  });

module.exports = {
  createScheduleBody,
  updateScheduleBody,
  listSchedulesQuery,
  availabilityQuery,
  bookTeamSlotBody,
  cancelScheduleBody,
  setTrainersBody,
};
