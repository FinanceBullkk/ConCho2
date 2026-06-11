const express = require('express');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const { getCronHealth } = require('../controllers/cronHealthController');

// ──────────────────────────────────────────────────────────
// Cron Health Routes — Admin-only heartbeat view for scheduled jobs.
// Mounted at /api/admin/cron.
// ──────────────────────────────────────────────────────────

const router = express.Router();

router.use(protect, roleGuard('Admin'));

/**
 * @openapi
 * /admin/cron/health:
 *   get:
 *     tags: [Cron]
 *     summary: Heartbeat + health verdict for monitored cron jobs (Admin)
 *     responses:
 *       200:
 *         description: Per-job last-run heartbeat and derived health
 */
router.get('/health', getCronHealth); // GET /api/admin/cron/health

module.exports = router;
