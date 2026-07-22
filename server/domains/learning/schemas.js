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

const englishLevel = z.object({
  code: z.string().trim().min(1).max(60).regex(/^[a-z0-9_]+$/),
  displayName: z.string().trim().min(1).max(120),
  order: z.coerce.number().int().min(1).max(100),
});

const englishPolicy = z.object({
  maxAbsencesAllowed: z.coerce.number().int().min(0).max(200),
  absenceStatuses: z.array(z.enum(['A', 'L', 'EL'])).min(1).max(3).default(['A']),
  levelScale: z.array(englishLevel).length(13),
}).superRefine((policy, ctx) => {
  if (new Set(policy.levelScale.map((level) => level.code)).size !== policy.levelScale.length) {
    ctx.addIssue({ code: 'custom', message: 'level codes must be unique', path: ['levelScale'] });
  }
  if (new Set(policy.levelScale.map((level) => level.order)).size !== policy.levelScale.length) {
    ctx.addIssue({ code: 'custom', message: 'level orders must be unique', path: ['levelScale'] });
  }
});

const programShape = {
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
  englishPolicy: englishPolicy.nullable().optional(),
  prerequisitePrograms: z.array(objectId).max(20).optional(),
  status: z.enum(['active', 'inactive', 'archived']).default('active'),
  // Values for admin-defined custom fields (Studio ▸ Custom fields). Free-form
  // map keyed by CustomFieldDefinition.key; per-field meaning is admin-defined.
  customFields: z.record(z.string(), z.any()).optional(),
};

const createProgramBody = z.object(programShape).superRefine((program, ctx) => {
  if (program.category === 'english') {
    if (program.schedulingMode !== 'nomination') {
      ctx.addIssue({ code: 'custom', message: 'English programs must use nomination scheduling', path: ['schedulingMode'] });
    }
    if (!program.englishPolicy) {
      ctx.addIssue({ code: 'custom', message: 'englishPolicy is required for English programs', path: ['englishPolicy'] });
    }
  } else if (program.englishPolicy != null) {
    ctx.addIssue({ code: 'custom', message: 'englishPolicy is only valid for English programs', path: ['englishPolicy'] });
  }
});

const updateProgramBody = z.object(programShape).partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required' }
);

const listProgramsQuery = z.object({
  status: z.enum(['active', 'inactive', 'archived']).optional(),
  category: z.enum(['english', 'onboarding', 'compliance', 'soft_skills', 'technical', 'workshop', 'other']).optional(),
  liveEnglish: z.enum(['true']).transform(() => true).optional(),
  q: z.string().trim().max(120).optional(),
});

const listCohortsQuery = z.object({
  status: z.enum(['Ongoing', 'Completed']).optional(),
  programId: objectId.optional(),
  cohortCode: z.string().trim().optional(),
  classCode: z.string().trim().optional(),
  category: z.enum(['english', 'onboarding', 'compliance', 'soft_skills', 'technical', 'workshop', 'other']).optional(),
  liveEnglish: z.enum(['true']).transform(() => true).optional(),
});

const createCohortBody = z.object({
  cohortCode: z.string().trim().min(1).optional(),
  classCode: z.string().trim().min(1).optional(),
  programId: objectId,
  status: z.enum(['Ongoing', 'Completed']).optional(),
  totalSessions: z.coerce.number().int().min(1).max(200).optional(),
  teacherIds: z.array(objectId).optional(),
  englishGroupCode: z.string().trim().min(1).max(60).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/).optional(),
  englishPicDisplay: z.string().trim().max(160).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customFields: z.record(z.string(), z.any()).optional(),
});

// Cohort edit — status + totalSessions + custom fields are editable (mirrors the
// legacy class edit surface); at least one field must be present.
const updateCohortBody = z.object({
  status: z.enum(['Ongoing', 'Completed']).optional(),
  totalSessions: z.coerce.number().int().min(1).max(200).optional(),
  customFields: z.record(z.string(), z.any()).optional(),
  teacherIds: z.array(objectId).optional(),
  englishGroupCode: z.string().trim().min(1).max(60).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/).optional(),
  englishPicDisplay: z.string().trim().max(160).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one editable field is required',
});

// Nudge selected cohort learners (in-app notification). TMS.update S4.
const nudgeCohortBody = z.object({
  userIds: z.array(objectId).min(1).max(500),
  message: z.string().trim().max(500).optional(),
});

module.exports = {
  createProgramBody,
  updateProgramBody,
  listProgramsQuery,
  listCohortsQuery,
  createCohortBody,
  updateCohortBody,
  nudgeCohortBody,
};
