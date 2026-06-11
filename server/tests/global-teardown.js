// ──────────────────────────────────────────────────────────
// Jest globalTeardown — stop the shared replica set
// ──────────────────────────────────────────────────────────
// Runs ONCE after the whole test run. Stops the single MongoMemoryReplSet that
// global-setup.js started, so no mongod is left orphaned.
// ──────────────────────────────────────────────────────────
module.exports = async () => {
  const replSet = global.__MONGO_REPLSET__;
  if (replSet) await replSet.stop();
};
