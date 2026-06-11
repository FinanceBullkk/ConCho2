const DAY_MS = 24 * 60 * 60 * 1000;

const startOfUtcDay = (date) => {
  const d = new Date(date);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

const daysBetweenUtcDates = (from, to) =>
  Math.round((startOfUtcDay(to) - startOfUtcDay(from)) / DAY_MS);

const getIsoWeekKey = (value) => {
  const d = new Date(value);
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / DAY_MS) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

const getLearnerCadence = ({ dueDate, now = new Date() }) => {
  const daysUntil = daysBetweenUtcDates(now, dueDate);
  if (daysUntil === 7) {
    return { type: 'assignment_due_soon', cadenceKey: 'due_7', daysUntil };
  }
  if (daysUntil === 1) {
    return { type: 'assignment_due_soon', cadenceKey: 'due_1', daysUntil };
  }
  if (daysUntil < 0) {
    const daysOverdue = Math.abs(daysUntil);
    const bucketStartDay = Math.floor((daysOverdue - 1) / 3) * 3 + 1;
    return {
      type: 'assignment_overdue',
      cadenceKey: `overdue_d${bucketStartDay}`,
      daysOverdue,
    };
  }
  return null;
};

const getManagerDigestCadenceKey = (now = new Date()) =>
  `manager_overdue_${getIsoWeekKey(now)}`;

module.exports = {
  DAY_MS,
  daysBetweenUtcDates,
  getIsoWeekKey,
  getLearnerCadence,
  getManagerDigestCadenceKey,
};
