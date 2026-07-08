// user-repository — backend selector (Phase 5 cutover-blocker slice 4).
// The User-model touches of the legacy user surface (importService bulk
// upsert — B6; user-lifecycle soft-delete cascade — B1), following the
// controllers/class/class-repository.* precedent for legacy controllers.
// `impls` is exported so the parity test drives both backends in one run.
// Default DB_BACKEND=mongo → running app unchanged.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./user-repository.mongo');
const pg = require('./user-repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
