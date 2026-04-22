const Class = require('../models/Class');
const Team = require('../models/Team');
const Schedule = require('../models/Schedule');
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
 * Delete a class — GUARD: blocks if Teams or Schedules still reference it.
 *
 * Admin must delete/reassign Teams and Schedules first to avoid
 * creating orphan data throughout the system.
 */
const deleteClass = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.id);
    if (!cls) return res.status(404).json({ success: false, message: 'Class not found' });

    // Guard: check for Teams assigned to this class
    const teamCount = await Team.countDocuments({ classId: cls._id });
    if (teamCount > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete: ${teamCount} team(s) are still assigned to this class. Delete or reassign them first.`,
      });
    }

    // Guard: check for Schedules referencing this class
    const scheduleCount = await Schedule.countDocuments({ classId: cls._id });
    if (scheduleCount > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete: ${scheduleCount} schedule(s) still reference this class. Delete them first.`,
      });
    }

    await Class.findByIdAndDelete(cls._id);
    res.json({ success: true, message: `Class ${cls.classCode} deleted` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getClasses, getClassById, createClass, updateClass, deleteClass };
