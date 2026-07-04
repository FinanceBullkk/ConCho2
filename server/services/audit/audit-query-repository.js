// audit-query-repository — backend selector (Phase 3 Wave-F, legacy-tail port).
// Consumers (routes/auditRoutes) keep `require('./audit/audit-query-repository')`
// unchanged; resolves to the Mongo or Postgres impl by DB_BACKEND.
// `impls` is exported so the parity test drives both backends in one run.
// Default DB_BACKEND=mongo → app unchanged.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./audit-query-repository.mongo');
const pg = require('./audit-query-repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
