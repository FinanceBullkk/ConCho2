import { describe, it, expect } from 'vitest';
import { detectConflicts } from '../schedule-conflicts';

const ev = (id, start, end) => ({ _id: id, startTime: start, endTime: end });

describe('detectConflicts', () => {
  const base = [
    ev('a', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z'),
    ev('b', '2026-01-01T13:00:00Z', '2026-01-01T14:00:00Z'),
  ];

  it('flags an overlapping window', () => {
    const c = ev('new', '2026-01-01T10:30:00Z', '2026-01-01T11:30:00Z');
    expect(detectConflicts(base, c).map((s) => s._id)).toEqual(['a']);
  });

  it('returns empty when nothing overlaps', () => {
    const c = ev('new', '2026-01-01T11:30:00Z', '2026-01-01T12:30:00Z');
    expect(detectConflicts(base, c)).toEqual([]);
  });

  it('treats touching boundaries as NON-overlapping (end === otherStart)', () => {
    // candidate ends exactly when 'a' starts → intervals only touch, no overlap
    const c = ev('new', '2026-01-01T09:00:00Z', '2026-01-01T10:00:00Z');
    expect(detectConflicts(base, c)).toEqual([]);
  });

  it('excludes the candidate itself by _id (editing an existing session)', () => {
    const c = ev('a', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z');
    expect(detectConflicts(base, c)).toEqual([]);
  });

  it('still flags a same-time clash when the candidate has no _id (new booking)', () => {
    const c = { startTime: '2026-01-01T10:00:00Z', endTime: '2026-01-01T11:00:00Z' };
    expect(detectConflicts(base, c).map((s) => s._id)).toEqual(['a']);
  });

  it('returns empty for invalid or inverted time windows', () => {
    expect(detectConflicts(base, ev('x', 'not-a-date', '2026-01-01T11:00:00Z'))).toEqual([]);
    expect(detectConflicts(base, ev('x', '2026-01-01T11:00:00Z', '2026-01-01T10:00:00Z'))).toEqual([]);
  });

  it('detects multiple simultaneous conflicts', () => {
    const c = ev('new', '2026-01-01T09:30:00Z', '2026-01-01T13:30:00Z'); // spans both a and b
    expect(detectConflicts(base, c).map((s) => s._id).sort()).toEqual(['a', 'b']);
  });
});
