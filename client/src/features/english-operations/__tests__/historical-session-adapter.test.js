import { describe, expect, it } from 'vitest';
import {
  adaptHistoricalSessions,
  latestMarkedHistoricalStart,
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
    expect(latestMarkedHistoricalStart([...schedules].reverse())).toBe(schedules[1].startTime);
  });

  it('keeps live Meeting instants unchanged and uses their real duration', () => {
    const [session] = adaptHistoricalSessions([{
      id: 'live-1', courseRunId: 'run-1', sessionNumber: 15,
      heldAt: '2026-07-27T03:00:00.000Z', durationMinutes: 90,
      sourceKind: 'live', classCode: 'EL037', courseName: 'Communication 2',
    }], { historical: 'Historical', readOnly: 'Read-only', live: 'Live' });

    expect(session.sourceKind).toBe('live');
    expect(session.startTime).toBe('2026-07-27T03:00:00.000Z');
    expect(session.endTime).toBe('2026-07-27T04:30:00.000Z');
    expect(session.historicalLabel).toBe('Live');
  });
});
