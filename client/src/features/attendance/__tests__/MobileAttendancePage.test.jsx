import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MobileAttendancePage from '../MobileAttendancePage';

const h = vi.hoisted(() => ({
  offline: {}, calendar: {}, flush: vi.fn(),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));
vi.mock('../useOfflineAttendance', () => ({ useOfflineAttendance: () => h.offline }));
vi.mock('../../../hooks/useSchedules', () => ({ useAttendanceCalendar: () => h.calendar }));
vi.mock('../attendance-offline-db', () => ({ getAllQueued: vi.fn().mockResolvedValue([]) }));
// Keep the page test focused — stub the roster child.
vi.mock('../MobileRosterPanel', () => ({ default: () => <div data-testid="roster-panel" /> }));

const todaySession = {
  _id: 'sch1',
  startTime: new Date().toISOString(),
  classId: { classCode: 'ENG-101', courseName: 'English 101' },
  enrolledCount: 5, markedCount: 0,
};

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MobileAttendancePage /></QueryClientProvider>);
};

beforeEach(() => {
  h.flush = vi.fn();
  h.offline = { online: true, queuedCount: 0, flushing: false, enqueue: vi.fn(), flush: h.flush };
  h.calendar = { data: [todaySession], isLoading: false, isError: false };
});

describe('MobileAttendancePage', () => {
  it("lists today's sessions and shows the online banner", () => {
    renderPage();
    expect(screen.getByText('mobileAttendance.online')).toBeInTheDocument();
    expect(screen.getByText('English 101')).toBeInTheDocument();
  });

  it('shows the offline banner when offline', () => {
    h.offline = { ...h.offline, online: false };
    renderPage();
    expect(screen.getByText('mobileAttendance.offline')).toBeInTheDocument();
  });

  it('shows a Sync-now action when changes are queued and flushes on click', async () => {
    const user = userEvent.setup();
    h.offline = { ...h.offline, online: true, queuedCount: 3 };
    renderPage();
    const sync = screen.getByRole('button', { name: /syncNow/ });
    await user.click(sync);
    expect(h.flush).toHaveBeenCalled();
  });

  it('opens the roster panel when a session is tapped', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('English 101'));
    expect(screen.getByTestId('roster-panel')).toBeInTheDocument();
  });
});
