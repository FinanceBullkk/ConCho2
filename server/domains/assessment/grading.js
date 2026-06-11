// Pure auto-grading for assessment attempts. No DB, no HTTP → unit-testable.
//
// Grading is all-or-nothing per item (v1): a choice item earns full points only
// on an exact match of the selected index set to the correct index set; a
// short_text item earns full points on a trimmed, case-insensitive match to any
// accepted answer. Unknown/unanswered items earn zero.

const round2 = (n) => Math.round(n * 100) / 100;
const normalizeText = (s) => (s || '').trim().toLowerCase();

// Set-equality for two arrays of numbers (order-independent, de-duplicated).
const sameIndexSet = (a = [], b = []) => {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const v of sa) if (!sb.has(v)) return false;
  return true;
};

const gradeItem = (item, answer) => {
  const points = typeof item.points === 'number' ? item.points : 1;
  let correct = false;

  if (item.type === 'single_choice' || item.type === 'multiple_choice') {
    correct = sameIndexSet(answer?.selectedOptionIndexes, item.correctOptionIndexes);
  } else if (item.type === 'short_text') {
    const accepted = (item.acceptedAnswers || []).map(normalizeText);
    correct = accepted.includes(normalizeText(answer?.text));
  }

  return {
    itemId: item._id,
    selectedOptionIndexes: answer?.selectedOptionIndexes,
    text: answer?.text,
    pointsPossible: points,
    pointsEarned: correct ? points : 0,
    correct,
  };
};

// Grade a whole attempt. `answers` is keyed by item _id (string-compared).
// Returns the graded answer rows plus the rolled-up score + pass flag.
const gradeAttempt = (assessment, answers = []) => {
  const byItem = new Map(answers.map((a) => [String(a.itemId), a]));

  const graded = assessment.items.map((item) =>
    gradeItem(item, byItem.get(String(item._id))));

  const score = graded.reduce((sum, g) => sum + g.pointsEarned, 0);
  const maxScore = graded.reduce((sum, g) => sum + g.pointsPossible, 0);
  const scorePercent = maxScore > 0 ? round2((score / maxScore) * 100) : 0;
  const passed = scorePercent >= (assessment.passingScorePercent || 0);

  return { graded, score, maxScore, scorePercent, passed };
};

module.exports = { gradeAttempt, gradeItem, sameIndexSet, normalizeText };
