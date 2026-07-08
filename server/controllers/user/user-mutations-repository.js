// user-mutations-repository — backend selector (Phase 5 cutover-blocker slice 4).
// The admin user create/update writes follow DB_BACKEND; without this the
// create/update handlers kept writing Mongo while the lifecycle cascade (B1)
// wrote PG → split-brain user rows (freed empCodes still 409'd on create).
// `impls` is exported so the parity test drives both backends in one run.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./user-mutations-repository.mongo');
const pg = require('./user-mutations-repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
