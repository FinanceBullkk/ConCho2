const { z } = require('zod');

// POST /api/admin/reconcile/heal body.
// `check` must be present; whether it is *auto-healable* is decided in the
// use-case (returns 422 for non-safe checks, listing the safe set). `refs` is
// an optional filter — the server re-derives the real issues, so refs only
// narrows which of the current issues to fix.
const healBody = z.object({
  check: z.string().min(1, 'check is required'),
  refs: z.array(z.record(z.string(), z.any())).optional(),
});

module.exports = { healBody };
