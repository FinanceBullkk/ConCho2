// English-training — request validation (zod). Phase 1 is read-only, so these
// guard path params + list query only.
const { z } = require('zod');

const idParams = z.object({ id: z.string().min(1) });
const empCodeParams = z.object({ empCode: z.string().min(1) });
const issueCodeParams = z.object({
  code: z.string().trim().min(1).max(100).regex(/^[a-z0-9_]+$/),
});
const listEmployeesQuery = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const employeeCorrectionBody = z.object({
  businessUnit: z.string().trim().min(1).max(100).optional(),
  jobRole: z.string().trim().min(1).max(100).optional(),
  reason: z.string().trim().min(3).max(500),
}).refine((value) => value.businessUnit !== undefined || value.jobRole !== undefined, {
  message: 'businessUnit or jobRole is required',
});

// Exam result: levelCode is validated for shape only (slug); existence is checked
// against eng_levels in the use-case so the 13 codes have one source of truth (DB).
const examResultBody = z.object({
  levelCode: z.string().trim().min(1).max(100).regex(/^[a-z0-9_]+$/),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'examDate must be YYYY-MM-DD'),
  note: z.string().trim().max(500).optional(),
});

const MANAGED_STATUSES = ['Active', 'Inactive', 'Dropped', 'Transferred', 'On-hold', 'Waiting for class'];
const managedPersonFields = {
  name: z.string().trim().min(1).max(120),
  email: z.union([z.string().trim().toLowerCase().email().max(254), z.literal('')]).optional(),
  department: z.string().trim().max(120).optional(),
  position: z.string().trim().max(120).optional(),
  status: z.enum(MANAGED_STATUSES).optional(),
};
const managedPersonCreateBody = z.object({
  empCode: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
  ...managedPersonFields,
});
const managedPersonUpdateBody = z.object(managedPersonFields).refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field is required' },
);

const canonicalClassBody = z.object({
  classCode: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/),
  displayName: z.string().trim().min(1).max(120),
  courseId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  capacity: z.coerce.number().int().min(1).max(500),
  status: z.enum(['planned', 'active']).default('active'),
  picEmployeeId: z.string().min(1).nullable().optional(),
  picLabel: z.string().trim().max(120).nullable().optional(),
}).refine((value) => Boolean(value.picEmployeeId || value.picLabel), {
  message: 'PIC employee or PIC team label is required',
});

module.exports = {
  idParams, empCodeParams, issueCodeParams, listEmployeesQuery,
  employeeCorrectionBody, examResultBody,
  managedPersonCreateBody, managedPersonUpdateBody,
  canonicalClassBody,
};
