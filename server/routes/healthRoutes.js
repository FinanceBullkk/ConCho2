const router = require('express').Router();
const { version } = require('../package.json');
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

// Readiness — "I can serve traffic". Probes Postgres (the only backend since
// Wave K) with a short timeout: SELECT 1. Used by load balancers to decide
// whether to route traffic here.
router.get('/ready', async (_req, res) => {
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
});

module.exports = router;
