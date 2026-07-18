// English-training — request validation (zod). Phase 1 is read-only, so these
// guard path params + list query only.
const { z } = require('zod');

const idParams = z.object({ id: z.string().min(1) });
const empCodeParams = z.object({ empCode: z.string().min(1) });
const issueCodeParams = z.object({
  code: z.string().trim().min(1).max(100).regex(/^[a-z0-9_]+$/),
});
const listEmployeesQuery = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const employeeCorrectionBody = z.object({
  businessUnit: z.string().trim().min(1).max(100).optional(),
  jobRole: z.string().trim().min(1).max(100).optional(),
  reason: z.string().trim().min(3).max(500),
}).refine((value) => value.businessUnit !== undefined || value.jobRole !== undefined, {
  message: 'businessUnit or jobRole is required',
});

module.exports = {
  idParams, empCodeParams, issueCodeParams, listEmployeesQuery, employeeCorrectionBody,
};
