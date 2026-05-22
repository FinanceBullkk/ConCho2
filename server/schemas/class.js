const { z } = require('zod');
const { objectId } = require('./common');

const COURSE_NAMES = [
  'Foundation',
  'Extension of Foundation',
  'Communication 1',
  'Communication 2',
  'Communication 3',
  'Business English',
];

// ── Create Class ────────────────────────────────────────
const createClassBody = z.object({
  classCode: z.string().trim().min(1, 'classCode is required').optional(),
  courseName: z.enum(COURSE_NAMES, {
    errorMap: () => ({ message: `courseName must be one of: ${COURSE_NAMES.join(', ')}` }),
  }),
  status: z.enum(['Ongoing', 'Completed']).optional(),
  // totalSessions is auto-mapped from courseName in controller
});

// ── Update Class ────────────────────────────────────────
const updateClassBody = z.object({
  courseName: z.enum(COURSE_NAMES).optional(),
  status: z.enum(['Ongoing', 'Completed']).optional(),
  totalSessions: z.number().int().min(1).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field is required',
});

module.exports = { createClassBody, updateClassBody };
