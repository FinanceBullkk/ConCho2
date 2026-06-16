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

// A5 part 2 — evidence pack window (drives both hours + compliance sheets).
const evidencePackQuery = z.object({
  from: isoDateOnly.optional(),
  to: isoDateOnly.optional(),
  departmentId: objectId.optional(),
}).refine(
  (q) => !q.from || !q.to || q.from <= q.to,
  { message: 'from must be before or equal to to', path: ['from'] },
);

// A5 part 2 — saved report presets.
const presetFilters = z.object({
  from: isoDateOnly.optional(),
  to: isoDateOnly.optional(),
  departmentId: objectId.optional(),
  role: z.string().max(40).optional(),
  programIds: z.array(objectId).max(100).optional(),
}).optional();

const presetBody = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['hours', 'compliance', 'evidence']).optional(),
  filters: presetFilters,
  schedule: z.enum(['none', 'monthly', 'quarterly']).optional(),
});

const presetUpdateBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  kind: z.enum(['hours', 'compliance', 'evidence']).optional(),
  filters: presetFilters,
  schedule: z.enum(['none', 'monthly', 'quarterly']).optional(),
}).refine((b) => Object.keys(b).length > 0, { message: 'At least one field is required' });

module.exports = {
  completionReportQuery,
  completionRollupQuery,
  complianceReportQuery,
  trainingHoursQuery,
  evidencePackQuery,
  presetBody,
  presetUpdateBody,
};
