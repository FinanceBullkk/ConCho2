const { z } = require('zod');

// zod request schemas for the Custom fields domain. The "select needs options"
// rule is enforced in use-cases (after merging update payloads), so these stay
// shape-only.

const entity = z.enum(['Program']);
const type = z.enum(['text', 'select']);
const key = z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]*$/, 'Key must be a snake_case identifier').max(40);

const createBody = z.object({
  entity: entity.default('Program'),
  key,
  label: z.string().trim().min(1).max(80),
  type: type.default('text'),
  options: z.array(z.string().trim().min(1).max(60)).max(50).optional().default([]),
  required: z.boolean().optional().default(false),
  order: z.coerce.number().int().min(0).max(1000).optional().default(0),
});

const updateBody = createBody.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required' },
);

const listQuery = z.object({ entity: entity.optional() });

module.exports = { createBody, updateBody, listQuery };
