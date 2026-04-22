/**
 * Read ?page=&limit= (already coerced + defaulted by the
 * zod schema in schemas/common.js) and compute skip.
 *
 * Controllers that want pagination should attach
 * validate({ query: schema }) to the route first so the
 * defaults and bounds are applied before this runs.
 */
const parsePagination = (req) => {
  const page = req.query.page || 1;
  const limit = req.query.limit || 50;
  return { page, limit, skip: (page - 1) * limit };
};

/**
 * Shape the JSON response for a paginated list.
 * `count` is kept as an alias for `total` so existing
 * clients that read `res.data.count` keep working.
 */
const paginatedResponse = ({ data, total, page, limit }) => ({
  success: true,
  count: total,
  total,
  page,
  pages: Math.max(1, Math.ceil(total / limit)),
  limit,
  data,
});

module.exports = { parsePagination, paginatedResponse };
