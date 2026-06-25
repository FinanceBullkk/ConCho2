// booking-write-repository — backend selector (Phase 3 Wave-D keystone).
// Consumers keep `require('./booking-write-repository')` unchanged; this resolves
// to the Mongo or Postgres impl by DB_BACKEND. `impls` is exported so the parity
// test can exercise both backends in one run. Default DB_BACKEND=mongo → app
// unchanged. Pairs with domains/_shared/unit-of-work for the atomic boundary.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./booking-write-repository.mongo');
const pg = require('./booking-write-repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
