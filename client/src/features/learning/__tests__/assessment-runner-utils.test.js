import { describe, it, expect } from 'vitest';
import { formatClock, shuffleItems, answeredCount } from '../assessment-runner-utils';

describe('assessment-runner-utils', () => {
  it('formatClock renders MM:SS and clamps at zero', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(600)).toBe('10:00');
    expect(formatClock(-10)).toBe('00:00');
  });

  it('shuffleItems is a no-op when disabled or < 2 items', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(shuffleItems(items, false)).toBe(items);
    expect(shuffleItems([{ id: 'a' }], true)).toEqual([{ id: 'a' }]);
  });

  it('shuffleItems keeps the same set of items when enabled', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const out = shuffleItems(items, true);
    expect(out).toHaveLength(4);
    expect(out.map((i) => i.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('answeredCount counts choice + short_text answers', () => {
    const items = [
      { id: 'q1', type: 'single_choice' },
      { id: 'q2', type: 'multiple_choice' },
      { id: 'q3', type: 'short_text' },
    ];
    const answers = {
      q1: { selectedOptionIndexes: [0] },
      q2: { selectedOptionIndexes: [] },   // selected nothing → not answered
      q3: { text: '  ' },                  // whitespace → not answered
    };
    expect(answeredCount(items, answers)).toBe(1);

    answers.q3.text = 'done';
    expect(answeredCount(items, answers)).toBe(2);
  });
});
