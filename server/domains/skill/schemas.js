const { z } = require('zod');
const { objectId } = require('../../schemas/common');

// Zod request validation for the skill domain (TMS.update gap #4).

// targetByRole: { roleKey: level }. Levels are clamped to a sane 1..10 ceiling
// (skill.maxLevel further constrains the meaningful range in the UI). 0 / absent
// = not required for that role — callers omit a role or send 0.
const targetByRole = z.record(z.string().trim().min(1).max(40), z.coerce.number().int().min(0).max(10));

const createBody = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(40).optional().default('General'),
  parentId: objectId.nullable().optional(),
  hue: z.coerce.number().int().min(0).max(360).optional().default(250),
  programIds: z.array(objectId).max(100).optional().default([]),
  maxLevel: z.coerce.number().int().min(1).max(10).optional().default(5),
  targetByRole: targetByRole.optional().default({}),
  coverageTarget: z.coerce.number().int().min(1).max(1000000).nullable().optional().default(null),
});

const updateBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  category: z.string().trim().min(1).max(40).optional(),
  parentId: objectId.nullable().optional(),
  hue: z.coerce.number().int().min(0).max(360).optional(),
  programIds: z.array(objectId).max(100).optional(),
  maxLevel: z.coerce.number().int().min(1).max(10).optional(),
  targetByRole: targetByRole.optional(),
  coverageTarget: z.coerce.number().int().min(1).max(1000000).nullable().optional(),
}).refine((b) => Object.keys(b).length > 0, { message: 'At least one field is required' });

const learnerParams = z.object({ userId: objectId });

module.exports = { createBody, updateBody, learnerParams };
