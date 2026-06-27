// waitlist/repository — backend selector (Phase 3 Wave-D dual-backend port, S2).
// Consumers keep `require('./repository')` unchanged; this resolves by DB_BACKEND.
//
// Unlike schedule/repository (sliced — merges mongo ⊕ pg while writes are
// un-ported), S2 ports ALL 10 waitlist methods at once, so this is a clean swap:
// DB_BACKEND=postgres → pg, else mongo. `impls` is exported so the parity test
// drives both backends. Default DB_BACKEND=mongo → app unchanged.
const { isPostgres } = require('../../../config/db-backend');
const mongo = require('./repository.mongo');
const pg = require('./repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
