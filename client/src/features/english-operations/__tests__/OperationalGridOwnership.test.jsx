import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SchedulePanel from '../SchedulePanel';
import AttendancePanel from '../AttendancePanel';

const h = vi.hoisted(() => ({
  scheduleProps: null,
  attendanceProps: null,
  archiveSessions: [{
    id: 'archive-session-1', courseRunId: 'archive-run-1', sessionNumber: 4,
    heldAt: '2025-06-10T10:00:00.000Z', status: 'held', classCode: 'EL001',
    courseName: 'English Level 1', attendanceCount: 3, presentCount: 2, absentCount: 1,
  }],
}));

vi.mock('../../schedule/SchedulesPage', () => ({
  default: (props) => {
    h.scheduleProps = props;
    return <div data-testid="weekly-schedule-grid" />;
  },
}));

vi.mock('../../attendance/AttendancePage', () => ({
  default: (props) => {
    h.attendanceProps = props;
    return <div data-testid="weekly-attendance-grid" />;
  },
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'admin-1', role: 'Admin' } }),
}));

vi.mock('../../../hooks/useOrg', () => ({
  useOffices: () => ({ data: [] }),
}));

vi.mock('../../../hooks/useSchedulingConfig', () => ({
  DEFAULT_UTC_OFFSET_MINUTES: 420,
  useSchedulingConfig: () => ({
    data: { utcOffsetMinutes: 420, slots: [] },
    isLoading: false,
  }),
}));

vi.mock('../../rooms/useRooms', () => ({
  useRooms: () => ({ data: [] }),
}));

vi.mock('../useEnglishOperations', () => ({
  useCanonicalEnglishSessions: () => ({ data: h.archiveSessions, isLoading: false }),
  useCanonicalEnglishCourseRuns: () => ({ data: [], isLoading: false }),
  useCreateCanonicalEnglishSession: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEnglishArchiveSessionAttendance: () => ({
    data: {
      id: 'archive-session-1', classCode: 'EL001', courseName: 'English Level 1',
      sessionNumber: 4, heldAt: '2025-06-10T10:00:00.000Z',
      roster: [{ employeeCode: 'E001', employeeName: 'Learner One', attendanceStatus: 'present' }],
    },
    isLoading: false,
  }),
  useCanonicalEnglishAttendanceRoster: () => ({ data: undefined, isLoading: false }),
  useSaveCanonicalEnglishAttendance: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  h.scheduleProps = null;
  h.attendanceProps = null;
});

describe('English Operations owns the operational grids', () => {
  it('renders the weekly Schedule grid from canonical English sessions only', () => {
    render(<SchedulePanel />);

    expect(screen.getByTestId('weekly-schedule-grid')).toBeInTheDocument();
    expect(h.scheduleProps.allowedClassIds).toEqual([]);
    expect(h.scheduleProps.allowCreate).toBe(false);
    expect(h.scheduleProps.historicalOnly).toBe(true);
  });

  it('renders the weekly Attendance grid from canonical English attendance only', () => {
    render(<AttendancePanel />);

    expect(screen.getByTestId('weekly-attendance-grid')).toBeInTheDocument();
    expect(h.attendanceProps.allowedClassIds).toEqual([]);
    expect(h.attendanceProps.statusOptions).toEqual(['P', 'A']);
  });

  it('opens Schedule on the latest imported canonical week', () => {
    render(<SchedulePanel />);

    expect(h.scheduleProps.historicalOnly).toBe(true);
    expect(h.scheduleProps.historicalSchedules).toEqual([
      expect.objectContaining({ archiveSessionId: 'archive-session-1', isHistorical: true }),
    ]);
    expect(h.scheduleProps.defaultWeek).toBe('2025-06-10T03:00:00.000Z');
  });

  it('opens Attendance from imported canonical rows', () => {
    render(<AttendancePanel />);

    expect(h.attendanceProps.historicalOnly).toBe(true);
    expect(h.attendanceProps.historicalSchedules).toEqual([
      expect.objectContaining({ archiveSessionId: 'archive-session-1', isHistorical: true }),
    ]);
    expect(h.attendanceProps.onHistoricalSelect).toEqual(expect.any(Function));
  });
});
