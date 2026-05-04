const mongoose = require('mongoose');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const router = require('express').Router();

// ──────────────────────────────────────────────────────────
// Admin Database Explorer API
// ──────────────────────────────────────────────────────────
// Generic CRUD for any registered Mongoose model.
// Admin-only. Powers the "Database" tab in the Data page.
// ──────────────────────────────────────────────────────────

router.use(protect, roleGuard('Admin'));

// Allowed models (whitelist for safety)
const ALLOWED_MODELS = [
  'User', 'Team', 'Class', 'Schedule',
  'Attendance', 'Enrollment', 'Evaluation',
  'Counter', 'Setting',
];

// Resolve model name from param (case-insensitive)
const resolveModel = (name) => {
  const match = ALLOWED_MODELS.find(m => m.toLowerCase() === name.toLowerCase());
  if (!match) return null;
  try { return mongoose.model(match); }
  catch { return null; }
};

// GET /api/admin-db/collections — List all collection stats
router.get('/collections', async (_req, res) => {
  try {
    const stats = [];
    for (const name of ALLOWED_MODELS) {
      try {
        const Model = mongoose.model(name);
        const count = await Model.countDocuments();
        const schema = Model.schema;
        const fields = Object.keys(schema.paths).filter(f => f !== '__v');
        stats.push({ name, count, fields });
      } catch {
        // Model not registered, skip
      }
    }
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin-db/:collection — Query documents
router.get('/:collection', async (req, res) => {
  try {
    const Model = resolveModel(req.params.collection);
    if (!Model) return res.status(404).json({ success: false, message: `Collection "${req.params.collection}" not found` });

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;
    const sort = req.query.sort || '-createdAt';
    const search = req.query.search || '';

    // Build filter from query.filter (JSON string)
    let filter = {};
    if (req.query.filter) {
      try { filter = JSON.parse(req.query.filter); } catch { /* ignore bad filter */ }
    }

    // Include soft-deleted if requested
    if (req.query.includeDeleted === 'true') {
      // Don't add isDeleted filter
    } else {
      // Default: exclude soft-deleted
      filter.isDeleted = { $ne: true };
    }

    // Simple text search across string fields
    if (search) {
      const stringPaths = Object.entries(Model.schema.paths)
        .filter(([, v]) => v.instance === 'String')
        .map(([k]) => k);
      if (stringPaths.length > 0) {
        filter.$or = stringPaths.map(field => ({
          [field]: { $regex: search, $options: 'i' }
        }));
      }
    }

    const [docs, total] = await Promise.all([
      Model.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Model.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: docs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin-db/:collection/:id — Update a single document
router.put('/:collection/:id', async (req, res) => {
  try {
    const Model = resolveModel(req.params.collection);
    if (!Model) return res.status(404).json({ success: false, message: 'Collection not found' });

    // Strip protected fields
    const { _id, __v, createdAt, ...updateData } = req.body;

    const doc = await Model.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).lean();

    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin-db/:collection/:id — Hard delete a document
router.delete('/:collection/:id', async (req, res) => {
  try {
    const Model = resolveModel(req.params.collection);
    if (!Model) return res.status(404).json({ success: false, message: 'Collection not found' });

    const doc = await Model.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
