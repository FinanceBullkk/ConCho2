// Metric time-series — backend selector (Phase 3 metrics Wave-A port).
// Resolves to the Mongo or Postgres impl by DB_BACKEND. `impls` is exported so
// the parity test can exercise both backends in one run.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./mongo');
const pg = require('./pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
