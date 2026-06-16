const { z } = require('zod');
const { objectId } = require('../../schemas/common');

// ──────────────────────────────────────────────────────────
// finance/schemas — zod request validation for A1 (budget & cost).
// Money is integer MINOR units. `currency` is optional on write (defaults to
// the tenant currency server-side); when supplied it must match (enforced in
// use-cases, not here, so the error message can name the tenant currency).
// ──────────────────────────────────────────────────────────

const currency = z.string().regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter ISO code')
  .transform((s) => s.toUpperCase());

const amountMinor = z.coerce.number().int('amountMinor must be an integer').min(0, 'amountMinor must be ≥ 0');

const fiscalYear = z.string().regex(/^\d{4}$/, 'fiscalYear must be a 4-digit year, e.g. "2026"');

const COST_TYPES = ['trainer', 'venue', 'material', 'vendor', 'travel', 'other'];

const costScope = z.object({
  programId: objectId.optional(),
  cohortId: objectId.optional(),
  sessionId: objectId.optional(),
  departmentId: objectId.optional(),
  vendorId: objectId.optional(),
}).strict();

const createCostEntryBody = z.object({
  scope: costScope.optional(),
  type: z.enum(COST_TYPES).optional(),
  amountMinor,
  currency: currency.optional(),
  incurredOn: z.coerce.date(),
  poRef: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
});

const updateCostEntryBody = z.object({
  scope: costScope.optional(),
  type: z.enum(COST_TYPES).optional(),
  amountMinor: amountMinor.optional(),
  currency: currency.optional(),
  incurredOn: z.coerce.date().optional(),
  poRef: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
});

const createBudgetBody = z.object({
  fiscalYear,
  departmentId: objectId.optional(),
  programId: objectId.optional(),
  amountMinor,
  currency: currency.optional(),
  label: z.string().max(120).optional(),
});

const updateBudgetBody = z.object({
  fiscalYear: fiscalYear.optional(),
  departmentId: objectId.optional(),
  programId: objectId.optional(),
  amountMinor: amountMinor.optional(),
  currency: currency.optional(),
  label: z.string().max(120).optional(),
});

const costRollupQuery = z.object({
  by: z.enum(['program', 'department', 'cohort', 'vendor', 'type']).optional(),
  fiscalYear: fiscalYear.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const budgetVarianceQuery = z.object({
  fiscalYear,
  departmentId: objectId.optional(),
});

const budgetListQuery = z.object({
  fiscalYear: fiscalYear.optional(),
  departmentId: objectId.optional(),
});

const costListQuery = z.object({
  programId: objectId.optional(),
  departmentId: objectId.optional(),
  cohortId: objectId.optional(),
  type: z.enum(COST_TYPES).optional(),
  fiscalYear: fiscalYear.optional(),
});

module.exports = {
  createCostEntryBody,
  updateCostEntryBody,
  createBudgetBody,
  updateBudgetBody,
  costRollupQuery,
  budgetVarianceQuery,
  costListQuery,
  budgetListQuery,
};
