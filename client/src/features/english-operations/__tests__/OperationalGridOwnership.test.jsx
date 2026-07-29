import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMonday } from '../../../components/CalendarGrid';
import SchedulePanel from '../SchedulePanel';
import AttendancePanel from '../AttendancePanel';

const h = vi.hoisted(() => ({
  scheduleProps: null,
  attendanceProps: null,
  runs: [],
  config: { utcOffsetMinutes: 420, slots: [] },
  createSession: vi.fn().mockResolvedValue({}),
  rescheduleMeeting: vi.fn().mockResolvedValue({}),
  cancelMeeting: vi.fn().mockResolvedValue({}),
  archiveSessions: [{
    id: 'archive-session-1', courseRunId: 'archive-run-1', sessionNumber: 4,
    heldAt: '2025-06-10T10:00:00.000Z', status: 'held', classCode: 'EL001',
    courseName: 'English Level 1', attendanceCount: 3, expectedRosterCount: 3, presentCount: 2, absentCount: 1,
  }],
  // What the server-side summary aggregate would report for the fixture
  // above — one recorded (done) session, nothing needing evidence or upcoming.
  summary: {
    counts: { all: 1, recorded: 1, needsEvidence: 0, upcoming: 0, live: 0, imported: 1 },
    nearestSessionAt: '2025-06-10T03:00:00.000Z',
    latestSessionAt: '2025-06-10T03:00:00.000Z',
    filterSeedAt: {
      all: '2025-06-10T03:00:00.000Z', recorded: '2025-06-10T03:00:00.000Z',
      needsEvidence: null, upcoming: null,
    },
  },
}));

vi.mock('../../schedule/SchedulesPage', () => ({
  default: (props) => {
    h.scheduleProps = props;
    return <div data-testid="weekly-schedule-grid">{props.historicalDrawer}</div>;
  },
}));

vi.mock('../../attendance/AttendancePage', () => ({
  // Named (and capitalised) so the hook below is a legal component hook call.
  default: function MockAttendancePage(props) {
    h.attendanceProps = props;
    // `weekStart` is now parent-controlled (lifted into AttendancePanel), so
    // the mock just mirrors whatever the panel currently holds — no local
    // seed-once state needed here.
    h.attendanceMountedWeek = props.weekStart ? new Date(props.weekStart).toISOString() : null;
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
    data: h.config,
    isLoading: false,
  }),
}));

vi.mock('../../rooms/useRooms', () => ({
  useRooms: () => ({ data: [] }),
}));

vi.mock('../useEnglishOperations', () => ({
  useEnglishSessionsSummary: () => ({ data: h.summary, isLoading: false }),
  useEnglishSessionsWindow: () => ({ data: h.archiveSessions, isLoading: false, isError: false }),
  useCanonicalEnglishCourseRuns: () => ({ data: h.runs, isLoading: false }),
  useCreateCanonicalEnglishSession: () => ({ mutateAsync: h.createSession, isPending: false }),
  useRescheduleCanonicalEnglishMeeting: () => ({ mutateAsync: h.rescheduleMeeting, isPending: false }),
  useCancelCanonicalEnglishMeeting: () => ({ mutateAsync: h.cancelMeeting, isPending: false }),
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
  h.runs = [];
  h.config = { utcOffsetMinutes: 420, slots: [] };
  h.createSession.mockClear();
  h.rescheduleMeeting.mockClear();
  h.cancelMeeting.mockClear();
  h.archiveSessions = [{
    id: 'archive-session-1', courseRunId: 'archive-run-1', sessionNumber: 4,
    heldAt: '2025-06-10T10:00:00.000Z', status: 'held', classCode: 'EL001',
    courseName: 'English Level 1', attendanceCount: 3, expectedRosterCount: 3, presentCount: 2, absentCount: 1,
  }];
  h.summary = {
    counts: { all: 1, recorded: 1, needsEvidence: 0, upcoming: 0, live: 0, imported: 1 },
    nearestSessionAt: '2025-06-10T03:00:00.000Z',
    latestSessionAt: '2025-06-10T03:00:00.000Z',
    filterSeedAt: {
      all: '2025-06-10T03:00:00.000Z', recorded: '2025-06-10T03:00:00.000Z',
      needsEvidence: null, upcoming: null,
    },
  };
});

describe('English Operations owns the operational grids', () => {
  it('renders the weekly Schedule grid from canonical English sessions only', () => {
    render(<SchedulePanel />);

    expect(screen.getByTestId('weekly-schedule-grid')).toBeInTheDocument();
    expect(h.scheduleProps.allowedClassIds).toEqual([]);
    expect(h.scheduleProps.allowCreate).toBe(false);
    expect(h.scheduleProps.historicalOnly).toBe(true);
    expect(h.scheduleProps.onHistoricalCellClick).toEqual(expect.any(Function));
    expect(h.scheduleProps.onHistoricalScheduleClick).toEqual(expect.any(Function));
  });

  it('renders the weekly Attendance grid from canonical English attendance only', () => {
    render(<AttendancePanel />);

    expect(screen.getByTestId('weekly-attendance-grid')).toBeInTheDocument();
    expect(h.attendanceProps.allowedClassIds).toEqual([]);
    expect(h.attendanceProps.statusOptions).toEqual(['P', 'A']);
    expect(h.attendanceProps.hideHeader).toBe(true);
    expect(h.attendanceProps.stackedDetail).toBe(true);
    expect(screen.getByRole('button', { name: /all sessions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /needs evidence/i })).toBeInTheDocument();
  });

  it('opens Schedule on the week nearest to now, per the server summary', () => {
    render(<SchedulePanel />);

    expect(h.scheduleProps.historicalOnly).toBe(true);
    expect(h.scheduleProps.historicalSchedules).toEqual([
      expect.objectContaining({ archiveSessionId: 'archive-session-1', isHistorical: true }),
    ]);
    // weekStart is now a controlled Date (Monday-aligned), seeded once from
    // summary.nearestSessionAt — not the raw defaultWeek string.
    expect(h.scheduleProps.weekStart).toBeInstanceOf(Date);
    expect(h.scheduleProps.historicalLatestWeek).toBe('2025-06-10T03:00:00.000Z');
  });

  it('opens Attendance from imported canonical rows', () => {
    render(<AttendancePanel />);

    expect(h.attendanceProps.historicalOnly).toBe(true);
    expect(h.attendanceProps.historicalSchedules).toEqual([
      expect.objectContaining({ archiveSessionId: 'archive-session-1', isHistorical: true }),
    ]);
    expect(h.attendanceProps.onHistoricalSelect).toEqual(expect.any(Function));
  });

  it('opens a prefilled English Meeting form when an empty grid cell is clicked', () => {
    h.runs = [{
      id: 'run-live-1', classCode: 'EL900', courseName: 'Foundation',
      runNumber: 1, nextSessionNumber: 2,
    }];
    h.config = {
      utcOffsetMinutes: 420,
      slots: [{
        id: '09:00-10:00', label: '09:00-10:00',
        startHour: 9, startMinute: 0, endHour: 10, endMinute: 0,
      }],
    };
    render(<SchedulePanel />);
    act(() => h.scheduleProps.onHistoricalCellClick({
      day: new Date(2099, 6, 22),
      slot: h.config.slots[0],
      startTime: new Date('2099-07-22T02:00:00.000Z'),
      endTime: new Date('2099-07-22T03:00:00.000Z'),
    }));

    expect(screen.getByRole('heading', { name: /schedule the next credited session/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toHaveValue('2099-07-22');
    expect(screen.getByLabelText('Time slot')).toHaveValue('09:00-10:00');
    expect(screen.getByRole('button', { name: 'Create session 2' })).toBeEnabled();
    expect(h.scheduleProps.hideHeader).toBe(true);
    expect(h.scheduleProps.historicalDrawer).toBeTruthy();
  });

  // Regression (2026-07-24 real-data run, PR #335): the tiles counted 9
  // upcoming sessions while the grid stayed on the week it mounted with — far
  // in the past and empty — so an operator filtering to Upcoming saw "nothing
  // scheduled". The seed now comes from the server summary's per-bucket
  // filterSeedAt instead of a client-side scan of the loaded window.
  it('moves the calendar to the filtered sessions when the attendance filter changes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T02:00:00.000Z'));
    h.archiveSessions = [
      {
        id: 'past-1', courseRunId: 'run-1', sessionNumber: 4,
        heldAt: '2026-07-06T10:00:00.000Z', status: 'held', classCode: 'EL001',
        courseName: 'English Level 1', attendanceCount: 3, expectedRosterCount: 3,
      },
      {
        id: 'upcoming-1', courseRunId: 'run-1', sessionNumber: 6, sourceKind: 'live',
        heldAt: '2026-07-27T02:00:00.000Z', status: 'scheduled', classCode: 'EL001',
        courseName: 'English Level 1', attendanceCount: 0, expectedRosterCount: 3,
      },
    ];
    h.summary = {
      counts: { all: 2, recorded: 1, needsEvidence: 0, upcoming: 1, live: 1, imported: 1 },
      nearestSessionAt: '2026-07-06T03:00:00.000Z',
      latestSessionAt: '2026-07-27T02:00:00.000Z',
      filterSeedAt: {
        all: '2026-07-06T03:00:00.000Z', recorded: '2026-07-06T03:00:00.000Z',
        needsEvidence: null, upcoming: '2026-07-27T02:00:00.000Z',
      },
    };

    try {
      render(<AttendancePanel />);
      // Unfiltered, the panel seeds from the summary's overall nearest session
      // (Monday-aligned — the exact instant depends on the runner's local TZ,
      // same as the real getMonday the panel calls).
      expect(h.attendanceMountedWeek).toBe(getMonday(new Date('2026-07-06T03:00:00.000Z')).toISOString());

      fireEvent.click(screen.getByRole('button', { name: /upcoming/i }));

      expect(h.attendanceProps.historicalSchedules).toEqual([
        expect.objectContaining({ archiveSessionId: 'upcoming-1' }),
      ]);
      // The visible week actually moved to the Upcoming bucket's seed.
      expect(h.attendanceMountedWeek).toBe(getMonday(new Date('2026-07-27T02:00:00.000Z')).toISOString());
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens a live Meeting for durable cancellation with a required reason', async () => {
    h.runs = [{
      id: 'run-live-1', classCode: 'EL900', courseName: 'Foundation',
      runNumber: 1, nextSessionNumber: 3,
    }];
    h.config = {
      utcOffsetMinutes: 420,
      slots: [{
        id: '09:00-10:00', label: '09:00-10:00',
        startHour: 9, startMinute: 0, endHour: 10, endMinute: 0,
      }],
    };
    render(<SchedulePanel />);
    act(() => h.scheduleProps.onHistoricalScheduleClick({
      _id: 'archive:unit-live-1', archiveSessionId: 'unit-live-1',
      meetingId: 'meeting-live-1', courseRunId: 'run-live-1', sourceKind: 'live',
      status: 'planned', sessionNumber: 2,
      startTime: '2099-07-22T02:00:00.000Z', endTime: '2099-07-22T03:00:00.000Z',
      classId: { classCode: 'EL900', courseName: 'Foundation' },
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel session' }));
    const confirm = screen.getByRole('button', { name: 'Confirm cancellation' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Cancellation reason'), { target: { value: 'Company event' } });
    fireEvent.click(confirm);

    await waitFor(() => expect(h.cancelMeeting).toHaveBeenCalledWith({
      courseRunId: 'run-live-1', meetingId: 'meeting-live-1',
      data: { cancellationReason: 'Company event' },
    }));
  });
});
