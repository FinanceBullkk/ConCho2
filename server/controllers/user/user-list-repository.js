// user-list-repository — backend selector (Phase 3 Wave-G: getUsers list read).
// The controller keeps `require('./user-list-repository')` unchanged; this
// resolves to the Mongo or Postgres impl by DB_BACKEND. `impls` is exported so
// a parity test can drive both backends in one run. Default DB_BACKEND=mongo →
// running app unchanged.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./user-list-repository.mongo');
const pg = require('./user-list-repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
