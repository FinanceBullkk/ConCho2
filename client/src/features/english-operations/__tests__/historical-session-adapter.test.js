import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adaptHistoricalSessions,
  nearestSessionStart,
} from '../historical-session-adapter';

describe('adaptHistoricalSessions', () => {
  it('treats imported Excel clock values as Vietnam wall time instead of adding seven hours', () => {
    const [session] = adaptHistoricalSessions([{
      id: 'archive-1',
      courseRunId: 'run-1',
      sessionNumber: 14,
      heldAt: '2026-07-27T10:00:00.000Z',
      status: 'held',
      classCode: 'EL037',
      courseName: 'Communication 2',
    }], { historical: 'Historical', readOnly: 'Read-only' });

    // The source workbook stores 10:00 as a timezone-free VN wall clock.
    // The generic grid expects a real UTC instant, hence 10:00 VN = 03:00Z.
    expect(session.startTime).toBe('2026-07-27T03:00:00.000Z');
    expect(session.endTime).toBe('2026-07-27T04:00:00.000Z');
  });

  it('distinguishes complete, partial, and missing imported attendance', () => {
    const schedules = adaptHistoricalSessions([
      {
        id: 'complete', courseRunId: 'run-1', sessionNumber: 1,
        heldAt: '2026-07-10T09:00:00.000Z', classCode: 'EL001', courseName: 'Foundation',
        attendanceCount: 5, expectedRosterCount: 5, presentCount: 4, absentCount: 1,
      },
      {
        id: 'partial', courseRunId: 'run-2', sessionNumber: 2,
        heldAt: '2026-07-11T09:00:00.000Z', classCode: 'EL002', courseName: 'Foundation',
        attendanceCount: 3, expectedRosterCount: 5, presentCount: 2, absentCount: 1,
      },
      {
        id: 'missing', courseRunId: 'run-3', sessionNumber: 3,
        heldAt: '2026-07-12T09:00:00.000Z', classCode: 'EL003', courseName: 'Foundation',
        attendanceCount: 0, expectedRosterCount: 5, presentCount: 0, absentCount: 0,
      },
    ], { historical: 'Historical', readOnly: 'Read-only', unrecorded: 'No evidence' });

    expect(schedules.map((row) => ({
      id: row.archiveSessionId,
      status: row.attendanceStatus,
      marked: row.markedCount,
      enrolled: row.enrolledCount,
    }))).toEqual([
      { id: 'complete', status: 'done', marked: 5, enrolled: 5 },
      { id: 'partial', status: 'partial', marked: 3, enrolled: 5 },
      { id: 'missing', status: 'unrecorded', marked: 0, enrolled: 5 },
    ]);
    expect(schedules[2].attendanceStateLabel).toBe('No evidence');
  });

  it('keeps live Meeting instants unchanged and uses their real duration', () => {
    const [session] = adaptHistoricalSessions([{
      id: 'live-1', courseRunId: 'run-1', sessionNumber: 15,
      heldAt: '2026-07-27T03:00:00.000Z', durationMinutes: 90,
      sourceKind: 'live', sourceWasImported: true,
      sourceStartsAt: '2026-07-27T10:00:00.000Z',
      operationalAt: '2026-07-21T00:00:00.000Z',
      classCode: 'EL037', courseName: 'Communication 2',
    }], { historical: 'Historical', readOnly: 'Read-only', live: 'Live' });

    expect(session.sourceKind).toBe('live');
    expect(session.startTime).toBe('2026-07-27T03:00:00.000Z');
    expect(session.endTime).toBe('2026-07-27T04:30:00.000Z');
    expect(session.historicalLabel).toBe('Live');
    expect(session.sourceWasImported).toBe(true);
    expect(session.sourceStartsAt).toBe('2026-07-27T10:00:00.000Z');
  });
});

describe('nearestSessionStart', () => {
  afterEach(() => vi.useRealTimers());

  const at = (startTime, markedCount = 0) => ({ startTime, markedCount });

  it('picks the session closest to now, in either direction', () => {
    const now = new Date('2026-07-24T02:00:00.000Z');
    expect(nearestSessionStart([
      at('2026-07-06T02:00:00.000Z', 5),
      at('2026-07-23T02:00:00.000Z'),
      at('2026-07-27T02:00:00.000Z'),
    ], now.getTime())).toBe('2026-07-23T02:00:00.000Z');
  });

  // The Upcoming filter used to strand the grid on the first MARKED session —
  // a week from the far past — so the tile counted 9 sessions while the
  // calendar rendered empty.
  it('lands on the nearest upcoming session when none are marked yet', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T02:00:00.000Z'));
    expect(nearestSessionStart([
      at('2026-07-27T02:00:00.000Z'),
      at('2026-07-29T02:00:00.000Z'),
    ])).toBe('2026-07-27T02:00:00.000Z');
  });

  it('ignores unparseable timestamps and returns null for an empty set', () => {
    expect(nearestSessionStart([at('not-a-date')], Date.parse('2026-07-24T02:00:00.000Z'))).toBeNull();
    expect(nearestSessionStart([])).toBeNull();
    expect(nearestSessionStart(undefined)).toBeNull();
  });
});
