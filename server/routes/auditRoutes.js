const router = require('express').Router();
const AuditLog = require('../models/AuditLog');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');
const { handleError } = require('../helpers/handleError');

// ──────────────────────────────────────────────────────────
// Audit Log Query API (Phase 1.1)
// ──────────────────────────────────────────────────────────
// Admin-only. The audit collection is append-only — there is no
// route here to mutate or delete entries. The TTL index on the
// model handles retention.
// ──────────────────────────────────────────────────────────

router.use(protect, roleGuard('Admin'));

/**
 * GET /api/admin/audit
 *
 * Filters (all optional, can combine):
 *   ?entity=User
 *   ?entityId=<ObjectId>
 *   ?actorId=<ObjectId>
 *   ?action=updated
 *   ?from=2025-01-01&to=2025-12-31
 *
 * Pagination: ?page=1&limit=50 (default 50, max 200).
 * Sorted newest-first by default.
 */
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.entity) filter.entity = req.query.entity;
    if (req.query.entityId) filter.entityId = req.query.entityId;
    if (req.query.actorId) filter.actorId = req.query.actorId;
    if (req.query.action) filter.action = req.query.action;

    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }

    // Pagination — cap limit at 200 to prevent dump attacks.
    const { page, limit, skip } = parsePagination(req);
    const cappedLimit = Math.min(limit, 200);

    const [entries, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(cappedLimit)
        .populate('actorId', 'empCode name role')
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json(paginatedResponse({ data: entries, total, page, limit: cappedLimit }));
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * GET /api/admin/audit/entity/:entity/:entityId
 *
 * Convenience endpoint: full history for one entity. The most common
 * support workflow ("show me everything that happened to user X").
 */
router.get('/entity/:entity/:entityId', async (req, res) => {
  try {
    const entries = await AuditLog.find({
      entity: req.params.entity,
      entityId: req.params.entityId,
    })
      .sort({ createdAt: -1 })
      .limit(500)
      .populate('actorId', 'empCode name role')
      .lean();

    res.json({ success: true, count: entries.length, data: entries });
  } catch (error) {
    handleError(res, error);
  }
});

module.exports = router;
