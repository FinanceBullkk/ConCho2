const { z } = require('zod');

// ── Import Users ──────────────────────────────────────────
// empCode is required (admin-input convention; no auto-generation).
// email is optional on import only because legacy spreadsheets may
// not have it; importService should warn (not fail) for rows missing
// email so an admin can backfill afterward.
const importUserItem = z.object({
  empCode: z.string().min(1, 'empCode is required').max(20),
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('email must be a valid email address').max(254).optional(),
  role: z.enum(['Admin', 'Teacher', 'Participant']).optional(),
  department: z.string().max(100).optional(),
  status: z.enum(['Active', 'Dropped', 'Transferred', 'On-hold']).optional(),
  password: z.string().min(10).optional(),
}).strict();

const importUsersBody = z.object({
  users: z.array(importUserItem).min(1, 'At least 1 user required').max(500, 'Max 500 users per batch'),
});

// ── Import Classes ────────────────────────────────────────
const importClassItem = z.object({
  classCode: z.string().min(1).max(20).optional(),
  courseName: z.string().min(1, 'Course name is required').max(100),
  totalSessions: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['Not Started', 'Ongoing', 'Completed']).optional(),
}).strict();

const importClassesBody = z.object({
  classes: z.array(importClassItem).min(1).max(200),
});

module.exports = { importUsersBody, importClassesBody };
