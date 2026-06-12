// Node's built-in RFC 4122 v4 generator — replaced the `uuid` package
// (its only consumer was this file; uuid ≥13 is ESM-only and the server
// is CommonJS, so the dep was dropped instead of major-bumped).
const { randomUUID } = require('crypto');

// Per-request correlation ID. Honor an inbound `X-Request-Id` from the
// load balancer / client when present so traces stitch together across hops.
const REQUEST_ID_HEADER = 'x-request-id';

const requestId = (req, res, next) => {
  const inbound = req.get(REQUEST_ID_HEADER);
  const id = (inbound && inbound.length <= 128 && /^[\w.-]+$/.test(inbound)) ? inbound : randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
};

module.exports = { requestId, REQUEST_ID_HEADER };
