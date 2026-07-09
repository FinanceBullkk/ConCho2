const router = require('express').Router();
const mongoose = require('mongoose');
const { version } = require('../package.json');
const { isPostgres } = require('../config/db-backend');
const pg = require('../config/pg');

// 2-second ceiling so a hung DB probe can't stall the load balancer.
const withTimeout = (promise, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(label)), 2000)),
]);

// Liveness — "the process is up". Always 200 if Node is responding.
// Used by orchestrators to decide whether to restart the container.
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'tms-server',
    version,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

// Readiness — "I can serve traffic". Probes the ACTIVE backend with a short
// timeout (K1b: Postgres → SELECT 1; Mongo → admin ping). Used by load balancers
// to decide whether to route traffic here.
router.get('/ready', async (_req, res) => {
  if (isPostgres) {
    try {
      await withTimeout(pg.ping(), 'pg_ping_timeout');
      return res.json({
        status: 'ready',
        db: 'connected',
        backend: 'postgres',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return res.status(503).json({ status: 'not_ready', backend: 'postgres', reason: err.message });
    }
  }

  const mongoState = mongoose.connection.readyState; // 1 = connected
  if (mongoState !== 1) {
    return res.status(503).json({
      status: 'not_ready',
      reason: 'mongo_disconnected',
      mongoState,
    });
  }

  try {
    await withTimeout(mongoose.connection.db.admin().ping(), 'mongo_ping_timeout');
    res.json({
      status: 'ready',
      db: 'connected',
      backend: 'mongo',
      dbName: mongoose.connection.name,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', reason: err.message, mongoState });
  }
});

module.exports = router;
