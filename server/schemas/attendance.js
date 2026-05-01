const { z } = require('zod');
const { objectId } = require('./common');

// ── Attendance ────────────────────────────────────────────
const attendanceRecord = z.object({
  userId: objectId,
  status: z.enum(['P', 'A', 'L', 'EL']),
  note: z.string().max(500).optional(),
  remark: z.string().max(500).optional(),
  photoUrl: z.string().url().optional(),
});

const bulkMarkBody = z.object({
  records: z.array(attendanceRecord).min(1, 'At least 1 record required').max(50),
});

module.exports = { bulkMarkBody };
