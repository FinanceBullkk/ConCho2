const { z } = require('zod');
const { objectId } = require('../../schemas/common');
const { ITEM_TYPES } = require('../../models/Assessment');

const optionIndexes = z.array(z.number().int().min(0)).min(1);

// An authored item. Choice types need options + correct indexes; short_text
// needs accepted answers. Cross-field rules are enforced via superRefine.
const itemSchema = z
  .object({
    type: z.enum(ITEM_TYPES),
    prompt: z.string().trim().min(1).max(2000),
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(20).optional(),
    correctOptionIndexes: optionIndexes.optional(),
    acceptedAnswers: z.array(z.string().trim().min(1).max(500)).min(1).max(20).optional(),
    questionBankItemId: objectId.optional(),
    points: z.coerce.number().min(0).max(100).optional(),
  })
  .superRefine((item, ctx) => {
    const isChoice = item.type === 'single_choice' || item.type === 'multiple_choice';
    if (isChoice) {
      if (!item.options || !item.correctOptionIndexes) {
        ctx.addIssue({ code: 'custom', message: 'Choice items require options and correctOptionIndexes' });
        return;
      }
      if (item.type === 'single_choice' && item.correctOptionIndexes.length !== 1) {
        ctx.addIssue({ code: 'custom', message: 'single_choice needs exactly one correct option' });
      }
      const max = item.options.length - 1;
      if (item.correctOptionIndexes.some((i) => i > max)) {
        ctx.addIssue({ code: 'custom', message: 'correctOptionIndexes out of range' });
      }
    } else if (item.type === 'short_text' && !item.acceptedAnswers) {
      ctx.addIssue({ code: 'custom', message: 'short_text items require acceptedAnswers' });
    }
  });

const createAssessmentBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  cohortId: objectId,
  items: z.array(itemSchema).max(100).optional(),
  questionBankItemIds: z.array(objectId).max(100).optional(),
  passingScorePercent: z.coerce.number().min(0).max(100).optional(),
  maxAttempts: z.coerce.number().int().min(0).optional(),
  timeLimitMinutes: z.coerce.number().int().min(0).max(600).optional(),
  shuffleQuestions: z.coerce.boolean().optional(),
  showAnswersAfter: z.coerce.boolean().optional(),
  isPublished: z.coerce.boolean().optional(),
}).superRefine((body, ctx) => {
  const authored = body.items?.length || 0;
  const imported = body.questionBankItemIds?.length || 0;
  if (authored + imported < 1) {
    ctx.addIssue({ code: 'custom', message: 'An assessment needs at least one item' });
  }
  if (authored + imported > 100) {
    ctx.addIssue({ code: 'custom', message: 'An assessment can contain at most 100 items' });
  }
});

const updateAssessmentBody = createAssessmentBody;

const listAssessmentsQuery = z.object({
  cohortId: objectId.optional(),
});

// A learner's submitted answers, keyed by item id.
const submitAttemptBody = z.object({
  answers: z
    .array(
      z.object({
        itemId: objectId,
        selectedOptionIndexes: z.array(z.number().int().min(0)).optional(),
        text: z.string().trim().max(2000).optional(),
      }),
    )
    .min(1),
});

const listAttemptsQuery = z.object({
  cohortId: objectId.optional(),
  assessmentId: objectId.optional(),
  learnerId: objectId.optional(),
});

const manualGradeAttemptBody = z.object({
  answers: z.array(z.object({
    itemId: objectId,
    pointsEarned: z.coerce.number().min(0).max(100),
    note: z.string().trim().max(1000).optional(),
  })).min(1),
});

module.exports = {
  itemSchema,
  createAssessmentBody,
  updateAssessmentBody,
  listAssessmentsQuery,
  submitAttemptBody,
  listAttemptsQuery,
  manualGradeAttemptBody,
};
