// learning/completion/repository — backend selector (Phase 3 Wave-B port).
// Consumers keep `require('./repository')` unchanged; this resolves to the Mongo
// or Postgres impl by DB_BACKEND. `impls` is exported so the parity test can
// exercise both backends in one run. Default DB_BACKEND=mongo → app unchanged.
//
// NOTE: the certificate-expiry + recert-assignment cron services (this folder)
// still read Mongoose models directly (NotificationLog/Assignment/manager
// hierarchy) — they belong to Wave C and are NOT routed through this repository.
const { isPostgres } = require('../../../config/db-backend');
const mongo = require('./repository.mongo');
const pg = require('./repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
