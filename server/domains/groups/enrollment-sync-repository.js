// groups/enrollment-sync-repository — backend selector (Phase 3 Wave-D, groups slice 3).
// Consumers keep `require('./enrollment-sync-repository')` unchanged; resolves to
// the Mongo or Postgres impl by DB_BACKEND. `impls` is exported so the parity test
// drives both backends in one run. Default DB_BACKEND=mongo → app unchanged.
// Pairs with domains/_shared/unit-of-work for the team create/update transaction.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./enrollment-sync-repository.mongo');
const pg = require('./enrollment-sync-repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
