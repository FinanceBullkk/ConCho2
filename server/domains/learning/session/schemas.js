const { z } = require('zod');
const { objectId, paginationQuery } = require('../../../schemas/common');

const listSessionsQuery = paginationQuery.extend({
  cohortId: objectId.optional(),
  classId: objectId.optional(),
  groupId: objectId.optional(),
  bookedTeamId: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const bookSessionBody = z.object({
  groupId: objectId,
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
});

module.exports = { listSessionsQuery, bookSessionBody };
