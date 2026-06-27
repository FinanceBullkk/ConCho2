// schedule/repository — backend selector (Phase 3 Wave-D dual-backend port).
// Consumers keep `require('./repository')` unchanged; this resolves by DB_BACKEND.
//
// SLICED PORT: slice S1 ports the PURE READS in ./repository.pg; the session-aware
// booking / cancel / room-lock / waitlist WRITES stay in ./repository.mongo until
// slice S3. The selector therefore MERGES mongo ⊕ pg — `pg` OVERRIDES only the
// methods it implements, so an un-ported write still resolves to mongo even on
// DB_BACKEND=postgres mid-migration. Once pg is complete the spread is fully pg.
// `impls` is exported so the parity test drives both backends. Default
// DB_BACKEND=mongo → app unchanged.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./repository.mongo');
const pg = require('./repository.pg');

module.exports = {
  ...(isPostgres ? { ...mongo, ...pg } : mongo),
  impls: { mongo, pg },
};
