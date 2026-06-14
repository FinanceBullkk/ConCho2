const { z } = require('zod');

// Per-user notification delivery preferences (TMS.update S7). Categories map to
// the notification feed's filter groups; each carries in-app + email channels.
const CATEGORIES = ['overdue', 'certificates', 'completions', 'assignments', 'system'];

// Server defaults — applied on read when the user has not customised, and as the
// base that a partial PUT merges over. Mirrors the prototype's initial toggles.
const DEFAULT_PREFERENCES = {
  categories: {
    overdue: { inApp: true, email: true },
    certificates: { inApp: true, email: true },
    completions: { inApp: true, email: false },
    assignments: { inApp: true, email: true },
    system: { inApp: false, email: false },
  },
  digest: 'daily',
};

const channelPref = z.object({ inApp: z.boolean(), email: z.boolean() });

// String-keyed record (zod's enum-keyed record demands ALL keys); we accept a
// PARTIAL categories patch and reject any unknown category key via refine.
const preferencesBody = z.object({
  categories: z.record(z.string(), channelPref)
    .refine((obj) => Object.keys(obj).every((k) => CATEGORIES.includes(k)), { message: 'Unknown notification category' })
    .optional(),
  digest: z.enum(['daily', 'weekly', 'off']).optional(),
}).refine((b) => b.categories || b.digest, { message: 'Provide categories and/or digest' });

// Deep-merge stored preferences over the server defaults so a read always
// returns a complete, well-formed object even after schema growth.
const mergePreferences = (stored) => ({
  categories: { ...DEFAULT_PREFERENCES.categories, ...(stored?.categories || {}) },
  digest: stored?.digest || DEFAULT_PREFERENCES.digest,
});

module.exports = { preferencesBody, CATEGORIES, DEFAULT_PREFERENCES, mergePreferences };
