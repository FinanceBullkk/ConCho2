const { z } = require('zod');

// ── Import Users ──────────────────────────────────────────
// empCode is required (admin-input convention; no auto-generation).
// email is optional on import only because legacy spreadsheets may
// not have it; importService should warn (not fail) for rows missing
// email so an admin can backfill afterward.
const importUserItem = z.object({
  empCode: z.string().min(1, 'empCode is required').max(20),
  name: z.string().min(1, 'Name is required').max(100),
  // role is required — importService enforces it; schema alignment (P2-04).
  role: z.enum(['Admin', 'Teacher', 'Participant'], { required_error: 'role is required' }),
  email: z.string().email('email must be a valid email address').max(254).optional(),
  department: z.string().max(100).optional(),
  status: z.enum(['Active', 'Dropped', 'Transferred', 'On-hold']).optional(),
  // If omitted, a default password is assigned and mustChangePassword is set.
  password: z.string().min(10).optional(),
}).strict();

const importUsersBody = z.object({
  users: z.array(importUserItem).min(1, 'At least 1 user required').max(500, 'Max 500 users per batch'),
});

// ── Import Classes ────────────────────────────────────────
const importClassItem = z.object({
  // classCode and totalSessions are required — importService and the Class
  // model both require them; schema alignment (P2-04).
  classCode: z.string().min(1, 'classCode is required').max(20),
  courseName: z.string().min(1, 'Course name is required').max(100),
  totalSessions: z.coerce.number({ required_error: 'totalSessions is required' }).int().min(1).max(100),
  // P3-03: Class model only allows 'Ongoing' | 'Completed' — 'Not Started'
  // was never a valid model value and would fail the Mongoose enum check.
  status: z.enum(['Ongoing', 'Completed']).optional(),
}).strict();

const importClassesBody = z.object({
  classes: z.array(importClassItem).min(1).max(200),
});

module.exports = { importUsersBody, importClassesBody };
