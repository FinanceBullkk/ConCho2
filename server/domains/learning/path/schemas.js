const { z } = require('zod');
const { objectId } = require('../../../schemas/common');

const statusEnum = z.enum(['active', 'inactive', 'archived']);

// Ordered program references. Order is the sequence; the use-case de-duplicates.
const programs = z.array(objectId).max(50);

const code = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Code may contain only letters, digits, underscore, and hyphen');

const createPathBody = z.object({
  code,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  programs: programs.optional().default([]),
  status: statusEnum.default('active'),
});

// Code is immutable after creation (stable catalog identifier).
const updatePathBody = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(2000).optional(),
    programs: programs.optional(),
    status: statusEnum.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'No fields to update' });

const listPathsQuery = z.object({
  status: statusEnum.optional(),
  search: z.string().trim().max(120).optional(),
});

module.exports = { createPathBody, updatePathBody, listPathsQuery };
