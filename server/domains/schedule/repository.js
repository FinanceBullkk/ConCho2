// schedule/repository — backend selector (Phase 3 Wave-D dual-backend port).
// Consumers keep `require('./repository')` unchanged; this resolves by DB_BACKEND.
//
// SLICED PORT: slice S1 ported the PURE READS in ./repository.pg; slice S3a adds
// the 12 booking/cancel/room-lock/waitlist/mode/capacity/attendance TXN methods.
// Still un-ported (slice S3b, with the scheduleService orchestration cutover):
// updateScheduleById (generic field-mapper) + findTeamById (opts-session). The
// selector therefore still MERGES mongo ⊕ pg — `pg` OVERRIDES only the methods it
// implements, so an un-ported write resolves to mongo even on DB_BACKEND=postgres
// mid-migration. Once pg is complete the spread is fully pg. `impls` is exported
// so the parity test drives both backends. Default DB_BACKEND=mongo → app unchanged.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./repository.mongo');
const pg = require('./repository.pg');

module.exports = {
  ...(isPostgres ? { ...mongo, ...pg } : mongo),
  impls: { mongo, pg },
};
