const searchService = require('../services/searchService');
const { handleError } = require('../helpers/handleError');

/**
 * GET /api/search?q=...&limit=5
 *
 * Global cross-entity search. Returns up to `limit` matches per entity
 * type (users, teams, classes). Role-scoped (see searchService.js).
 */
const globalSearch = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({
        success: true,
        data: { users: [], teams: [], classes: [], total: 0 },
      });
    }

    const data = await searchService.search({
      q,
      user: req.user,
      limit: req.query.limit,
    });

    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { globalSearch };
