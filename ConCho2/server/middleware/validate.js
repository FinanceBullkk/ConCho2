const { ZodError } = require('zod');

/**
 * Request validation middleware.
 *
 * Usage:
 *   router.post('/login', validate({ body: loginBodySchema }), login);
 *   router.get('/', validate({ query: listUsersQuerySchema }), getUsers);
 *   router.get('/:id', validate({ params: idParamSchema }), getUserById);
 *
 * Replaces req.body / req.query / req.params with the parsed (and
 * coerced) values so controllers get the cleaned types.
 *
 * On failure returns 400 with { success, message, errors: [{path,message}] }.
 */
const validate = (schemas) => (req, res, next) => {
  try {
    if (schemas.body) req.body = schemas.body.parse(req.body);
    if (schemas.query) {
      const parsed = schemas.query.parse(req.query);
      // req.query is a getter in newer Express — assign individual keys
      for (const k of Object.keys(parsed)) req.query[k] = parsed[k];
    }
    if (schemas.params) req.params = schemas.params.parse(req.params);
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      const errors = err.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      return res.status(400).json({
        success: false,
        message: 'Validation failed: ' + errors.map((e) => `${e.path} — ${e.message}`).join('; '),
        errors,
      });
    }
    next(err);
  }
};

module.exports = { validate };
