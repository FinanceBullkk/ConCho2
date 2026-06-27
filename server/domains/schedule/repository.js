// schedule/repository — backend selector (Phase 3 Wave-D dual-backend port).
// Consumers keep `require('./repository')` unchanged; this resolves by DB_BACKEND.
//
// PORT COMPLETE (S1 reads → S3a 12 txn methods → S3b-1 seams → S3b-2 the last 2:
// updateScheduleById generic field-mapper + findTeamById opts-session). Every
// method now has a pg twin, so this is a CLEAN SWAP — DB_BACKEND=postgres → pg,
// else mongo. `impls` is exported so the parity tests drive both backends.
// Default DB_BACKEND=mongo → app unchanged.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./repository.mongo');
const pg = require('./repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
