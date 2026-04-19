const Attendance = require('../models/Attendance');
const Schedule = require('../models/Schedule');

// ──────────────────────────────────────────────────────────
// Attendance Controller
// ──────────────────────────────────────────────────────────

/**
 * POST /api/attendance/:scheduleId
 * BULK UPSERT attendance for an entire class roster
 *
 * Body: {
 *   records: [
 *     { userId: "...", status: "P", remark: "", photoUrl: "" },
 *     { userId: "...", status: "A" },
 *     ...
 *   ]
 * }
 *
 * Uses MongoDB bulkWrite with upsert to efficiently handle
 * both inserts and updates in a single DB roundtrip.
 */
const bulkMarkAttendance = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { records } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'records array is required and must not be empty',
      });
    }

    // Verify schedule exists
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    // Validate statuses
    const validStatuses = ['P', 'A', 'L', 'EL'];
    for (const record of records) {
      if (!record.userId || !record.status) {
        return res.status(400).json({
          success: false,
          message: 'Each record must have userId and status',
        });
      }
      if (!validStatuses.includes(record.status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status "${record.status}". Use: ${validStatuses.join(', ')}`,
        });
      }
    }

    // Build bulkWrite operations (upsert = insert or update)
    const operations = records.map((record) => ({
      updateOne: {
        filter: { scheduleId, userId: record.userId },
        update: {
          $set: {
            scheduleId,
            userId: record.userId,
            status: record.status,
            remark: record.remark || '',
            photoUrl: record.photoUrl || '',
          },
        },
        upsert: true,
      },
    }));

    const result = await Attendance.bulkWrite(operations);

    res.json({
      success: true,
      message: `Attendance processed: ${result.upsertedCount} created, ${result.modifiedCount} updated`,
      data: {
        matched: result.matchedCount,
        modified: result.modifiedCount,
        upserted: result.upsertedCount,
        total: records.length,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/attendance/schedule/:scheduleId
 * Get all attendance records for a specific schedule
 */
const getAttendanceBySchedule = async (req, res) => {
  try {
    const records = await Attendance.find({ scheduleId: req.params.scheduleId })
      .populate('userId', 'empCode name department')
      .sort({ 'userId.empCode': 1 });

    res.json({ success: true, count: records.length, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/attendance/user/:userId
 * Get attendance history for a specific user
 */
const getAttendanceByUser = async (req, res) => {
  try {
    const records = await Attendance.find({ userId: req.params.userId })
      .populate({
        path: 'scheduleId',
        populate: [
          { path: 'classId', select: 'classCode courseName' },
          { path: 'teacherId', select: 'empCode name' },
        ],
      })
      .sort({ createdAt: -1 });

    res.json({ success: true, count: records.length, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { bulkMarkAttendance, getAttendanceBySchedule, getAttendanceByUser };
