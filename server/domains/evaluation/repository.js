// evaluation/repository — backend selector (Phase 5 cutover-blocker slice 4, B3).
// evaluationController keeps one require; resolves to the Mongo or Postgres
// impl by DB_BACKEND. `impls` is exported so the parity test drives both
// backends in one run. Default DB_BACKEND=mongo → running app unchanged.
//
// Note the vocabulary: Evaluation = the instructor-scored English rubric mode
// of the converged assessment concept (domain-model-and-migration.md) — the
// model name and /api/evaluations URL stay; this repo is the port seam only.
const { isPostgres } = require('../../config/db-backend');
const mongo = require('./repository.mongo');
const pg = require('./repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
