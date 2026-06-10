import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AttendancePage from '../AttendancePage';

// Smoke: the attendance grid renders exact configured slot rows (descriptor
// migration) without crashing, with the data hooks mocked.

vi.mock('../../../components/AttendanceDrawer', () => ({ AttendanceDrawer: () => null }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }));
vi.mock('../../../api/api', () => ({
  schedulesAPI: { getById: vi.fn() },
  attendanceAPI: { getBySchedule: vi.fn() },
}));
vi.mock('../../../hooks/useAttendance', () => ({ useBulkMarkAttendance: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock('../../../hooks/useSchedules', () => ({ useAttendanceCalendar: () => ({ data: [], isLoading: false }) }));
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

describe('AttendancePage — exact-slot grid', () => {
  it('renders the descriptor grid from config without crashing', () => {
    render(<AttendancePage />);
    expect(screen.getByText('Attendance')).toBeInTheDocument();
    expect(screen.getAllByText('10:00-11:00').length).toBeGreaterThanOrEqual(1);
  });
});
