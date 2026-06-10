const { z } = require('zod');
const { objectId } = require('../../schemas/common');

// ── Create Team ─────────────────────────────────────────
const createTeamBody = z.object({
  name: z.string().trim().min(1, 'Team name is required'),
  leaderId: objectId.nullable().optional(),
  classId: objectId.nullable().optional(),
  members: z.array(objectId).optional().default([]),
  forceSwap: z.boolean().optional(),
});

// ── Update Team ─────────────────────────────────────────
const updateTeamBody = z.object({
  name: z.string().trim().min(1).optional(),
  leaderId: objectId.optional(),
  classId: z.union([objectId, z.literal(''), z.null()]).optional(),
  members: z.array(objectId).optional(),
  forceSwap: z.boolean().optional(),
}).refine(data => Object.keys(data).filter(k => k !== 'forceSwap').length > 0, {
  message: 'At least one field is required',
});

module.exports = { createTeamBody, updateTeamBody };
