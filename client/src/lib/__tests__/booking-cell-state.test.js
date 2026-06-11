import { describe, expect, it } from 'vitest';
import { bookingCellState } from '../booking-cell-state';

// Base args = empty future cell, bookable mode. Override per case.
const cell = (o = {}) => ({ mySchedule: null, blocker: null, isPast: false, bookable: true, ...o });

describe('bookingCellState', () => {
  it('classifies "mine" with precedence over every mode/time', () => {
    expect(bookingCellState(cell({ mySchedule: { _id: 'x' }, bookable: false }))).toBe('mine');
    expect(bookingCellState(cell({ mySchedule: { _id: 'x' }, isPast: true }))).toBe('mine');
  });

  it('shows "blocker" regardless of bookable (other-team visibility never gated)', () => {
    expect(bookingCellState(cell({ blocker: { _id: 'y' }, bookable: false }))).toBe('blocker');
    expect(bookingCellState(cell({ blocker: { _id: 'y' }, bookable: true }))).toBe('blocker');
  });

  it('keeps empty past cells muted in any mode', () => {
    expect(bookingCellState(cell({ isPast: true, bookable: true }))).toBe('empty-past');
    expect(bookingCellState(cell({ isPast: true, bookable: false }))).toBe('empty-past');
  });

  it('returns "bookable" for a future empty cell only when the mode allows it', () => {
    expect(bookingCellState(cell({ bookable: true }))).toBe('bookable');
  });

  it('returns "locked" for a future empty cell when the mode forbids leader booking', () => {
    expect(bookingCellState(cell({ bookable: false }))).toBe('locked');
  });
});
