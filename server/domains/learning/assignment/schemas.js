const { z } = require('zod');
const { objectId } = require('../../../schemas/common');

const targetType = z.enum(['program', 'path']);
const listAssignmentsQuery = z.object({
  status: z.enum(['active', 'archived']).optional(),
  targetType: targetType.optional(),
});

const createAssignmentBody = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000).optional(),
    targetType,
    programId: objectId.optional(),
    pathId: objectId.optional(),
    dueDate: z.coerce.date(),
    userIds: z.array(objectId).max(1000).optional(),
    departmentIds: z.array(objectId).max(100).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.targetType === 'program' && !body.programId) {
      ctx.addIssue({ code: 'custom', path: ['programId'], message: 'programId is required' });
    }
    if (body.targetType === 'path' && !body.pathId) {
      ctx.addIssue({ code: 'custom', path: ['pathId'], message: 'pathId is required' });
    }
    if (!(body.userIds?.length || body.departmentIds?.length)) {
      ctx.addIssue({ code: 'custom', message: 'At least one target is required' });
    }
  });

module.exports = { createAssignmentBody, listAssignmentsQuery };
