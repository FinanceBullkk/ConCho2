const { z } = require('zod');

// ──────────────────────────────────────────────────────────
// mobile/schemas — zod validation for B5 (mobile learning surface, H2).
// ──────────────────────────────────────────────────────────

const subscribeBody = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
  userAgent: z.string().max(500).optional(),
});

const unsubscribeBody = z.object({
  endpoint: z.string().url().max(2000),
});

module.exports = { subscribeBody, unsubscribeBody };
