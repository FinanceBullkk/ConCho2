const { z } = require('zod');
const { objectId, paginationQuery } = require('./common');

// ── Admin manual schedule creation ────────────────────────
const createScheduleBody = z.object({
  classId: objectId,
  bookedTeamId: objectId,
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  roomLink: z.string().trim().max(500).optional(),
  capacity: z.coerce.number().int().min(1).max(1000).optional(),
});

const updateScheduleBody = z.object({
  classId: objectId.optional(),
  bookedTeamId: objectId.optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  roomLink: z.string().trim().max(500).optional(),
  capacity: z.coerce.number().int().min(1).max(1000).optional(),
});

const listSchedulesQuery = paginationQuery.extend({
  classId: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
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

module.exports = {
  createScheduleBody,
  updateScheduleBody,
  listSchedulesQuery,
  availabilityQuery,
  bookTeamSlotBody,
};
