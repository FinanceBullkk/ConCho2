const { z } = require('zod');
const { objectId } = require('../../schemas/common');

// ──────────────────────────────────────────────────────────
// room/schemas — zod request validation for the room domain.
// ──────────────────────────────────────────────────────────

const code = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Code may contain only letters, digits, underscore, and hyphen');

const createRoomBody = z.object({
  name: z.string().trim().min(1).max(120),
  code,
  officeId: objectId,
  seats: z.coerce.number().int().min(1).max(1000).optional(),
});

// Code is immutable after creation (stable room identifier). Office MAY be
// changed (a room can be re-homed) but only to another live office.
const updateRoomBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    officeId: objectId.optional(),
    seats: z.coerce.number().int().min(1).max(1000).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'No fields to update' });

const listRoomsQuery = z.object({
  officeId: objectId.optional(),
  search: z.string().trim().max(120).optional(),
});

module.exports = { createRoomBody, updateRoomBody, listRoomsQuery };
