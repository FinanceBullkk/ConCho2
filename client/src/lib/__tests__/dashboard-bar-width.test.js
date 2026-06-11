import { describe, expect, it } from 'vitest';
import { activeRatioBarWidth } from '../dashboard-bar-width';

describe('activeRatioBarWidth', () => {
  it('matches the active/total label shown in org breakdown bars', () => {
    expect(activeRatioBarWidth(15, 63)).toBeCloseTo(23.81, 2);
    expect(activeRatioBarWidth(23, 28)).toBeCloseTo(82.14, 2);
    expect(activeRatioBarWidth(0, 7)).toBe(0);
  });

  it('guards invalid totals and clamps invalid active counts', () => {
    expect(activeRatioBarWidth(3, 0)).toBe(0);
    expect(activeRatioBarWidth(10, 5)).toBe(100);
    expect(activeRatioBarWidth(-1, 5)).toBe(0);
  });
});
