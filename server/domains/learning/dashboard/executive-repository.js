// learning/dashboard/executive-repository — backend selector (Phase 3 Wave-B port).
// Consumers keep `require('./executive-repository')` unchanged; this resolves to
// the Mongo or Postgres impl by DB_BACKEND. `impls` is exported so the parity test
// can exercise both backends in one run. Default DB_BACKEND=mongo → app unchanged.
const { isPostgres } = require('../../../config/db-backend');
const mongo = require('./executive-repository.mongo');
const pg = require('./executive-repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
