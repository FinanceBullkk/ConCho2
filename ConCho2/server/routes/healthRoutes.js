const router = require('express').Router();
const mongoose = require('mongoose');
const { version } = require('../package.json');

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

// Readiness — "I can serve traffic". Pings Mongo with a short timeout.
// Used by load balancers to decide whether to route traffic here.
router.get('/ready', async (_req, res) => {
  const mongoState = mongoose.connection.readyState; // 1 = connected
  if (mongoState !== 1) {
    return res.status(503).json({
      status: 'not_ready',
      reason: 'mongo_disconnected',
      mongoState,
    });
  }

  try {
    // 2-second ceiling so a hung admin command can't stall the LB.
    await Promise.race([
      mongoose.connection.db.admin().ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('mongo_ping_timeout')), 2000)),
    ]);
    res.json({
      status: 'ready',
      db: 'connected',
      dbName: mongoose.connection.name,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', reason: err.message, mongoState });
  }
});

module.exports = router;
