const { z } = require('zod');
const { ALL_CAPABILITIES } = require('../../policy/capabilities');

// zod request schemas for the roles domain (TMS.update gap #2). Capability ids
// are validated against the canonical set so a typo can't grant nothing/noise.
const capId = z.string().refine((c) => ALL_CAPABILITIES.includes(c), { message: 'Unknown capability id' });
const roleKey = z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'Role key must start with a letter (A-Z, 0-9, _, -)').max(40);

const createRoleBody = z.object({
  key: roleKey,
  name: z.string().trim().min(1).max(60),
  capabilities: z.array(capId).max(ALL_CAPABILITIES.length).optional().default([]),
});

const updateRoleBody = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  capabilities: z.array(capId).max(ALL_CAPABILITIES.length).optional(),
}).refine((b) => b.name !== undefined || b.capabilities !== undefined, { message: 'Provide name and/or capabilities' });

const keyParam = z.object({ key: roleKey });

module.exports = { createRoleBody, updateRoleBody, keyParam };
