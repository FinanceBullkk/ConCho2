// evaluation-export-repository — backend selector (Phase 3 Wave-F, legacy-tail port).
// Consumers (services/export/evaluation-export.js) keep
// `require('./evaluation-export-repository')` unchanged; resolves to the Mongo
// or Postgres impl by DB_BACKEND. `impls` is exported so the parity test drives
// both backends in one run. Default DB_BACKEND=mongo → app unchanged.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./evaluation-export-repository.mongo');
const pg = require('./evaluation-export-repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
