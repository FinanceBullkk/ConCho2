const router = require('express').Router();
const { globalSearch } = require('../controllers/searchController');
const { protect } = require('../middleware/auth');

/**
 * @openapi
 * /search:
 *   get:
 *     tags: [Search]
 *     summary: Global cross-entity search
 *     description: |
 *       Searches Users, Teams, and Classes for the given query string.
 *       Results are role-scoped — Participants see only their own record,
 *       teams they belong to, and classes for those teams.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string, minLength: 2 }
 *         description: Query string (min 2 chars)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 25 }
 *         description: Per-entity result cap (default 5)
 *     responses:
 *       200: { description: Search results }
 *       401: { description: Not authenticated }
 */
router.get('/', protect, globalSearch);

module.exports = router;
