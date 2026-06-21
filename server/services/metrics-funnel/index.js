// Funnel reference repository — backend selector (Phase 2 / 2.6).
// Resolves to the Mongo or Postgres implementation by DB_BACKEND. Callers
// (e.g. analyticsSeriesService, in Phase 3) import THIS and never know which
// store answers — the Phase-3 port pattern in miniature.
//
// `impls` is exported too so tests can exercise both backends in one run.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./mongo');
const pg = require('./pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
