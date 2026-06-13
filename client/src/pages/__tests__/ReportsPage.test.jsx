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

// IA Phase 03: the in-page tab strip is gone (the sidebar's Reports group drives
// ?tab=). The page renders the panel for the active (or first-allowed) tab; we
// assert the rendered panel per role + ?tab=.
describe('ReportsPage — consolidated reporting, panel per role/tab', () => {
  beforeEach(() => {
    mockCan.mockReset();
  });

  it('Admin defaults to the Overview panel', () => {
    mockCan.mockImplementation(() => true);
    renderReports();
    expect(screen.getByTestId('overview-panel')).toBeInTheDocument();
  });

  it('Admin ?tab=hr-export renders the HR Export panel', () => {
    mockCan.mockImplementation(() => true);
    renderReports('/reports?tab=hr-export');
    expect(screen.getByTestId('hr-export-page')).toBeInTheDocument();
    expect(screen.queryByTestId('overview-panel')).not.toBeInTheDocument();
  });

  it('Teacher defaults to L&D Dashboard (no read:dashboard → no Overview)', () => {
    // Teacher permissions: read:reports + read:attendance (no read:dashboard / export:data).
    mockCan.mockImplementation((p) => p === 'read:reports' || p === 'read:attendance');
    renderReports();
    expect(screen.getByTestId('learning-dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('overview-panel')).not.toBeInTheDocument();
  });

  it('Teacher requesting ?tab=overview falls back to the first allowed panel (L&D Dashboard)', () => {
    mockCan.mockImplementation((p) => p === 'read:reports' || p === 'read:attendance');
    renderReports('/reports?tab=overview');
    expect(screen.getByTestId('learning-dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('overview-panel')).not.toBeInTheDocument();
  });

  it('renders empty-state header when user has no report permissions at all', () => {
    mockCan.mockImplementation(() => false);
    renderReports();
    expect(screen.getByRole('heading', { name: /reports/i })).toBeInTheDocument();
    expect(screen.getByText(/no reports available/i)).toBeInTheDocument();
  });
});
