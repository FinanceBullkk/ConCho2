// search-repository — backend selector (Phase 3 Wave-F, legacy-tail port).
// Consumers (services/searchService.js) keep `require('./search/search-repository')`
// unchanged; resolves to the Mongo or Postgres impl by DB_BACKEND. `impls` is
// exported so the parity test drives both backends in one run. Default
// DB_BACKEND=mongo → app unchanged.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./search-repository.mongo');
const pg = require('./search-repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
