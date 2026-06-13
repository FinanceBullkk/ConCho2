import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReportsPage from '../ReportsPage';

// Mock useRole — we exercise the permission-based tab visibility here.
const mockCan = vi.fn();
vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({ can: mockCan }),
}));

// Heavy child components are not under test; stub them so we can assert purely
// on the tab strip and active-tab routing. IA cleanup 2026-06-13: reporting is
// consolidated here — Overview (home analytics), L&D Dashboard + Completion
// (moved from Learning), Attendance, HR Export. Sheets Sync moved to System.
vi.mock('../../features/dashboard/AdminAnalyticsPanel', () => ({ default: () => <div data-testid="overview-panel">Overview</div> }));
vi.mock('../../features/learning/DashboardTab', () => ({ default: () => <div data-testid="learning-dashboard">L&D Dashboard</div> }));
vi.mock('../../features/learning/ReportsTab', () => ({ default: () => <div data-testid="completion-report">Completion</div> }));
vi.mock('../../features/attendance/AttendanceDashboardPage', () => ({ default: () => <div data-testid="analytics-page">Analytics</div> }));
vi.mock('../../features/admin/HRExportPage', () => ({ default: () => <div data-testid="hr-export-page">HR Export</div> }));

function renderReports(initialPath = '/reports') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ReportsPage />
    </MemoryRouter>
  );
}

describe('ReportsPage — consolidated reporting, tab visibility per role', () => {
  beforeEach(() => {
    mockCan.mockReset();
  });

  it('Admin sees all five report tabs (no Sheets Sync — that lives in System now)', () => {
    mockCan.mockImplementation(() => true);
    renderReports();
    expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /l&d dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /completion/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /attendance/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /hr export/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /sheets sync/i })).not.toBeInTheDocument();
  });

  it('Teacher sees L&D Dashboard + Completion + Attendance (no Overview, no HR Export)', () => {
    // Teacher permissions: read:reports + read:attendance (no read:dashboard / export:data).
    mockCan.mockImplementation((p) => p === 'read:reports' || p === 'read:attendance');
    renderReports();
    expect(screen.getByRole('tab', { name: /l&d dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /completion/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /attendance/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /overview/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /hr export/i })).not.toBeInTheDocument();
  });

  it('Teacher requesting ?tab=overview falls back to first allowed tab (L&D Dashboard)', () => {
    mockCan.mockImplementation((p) => p === 'read:reports' || p === 'read:attendance');
    renderReports('/reports?tab=overview');
    // L&D Dashboard is the first tab a Teacher can see — its panel must render.
    expect(screen.getByTestId('learning-dashboard')).toBeInTheDocument();
    // overview panel must NOT render
    expect(screen.queryByTestId('overview-panel')).not.toBeInTheDocument();
  });

  it('renders empty-state header when user has no report permissions at all', () => {
    mockCan.mockImplementation(() => false);
    renderReports();
    expect(screen.getByRole('heading', { name: /reports/i })).toBeInTheDocument();
    expect(screen.getByText(/no reports available/i)).toBeInTheDocument();
  });
});
