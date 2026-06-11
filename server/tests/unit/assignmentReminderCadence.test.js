const {
  daysBetweenUtcDates,
  getIsoWeekKey,
  getLearnerCadence,
  getManagerDigestCadenceKey,
} = require('../../domains/learning/assignment/reminder-cadence');

describe('assignment reminder cadence helpers', () => {
  test('generates separate due-soon keys for 7 days and 1 day before due date', () => {
    const dueDate = new Date('2026-06-30T00:00:00.000Z');

    expect(getLearnerCadence({
      dueDate,
      now: new Date('2026-06-23T12:00:00.000Z'),
    })).toMatchObject({ type: 'assignment_due_soon', cadenceKey: 'due_7', daysUntil: 7 });

    expect(getLearnerCadence({
      dueDate,
      now: new Date('2026-06-29T12:00:00.000Z'),
    })).toMatchObject({ type: 'assignment_due_soon', cadenceKey: 'due_1', daysUntil: 1 });
  });

  test('respects D4 date-level semantics: due date remains open until next UTC date', () => {
    const dueDate = new Date('2026-06-30T00:00:00.000Z');

    expect(daysBetweenUtcDates(new Date('2026-06-30T23:59:59.000Z'), dueDate)).toBe(0);
    expect(getLearnerCadence({
      dueDate,
      now: new Date('2026-06-30T23:59:59.000Z'),
    })).toBeNull();
    expect(getLearnerCadence({
      dueDate,
      now: new Date('2026-07-01T00:00:00.000Z'),
    })).toMatchObject({ type: 'assignment_overdue', cadenceKey: 'overdue_d1', daysOverdue: 1 });
  });

  test('overdue reminders keep one key per three-day bucket', () => {
    const dueDate = new Date('2026-06-30T00:00:00.000Z');

    expect(getLearnerCadence({
      dueDate,
      now: new Date('2026-07-01T12:00:00.000Z'),
    })).toMatchObject({ cadenceKey: 'overdue_d1' });
    expect(getLearnerCadence({
      dueDate,
      now: new Date('2026-07-02T12:00:00.000Z'),
    })).toMatchObject({ cadenceKey: 'overdue_d1', daysOverdue: 2 });
    expect(getLearnerCadence({
      dueDate,
      now: new Date('2026-07-04T12:00:00.000Z'),
    })).toMatchObject({ cadenceKey: 'overdue_d4' });
  });

  test('manager digest key is a weekly ISO bucket', () => {
    expect(getIsoWeekKey(new Date('2026-07-01T12:00:00.000Z'))).toBe('2026-W27');
    expect(getManagerDigestCadenceKey(new Date('2026-07-01T12:00:00.000Z')))
      .toBe('manager_overdue_2026-W27');
  });
});
