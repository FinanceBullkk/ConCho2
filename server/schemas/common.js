const { z } = require('zod');

// MongoDB ObjectId: 24-char hex string.
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId');

// Standard ?page=&limit= params. Both optional.
// Coerced from query-string numbers; defaults applied here so
// controllers can rely on req.query.page / req.query.limit.
const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(2000).default(50),
});

// :id route param used by most resources.
const idParam = z.object({ id: objectId });

module.exports = { objectId, paginationQuery, idParam };
