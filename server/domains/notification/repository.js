// notification/repository — backend selector (Phase 3 Wave-B port).
// Consumers keep `require('./repository')` unchanged; this resolves to the Mongo
// or Postgres impl by DB_BACKEND. `impls` is exported so the parity test can
// exercise both backends in one run. Default DB_BACKEND=mongo → app unchanged.
//
// Read/mark surface (Wave B) + the shared WRITE seam (Phase 5 slice 3):
// insertLog/updateLogById carry the in-app bell writer and the expiry/assignment
// reminder crons (A4–A6); the waitlist-promotion writer (A7) has its own twins
// on the waitlist repo (#256). All writers now follow DB_BACKEND.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./repository.mongo');
const pg = require('./repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
