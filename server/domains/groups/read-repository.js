// groups/read-repository — backend selector (Phase 3 Wave-G, groups read port).
// The domain's 13 Mongo-only reads (list/single/progress/guards) go dual-backend
// so the pg lane's post-write re-reads stop returning null (createTeam wrote
// through the seam but findTeamByIdPopulated only knew Mongo). Consumers require
// this selector; it resolves to the Mongo or Postgres impl by DB_BACKEND.
// `impls` is exported so the parity test drives both backends in one run.
// Default DB_BACKEND=mongo → app unchanged.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./read-repository.mongo');
const pg = require('./read-repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
