const { z } = require('zod');
const { objectId } = require('../../schemas/common');

const programCode = z.string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'code may contain only letters, numbers, underscore, and hyphen');

const completionPolicy = z.object({
  attendanceThresholdPercent: z.coerce.number().min(0).max(100).optional(),
  requiresAssessment: z.boolean().optional(),
  requiresFeedback: z.boolean().optional(),
}).optional();

const capacityPolicy = z.object({
  maxParticipants: z.coerce.number().int().min(1).nullable().optional(),
  maxParticipantsPerSession: z.coerce.number().int().min(1).nullable().optional(),
}).optional();

const facilitatorPolicy = z.object({
  assignmentRequired: z.boolean().optional(),
  visibility: z.enum(['all_facilitators', 'assigned_only']).optional(),
}).optional();

const recertifyPolicy = z.object({
  autoAssign: z.boolean().optional(),
}).optional();

const createProgramBody = z.object({
  code: programCode,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(['english', 'onboarding', 'compliance', 'soft_skills', 'technical', 'workshop', 'other']).default('other'),
  defaultSessionCount: z.coerce.number().int().min(1).max(200).default(1),
  deliveryMode: z.enum(['online', 'offline', 'hybrid']).default('online'),
  schedulingMode: z.enum(['leader_booking', 'admin_scheduled', 'self_enroll', 'nomination']).default('admin_scheduled'),
  completionPolicy,
  certificateValidityDays: z.coerce.number().int().min(1).max(3650).nullable().optional(),
  capacityPolicy,
  facilitatorPolicy,
  recertifyPolicy,
  prerequisitePrograms: z.array(objectId).max(20).optional(),
  status: z.enum(['active', 'inactive', 'archived']).default('active'),
  // Values for admin-defined custom fields (Studio ▸ Custom fields). Free-form
  // map keyed by CustomFieldDefinition.key; per-field meaning is admin-defined.
  customFields: z.record(z.string(), z.any()).optional(),
});

const updateProgramBody = createProgramBody.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required' }
);

const listProgramsQuery = z.object({
  status: z.enum(['active', 'inactive', 'archived']).optional(),
  category: z.enum(['english', 'onboarding', 'compliance', 'soft_skills', 'technical', 'workshop', 'other']).optional(),
  q: z.string().trim().max(120).optional(),
});

const listCohortsQuery = z.object({
  status: z.enum(['Ongoing', 'Completed']).optional(),
  programId: objectId.optional(),
  cohortCode: z.string().trim().optional(),
  classCode: z.string().trim().optional(),
  // English-class separation: scheduling-world filter. team = leader_booking/
  // admin_scheduled programs + program-less legacy classes; cohort =
  // self_enroll/nomination. Ignored when programId is given (already scoped).
  mode: z.enum(['team', 'cohort']).optional(),
});

const createCohortBody = z.object({
  cohortCode: z.string().trim().min(1).optional(),
  classCode: z.string().trim().min(1).optional(),
  programId: objectId,
  status: z.enum(['Ongoing', 'Completed']).optional(),
  totalSessions: z.coerce.number().int().min(1).max(200).optional(),
  teacherIds: z.array(objectId).optional(),
  // Values for admin-defined custom fields (Studio ▸ Custom fields, Cohort
  // entity). Free-form map keyed by CustomFieldDefinition.key.
  customFields: z.record(z.string(), z.any()).optional(),
});

// Cohort edit — status + totalSessions + custom field values are editable
// (mirrors the legacy class edit surface, plus custom fields); at least one
// field must be present.
const updateCohortBody = z.object({
  status: z.enum(['Ongoing', 'Completed']).optional(),
  totalSessions: z.coerce.number().int().min(1).max(200).optional(),
  customFields: z.record(z.string(), z.any()).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field (status, totalSessions, or customFields) is required',
});

module.exports = {
  createProgramBody,
  updateProgramBody,
  listProgramsQuery,
  listCohortsQuery,
  createCohortBody,
  updateCohortBody,
};
