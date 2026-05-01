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

const createUserBody = z.object({
  empCode: fields.empCode.optional(),
  name: fields.name,
  role: fields.role,
  department: fields.department.optional(),
  position: fields.position.optional(),
  status: fields.status.optional(),
  dropReason: fields.dropReason.optional(),
  entranceLevel: fields.entranceLevel.optional(),
  currentLevel: fields.currentLevel.optional(),
  password: fields.password.optional(),
});

const updateUserBody = z.object({
  empCode: fields.empCode.optional(),
  name: fields.name.optional(),
  role: fields.role.optional(),
  department: fields.department.optional(),
  position: fields.position.optional(),
  status: fields.status.optional(),
  dropReason: fields.dropReason.optional(),
  entranceLevel: fields.entranceLevel.optional(),
  currentLevel: fields.currentLevel.optional(),
  password: fields.password.optional(),
});

const listUsersQuery = paginationQuery.extend({
  role: fields.role.optional(),
  status: fields.status.optional(),
  department: z.string().trim().max(120).optional(),
});

module.exports = { createUserBody, updateUserBody, listUsersQuery };
