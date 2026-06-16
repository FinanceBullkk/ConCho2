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

// A5 (Modernization H1) — training-hours rollup. from/to default to last 90d.
const trainingHoursQuery = z.object({
  from: isoDateOnly.optional(),
  to: isoDateOnly.optional(),
  groupBy: z.enum(['user', 'department']).optional(),
  departmentId: objectId.optional(),
}).refine(
  (q) => !q.from || !q.to || q.from <= q.to,
  { message: 'from must be before or equal to to', path: ['from'] },
);

module.exports = { completionReportQuery, completionRollupQuery, complianceReportQuery, trainingHoursQuery };
