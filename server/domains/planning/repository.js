// planning/repository — backend selector (Phase 3 Wave-D, planning port).
// Consumers keep `require('./repository')` unchanged; resolves to the Mongo or
// Postgres impl by DB_BACKEND (clean swap — every method has a pg twin).
// `impls` is exported so the parity test drives both backends in one run.
// Default DB_BACKEND=mongo → app unchanged. Pairs with
// domains/_shared/unit-of-work for the scheduleItem transaction.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./repository.mongo');
const pg = require('./repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
