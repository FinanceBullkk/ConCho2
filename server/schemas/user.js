const { z } = require('zod');
const { paginationQuery } = require('./common');

const ROLES = ['Admin', 'Teacher', 'Participant'];
const STATUSES = ['Active', 'Dropped', 'Transferred', 'On-hold'];

// Field primitives — no defaults here so that using them in an
// update schema does not silently overwrite stored values with
// empty strings when a key is omitted.
const fields = {
  empCode: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1, 'name is required').max(120),
  role: z.enum(ROLES),
  department: z.string().trim().max(120),
  status: z.enum(STATUSES),
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
  status: fields.status.optional(),
  password: fields.password.optional(),
});

const updateUserBody = z.object({
  empCode: fields.empCode.optional(),
  name: fields.name.optional(),
  role: fields.role.optional(),
  department: fields.department.optional(),
  status: fields.status.optional(),
  password: fields.password.optional(),
});

const listUsersQuery = paginationQuery.extend({
  role: fields.role.optional(),
  status: fields.status.optional(),
  department: z.string().trim().max(120).optional(),
});

module.exports = { createUserBody, updateUserBody, listUsersQuery };
