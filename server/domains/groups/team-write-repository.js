// groups/team-write-repository — backend selector (Phase 3 Wave-D, groups slice 2).
// Consumers keep `require('./team-write-repository')` unchanged; resolves to the
// Mongo or Postgres impl by DB_BACKEND. `impls` is exported so the parity test
// drives both backends in one run. Default DB_BACKEND=mongo → app unchanged.
// Pairs with domains/_shared/unit-of-work for the team-create/update transaction.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./team-write-repository.mongo');
const pg = require('./team-write-repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
