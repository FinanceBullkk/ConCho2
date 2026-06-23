// assessment/question-bank-repository — backend selector (Phase 3 Wave-B port).
// Consumers keep `require('./question-bank-repository')` unchanged; this resolves
// to the Mongo or Postgres impl by DB_BACKEND. `impls` is exported so the parity
// test can exercise both backends in one run. Default DB_BACKEND=mongo → unchanged.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./question-bank-repository.mongo');
const pg = require('./question-bank-repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
