const { z } = require('zod');
const { objectId } = require('../../schemas/common');

// ──────────────────────────────────────────────────────────
// planning/schemas — zod request validation for A4 (TNA → annual plan, H2).
// ──────────────────────────────────────────────────────────

const quarter = z.string().regex(/^\d{4}-Q[1-4]$/, 'must be YYYY-Qn, e.g. "2026-Q1"');
const fiscalYear = z.string().regex(/^\d{4}$/, 'fiscalYear must be a 4-digit year');
const target = z.object({ kind: z.enum(['program', 'skill']), id: objectId }).strict();

const createRequestBody = z.object({
  target,
  departmentId: objectId.optional(),
  headcount: z.coerce.number().int().min(1, 'headcount must be ≥ 1'),
  rationale: z.string().max(1000).optional(),
  priority: z.enum(['low', 'med', 'high']).optional(),
  targetQuarter: quarter,
});

const listRequestsQuery = z.object({
  status: z.enum(['submitted', 'in-review', 'approved', 'planned', 'rejected']).optional(),
  departmentId: objectId.optional(),
  targetKind: z.enum(['program', 'skill']).optional(),
  targetQuarter: quarter.optional(),
});

const statusBody = z.object({
  status: z.enum(['submitted', 'in-review', 'approved', 'planned', 'rejected']),
});

const demandQuery = z.object({
  by: z.enum(['program', 'skill', 'quarter', 'department']).optional(),
  fiscalYear: fiscalYear.optional(),
});

const planItem = z.object({
  target,
  quarter: quarter.optional(),
  demand: z.coerce.number().int().min(0).optional(),
  estCostMinor: z.coerce.number().int().min(0).optional(),
  cohortIds: z.array(objectId).optional(),
}).strict();

const upsertPlanBody = z.object({
  items: z.array(planItem).max(200),
});

const scheduleItemBody = z.object({
  classCode: z.string().trim().min(1).max(40),
  totalSessions: z.coerce.number().int().min(1, 'totalSessions must be ≥ 1'),
});

const fyParam = z.object({ fiscalYear });
const itemParams = z.object({ fiscalYear, itemId: objectId });

module.exports = {
  createRequestBody,
  listRequestsQuery,
  statusBody,
  demandQuery,
  upsertPlanBody,
  scheduleItemBody,
  fyParam,
  itemParams,
};
