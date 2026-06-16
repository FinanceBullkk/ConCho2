const { z } = require('zod');
const { objectId } = require('../../schemas/common');

// ──────────────────────────────────────────────────────────
// vendor/schemas — zod request validation for A2 (vendor management, H2).
// Money is integer MINOR units; per-contract currency (a foreign provider may
// bill in its own currency, unlike A1's single-tenant-currency cost entries).
// ──────────────────────────────────────────────────────────

const VENDOR_TYPES = ['provider', 'individual', 'platform'];

const currency = z.string().regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter ISO code')
  .transform((s) => s.toUpperCase());

const valueMinor = z.coerce.number().int('valueMinor must be an integer').min(0, 'valueMinor must be ≥ 0');

const contact = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(40).optional(),
  role: z.string().max(80).optional(),
}).strict();

const contract = z.object({
  ref: z.string().max(120).optional(),
  startsOn: z.coerce.date().optional(),
  endsOn: z.coerce.date().optional(),
  valueMinor: valueMinor.optional(),
  currency: currency.optional(),
  docUrl: z.string().max(500).optional(),
}).strict();

const createVendorBody = z.object({
  name: z.string().trim().min(1).max(160),
  type: z.enum(VENDOR_TYPES).optional(),
  contacts: z.array(contact).max(20).optional(),
  delivers: z.array(objectId).max(100).optional(),
  contracts: z.array(contract).max(50).optional(),
  note: z.string().max(1000).optional(),
  status: z.enum(['active', 'archived']).optional(),
});

const updateVendorBody = createVendorBody.partial();

const ratingBody = z.object({
  value: z.coerce.number().int().min(1, 'rating must be 1–5').max(5, 'rating must be 1–5'),
  note: z.string().max(500).optional(),
});

const listVendorsQuery = z.object({
  type: z.enum(VENDOR_TYPES).optional(),
  status: z.enum(['active', 'archived']).optional(),
  deliversProgramId: objectId.optional(),
  q: z.string().max(160).optional(),
});

const spendQuery = z.object({
  fiscalYear: z.string().regex(/^\d{4}$/, 'fiscalYear must be a 4-digit year').optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

module.exports = {
  createVendorBody,
  updateVendorBody,
  ratingBody,
  listVendorsQuery,
  spendQuery,
};
