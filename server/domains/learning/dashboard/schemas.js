const { z } = require('zod');

// Query params arrive as strings; the use-case applies the 30-day default.
// Shared by the operational and executive bundles.
const operationalDashboardQuery = z.object({
  window: z.enum(['30', '60', '90']).optional(),
});

// L&D cost inputs (executive financials). Currency amounts are INTEGER minor
// units (e.g. VND has no minor unit → whole dong) to avoid float drift.
// coordinatorCount + automationHoursReclaimedPerWeek feed the Efficiency
// dividend (ROI §10): hours/wk × coordinators × 52 weeks × loaded hourly cost.
const costConfigBody = z.object({
  annualBudgetMinor: z.number().int().min(0),
  currency: z.string().trim().toUpperCase().length(3),
  avgLoadedHourlyCostMinor: z.number().int().min(0).nullable().optional().default(null),
  coordinatorCount: z.number().int().min(0).nullable().optional().default(null),
  automationHoursReclaimedPerWeek: z.number().min(0).nullable().optional().default(null),
});

module.exports = { operationalDashboardQuery, costConfigBody };
