export const ASSESSMENT_ITEM_TYPES = ['single_choice', 'multiple_choice', 'short_text'];

export const blankAssessmentItem = {
  type: 'single_choice',
  prompt: '',
  optionsText: 'Option A\nOption B',
  correctText: '1',
  acceptedText: '',
  points: 1,
};

export const indexList = (text) => text
  .split(',')
  .map((v) => Number(v.trim()) - 1)
  .filter((v) => Number.isInteger(v) && v >= 0);

export const itemPayload = (item) => {
  const base = {
    type: item.type,
    prompt: item.prompt.trim(),
    points: Number(item.points) || 1,
  };
  if (item.type === 'short_text') {
    return {
      ...base,
      acceptedAnswers: item.acceptedText.split('\n').map((v) => v.trim()).filter(Boolean),
    };
  }
  return {
    ...base,
    options: item.optionsText.split('\n').map((v) => v.trim()).filter(Boolean),
    correctOptionIndexes: indexList(item.correctText),
  };
};

export const itemFormValue = (item = {}) => ({
  type: item.type || blankAssessmentItem.type,
  prompt: item.prompt || '',
  optionsText: (item.options || ['Option A', 'Option B']).join('\n'),
  correctText: (item.correctOptionIndexes || [0]).map((v) => Number(v) + 1).join(', '),
  acceptedText: (item.acceptedAnswers || []).join('\n'),
  points: typeof item.points === 'number' ? item.points : 1,
});

export const assessmentFormValue = (assessment, selectedCohortId) => ({
  title: assessment?.title || '',
  description: assessment?.description || '',
  cohortId: assessment?.cohortId || selectedCohortId || '',
  passingScorePercent: assessment?.passingScorePercent ?? 70,
  maxAttempts: assessment?.maxAttempts ?? 0,
  isPublished: assessment?.isPublished ?? true,
});

export const assessmentItemsValue = (assessment) =>
  assessment?.items?.length ? assessment.items.map(itemFormValue) : [{ ...blankAssessmentItem }];
