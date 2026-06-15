import { describe, it, expect } from 'vitest';
import {
  markKey, buildQueueRows, groupBySchedule, queuedCountForSchedule,
} from '../attendance-offline-utils';

describe('attendance-offline-utils', () => {
  it('markKey is stable per (schedule, user)', () => {
    expect(markKey('s1', 'u1')).toBe('s1::u1');
  });

  it('buildQueueRows drops incomplete records and stamps the key', () => {
    const rows = buildQueueRows('s1', [
      { userId: 'u1', status: 'P' },
      { userId: 'u2', status: 'A' },
      { userId: 'u3' },          // no status → dropped
      { status: 'P' },           // no userId → dropped
    ], 1000);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ key: 's1::u1', scheduleId: 's1', userId: 'u1', status: 'P', queuedAt: 1000 });
  });

  it('groupBySchedule reassembles per-schedule bulkMark payloads', () => {
    const rows = [
      { key: 's1::u1', scheduleId: 's1', userId: 'u1', status: 'P' },
      { key: 's1::u2', scheduleId: 's1', userId: 'u2', status: 'A' },
      { key: 's2::u1', scheduleId: 's2', userId: 'u1', status: 'L' },
    ];
    const groups = groupBySchedule(rows);
    expect(groups).toHaveLength(2);
    const s1 = groups.find((g) => g.scheduleId === 's1');
    expect(s1.records).toEqual([{ userId: 'u1', status: 'P' }, { userId: 'u2', status: 'A' }]);
    expect(s1.keys).toEqual(['s1::u1', 's1::u2']);
  });

  it('queuedCountForSchedule counts only that schedule', () => {
    const rows = [
      { scheduleId: 's1', userId: 'u1' },
      { scheduleId: 's1', userId: 'u2' },
      { scheduleId: 's2', userId: 'u1' },
    ];
    expect(queuedCountForSchedule(rows, 's1')).toBe(2);
    expect(queuedCountForSchedule(rows, 's2')).toBe(1);
    expect(queuedCountForSchedule(rows, 's3')).toBe(0);
  });
});
