const { z } = require('zod');

// Zod validation for the branding designer (TMS.update gap #5).

// Hex color (#rgb or #rrggbb). Logo accepts an http(s) URL or a data: URI.
const hexColor = z.string().trim().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a hex color like #3b6fe0');
const logoUrl = z.string().trim().max(20000).refine(
  (v) => v === '' || /^(https?:\/\/|data:image\/)/.test(v),
  { message: 'Logo must be an http(s) URL or a data:image URI' },
);

const updateBody = z.object({
  orgName: z.string().trim().min(1).max(80).optional(),
  accentColor: hexColor.optional(),
  logoUrl: logoUrl.optional(),
  certificateTitle: z.string().trim().min(1).max(120).optional(),
  emailSignature: z.string().trim().max(200).optional(),
}).refine((b) => Object.keys(b).length > 0, { message: 'At least one field is required' });

module.exports = { updateBody };
