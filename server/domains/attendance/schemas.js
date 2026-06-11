const { z } = require('zod');
const { objectId } = require('../../schemas/common');

// ──────────────────────────────────────────────────────────
// attendance/schemas — zod request validation (Phase 1 domain extraction;
// relocated from schemas/attendance.js, behavior-preserving).
// ──────────────────────────────────────────────────────────
// v1.0 UI exposes P/A only. L and EL are accepted by the API
// for data-migration / future use but not surfaced in the drawer.
const attendanceRecord = z.object({
  userId: objectId,
  status: z.enum(['P', 'A', 'L', 'EL']),
  remark: z.string().max(500).optional(),
  photoUrl: z.string().url().optional(),
});

const bulkMarkBody = z.object({
  records: z.array(attendanceRecord).min(1, 'At least 1 record required').max(50),
});

module.exports = { bulkMarkBody };
