const { z } = require('zod');

// Query params arrive as strings; the use-case applies the 30-day default.
const operationalDashboardQuery = z.object({
  window: z.enum(['30', '60', '90']).optional(),
});

module.exports = { operationalDashboardQuery };
