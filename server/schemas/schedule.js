const { z } = require('zod');
const { objectId, paginationQuery } = require('./common');

const timeSlot = z
  .string()
  .trim()
  .regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/, 'timeSlot must be HH:MM-HH:MM');

const fields = {
  classId: objectId,
  date: z.coerce.date(),
  timeSlot,
  teacherId: objectId,
  roomLink: z.string().trim().max(500),
  capacity: z.coerce.number().int().min(1).max(1000),
};

const createScheduleBody = z.object({
  classId: fields.classId,
  date: fields.date,
  timeSlot: fields.timeSlot,
  teacherId: fields.teacherId,
  roomLink: fields.roomLink.optional(),
  capacity: fields.capacity.optional(),
});

const updateScheduleBody = z.object({
  classId: fields.classId.optional(),
  date: fields.date.optional(),
  timeSlot: fields.timeSlot.optional(),
  teacherId: fields.teacherId.optional(),
  roomLink: fields.roomLink.optional(),
  capacity: fields.capacity.optional(),
});

const listSchedulesQuery = paginationQuery.extend({
  classId: objectId.optional(),
  teacherId: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const availabilityQuery = z.object({
  classId: objectId.optional(),
});

const bookTeamBody = z.object({ teamId: objectId });

module.exports = {
  createScheduleBody,
  updateScheduleBody,
  listSchedulesQuery,
  availabilityQuery,
  bookTeamBody,
};
