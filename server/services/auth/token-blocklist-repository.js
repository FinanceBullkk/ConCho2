// token-blocklist-repository — backend selector (Phase 5 cutover-blocker slice 2).
// Consumer (auth-tokens.js: revokeToken/isTokenRevoked) keeps a single require;
// resolves to the Mongo or Postgres impl by DB_BACKEND. `impls` is exported so
// the parity test drives both backends in one run. Default DB_BACKEND=mongo →
// running app unchanged. SECURITY: without this seam, revoked JWTs stay valid
// on the PG backend (the Mongoose write would land in a dead Mongo at cutover).
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./token-blocklist-repository.mongo');
const pg = require('./token-blocklist-repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
