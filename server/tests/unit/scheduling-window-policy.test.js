const {
  normalizeSlot,
  parseSlots,
  assertSlotsValidForWrite,
  assertValidBookingWindow,
} = require('../../domains/schedule/scheduling-window-policy');

// Pure-function tests (no DB). assertValidBookingWindow's date-guard branches
// run before any Settings read, so they are exercised here too; the slot-match
// branch (which reads the Setting) is covered by integration tests.

describe('scheduling-window-policy — normalizeSlot', () => {
  test('normalizes a valid window and ignores extra fields (e.g. label)', () => {
    const d = normalizeSlot({ sh: 9, sm: 0, eh: 10, em: 30, label: '09:00-10:30' });
    expect(d).toMatchObject({
      startHour: 9, startMinute: 0, endHour: 10, endMinute: 30, durationMinutes: 90,
    });
  });

  test('rejects non-integer / out-of-range / non-object', () => {
    expect(normalizeSlot({ sh: 9.5, sm: 0, eh: 10, em: 0 })).toBeNull();
    expect(normalizeSlot({ sh: 24, sm: 0, eh: 25, em: 0 })).toBeNull();
    expect(normalizeSlot({ sh: 9, sm: 60, eh: 10, em: 0 })).toBeNull();
    expect(normalizeSlot(null)).toBeNull();
    expect(normalizeSlot('10:00')).toBeNull();
  });

  test('rejects non-positive / non-same-day windows', () => {
    expect(normalizeSlot({ sh: 10, sm: 0, eh: 10, em: 0 })).toBeNull(); // zero length
    expect(normalizeSlot({ sh: 11, sm: 0, eh: 10, em: 0 })).toBeNull(); // end before start
  });
});

describe('scheduling-window-policy — parseSlots', () => {
  test('sorts valid slots by start time and reports none', () => {
    const { slots, errors } = parseSlots([
      { sh: 14, sm: 0, eh: 15, em: 0 },
      { sh: 9, sm: 0, eh: 10, em: 0 },
    ]);
    expect(errors).toHaveLength(0);
    expect(slots.map((s) => s.startHour)).toEqual([9, 14]);
  });

  test('reports invalid entries by index but keeps valid ones', () => {
    const { slots, errors } = parseSlots([
      { sh: 9, sm: 0, eh: 10, em: 0 },
      { sh: 99, sm: 0, eh: 10, em: 0 },
    ]);
    expect(slots).toHaveLength(1);
    expect(errors.some((e) => e.includes('slot[1]'))).toBe(true);
  });

  test('detects overlapping and duplicate windows (still returns them)', () => {
    const overlap = parseSlots([
      { sh: 9, sm: 0, eh: 10, em: 0 },
      { sh: 9, sm: 30, eh: 11, em: 0 },
    ]);
    expect(overlap.slots).toHaveLength(2);
    expect(overlap.errors.some((e) => e.includes('overlaps'))).toBe(true);

    const dup = parseSlots([
      { sh: 9, sm: 0, eh: 10, em: 0 },
      { sh: 9, sm: 0, eh: 10, em: 0 },
    ]);
    expect(dup.errors.some((e) => e.includes('overlaps'))).toBe(true);
  });

  test('non-array input is an error; empty array is clean', () => {
    expect(parseSlots('nope').errors).toHaveLength(1);
    expect(parseSlots([])).toEqual({ slots: [], errors: [] });
  });
});

describe('scheduling-window-policy — assertSlotsValidForWrite', () => {
  test('allows an empty array (disables booking, keeps history)', () => {
    expect(() => assertSlotsValidForWrite([])).not.toThrow();
  });

  test('allows valid, non-overlapping windows', () => {
    expect(() => assertSlotsValidForWrite([
      { sh: 8, sm: 0, eh: 9, em: 30 },
      { sh: 10, sm: 0, eh: 11, em: 30 },
    ])).not.toThrow();
  });

  test('rejects malformed windows with 400', () => {
    expect.assertions(2);
    try {
      assertSlotsValidForWrite([{ sh: 9, sm: 0, eh: 8, em: 0 }]);
    } catch (e) {
      expect(e.statusCode).toBe(400);
      expect(e.message).toMatch(/Invalid ALLOWED_TIME_SLOTS/);
    }
  });

  test('rejects overlapping windows with 400', () => {
    expect(() => assertSlotsValidForWrite([
      { sh: 9, sm: 0, eh: 10, em: 0 },
      { sh: 9, sm: 30, eh: 11, em: 0 },
    ])).toThrow(/overlaps/);
  });
});

describe('scheduling-window-policy — assertValidBookingWindow date guards', () => {
  test('rejects invalid dates before any Settings read', async () => {
    await expect(assertValidBookingWindow(new Date('nope'), new Date()))
      .rejects.toThrow(/valid ISO dates/);
  });

  test('rejects end <= start before any Settings read', async () => {
    await expect(
      assertValidBookingWindow(new Date('2030-01-02T00:00:00Z'), new Date('2030-01-01T00:00:00Z')),
    ).rejects.toThrow(/after startTime/);
  });
});
