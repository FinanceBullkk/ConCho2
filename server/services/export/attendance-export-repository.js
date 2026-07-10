// Backend repository — PostgreSQL only.
// The Mongo impl + the dual-backend selector were retired in Wave K Phase 2
// Batch D1b (2026-07-10) after prod cut over to PostgreSQL and Atlas was
// cancelled. Consumers keep `require('./...')` unchanged.
module.exports = require('./attendance-export-repository.pg');
