const DEFAULT_TIME_SLOTS = require('../../config/default-time-slots');
const {
  allocateArchiveSessionTimes,
  validateArchiveSessionAllocation,
} = require('../../domains/english-training/session-time-allocation');

const session = ({ id, classCode, heldAt, sessionNumber = 1, courseRunKey } = {}) => ({
  id,
  naturalKey: `${classCode}|${courseRunKey || classCode}|${sessionNumber}`,
  classCode,
  courseRunKey: courseRunKey || classCode,
  sessionNumber,
  heldAt,
});

describe('English Archive session-time allocation', () => {
  test('keeps five sessions on their source date and moves only the overflow', () => {
    const sessions = Array.from({ length: 6 }, (_, index) => session({
      id: `s${index + 1}`,
      classCode: `EL00${index + 1}`,
      heldAt: '2025-07-14T10:00:00.000Z',
    }));

    const result = allocateArchiveSessionTimes(sessions, { slots: DEFAULT_TIME_SLOTS });

    expect(result.summary).toMatchObject({ total: 6, movedDates: 1 });
    expect(result.assignments.filter((row) => row.assignedDate === '2025-07-14')).toHaveLength(5);
    expect(result.assignments.filter((row) => row.assignedDate !== '2025-07-14')).toHaveLength(1);
    expect(validateArchiveSessionAllocation(result.assignments, DEFAULT_TIME_SLOTS)).toEqual([]);
  });

  test('moves a duplicate class before allowing two sessions for it on one date', () => {
    const sessions = [
      session({ id: 'duplicate-a', classCode: 'EL024', courseRunKey: 'foundation', heldAt: '2025-06-10T09:00:00.000Z' }),
      session({ id: 'duplicate-b', classCode: 'EL024', courseRunKey: 'communication-1', heldAt: '2025-06-10T09:00:00.000Z' }),
      ...Array.from({ length: 4 }, (_, index) => session({
        id: `other-${index}`,
        classCode: `EL10${index}`,
        heldAt: '2025-06-10T09:00:00.000Z',
      })),
    ];

    const result = allocateArchiveSessionTimes(sessions, { slots: DEFAULT_TIME_SLOTS });
    const duplicateDates = result.assignments
      .filter((row) => row.classCode === 'EL024')
      .map((row) => row.assignedDate);

    expect(new Set(duplicateDates).size).toBe(2);
    expect(result.summary.movedDates).toBe(1);
    expect(validateArchiveSessionAllocation(result.assignments, DEFAULT_TIME_SLOTS)).toEqual([]);
  });

  test('uses only one-hour approved slots and produces the same result on every run', () => {
    const sessions = [
      session({ id: 'a', classCode: 'EL001', heldAt: '2025-07-14T09:30:00.000Z' }),
      session({ id: 'b', classCode: 'EL002', heldAt: '2025-07-14T10:00:00.000Z' }),
      session({ id: 'c', classCode: 'EL003', heldAt: '2025-07-14T17:00:00.000Z' }),
    ];

    const first = allocateArchiveSessionTimes(sessions, { slots: DEFAULT_TIME_SLOTS });
    const second = allocateArchiveSessionTimes([...sessions].reverse(), { slots: DEFAULT_TIME_SLOTS });

    expect(first.assignments).toEqual(second.assignments);
    expect(first.assignments.map((row) => row.slotLabel)).toEqual([
      '09:00-10:00', '10:00-11:00', '15:00-16:00',
    ]);
    expect(validateArchiveSessionAllocation(first.assignments, DEFAULT_TIME_SLOTS)).toEqual([]);
  });
});
