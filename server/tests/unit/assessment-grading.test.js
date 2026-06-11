const { gradeAttempt, sameIndexSet, normalizeText } = require('../../domains/assessment/grading');

// Build an assessment-like object with explicit item _ids for keying answers.
const mk = (items, passingScorePercent = 0) => ({
  items: items.map((it, i) => ({ _id: `item${i}`, points: 1, ...it })),
  passingScorePercent,
});

describe('assessment/grading — pure auto-grading', () => {
  test('sameIndexSet is order-independent and de-duplicated', () => {
    expect(sameIndexSet([0, 1], [1, 0])).toBe(true);
    expect(sameIndexSet([1, 1, 0], [0, 1])).toBe(true);
    expect(sameIndexSet([0], [0, 1])).toBe(false);
    expect(sameIndexSet([], [])).toBe(true);
  });

  test('normalizeText trims and lowercases', () => {
    expect(normalizeText('  Hello ')).toBe('hello');
    expect(normalizeText(undefined)).toBe('');
  });

  test('single_choice: correct index earns full points', () => {
    const a = mk([{ type: 'single_choice', options: ['A', 'B'], correctOptionIndexes: [1] }]);
    const r = gradeAttempt(a, [{ itemId: 'item0', selectedOptionIndexes: [1] }]);
    expect(r.score).toBe(1);
    expect(r.maxScore).toBe(1);
    expect(r.scorePercent).toBe(100);
    expect(r.passed).toBe(true);
  });

  test('single_choice: wrong index earns zero', () => {
    const a = mk([{ type: 'single_choice', options: ['A', 'B'], correctOptionIndexes: [1] }], 50);
    const r = gradeAttempt(a, [{ itemId: 'item0', selectedOptionIndexes: [0] }]);
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
  });

  test('multiple_choice: all-or-nothing exact set match', () => {
    const a = mk([{ type: 'multiple_choice', options: ['A', 'B', 'C'], correctOptionIndexes: [0, 2] }]);
    expect(gradeAttempt(a, [{ itemId: 'item0', selectedOptionIndexes: [2, 0] }]).score).toBe(1);
    expect(gradeAttempt(a, [{ itemId: 'item0', selectedOptionIndexes: [0] }]).score).toBe(0);
    expect(gradeAttempt(a, [{ itemId: 'item0', selectedOptionIndexes: [0, 1, 2] }]).score).toBe(0);
  });

  test('short_text: case-insensitive, trimmed match against accepted answers', () => {
    const a = mk([{ type: 'short_text', acceptedAnswers: ['Paris', 'paris city'] }]);
    expect(gradeAttempt(a, [{ itemId: 'item0', text: '  paris ' }]).score).toBe(1);
    expect(gradeAttempt(a, [{ itemId: 'item0', text: 'London' }]).score).toBe(0);
  });

  test('mixed assessment rolls up weighted score and pass threshold', () => {
    const a = mk(
      [
        { type: 'single_choice', options: ['A', 'B'], correctOptionIndexes: [0], points: 2 },
        { type: 'short_text', acceptedAnswers: ['x'], points: 2 },
      ],
      60,
    );
    // Gets the 2-pt choice right, the 2-pt text wrong → 2/4 = 50% < 60 → fail.
    const r = gradeAttempt(a, [
      { itemId: 'item0', selectedOptionIndexes: [0] },
      { itemId: 'item1', text: 'wrong' },
    ]);
    expect(r.score).toBe(2);
    expect(r.maxScore).toBe(4);
    expect(r.scorePercent).toBe(50);
    expect(r.passed).toBe(false);
  });

  test('unanswered items earn zero (missing answer key)', () => {
    const a = mk([{ type: 'single_choice', options: ['A', 'B'], correctOptionIndexes: [0] }], 50);
    const r = gradeAttempt(a, []);
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
  });
});
