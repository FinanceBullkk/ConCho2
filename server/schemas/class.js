const { z } = require('zod');
const { objectId } = require('./common');

// ── Create Class ────────────────────────────────────────
const createClassBody = z.object({
  classCode: z.string().trim().min(1, 'classCode is required').optional(),
  courseName: z.string().trim().min(1, 'courseName is required'),
  status: z.enum(['Ongoing', 'Completed']).optional(),
});

// ── Update Class ────────────────────────────────────────
const updateClassBody = z.object({
  classCode: z.string().trim().min(1).optional(),
  courseName: z.string().trim().min(1).optional(),
  status: z.enum(['Ongoing', 'Completed']).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field is required',
});

module.exports = { createClassBody, updateClassBody };
