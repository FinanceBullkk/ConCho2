const DEFAULT_TIME_SLOTS = require('../../config/default-time-slots');
const { parseSlots } = require('../../domains/schedule/scheduling-window-policy');

describe('default scheduling slots', () => {
  test('uses the five approved one-hour English windows in Vietnam time', () => {
    expect(DEFAULT_TIME_SLOTS).toEqual([
      { sh: 9, sm: 0, eh: 10, em: 0, label: '09:00-10:00' },
      { sh: 10, sm: 0, eh: 11, em: 0, label: '10:00-11:00' },
      { sh: 13, sm: 0, eh: 14, em: 0, label: '13:00-14:00' },
      { sh: 14, sm: 0, eh: 15, em: 0, label: '14:00-15:00' },
      { sh: 15, sm: 0, eh: 16, em: 0, label: '15:00-16:00' },
    ]);
    const parsed = parseSlots(DEFAULT_TIME_SLOTS);
    expect(parsed.errors).toEqual([]);
    expect(parsed.slots.map((slot) => slot.durationMinutes)).toEqual([60, 60, 60, 60, 60]);
  });
});
