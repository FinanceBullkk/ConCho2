const { z } = require('zod');
const { objectId } = require('../../../schemas/common');

// Completion report (and its export) is scoped to a single cohort.
const completionReportQuery = z.object({
  cohortId: objectId,
});

const completionRollupQuery = z.object({});

const assignmentStatus = z.enum(['not_started', 'in_progress', 'complete', 'overdue']);
const certificateState = z.enum(['issued', 'missing', 'revoked', 'expiring', 'expired']);
const isoDateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const complianceReportQuery = z.object({
  assignmentId: objectId.optional(),
  programId: objectId.optional(),
  departmentId: objectId.optional(),
  managerId: objectId.optional(),
  status: assignmentStatus.optional(),
  certificateState: certificateState.optional(),
  dueFrom: isoDateOnly.optional(),
  dueTo: isoDateOnly.optional(),
}).refine(
  (q) => !q.dueFrom || !q.dueTo || q.dueFrom <= q.dueTo,
  { message: 'dueFrom must be before or equal to dueTo', path: ['dueFrom'] },
);

module.exports = { completionReportQuery, completionRollupQuery, complianceReportQuery };
