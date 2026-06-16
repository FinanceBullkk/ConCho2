const { z } = require('zod');
const { objectId } = require('../../schemas/common');

// appliesTo.value carries the role name, departmentId, or officeId (string);
// required for everything except 'all'.
const appliesTo = z.object({
  type: z.enum(['role', 'department', 'office', 'all']),
  value: z.string().default(''),
}).refine((a) => a.type === 'all' || a.value.trim().length > 0, {
  message: 'appliesTo.value is required unless type is "all"', path: ['value'],
});

const target = z.object({
  kind: z.enum(['program', 'path']).default('program'),
  id: objectId,
});

const createRequirementBody = z.object({
  appliesTo,
  target,
  dueWithinDays: z.coerce.number().int().min(1).max(3650).optional(),
  recurrence: z.enum(['once', 'annual', 'biennial']).optional(),
  mandatory: z.boolean().optional(),
  label: z.string().max(120).optional(),
});

const updateRequirementBody = z.object({
  appliesTo: appliesTo.optional(),
  target: target.optional(),
  dueWithinDays: z.coerce.number().int().min(1).max(3650).optional(),
  recurrence: z.enum(['once', 'annual', 'biennial']).optional(),
  mandatory: z.boolean().optional(),
  label: z.string().max(120).optional(),
});

const matrixQuery = z.object({
  departmentId: objectId.optional(),
  role: z.string().optional(),
});

module.exports = { createRequirementBody, updateRequirementBody, matrixQuery };
