// dashboard-stats-repository — backend selector (Phase 3 Wave-F, the 14-query
// admin-analytics bundle — the largest single Mongo→SQL rewrite of the port).
// The controller keeps `require('./dashboard-stats-repository')` unchanged;
// resolves to the Mongo or Postgres impl by DB_BACKEND. `impls` is exported so
// the parity test drives both backends in one run. Default DB_BACKEND=mongo →
// running app unchanged.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./dashboard-stats-repository.mongo');
const pg = require('./dashboard-stats-repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
