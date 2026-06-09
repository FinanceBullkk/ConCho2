import { describe, expect, it } from 'vitest';
import {
  slotId,
  scheduleSlotId,
  slotToUtcRange,
  buildSlotRows,
} from '../scheduling-slots';

const OFFSET = 420; // VN +07:00, fixed (no DST)

const desc = (sh, sm, eh, em) => ({
  id: slotId({ startHour: sh, startMinute: sm, endHour: eh, endMinute: em }),
  label: slotId({ startHour: sh, startMinute: sm, endHour: eh, endMinute: em }),
  startHour: sh, startMinute: sm, endHour: eh, endMinute: em,
  durationMinutes: (eh * 60 + em) - (sh * 60 + sm),
});

describe('slotId', () => {
  it('formats HH:mm-HH:mm', () => {
    expect(slotId({ startHour: 9, startMinute: 5, endHour: 10, endMinute: 45 })).toBe('09:05-10:45');
  });
});

describe('scheduleSlotId', () => {
  it('derives the VN wall-clock id from a UTC session (tz-independent)', () => {
    // VN 10:00-11:00 === UTC 03:00-04:00
    const schedule = { startTime: '2026-06-10T03:00:00.000Z', endTime: '2026-06-10T04:00:00.000Z' };
    expect(scheduleSlotId(schedule, OFFSET)).toBe('10:00-11:00');
  });

  it('handles minute-offset windows', () => {
    // VN 09:15-10:45 === UTC 02:15-03:45
    const schedule = { startTime: '2026-06-10T02:15:00.000Z', endTime: '2026-06-10T03:45:00.000Z' };
    expect(scheduleSlotId(schedule, OFFSET)).toBe('09:15-10:45');
  });
});

describe('slotToUtcRange', () => {
  const day = new Date(2026, 5, 10); // local June 10 — Y/M/D read locally = 2026,5,10 in any tz

  it('builds an exact UTC range for a 60-min slot (no hour+1)', () => {
    const { startISO, endISO } = slotToUtcRange(day, desc(10, 0, 11, 0), OFFSET);
    expect(startISO).toBe('2026-06-10T03:00:00.000Z');
    expect(endISO).toBe('2026-06-10T04:00:00.000Z');
  });

  it('builds an exact UTC range for a 90-min / minute-offset slot', () => {
    const { startISO, endISO } = slotToUtcRange(day, desc(9, 15, 10, 45), OFFSET);
    expect(startISO).toBe('2026-06-10T02:15:00.000Z');
    expect(endISO).toBe('2026-06-10T03:45:00.000Z');
  });

  it('round-trips: range → scheduleSlotId yields the same window', () => {
    const slot = desc(13, 30, 15, 0);
    const { startISO, endISO } = slotToUtcRange(day, slot, OFFSET);
    expect(scheduleSlotId({ startTime: startISO, endTime: endISO }, OFFSET)).toBe(slot.id);
  });
});

describe('buildSlotRows', () => {
  const config = [desc(10, 0, 11, 0), desc(13, 0, 14, 0)];
  const weekStart = new Date('2026-06-08T00:00:00.000Z');
  const weekEnd = new Date('2026-06-15T00:00:00.000Z');

  it('returns configured slots when there are no sessions', () => {
    const rows = buildSlotRows(config, [], OFFSET, weekStart, weekEnd);
    expect(rows.map((r) => r.id)).toEqual(['10:00-11:00', '13:00-14:00']);
    expect(rows.every((r) => r.offPolicy === false)).toBe(true);
  });

  it('merges off-policy sessions as read-only rows, ordered by start', () => {
    const schedules = [
      // matches a configured slot → no extra row
      { startTime: '2026-06-10T03:00:00.000Z', endTime: '2026-06-10T04:00:00.000Z' },
      // off-policy VN 08:00-09:30 (UTC 01:00-02:30) → its own row, sorts first
      { startTime: '2026-06-10T01:00:00.000Z', endTime: '2026-06-10T02:30:00.000Z' },
    ];
    const rows = buildSlotRows(config, schedules, OFFSET, weekStart, weekEnd);
    expect(rows.map((r) => r.id)).toEqual(['08:00-09:30', '10:00-11:00', '13:00-14:00']);
    const off = rows.find((r) => r.id === '08:00-09:30');
    expect(off.offPolicy).toBe(true);
    expect(off.durationMinutes).toBe(90);
  });

  it('ignores sessions outside the visible week', () => {
    const schedules = [
      { startTime: '2026-07-01T01:00:00.000Z', endTime: '2026-07-01T02:30:00.000Z' }, // out of week
    ];
    const rows = buildSlotRows(config, schedules, OFFSET, weekStart, weekEnd);
    expect(rows.map((r) => r.id)).toEqual(['10:00-11:00', '13:00-14:00']);
  });

  it('renders off-policy history even when config is empty (fail-closed booking, visible history)', () => {
    const schedules = [
      { startTime: '2026-06-10T01:00:00.000Z', endTime: '2026-06-10T02:30:00.000Z' },
    ];
    const rows = buildSlotRows([], schedules, OFFSET, weekStart, weekEnd);
    expect(rows.map((r) => r.id)).toEqual(['08:00-09:30']);
    expect(rows[0].offPolicy).toBe(true);
  });
});
