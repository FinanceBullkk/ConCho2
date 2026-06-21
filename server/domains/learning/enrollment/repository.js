// learning/enrollment/repository — backend selector (Phase 3 Wave-B port).
// Consumers keep `require('./repository')` unchanged; this resolves to the Mongo
// or Postgres impl by DB_BACKEND. `impls` is exported so the parity test can
// exercise both backends in one run. Default DB_BACKEND=mongo → app unchanged.
//
// NOTE: insertActiveEnrollment is session-aware in Mongo (the team-sync
// transaction in domains/groups). The PG impl ignores `session` — cross-method
// atomicity is deferred to the dual-backend transaction abstraction (Wave-D).
const { isPostgres } = require('../../../config/db-backend');
const mongo = require('./repository.mongo');
const pg = require('./repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
