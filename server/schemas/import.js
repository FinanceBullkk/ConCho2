const { z } = require('zod');

// ── Import Users ──────────────────────────────────────────
const importUserItem = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  role: z.enum(['Admin', 'Teacher', 'Participant']).optional(),
  department: z.string().max(100).optional(),
  status: z.enum(['Active', 'Dropped', 'Transferred', 'On-hold']).optional(),
  password: z.string().min(10).optional(),
  empCode: z.string().max(20).optional(),
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
