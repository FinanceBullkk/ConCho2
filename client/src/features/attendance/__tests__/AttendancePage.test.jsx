import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import AttendancePage from '../AttendancePage';
import { getMonday } from '../../../components/CalendarGrid';

// Covers: the exact-slot grid renders from config (descriptor migration) AND
// the unified world facet (converge Phase 4 slice A1) — mode="all" shows BOTH
// scheduling worlds with a client-side Team/Cohort filter.

const h = vi.hoisted(() => ({ calendar: { data: [], isLoading: false } }));

vi.mock('../../../components/AttendanceDrawer', () => ({ AttendanceDrawer: () => null }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }));
vi.mock('../../../api/api', () => ({
  schedulesAPI: { getById: vi.fn() },
  attendanceAPI: { getBySchedule: vi.fn() },
}));
vi.mock('../../../hooks/useAttendance', () => ({ useBulkMarkAttendance: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock('../../../hooks/useSchedules', () => ({ useAttendanceCalendar: () => h.calendar }));
vi.mock('../../../hooks/useSchedulingConfig', () => ({
  DEFAULT_UTC_OFFSET_MINUTES: 420,
  useSchedulingConfig: () => ({
    data: {
      timezone: 'Asia/Ho_Chi_Minh', utcOffsetMinutes: 420, weeklyTeamLimit: 2,
      slots: [{ id: '10:00-11:00', label: '10:00-11:00', startHour: 10, startMinute: 0, endHour: 11, endMinute: 0, durationMinutes: 60 }],
    },
    isLoading: false,
  }),
}));

// A session placed safely INSIDE the current ISO week (mid-week offset) so it
// buckets into a grid cell no matter which weekday the test runs.
const inWeek = (dayOffset) => {
  const d = getMonday(new Date());
  d.setDate(d.getDate() + dayOffset);
  d.setHours(10, 0, 0, 0);
  return { startTime: d.toISOString(), endTime: new Date(d.getTime() + 3600000).toISOString() };
};

const session = (id, classCode, deliveryType, dayOffset) => ({
  _id: id,
  classId: { classCode, courseName: `Course ${classCode}` },
  ...inWeek(dayOffset),
  attendanceStatus: 'pending', enrolledCount: 1, markedCount: 0, deliveryType,
});

beforeEach(() => { h.calendar = { data: [], isLoading: false }; });

describe('AttendancePage — exact-slot grid + world facet', () => {
  it('renders the descriptor grid from config; no facet in plain mode', () => {
    render(<AttendancePage />);
    expect(screen.getByText('Attendance')).toBeInTheDocument();
    expect(screen.getAllByText('10:00-11:00').length).toBeGreaterThanOrEqual(1);
    // Plain mode (no `mode` prop) shows no Team/Cohort facet.
    expect(screen.queryByRole('button', { name: 'Cohort' })).toBeNull();
  });

  it('unified mode (mode="all") shows the Team/Cohort world facet', () => {
    render(<AttendancePage mode="all" />);
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Team' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cohort' })).toBeInTheDocument();
  });

  it('unified mode filters the calendar by world', () => {
    h.calendar = {
      isLoading: false,
      data: [session('s-team', 'TEAM-A', 'team', 2), session('s-cohort', 'COH-B', 'cohort', 3)],
    };
    render(<AttendancePage mode="all" />);
    // "All" → both worlds' sessions render their class codes.
    expect(screen.getByText('TEAM-A')).toBeInTheDocument();
    expect(screen.getByText('COH-B')).toBeInTheDocument();
    // Facet to Cohort → the team session drops out.
    fireEvent.click(screen.getByRole('button', { name: 'Cohort' }));
    expect(screen.queryByText('TEAM-A')).toBeNull();
    expect(screen.getByText('COH-B')).toBeInTheDocument();
  });
});
