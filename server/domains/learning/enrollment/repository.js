// learning/enrollment/repository — backend selector (Phase 3 Wave-B port).
// Consumers keep `require('./repository')` unchanged; this resolves to the Mongo
// or Postgres impl by DB_BACKEND. `impls` is exported so the parity test can
// exercise both backends in one run. Default DB_BACKEND=mongo → app unchanged.
//
// NOTE: insertActiveEnrollment is transaction-aware on BOTH backends (#255):
// it accepts a raw mongoose session (legacy) or the UoW tx handle — {session}
// joins the Mongo transaction, {client} joins the PG BEGIN/COMMIT unit — so the
// team-sync/transfer enrollment create rolls back with the team/schedule writes.
const { isPostgres } = require('../../../config/db-backend');
const mongo = require('./repository.mongo');
const pg = require('./repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
