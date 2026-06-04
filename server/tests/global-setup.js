const { MongoMemoryReplSet } = require('mongodb-memory-server');

// ──────────────────────────────────────────────────────────
// Jest globalSetup — one shared in-memory Mongo replica set
// ──────────────────────────────────────────────────────────
// Runs ONCE before the whole test run. Previously every test file spun up its
// own MongoMemoryReplSet (~2-4s each) via tests/setup.js — ~55 files × a few
// seconds of mongod startup, plus extra orphan risk if a run was interrupted.
//
// Now we start a single replica set here and publish its URI on
// process.env.MONGO_URI (inherited by jest workers). Each test file connects
// under its OWN database (see tests/setup.js → TEST_DB_NAME), so files stay
// fully isolated while paying the mongod spawn cost only once.
//
// A replica set (not a standalone) is required because the app uses MongoDB
// transactions (bookSlot, admin create, soft-delete cascade).
// ──────────────────────────────────────────────────────────
module.exports = async () => {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  // Visible to global-teardown.js (same jest parent process).
  global.__MONGO_REPLSET__ = replSet;
  process.env.MONGO_URI = replSet.getUri();
};
