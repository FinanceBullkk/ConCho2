// auth-repository — backend selector (Phase 3 Wave-E slice E3, auth port).
// Consumers (auth-login, middleware/auth) keep `require('./auth-repository')`
// unchanged; resolves to the Mongo or Postgres impl by DB_BACKEND.
// `impls` is exported so the parity test drives both backends in one run.
// Default DB_BACKEND=mongo → running app unchanged.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./auth-repository.mongo');
const pg = require('./auth-repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
