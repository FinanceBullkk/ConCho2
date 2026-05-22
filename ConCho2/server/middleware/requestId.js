const { v4: uuidv4 } = require('uuid');

// Per-request correlation ID. Honor an inbound `X-Request-Id` from the
// load balancer / client when present so traces stitch together across hops.
const REQUEST_ID_HEADER = 'x-request-id';

const requestId = (req, res, next) => {
  const inbound = req.get(REQUEST_ID_HEADER);
  const id = (inbound && inbound.length <= 128 && /^[\w.-]+$/.test(inbound)) ? inbound : uuidv4();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
};

module.exports = { requestId, REQUEST_ID_HEADER };
