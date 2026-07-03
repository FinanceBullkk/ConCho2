// audit-repository — backend selector (Phase 3 Wave-E slice E1, audit port).
// Consumers (auditService, audit-chain) keep `require('./audit-repository')`
// unchanged; resolves to the Mongo or Postgres impl by DB_BACKEND.
// `impls` is exported so the parity test drives both backends in one run.
// Default DB_BACKEND=mongo → running app unchanged.
const { isPostgres } = require('../config/db-backend');
const mongo = require('./audit-repository.mongo');
const pg = require('./audit-repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
