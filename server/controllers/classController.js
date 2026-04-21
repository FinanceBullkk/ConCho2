const Class = require('../models/Class');
const { getNextSequence } = require('../helpers/counter');

/**
 * GET /api/classes
 */
const getClasses = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const classes = await Class.find(filter).sort({ classCode: 1 });
    res.json({ success: true, count: classes.length, data: classes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/classes/:id
 */
const getClassById = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.id);
    if (!cls) return res.status(404).json({ success: false, message: 'Class not found' });
    res.json({ success: true, data: cls });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/classes
 *
 * classCode is auto-generated using an atomic counter UNLESS
 * explicitly provided in the request body (for migration/seeding).
 */
const createClass = async (req, res) => {
  try {
    let { classCode } = req.body;

    // Auto-generate classCode if not provided
    if (!classCode) {
      const seq = await getNextSequence('classCode');
      classCode = `EL${seq.toString().padStart(3, '0')}`;
    }

    const cls = await Class.create({ ...req.body, classCode });
    res.status(201).json({ success: true, data: cls });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * PUT /api/classes/:id
 */
const updateClass = async (req, res) => {
  try {
    const cls = await Class.findByIdAndUpdate(req.params.id, req.body, {
      new: true, runValidators: true,
    });
    if (!cls) return res.status(404).json({ success: false, message: 'Class not found' });
    res.json({ success: true, data: cls });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/classes/:id
 */
const deleteClass = async (req, res) => {
  try {
    const cls = await Class.findByIdAndDelete(req.params.id);
    if (!cls) return res.status(404).json({ success: false, message: 'Class not found' });
    res.json({ success: true, message: `Class ${cls.classCode} deleted` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getClasses, getClassById, createClass, updateClass, deleteClass };
