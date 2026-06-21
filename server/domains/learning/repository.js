// learning/repository — backend selector (Phase 3 Wave-B dual-backend port).
// Consumers keep `require('./repository')` unchanged; this resolves to the Mongo
// or Postgres impl by DB_BACKEND. `impls` is exported so the parity test can
// exercise both backends in one run. Default DB_BACKEND=mongo → app unchanged.
//
// NOTE: the cohort soft-archive (closeEnrollmentsByCohort + softDeleteCohort) is
// wrapped in a Mongoose transaction by the use-case. The PG impls run each
// statement individually (the `session` arg is ignored) — cross-method atomicity
// is deferred to the dual-backend transaction abstraction (Wave-D). Prod stays on
// DB_BACKEND=mongo, so the live transactional path is unchanged.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./repository.mongo');
const pg = require('./repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
