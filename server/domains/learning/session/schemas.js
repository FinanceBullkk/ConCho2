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
// officeId → the physical Office for a coordinator-scheduled offline session
//   (re-center Phase 2). Optional at the schema layer (legacy/online + team
//   booking carry none); REQUIRED for the cohort flow, enforced in the use-case
//   so the rule lives next to the scheduler/mode checks.
const bookSessionBody = z
  .object({
    groupId: objectId.optional(),
    cohortId: objectId.optional(),
    officeId: objectId.optional(),
    // Optional physical Room (re-center Phase 3). Validated in-tx against the
    // session's Office (must match) + the per-room conflict lock.
    roomId: objectId.optional(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
  })
  .refine((body) => Boolean(body.groupId) !== Boolean(body.cohortId), {
    message: 'Provide exactly one of groupId (team booking) or cohortId (cohort booking)',
    path: ['groupId'],
  });

module.exports = { listSessionsQuery, bookSessionBody };
