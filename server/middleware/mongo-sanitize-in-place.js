const { sanitize } = require('express-mongo-sanitize');

// ──────────────────────────────────────────────────────────
// NoSQL-injection sanitizer — express 5 compatible (golden rule layer)
// ──────────────────────────────────────────────────────────
// The stock express-mongo-sanitize middleware assigns `req[key] = target`,
// which throws under express 5 where `req.query` is a getter-only property.
// Its exported `sanitize()` however strips prohibited keys ($-prefixed,
// dotted) from the object IN PLACE — so we reuse the exact same battle-tested
// logic without the fatal assignment.
//
// `query` needs one extra step: the express 5 getter may re-parse the query
// string per access, so mutating one access's result is not enough. We pin
// the sanitized object onto the request as an own data property — every
// later `req.query` read then sees exactly the sanitized object.
const mongoSanitizeInPlace = (req, _res, next) => {
  if (req.body) sanitize(req.body);
  if (req.params) sanitize(req.params);
  if (req.headers) sanitize(req.headers);

  const query = req.query;
  if (query) {
    sanitize(query);
    Object.defineProperty(req, 'query', {
      value: query,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }

  next();
};

module.exports = { mongoSanitizeInPlace };
