const { z } = require('zod');

// Hex colour (#rgb or #rrggbb).
const hexColor = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'color must be a hex value');

const createSessionTypeBody = z.object({
  name: z.string().trim().min(1, 'name is required').max(60),
  color: hexColor.optional(),
  defaultDurationMin: z.coerce.number().int().min(1).max(1440).optional(),
  defaultCapacity: z.coerce.number().int().min(1).max(10000).nullable().optional(),
  order: z.coerce.number().int().min(0).optional(),
});

// Edit: every field optional; reuse the same validation.
const updateSessionTypeBody = createSessionTypeBody.partial();

module.exports = { createSessionTypeBody, updateSessionTypeBody };
