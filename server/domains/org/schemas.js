const { z } = require('zod');
const { objectId } = require('../../schemas/common');

// ──────────────────────────────────────────────────────────
// org/schemas — zod request validation for the org domain.
// ──────────────────────────────────────────────────────────

const code = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Code may contain only letters, digits, underscore, and hyphen');

const createDepartmentBody = z.object({
  name: z.string().trim().min(1).max(120),
  code,
  description: z.string().trim().max(1000).optional(),
});

// Code is immutable after creation (stable org identifier).
const updateDepartmentBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'No fields to update' });

const listDepartmentsQuery = z.object({
  search: z.string().trim().max(120).optional(),
});

// Assign a user's manager / department. `null` clears the field; omit to leave
// it unchanged. At least one of the two must be present.
const assignUserBody = z
  .object({
    managerId: objectId.nullable().optional(),
    departmentId: objectId.nullable().optional(),
  })
  .refine((b) => b.managerId !== undefined || b.departmentId !== undefined, {
    message: 'Provide managerId and/or departmentId',
  });

const myTeamQuery = z.object({}).optional();

module.exports = {
  createDepartmentBody,
  updateDepartmentBody,
  listDepartmentsQuery,
  assignUserBody,
  myTeamQuery,
};
