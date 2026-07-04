// class-repository — backend selector (Phase 3 Wave-F, legacy class handlers).
// Controllers keep `require('./class-repository')` unchanged; resolves to the
// Mongo or Postgres impl by DB_BACKEND. `impls` is exported so the parity test
// drives both backends in one run. Default DB_BACKEND=mongo → app unchanged.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./class-repository.mongo');
const pg = require('./class-repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
