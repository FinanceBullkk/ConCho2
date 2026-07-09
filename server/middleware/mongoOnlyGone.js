const mongoose = require('mongoose');
const { isPostgres } = require('../config/db-backend');

// ──────────────────────────────────────────────────────────
// mongoOnlyGone — 410 for Mongo-only routes once the app runs Mongo-less (K1b).
// ──────────────────────────────────────────────────────────
// The reconcile service + the Mongoose admin DB explorer are retired at the
// PostgreSQL cutover (Wave K) — they have no PG implementation. This guard is
// deliberately gated on the ACTUAL Mongo connection state, not merely
// DB_BACKEND, so that:
//   • under Postgres with MONGO_URI still set (the bake window) AND in every
//     test (Mongo is always connected via mongodb-memory-server) the routes
//     behave EXACTLY as before — no behaviour or test change, incl. the required
//     server-tests-pg gate;
//   • only once Mongo is physically off (Atlas retired) does the route return a
//     clean 410 instead of a 500 from an unconnected Mongoose call.
const mongoOnlyGone = (_req, res, next) => {
  if (isPostgres && mongoose.connection.readyState !== 1) {
    return res.status(410).json({
      success: false,
      message: 'This endpoint is retired under the PostgreSQL backend.',
    });
  }
  return next();
};

module.exports = { mongoOnlyGone };
