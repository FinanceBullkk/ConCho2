// cron-run-repository — backend selector (Phase 5 cutover, D-CronRun).
// Consumers (lib/cronMonitor.js recordStart/recordEnd, cronHealthController)
// keep a single require; resolves to the Mongo or Postgres impl by DB_BACKEND.
// `impls` is exported so the parity test drives both backends in one run.
// Default DB_BACKEND=mongo → running app unchanged. Without this seam the
// heartbeat writes would land in a dead Mongo at cutover and the admin
// cron-health endpoint would report every job as 'never' ran.
const { isPostgres } = require('../config/db-backend');
const mongo = require('./cron-run-repository.mongo');
const pg = require('./cron-run-repository.pg');

module.exports = {
  ...(isPostgres ? pg : mongo),
  impls: { mongo, pg },
};
