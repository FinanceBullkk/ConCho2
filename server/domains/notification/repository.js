// notification/repository — backend selector (Phase 3 Wave-B port).
// Consumers keep `require('./repository')` unchanged; this resolves to the Mongo
// or Postgres impl by DB_BACKEND. `impls` is exported so the parity test can
// exercise both backends in one run. Default DB_BACKEND=mongo → app unchanged.
//
// NOTE: the email/cron jobs that CREATE NotificationLog rows are NOT ported (they
// stay on Mongo until the cutover) — this is the read/mark surface only.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./repository.mongo');
const pg = require('./repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
