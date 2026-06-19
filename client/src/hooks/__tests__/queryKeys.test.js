import { describe, it, expect } from 'vitest';
import { qk } from '../queryKeys';

describe('qk query-key factory', () => {
  it('exposes static keys as arrays', () => {
    expect(qk.auth.me).toEqual(['auth', 'me']);
    expect(qk.teams.all).toEqual(['teams']);
    expect(qk.notifications.mine).toEqual(['notifications', 'mine']);
    expect(qk.assessment.gradingQueue).toEqual(['assessment', 'grading-queue']);
  });

  it('builds parameterised list/detail keys', () => {
    expect(qk.users.list({ page: 2 })).toEqual(['users', 'list', { page: 2 }]);
    expect(qk.users.detail('u1')).toEqual(['users', 'detail', 'u1']);
    expect(qk.learning.program('p1')).toEqual(['learning', 'program', 'p1']);
    expect(qk.vendor.spend('v1', { fy: 2026 })).toEqual(['vendor', 'spend', 'v1', { fy: 2026 }]);
  });

  it('returns the base prefix when attendanceCalendar is called with no params (invalidation)', () => {
    expect(qk.schedules.attendanceCalendar()).toEqual(['schedules', 'attendance-calendar']);
  });

  it('returns a scoped key when attendanceCalendar is called with params', () => {
    expect(qk.schedules.attendanceCalendar({ from: 'x' })).toEqual([
      'schedules', 'attendance-calendar', { from: 'x' },
    ]);
  });

  it('keeps a list key under the same prefix as its group (invalidation safety)', () => {
    expect(qk.classes.all).toEqual(['classes']);
    expect(qk.classes.list({}).slice(0, 1)).toEqual(['classes']);
  });
});
