const { z } = require('zod');
const { objectId, paginationQuery } = require('./common');

// ──────────────────────────────────────────────────────────
// Enrollment Zod schemas (audit PR E — SEC-011)
// ──────────────────────────────────────────────────────────
// Previously enrollmentRoutes had NO Zod validation, so:
//   - bulk endpoints accepted unbounded `enrollmentIds` arrays
//     (DoS surface — admin could fan out a 100k-element write)
//   - `note` was unbounded — possible log/UI bloat
//   - mass-assignment surface on PUT was wide open
// Each route below now has a strict schema; unknown fields are
// stripped and oversize arrays are rejected at 400 before the
// controller runs.
// ──────────────────────────────────────────────────────────

const ENROLLMENT_STATUS = ['Active', 'On-hold', 'Completed', 'Dropped', 'Transferred'];
const MAX_BULK_IDS = 200; // bulk endpoints process this many ids per call

// GET /api/enrollments?teamId=&userId=&classId=&status=
const listEnrollmentsQuery = paginationQuery.extend({
  teamId:  objectId.optional(),
  userId:  objectId.optional(),
  classId: objectId.optional(),
  status:  z.enum(ENROLLMENT_STATUS).optional(),
}).strict();

// PUT /api/enrollments/:id
const updateEnrollmentBody = z.object({
  status: z.enum(ENROLLMENT_STATUS).optional(),
  note:   z.string().trim().max(1000).optional(),
}).strict();

// POST /api/enrollments/:id/transfer
const transferEnrollmentBody = z.object({
  toTeamId: objectId,
  note:     z.string().trim().max(1000).optional(),
}).strict();

// POST /api/enrollments/check-conflicts
// Controller signature: { teamId?, memberIds[] }
const checkConflictsBody = z.object({
  teamId:    objectId.optional(),
  memberIds: z.array(objectId).min(1).max(MAX_BULK_IDS),
}).strict();

// PATCH /api/enrollments/bulk-status
const bulkStatusBody = z.object({
  enrollmentIds: z.array(objectId).min(1).max(MAX_BULK_IDS),
  status:        z.enum(ENROLLMENT_STATUS),
  note:          z.string().trim().max(1000).optional(),
}).strict();

// POST /api/enrollments/bulk-transfer
const bulkTransferBody = z.object({
  enrollmentIds: z.array(objectId).min(1).max(MAX_BULK_IDS),
  toTeamId:      objectId,
  note:          z.string().trim().max(1000).optional(),
}).strict();

module.exports = {
  listEnrollmentsQuery,
  updateEnrollmentBody,
  transferEnrollmentBody,
  checkConflictsBody,
  bulkStatusBody,
  bulkTransferBody,
  MAX_BULK_IDS,
};
