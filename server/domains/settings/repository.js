// settings/repository — backend selector (Phase 5 cutover-blocker slice 4, B4).
// settingController keeps one require; resolves to the Mongo or Postgres impl
// by DB_BACKEND. `impls` is exported so the parity test drives both backends
// in one run. Default DB_BACKEND=mongo → running app unchanged.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./repository.mongo');
const pg = require('./repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
