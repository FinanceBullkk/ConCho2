// English-training — request validation (zod). Phase 1 is read-only, so these
// guard path params + list query only.
const { z } = require('zod');

const idParams = z.object({ id: z.string().min(1) });
const empCodeParams = z.object({ empCode: z.string().min(1) });
const listEmployeesQuery = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

module.exports = { idParams, empCodeParams, listEmployeesQuery };
