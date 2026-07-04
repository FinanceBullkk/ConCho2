// metrics-repository — backend selector (Phase 3 Wave-F). Shared by
// metricSnapshotService (nightly writer) + analyticsSeriesService (reader);
// consumers keep `require('./metrics-repository')` unchanged. `impls` is
// exported so the parity test drives both backends in one run.
// Default DB_BACKEND=mongo → running app unchanged.
const { isPostgres } = require('../config/db-backend');
const mongo = require('./metrics-repository.mongo');
const pg = require('./metrics-repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
