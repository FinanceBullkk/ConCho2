// groups/lifecycle-repository — backend selector (Phase 3 Wave-D, groups slice 1).
// Consumers keep `require('./lifecycle-repository')` unchanged; resolves to the
// Mongo or Postgres impl by DB_BACKEND. `impls` is exported so the parity test
// drives both backends in one run. Default DB_BACKEND=mongo → app unchanged.
// Pairs with domains/_shared/unit-of-work for the soft-delete transaction.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./lifecycle-repository.mongo');
const pg = require('./lifecycle-repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
