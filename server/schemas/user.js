const { z } = require('zod');
const { paginationQuery } = require('./common');

const ROLES = ['Admin', 'Teacher', 'Participant'];
const STATUSES = ['Active', 'Inactive', 'Dropped', 'Transferred', 'On-hold', 'Waiting for class'];

// Field primitives — no defaults here so that using them in an
// update schema does not silently overwrite stored values with
// empty strings when a key is omitted.
const fields = {
  empCode: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1, 'name is required').max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('email must be a valid email address')
    .max(254),
  role: z.enum(ROLES),
  department: z.string().trim().max(120),
  position: z.string().trim().max(120),
  status: z.enum(STATUSES),
  dropReason: z.string().trim().max(500),
  entranceLevel: z.string().trim().max(120),
  currentLevel: z.string().trim().max(120),
  password: z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .max(128),
};

// On create:
//   - empCode is REQUIRED (admin enters; no auto-generation).
//   - email is REQUIRED (needed for Google Calendar invites; admin
//     enters per-user since emails do not follow a pattern).
const createUserBody = z.object({
  empCode: fields.empCode,
  name: fields.name,
  email: fields.email,
  role: fields.role,
  department: fields.department.optional(),
  position: fields.position.optional(),
  status: fields.status.optional(),
  dropReason: fields.dropReason.optional(),
  entranceLevel: fields.entranceLevel.optional(),
  currentLevel: fields.currentLevel.optional(),
  password: fields.password,
});

const updateUserBody = z.object({
  empCode: fields.empCode.optional(),
  name: fields.name.optional(),
  email: fields.email.optional(),
  role: fields.role.optional(),
  department: fields.department.optional(),
  position: fields.position.optional(),
  status: fields.status.optional(),
  dropReason: fields.dropReason.optional(),
  entranceLevel: fields.entranceLevel.optional(),
  currentLevel: fields.currentLevel.optional(),
  password: fields.password.optional(),
  // BUG #9 fix: acting admin's password — required when mutating
  // `password` or `role` of another user. Length cap matches `password`.
  currentPassword: z.string().min(1).max(128).optional(),
});

// SEC-014 (audit PR W): list query was missing `search`, `sortBy` and
// `sortOrder` even though userController.getUsers reads them. With the
// keys absent from the schema, an attacker could send a 10 MB `search`
// string that would survive validation and only get bounded later by
// regex execution. Add them with explicit length / enum caps.
//
// `lastActive` is the alias the client sends (UsersPage default sort) —
// the controller maps it to the underlying `lastActiveAt` field on the
// User document. Keep it in the enum so the strict validator accepts
// the existing UI default; the controller-side whitelist remains the
// last line of defence against arbitrary collation keys.
const SORTABLE_FIELDS = [
  'empCode', 'name', 'department', 'position', 'status', 'role',
  'entranceLevel', 'currentLevel', 'lastActive',
];

const listUsersQuery = paginationQuery.extend({
  role: z.preprocess((v) => (v === '' ? undefined : v), fields.role.optional()),
  status: z.preprocess((v) => (v === '' ? undefined : v), fields.status.optional()),
  department: z.string().trim().max(120).optional(),
  // Free-text search across empCode/name/department/position.
  // Length capped at 120 to mirror the longest free-text field and
  // bound the worst-case regex input. No min — single-character queries
  // are operationally useless but should not 400 a UI typing race;
  // clients already debounce + gate on min length where it matters
  // (EvaluationPage uses `debouncedSearch.length >= 2`).
  search: z
    .preprocess((v) => (v === '' ? undefined : v),
                z.string().trim().max(120).optional()),
  sortBy: z
    .preprocess((v) => (v === '' ? undefined : v),
                z.enum(SORTABLE_FIELDS).optional()),
  sortOrder: z
    .preprocess((v) => (v === '' ? undefined : v),
                z.enum(['asc', 'desc']).optional()),
}).strict();  // Reject unknown query keys — defence-in-depth against schema drift.

module.exports = { createUserBody, updateUserBody, listUsersQuery };
