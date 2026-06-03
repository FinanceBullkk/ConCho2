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

// Book against exactly one target:
//   groupId  → team-based modes (leader_booking / admin_scheduled)
//   cohortId → cohort-based modes (self_enroll / nomination)
const bookSessionBody = z
  .object({
    groupId: objectId.optional(),
    cohortId: objectId.optional(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
  })
  .refine((body) => Boolean(body.groupId) !== Boolean(body.cohortId), {
    message: 'Provide exactly one of groupId (team booking) or cohortId (cohort booking)',
    path: ['groupId'],
  });

module.exports = { listSessionsQuery, bookSessionBody };
