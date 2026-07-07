// attendance-export-repository — backend selector (Phase 3 Wave-F PR-2).
// Consumers keep `require('./attendance-export-repository')` unchanged; resolves
// to the Mongo or Postgres impl by DB_BACKEND. The old raw `aggregate(pipeline)`
// leak was refactored into SEMANTIC methods (findExportRows /
// findPendingIdsInRange / countExportablePending / claim / mark / counts) so the
// Postgres twin owns the same join in SQL. `impls` is exported so the parity
// test drives both backends in one run. Default DB_BACKEND=mongo → app unchanged.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./attendance-export-repository.mongo');
const pg = require('./attendance-export-repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
