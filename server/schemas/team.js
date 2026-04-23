const { z } = require('zod');
const { objectId } = require('./common');

// ── Create Team ─────────────────────────────────────────
const createTeamBody = z.object({
  name: z.string().trim().min(1, 'Team name is required'),
  leaderId: objectId,
  classId: objectId.optional(),
  members: z.array(objectId).optional().default([]),
});

// ── Update Team ─────────────────────────────────────────
const updateTeamBody = z.object({
  name: z.string().trim().min(1).optional(),
  leaderId: objectId.optional(),
  classId: objectId.optional(),
  members: z.array(objectId).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field is required',
});

module.exports = { createTeamBody, updateTeamBody };
