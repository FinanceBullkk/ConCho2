const { z } = require('zod');
const { objectId, idParam } = require('../../schemas/common');
const { ITEM_TYPES } = require('../../models/Assessment');
const { itemSchema } = require('./schemas');

const questionMeta = z.object({
  explanation: z.string().trim().max(2000).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  programId: objectId.optional().nullable(),
  cohortId: objectId.optional().nullable(),
});

const questionBankBody = itemSchema.and(questionMeta);

const questionBankQuery = z.object({
  programId: objectId.optional(),
  cohortId: objectId.optional(),
  type: z.enum(ITEM_TYPES).optional(),
  tag: z.string().trim().min(1).max(60).optional(),
  q: z.string().trim().min(1).max(200).optional(),
});

module.exports = {
  idParam,
  questionBankBody,
  questionBankQuery,
};
