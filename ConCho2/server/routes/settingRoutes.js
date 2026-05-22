const router = require('express').Router();
const { getSettings, updateSettings } = require('../controllers/settingController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

/**
 * @openapi
 * /settings:
 *   get:
 *     tags: [Settings]
 *     summary: Get all system settings (Admin only)
 *     responses:
 *       200:
 *         description: Array of setting documents
 *       403:
 *         description: Admin only
 *   put:
 *     tags: [Settings]
 *     summary: Update a system setting (Admin only)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [key, value]
 *             properties:
 *               key:   { type: string, example: 'ALLOWED_TIME_SLOTS' }
 *               value: { type: object }
 *     responses:
 *       200:
 *         description: Setting updated
 *       400:
 *         description: Key not in whitelist
 *       403:
 *         description: Admin only
 */
router.route('/')
  .get(protect, roleGuard('Admin'), getSettings)
  .put(protect, roleGuard('Admin'), updateSettings);

module.exports = router;
